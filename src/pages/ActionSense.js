// src/pages/ActionSense.js
import React, { useEffect, useRef, useState, useMemo } from "react";
import "./ActionSense.css";
import { extractActionItems } from "../utils/openaiApi";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * ActionSense
 * - 채팅 메시지에서 행동 유발 문장 감지 → 업무 카드 생성 제안/자동등록
 * - 룰 기반 + (옵션) LLM 보강
 * - 채팅: Firebase Firestore 사용
 * - 업무 카드(tasks): localStorage 유지
 */

const ENABLE_LLM_FALLBACK = true;

/* ===== Date utils (기존 그대로) ===== */
function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}
function toYMD(d) {
  const y = d.getFullYear();
  return `${y}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay(); // 0=일 ... 6=토
  const diff = 6 - day; // 토요일을 주말끝으로 봄
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function parseWeekdayToken(token) {
  const map = {
    일: 0,
    일요일: 0,
    월: 1,
    월요일: 1,
    화: 2,
    화요일: 2,
    수: 3,
    수요일: 3,
    목: 4,
    목요일: 4,
    금: 5,
    금요일: 5,
    토: 6,
    토요일: 6,
  };
  return map[token] ?? null;
}
function nextWeekdayDate(from, targetDow, { allowToday = false } = {}) {
  const d = new Date(from);
  const cur = d.getDay();
  let diff = targetDow - cur;
  if (diff < 0) diff += 7;
  if (diff === 0 && !allowToday) diff = 7;
  const candidate = new Date(d);
  candidate.setDate(d.getDate() + diff);
  candidate.setHours(0, 0, 0, 0);
  return candidate;
}
function lastDayOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(0, 0, 0, 0);
  return d;
}
function ensureFutureDate(
  base,
  date,
  { allowToday = true, pastMeansNextYear = true } = {}
) {
  const b = startOfDay(base);
  const t = startOfDay(date);
  if (t < b) {
    if (pastMeansNextYear) {
      const ny = new Date(t);
      ny.setFullYear(b.getFullYear() + 1);
      return ny;
    }
  }
  if (!allowToday && toYMD(t) === toYMD(b)) {
    const plusOne = new Date(t);
    plusOne.setDate(plusOne.getDate() + 1);
    return plusOne;
  }
  return t;
}

function normalizeDateKorean(str, now = new Date()) {
  if (!str) return null;
  const text = str.trim();
  const today = startOfDay(now);

  const hasPastMarker = /(지난|지난주|지난달|작년|전년)/.test(text);

  if (/오늘|EOD|오늘\s*마감|오늘\s*까지/i.test(text)) {
    return toYMD(today);
  }
  if (/내일/.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return toYMD(d);
  }
  if (/모레/.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return toYMD(d);
  }
  if (/글피/.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 3);
    return toYMD(d);
  }
  if (/이번\s*주\s*말|EOW|주말\s*까지/i.test(text)) {
    const eow = endOfWeek(today);
    return toYMD(eow);
  }
  if (/월말|말일/.test(text)) {
    return toYMD(lastDayOfMonth(today));
  }

  const wk = text.match(
    /(이번\s*주|다음\s*주|내주|차주|다다음\s*주)\s*(월요일|화요일|수요일|목요일|금요일|토요일|일요일|월|화|수|목|금|토|일)/
  );
  if (wk) {
    const weekWord = wk[1];
    const weekdayWord = wk[2];
    const targetDow = parseWeekdayToken(weekdayWord);
    if (targetDow != null) {
      const base = new Date(today);
      let addWeeks = 0;
      if (/다음\s*주|내주|차주/.test(weekWord)) addWeeks = 1;
      if (/다다음\s*주/.test(weekWord)) addWeeks = 2;
      base.setDate(base.getDate() + addWeeks * 7);
      const d = nextWeekdayDate(base, targetDow, { allowToday: true });
      if (toYMD(d) < toYMD(today)) d.setDate(d.getDate() + 7);
      return toYMD(d);
    }
  }

  const wd = text.match(
    /\b(월요일|화요일|수요일|목요일|금요일|토요일|일요일|월|화|수|목|금|토|일)\b/
  );
  if (wd) {
    const targetDow = parseWeekdayToken(wd[1]);
    if (targetDow != null) {
      const d = nextWeekdayDate(today, targetDow, { allowToday: false });
      return toYMD(d);
    }
  }

  let m = text.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (m) {
    const y = +m[1],
      mo = +m[2] - 1,
      da = +m[3];
    const dt = new Date(y, mo, da);
    if (!isNaN(dt)) {
      const candidate = ensureFutureDate(today, dt, {
        allowToday: true,
        pastMeansNextYear: !hasPastMarker && y === today.getFullYear(),
      });
      return toYMD(candidate);
    }
  }

  m = text.match(/\b(\d{1,2})[.\-\/](\d{1,2})\b/);
  if (m) {
    const y = today.getFullYear();
    const mo = +m[1] - 1,
      da = +m[2];
    let dt = new Date(y, mo, da);
    if (!isNaN(dt)) {
      dt = ensureFutureDate(today, dt, {
        allowToday: true,
        pastMeansNextYear: !hasPastMarker,
      });
      return toYMD(dt);
    }
  }

  m = text.match(
    /(?:(이번\s*달|다음\s*달)\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/
  );
  if (m) {
    const mod = m[1];
    const M = +m[2];
    const D = +m[3];
    const base = new Date(today);
    if (/다음\s*달/.test(mod || "")) {
      base.setMonth(base.getMonth() + 1);
    }
    const y = base.getFullYear();
    const mo = /다음\s*달/.test(mod || "") ? base.getMonth() : M - 1;
    let dt = new Date(y, mo, D);
    if (!isNaN(dt)) {
      dt = ensureFutureDate(today, dt, {
        allowToday: true,
        pastMeansNextYear: !hasPastMarker,
      });
      return toYMD(dt);
    }
  }

  return null;
}

/* ===== 핵심 분석기(룰 기반) (기존 그대로) ===== */
function analyzeMessageRuleBased(text, now = new Date()) {
  const original = text;
  text = (text || "").trim();

  const actionVerbs = [
    /해\s*줘/,
    /해주세요/,
    /부탁/,
    /진행하(자|세요)/,
    /처리/,
    /배포|릴리즈/,
    /테스트/,
    /정리|문서화|Docs?/,
    /업데이트/,
    /(회의|미팅).*(잡|스케줄|예약|일정)/,
    /리뷰|코드\s*리뷰|PR/,
    /확인\s*좀/,
    /공유\s*해/,
    /보내/,
    /제출/,
  ];
  const intent = actionVerbs.some((r) => r.test(text)) || /^\/todo/i.test(text);
  if (!intent) return { isAction: false };

  let assignedTo = null;
  const mHandle = text.match(/@([가-힣A-Za-z0-9_]+)/);
  if (mHandle) assignedTo = mHandle[1];
  if (!assignedTo) {
    const m1 = text.match(/담당\s*[:：]?\s*([^\s,]+)/);
    if (m1) assignedTo = m1[1];
  }
  if (!assignedTo) {
    const m2 = text.match(/([가-힣A-Za-z0-9_]+)\s*담당/);
    if (m2) assignedTo = m2[1];
  }

  let dueDate = null;
  dueDate = normalizeDateKorean(text, now);
  if (!dueDate) {
    const afterBy = text.match(/(?:\bby\b|까지)\s*([^.,;]+)/i);
    if (afterBy) {
      const sliced = afterBy[1].trim();
      const norm = normalizeDateKorean(sliced, now);
      if (norm) dueDate = norm;
    }
  }

  let priority = "보통";
  if (/긴급|급함|핫픽스|최우선|P0/.test(text)) priority = "높음";
  else if (/우선|상|P1/.test(text)) priority = "높음";
  else if (/중|P2/.test(text)) priority = "보통";
  else if (/하|P3|나중에/.test(text)) priority = "낮음";

  const tags = Array.from(text.matchAll(/#([^\s#]+)/g)).map((m) => m[1]);

  let title = original
    .replace(/^\/todo\s*/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (title.length > 64) title = title.slice(0, 64) + "…";

  let confidence = 0.5;
  if (intent) confidence += 0.2;
  if (assignedTo) confidence += 0.1;
  if (dueDate) confidence += 0.1;
  if (priority !== "보통") confidence += 0.05;
  if (tags.length) confidence += 0.05;
  if (/^\/todo/i.test(original)) confidence = Math.max(confidence, 0.9);

  return {
    isAction: true,
    extracted: { title, assignedTo, dueDate, priority, tags },
    confidence: Math.min(1, confidence),
  };
}

/* ===== 로컬스토리지: tasks만 유지 ===== */
const LS_TASKS = "actionsense_tasks_v1";
const LS_USER_NAME = "actionsense_user_name";

function loadLS(key, def) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? def;
  } catch {
    return def;
  }
}
function saveLS(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

/* ===== 컴포넌트 ===== */
const ActionSense = () => {
  // 메시지는 Firestore에서만 관리
  const [messages, setMessages] = useState([]);
  const [tasks, setTasks] = useState(() => loadLS(LS_TASKS, []));
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  const [channel, setChannel] = useState("#general");
  const channels = ["#general", "#dev", "#design"];

  // 👉 사용자 이름 (처음에 한 번 입력)
  const [userName, setUserName] = useState(() => {
    const saved = loadLS(LS_USER_NAME, null);
    return typeof saved === "string" ? saved : "";
  });
  const [nameInput, setNameInput] = useState(() => {
    const saved = loadLS(LS_USER_NAME, null);
    return typeof saved === "string" ? saved : "";
  });

  const isNameReady = !!userName;

  // Firestore 구독
  useEffect(() => {
    const colRef = collection(db, "actionSenseMessages");
    const q = query(colRef, orderBy("createdAt", "asc"));

    const unsub = onSnapshot(q, async (snap) => {
      if (snap.empty) {
        // 첫 실행 시 시스템 메시지 1개 삽입
        const sysMsg = {
          role: "system",
          text: "ActionSense가 채팅을 분석해 업무 등록을 제안합니다. 예: “@민준 이번주 금요일까지 백엔드 배포 준비 부탁 #배포 #우선”",
          channel: "#general",
          authorName: "ActionSense",
          createdAt: serverTimestamp(),
        };
        await addDoc(colRef, sysMsg);
        return;
      }

      const list = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          role: data.role || "user",
          text: data.text || "",
          channel: data.channel || "#general",
          suggestion: data.suggestion || null,
          authorName: data.authorName || null,
          createdAt: data.createdAt,
        };
      });
      setMessages(list);
    });

    return () => unsub();
  }, []);

  // tasks는 여전히 localStorage에 저장
  useEffect(() => {
    saveLS(LS_TASKS, tasks);
  }, [tasks]);

  // 메시지/모달 변화시 맨 아래로 스크롤
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, modalOpen]);

  // 현재 채널의 메시지 + 중복 방지 (같은 시각, 같은 내용이면 1개로)
  const visibleMessages = useMemo(() => {
    const filtered = messages.filter(
      (m) => !m.channel || m.channel === channel
    );

    const deduped = [];
    for (const m of filtered) {
      const last = deduped[deduped.length - 1];
      const curSeconds = m.createdAt?.seconds ?? null;
      const lastSeconds = last?.createdAt?.seconds ?? null;
      const almostSameTime =
        curSeconds != null &&
        lastSeconds != null &&
        Math.abs(curSeconds - lastSeconds) <= 1;

      if (
        last &&
        almostSameTime &&
        last.text === m.text &&
        last.role === m.role &&
        (last.authorName || "") === (m.authorName || "")
      ) {
        // 중복으로 보이는 경우 스킵
        continue;
      }
      deduped.push(m);
    }

    return deduped;
  }, [messages, channel]);

  // Firestore에 메시지 추가
  const addMessage = async (role, text, meta = {}) => {
    const displayName =
      meta.authorName ||
      (role === "user"
        ? userName || "나"
        : role === "assistant"
        ? "ActionSense"
        : "시스템");

    const payload = {
      role,
      text,
      channel: meta.channel || channel,
      suggestion: meta.suggestion || null,
      authorName: displayName,
      createdAt: serverTimestamp(),
    };
    await addDoc(collection(db, "actionSenseMessages"), payload);
  };

  const addTask = (payload) => {
    const t = {
      id: `TASK-${Date.now()}`,
      status: "진행 예정",
      title: payload.title || "제목 없음",
      description: payload.description || "",
      assignedTo: payload.assignedTo || null,
      dueDate: payload.dueDate || null,
      priority: payload.priority || "보통",
      tags: payload.tags || [],
      createdAt: new Date().toISOString(),
      progress: 0,
    };
    setTasks((prev) => [t, ...prev]);
    return t;
  };

  const onAcceptSuggestion = async (suggestion) => {
    const t = addTask({
      ...suggestion.extracted,
      description: `채팅에서 자동 생성됨: “${
        suggestion.preview || suggestion.extracted.title
      }”`,
    });
    await addMessage(
      "system",
      `✅ 업무로 등록했습니다: #${t.id} (${t.title})`,
      {
        authorName: "ActionSense",
      }
    );
  };

  const onOpenModal = (suggestion) => {
    setDraft({ ...suggestion.extracted });
    setModalOpen(true);
  };

  const onSubmitDraft = async () => {
    const t = addTask({
      ...draft,
      description: `수정 후 등록됨: “${draft.title}”`,
    });
    setModalOpen(false);
    setDraft(null);
    await addMessage(
      "system",
      `✅ 수정한 내용으로 업무를 등록했어요. (#${t.id})`,
      { authorName: "ActionSense" }
    );
  };

  const runAnalyzerOnMessage = async (text) => {
    const rb = analyzeMessageRuleBased(text, new Date());
    if (rb.isAction) {
      const { extracted, confidence } = rb;
      const preview = `${extracted.title} ${
        extracted.assignedTo ? ` / 담당:${extracted.assignedTo}` : ""
      }${extracted.dueDate ? ` / 기한:${extracted.dueDate}` : ""}${
        extracted.priority ? ` / 우선순위:${extracted.priority}` : ""
      }${extracted.tags?.length ? ` / #${extracted.tags.join(" #")}` : ""}`;

      await addMessage("assistant", "💡 업무로 등록할까요?", {
        suggestion: { extracted, confidence, preview },
        authorName: "ActionSense",
      });

      if (confidence >= 0.95) {
        const t = addTask({
          ...extracted,
          description: `고신뢰 자동생성: “${extracted.title}”`,
        });
        await addMessage(
          "system",
          `⚡ 고신뢰 감지로 자동 등록: #${t.id} (${t.title})`,
          { authorName: "ActionSense" }
        );
        return;
      }

      if (ENABLE_LLM_FALLBACK && confidence < 0.8) {
        try {
          setBusy(true);
          const ai = await extractActionItems(text);
          if (Array.isArray(ai) && ai.length > 0) {
            const a = ai[0];
            const llmExtracted = {
              title: a.text || extracted.title,
              assignedTo: a.assignedTo || extracted.assignedTo,
              dueDate: a.dueDate || extracted.dueDate,
              priority: extracted.priority,
              tags: extracted.tags,
            };
            const llmPreview = `${llmExtracted.title} ${
              llmExtracted.assignedTo
                ? ` / 담당:${llmExtracted.assignedTo}`
                : ""
            }${llmExtracted.dueDate ? ` / 기한:${llmExtracted.dueDate}` : ""}${
              llmExtracted.priority
                ? ` / 우선순위:${llmExtracted.priority}`
                : ""
            }${
              llmExtracted.tags?.length
                ? ` / #${llmExtracted.tags.join(" #")}`
                : ""
            }`;

            await addMessage("assistant", "🤖 보강 분석 제안:", {
              suggestion: {
                extracted: llmExtracted,
                confidence: Math.max(confidence, 0.85),
                preview: llmPreview,
              },
              authorName: "ActionSense",
            });
          }
        } catch (e) {
          console.warn("LLM 보강 실패:", e);
        } finally {
          setBusy(false);
        }
      }
      return;
    }

    if (ENABLE_LLM_FALLBACK) {
      try {
        setBusy(true);
        const ai = await extractActionItems(text);
        if (Array.isArray(ai) && ai.length > 0) {
          const a = ai[0];
          const extracted = {
            title: a.text || text,
            assignedTo: a.assignedTo || null,
            dueDate: a.dueDate || null,
            priority: "보통",
            tags: [],
          };
          const preview = `${extracted.title} ${
            extracted.assignedTo ? ` / 담당:${extracted.assignedTo}` : ""
          }${extracted.dueDate ? ` / 기한:${extracted.dueDate}` : ""}`;

          await addMessage("assistant", "💡 업무로 등록할까요? (AI 감지)", {
            suggestion: { extracted, confidence: 0.8, preview },
            authorName: "ActionSense",
          });
          return;
        }
      } catch (e) {
        console.warn("LLM 최종 감지 실패:", e);
      } finally {
        setBusy(false);
      }
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || busy || !isNameReady) return;

    await addMessage("user", text, {
      channel,
      authorName: userName || "나",
    });
    setInput("");
    await runAnalyzerOnMessage(text);
  };

  const quickSamples = [
    "@민준 이번주 금요일까지 백엔드 배포 준비 부탁 #배포 #우선",
    "모레까지 디자인 시스템 문서화 해줘 우선순위 높음",
    "다음주 화요일에 앱스토어 릴리즈 하자 담당:지수",
    "PR 리뷰 좀 부탁, 오늘 안에 #리뷰",
    "/todo 데이터 파이프라인 점검: 다음주 수, 담당 은혁, P1 #데이터",
  ];

  const handleSaveName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setUserName(trimmed);
    saveLS(LS_USER_NAME, trimmed);
  };

  return (
    <div className="actionsense-container">
      {/* 헤더 */}
      <header className="as-header">
        <div className="as-header-left">
          <div className="as-icon-wrapper">
            <span className="as-icon-zap">⚡</span>
          </div>
          <div>
            <h2 className="as-title">ActionSense</h2>
            <p className="as-subtitle">
              채팅 속 “해야 할 일”을 자동으로 감지해 업무 카드로 만들어 줍니다.
            </p>
          </div>
        </div>

        <div className="as-header-right">
          {busy ? (
            <span className="as-status-pill busy">AI 분석 중…</span>
          ) : (
            <span className="as-status-pill on">자동 감지 ON</span>
          )}
        </div>
      </header>

      {/* 메인 2열 레이아웃 */}
      <div className="as-main">
        {/* 왼쪽: 채팅 + 제안 */}
        <section className="as-chat-card">
          {/* 👉 이름 설정 영역 */}
          <div className="as-name-setup">
            <div className="as-name-setup-label">
              <span className="as-name-dot">●</span>
              <span>
                내 이름{" "}
                <span className="as-name-hint">(채팅에 표시될 이름)</span>
              </span>
            </div>
            <div className="as-name-setup-row">
              <input
                type="text"
                className="as-name-input"
                placeholder="예) 재민, Minjun"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
              />
              <button className="btn-secondary" onClick={handleSaveName}>
                적용
              </button>
            </div>
            {!isNameReady && (
              <p className="as-name-warning">
                채팅을 시작하려면 먼저 이름을 입력해 주세요.
              </p>
            )}
          </div>

          <div className="as-chat-header">
            <div className="as-channel-tabs">
              {channels.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  className={
                    "as-channel-tab" + (channel === ch ? " active" : "")
                  }
                  onClick={() => setChannel(ch)}
                >
                  {ch}
                </button>
              ))}
            </div>
            <p className="as-chat-hint">
              “@이름 ~까지 부탁”처럼 말하면 ActionSense가 업무로 만들지
              제안해요.
            </p>
          </div>

          {/* 채팅 메시지 렌더링 */}
          <div className="as-chat-messages">
            {visibleMessages.map((m) => {
              const isMine = m.role === "user" && m.authorName === userName;

              return (
                <div
                  key={m.id}
                  className={`as-message ${
                    isMine ? "my-message" : "other-message"
                  }`}
                >
                  <div className="as-bubble">
                    <div className="as-message-meta">
                      <span className="as-author-pill">
                        {m.authorName ||
                          (m.role === "user"
                            ? "사용자"
                            : m.role === "assistant"
                            ? "ActionSense"
                            : "시스템")}
                      </span>
                    </div>
                    <p className="as-message-text">{m.text}</p>

                    {m.suggestion && (
                      <div className="as-suggestion">
                        <div className="as-suggestion-summary">
                          <strong>제안:</strong> {m.suggestion.preview}
                          <span className="as-conf">
                            신뢰도 {(m.suggestion.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="as-suggestion-actions">
                          <button
                            className="btn-primary"
                            onClick={() => onAcceptSuggestion(m.suggestion)}
                          >
                            바로 등록
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={() => onOpenModal(m.suggestion)}
                          >
                            수정 후 등록
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <div className="as-chat-input-row">
            <input
              type="text"
              className="as-chat-input"
              placeholder={
                isNameReady
                  ? "메시지를 입력하세요…  예) @민준 내일까지 배포 준비 부탁 #배포"
                  : "먼저 위에서 내 이름을 설정해 주세요."
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={busy || !isNameReady}
            />
            <button
              className="btn-primary as-send-button"
              onClick={handleSend}
              disabled={busy || !isNameReady}
            >
              보내기
            </button>
          </div>

          <div className="as-sample-row">
            {quickSamples.map((s, i) => (
              <button
                key={i}
                className="btn-secondary as-sample-button"
                onClick={() => setInput(s)}
              >
                샘플 {i + 1}
              </button>
            ))}
          </div>
        </section>

        {/* 오른쪽: 생성된 업무 카드 패널 */}
        <section className="task-preview-panel">
          <div className="task-panel-header">
            <h3>생성된 업무 카드</h3>
            <p>ActionSense가 감지한 업무를 한눈에 모아봅니다.</p>
          </div>
          <div className="task-list-scroll">
            {tasks.length === 0 ? (
              <p className="task-empty">
                아직 생성된 업무가 없습니다. 채팅에서 부탁/요청을 해보세요.
              </p>
            ) : (
              tasks.map((t) => (
                <div key={t.id} className="task-card-preview">
                  <p className="status">• {t.status}</p>
                  <h3>{t.title}</h3>
                  <p className="task-id">#{t.id}</p>
                  {t.description && (
                    <p className="description">{t.description}</p>
                  )}
                  {t.assignedTo && (
                    <p className="detail">담당: {t.assignedTo}</p>
                  )}
                  {t.dueDate && <p className="detail">기한: {t.dueDate}</p>}
                  <p className="detail">우선순위: {t.priority}</p>
                  {!!t.tags?.length && (
                    <p className="detail">
                      태그: {t.tags.map((tg) => `#${tg}`).join(" ")}
                    </p>
                  )}
                  <div className="card-actions">
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setTasks((prev) =>
                          prev.map((x) =>
                            x.id === t.id
                              ? {
                                  ...x,
                                  progress: Math.min(
                                    100,
                                    (x.progress ?? 0) + 20
                                  ),
                                }
                              : x
                          )
                        );
                      }}
                    >
                      진행 +20%
                    </button>
                    <button
                      className="btn-danger"
                      onClick={() =>
                        setTasks((prev) => prev.filter((x) => x.id !== t.id))
                      }
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {modalOpen && (
        <div className="task-modal">
          <div className="modal-content">
            <h2>업무 카드 생성</h2>

            <label>제목</label>
            <input
              type="text"
              value={draft?.title || ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, title: e.target.value }))
              }
            />

            <label>담당</label>
            <input
              type="text"
              value={draft?.assignedTo || ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, assignedTo: e.target.value }))
              }
            />

            <label>기한</label>
            <input
              type="date"
              value={draft?.dueDate || ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, dueDate: e.target.value }))
              }
            />

            <label>우선순위</label>
            <select
              value={draft?.priority || "보통"}
              onChange={(e) =>
                setDraft((d) => ({ ...d, priority: e.target.value }))
              }
            >
              <option>낮음</option>
              <option>보통</option>
              <option>높음</option>
            </select>

            <label>태그</label>
            <input
              type="text"
              placeholder="#백엔드 #우선"
              value={(draft?.tags || []).join(" ")}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  tags: e.target.value.split(/\s+/).filter(Boolean),
                }))
              }
            />

            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setModalOpen(false);
                  setDraft(null);
                }}
              >
                취소
              </button>
              <button className="btn-primary" onClick={onSubmitDraft}>
                업무 카드 생성
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActionSense;
