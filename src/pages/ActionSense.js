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
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * ActionSense
 * - 채팅 메시지에서 행동 유발 문장 감지 → 업무 카드 생성 제안/자동등록
 * - 룰 기반 + (옵션) LLM 보강
 * - 채팅: Firebase Firestore 사용
 * - 업무 카드(tasks): Firestore actionSenseTasks 컬렉션에 저장
 */

const ENABLE_LLM_FALLBACK = true;

/* ===== Date utils ===== */
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

// [CHANGED] 월 기준 요일 인덱스: 월=0, 화=1, ... 일=6
function parseWeekdayIndexMon0(token) {
  const map = {
    월: 0,
    월요일: 0,
    화: 1,
    화요일: 1,
    수: 2,
    수요일: 2,
    목: 3,
    목요일: 3,
    금: 4,
    금요일: 4,
    토: 5,
    토요일: 5,
    일: 6,
    일요일: 6,
  };
  return map[token] ?? null;
}

// [CHANGED] 기준 날짜가 속한 "이번주 월요일" 구하기 (월요일을 주 시작으로)
function getMondayOfWeek(date) {
  const d = startOfDay(date);
  const dow = d.getDay(); // 0=일
  const diffFromMon = (dow + 6) % 7; // 월(1)->0, 화(2)->1, ..., 일(0)->6
  d.setDate(d.getDate() - diffFromMon);
  return d;
}

// [CHANGED] 개선된 한국어 날짜 파서 (AIScheduler와 동일 로직)
function normalizeDateKorean(str, now = new Date()) {
  if (!str) return null;
  const text = str.trim();
  const today = startOfDay(now);

  const hasPastMarker = /(지난|지난주|지난달|작년|전년)/.test(text);

  // 오늘/내일/모레/글피
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

  // 이번 주말 / 주말까지
  if (/이번\s*주\s*말|EOW|주말\s*까지/i.test(text)) {
    const eow = endOfWeek(today);
    return toYMD(eow);
  }

  // 월말/말일
  if (/월말|말일/.test(text)) {
    return toYMD(lastDayOfMonth(today));
  }

  // [CHANGED] "이번/다음/다다음/다다다음 주 + 요일"
  const wk = text.match(
    /((?:이번|다음|내|차|다다음|다다다음)\s*주)\s*(월요일|화요일|수요일|목요일|금요일|토요일|일요일|월|화|수|목|금|토|일)/
  );
  if (wk) {
    const weekWord = wk[1];
    const weekdayWord = wk[2];

    let weekOffset = 0;
    if (/다다다음/.test(weekWord)) weekOffset = 3;
    else if (/다다음/.test(weekWord)) weekOffset = 2;
    else if (/다음|내|차/.test(weekWord)) weekOffset = 1;
    else weekOffset = 0; // 이번주

    const idx = parseWeekdayIndexMon0(weekdayWord);
    if (idx != null) {
      const thisMon = getMondayOfWeek(today);
      const weekStart = new Date(thisMon);
      weekStart.setDate(weekStart.getDate() + 7 * weekOffset);

      const target = new Date(weekStart);
      target.setDate(weekStart.getDate() + idx);

      // "이번주 화요일"인데 이미 지났으면 다음주로
      if (weekOffset === 0 && target < today) {
        target.setDate(target.getDate() + 7);
      }

      return toYMD(target);
    }
  }

  // [CHANGED] 단독 요일: "화요일에 회의" → 가장 가까운 미래의 해당 요일
  const wd = text.match(
    /(월요일|화요일|수요일|목요일|금요일|토요일|일요일|월|화|수|목|금|토|일)/
  );
  if (wd) {
    const idx = parseWeekdayIndexMon0(wd[1]);
    if (idx != null) {
      const thisMon = getMondayOfWeek(today);
      let target = new Date(thisMon);
      target.setDate(thisMon.getDate() + idx);

      if (target <= today) {
        target.setDate(target.getDate() + 7);
      }
      return toYMD(target);
    }
  }

  // 2025-11-13 / 2025.11.13
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

  // 11-13 / 11.13 (올해)
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

  // (이번/다음달) 11월 13일
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

/* ===== 핵심 분석기(룰 기반) ===== */
function analyzeMessageRuleBased(text, now = new Date()) {
  const original = text;
  text = (text || "").trim();

  const actionVerbs = [
    /해\s*줘/,
    /해\s*주(세|세요|십시[오요]?)/,
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
  // [CHANGED] 개선된 normalizeDateKorean 사용
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

/* ===== 로컬스토리지: 사용자 이름만 유지 ===== */
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
  // 업무 카드는 Firestore actionSenseTasks 컬렉션에서 관리
  const [tasks, setTasks] = useState([]);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  const [channel, setChannel] = useState("#general");
  const channels = ["#general", "#dev", "#design"];

  // 사용자 이름
  const [userName, setUserName] = useState(() => {
    const saved = loadLS(LS_USER_NAME, null);
    return typeof saved === "string" ? saved : "";
  });
  const [nameInput, setNameInput] = useState(() => {
    const saved = loadLS(LS_USER_NAME, null);
    return typeof saved === "string" ? saved : "";
  });

  const isNameReady = !!userName;

  // Firestore: 채팅 메시지 구독
  useEffect(() => {
    const colRef = collection(db, "actionSenseMessages");
    const q = query(colRef, orderBy("createdAt", "asc"));

    const unsub = onSnapshot(q, async (snap) => {
      if (snap.empty) {
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

      const list = snap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
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

  // Firestore: 업무 카드 구독
  useEffect(() => {
    const colRef = collection(db, "actionSenseTasks");
    const q = query(colRef, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          status: data.status || "진행 예정",
          title: data.title || "제목 없음",
          description: data.description || "",
          assignedTo: data.assignedTo || null,
          dueDate: data.dueDate || null,
          priority: data.priority || "보통",
          tags: data.tags || [],
          createdAt: data.createdAt,
          progress: data.progress ?? 0,
        };
      });
      setTasks(list);
    });

    return () => unsub();
  }, []);

  // 메시지/모달 변화시 맨 아래로 스크롤
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, modalOpen]);

  // 현재 채널 메시지 + UI 레벨 중복 제거
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
        continue;
      }
      deduped.push(m);
    }

    return deduped;
  }, [messages, channel]);

  // Firestore에 메시지 추가 (쓰기 전 중복 방지)
  const addMessage = async (role, text, meta = {}) => {
    const displayName =
      meta.authorName ||
      (role === "user"
        ? userName || "나"
        : role === "assistant"
        ? "ActionSense"
        : "시스템");

    const targetChannel = meta.channel || channel;
    const nowSec = Math.floor(Date.now() / 1000);

    const isDuplicate = messages.some((m) => {
      const ts = m.createdAt?.seconds ?? null;
      if (ts == null) return false;
      const diff = Math.abs(nowSec - ts);
      return (
        diff <= 2 &&
        (m.channel || "#general") === targetChannel &&
        (m.role || "user") === role &&
        (m.authorName || "") === displayName &&
        (m.text || "") === text
      );
    });

    if (isDuplicate) {
      return;
    }

    const payload = {
      role,
      text,
      channel: targetChannel,
      suggestion: meta.suggestion || null,
      authorName: displayName,
      createdAt: serverTimestamp(),
    };
    await addDoc(collection(db, "actionSenseMessages"), payload);
  };

  // Firestore에 업무 카드 추가
  const addTask = async (payload) => {
    const colRef = collection(db, "actionSenseTasks");
    const base = {
      status: "진행 예정",
      title: payload.title || "제목 없음",
      description: payload.description || "",
      assignedTo: payload.assignedTo || null,
      dueDate: payload.dueDate || null,
      priority: payload.priority || "보통",
      tags: payload.tags || [],
      createdAt: serverTimestamp(),
      progress: 0,
    };
    const docRef = await addDoc(colRef, base);
    return { id: docRef.id, ...base };
  };

  const onAcceptSuggestion = async (suggestion) => {
    const t = await addTask({
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
    const t = await addTask({
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

  // === 메시지 분석 + AI 보강 ===
  const runAnalyzerOnMessage = async (text) => {
    const now = new Date();
    const rb = analyzeMessageRuleBased(text, now);

    // 1) 룰 기반에서 액션으로 판단된 경우
    if (rb.isAction) {
      const { extracted, confidence } = rb;

      let finalExtracted = { ...extracted };

      // 담당자 누락 시 AI로 추론 시도
      if (!finalExtracted.assignedTo || finalExtracted.assignedTo === "null") {
        try {
          setBusy(true);
          const aiGuess = await extractActionItems(text);
          if (Array.isArray(aiGuess) && aiGuess.length > 0) {
            const first = aiGuess[0];
            if (first.assignedTo && first.assignedTo.length > 0) {
              finalExtracted.assignedTo = first.assignedTo;
              await addMessage(
                "system",
                `🤖 담당자가 명시되지 않아 AI가 '${first.assignedTo}'님을 담당자로 추론했습니다.`,
                { authorName: "ActionSense" }
              );
            }
            if (first.text && first.text.length > 0) {
              finalExtracted.title = first.text;
            }

            // [선택] LLM이 상대 날짜 정보를 주는 경우, 룰 기반보다 우선 적용하고 싶다면 여기서 보정 가능
            // 예: first.offsetDays, first.relative 등
          }
        } catch (e) {
          console.warn("AI 담당자 추론 실패:", e);
        } finally {
          setBusy(false);
        }
      }

      const preview = `${finalExtracted.title} ${
        finalExtracted.assignedTo ? ` / 담당:${finalExtracted.assignedTo}` : ""
      }${finalExtracted.dueDate ? ` / 기한:${finalExtracted.dueDate}` : ""}${
        finalExtracted.priority ? ` / 우선순위:${finalExtracted.priority}` : ""
      }${
        finalExtracted.tags?.length
          ? ` / #${finalExtracted.tags.join(" #")}`
          : ""
      }`;

      await addMessage("assistant", "💡 업무로 등록할까요?", {
        suggestion: { extracted: finalExtracted, confidence, preview },
        authorName: "ActionSense",
      });

      if (confidence >= 0.95) {
        const t = await addTask({
          ...finalExtracted,
          description: `고신뢰 자동생성: “${finalExtracted.title}”`,
        });
        await addMessage(
          "system",
          `⚡ 고신뢰 감지로 자동 등록: #${t.id} (${t.title})`,
          { authorName: "ActionSense" }
        );
      }
    }
    // 2) 룰 기반에서 액션이 아니라고 판단되었지만, LLM 보강을 켜둔 경우
    else if (ENABLE_LLM_FALLBACK) {
      try {
        setBusy(true);
        const aiGuess = await extractActionItems(text);

        if (Array.isArray(aiGuess) && aiGuess.length > 0) {
          const first = aiGuess[0];

          // [CHANGED] LLM이 상대 날짜(offsetDays/relative)나 dueDate를 주면 여기서 YMD로 변환
          let resolvedDue = null;

          // 1) offsetDays: 숫자 (예: 7 → 7일 후)
          if (
            typeof first.offsetDays === "number" &&
            Number.isFinite(first.offsetDays)
          ) {
            const base = startOfDay(now);
            base.setDate(base.getDate() + first.offsetDays);
            resolvedDue = toYMD(base);
          }

          // 2) relative: "7일 후" 같은 문자열
          if (!resolvedDue && typeof first.relative === "string") {
            const m = first.relative.match(/(\d+)\s*일\s*후/);
            if (m) {
              const offset = parseInt(m[1], 10);
              if (Number.isFinite(offset)) {
                const base = startOfDay(now);
                base.setDate(base.getDate() + offset);
                resolvedDue = toYMD(base);
              }
            }
          }

          // 3) dueDate: "다음주 화요일" 또는 "2025-11-13" 같은 문자열
          if (!resolvedDue && first.dueDate) {
            const s = String(first.dueDate).trim();
            const norm = normalizeDateKorean(s, now);
            if (norm) {
              resolvedDue = norm;
            } else {
              const d = new Date(s);
              if (!isNaN(d.getTime())) {
                resolvedDue = toYMD(d);
              }
            }
          }

          const extracted = {
            title:
              (first.text && String(first.text).trim()) ||
              text.slice(0, 64) ||
              "업무 요청",
            assignedTo:
              (first.assignedTo && String(first.assignedTo).trim()) || null,
            dueDate: resolvedDue,
            priority: first.priority || "보통",
            tags: [],
          };

          if (!extracted.assignedTo) {
            const mention = text.match(/@([가-힣A-Za-z0-9_]+)/);
            if (mention) {
              extracted.assignedTo = mention[1];
            }
          }

          const confidence = 0.8;
          const preview = `${extracted.title} ${
            extracted.assignedTo ? ` / 담당:${extracted.assignedTo}` : ""
          }${extracted.dueDate ? ` / 기한:${extracted.dueDate}` : ""}${
            extracted.priority ? ` / 우선순위:${extracted.priority}` : ""
          }`;

          await addMessage("assistant", "💡 업무로 등록할까요?", {
            suggestion: { extracted, confidence, preview },
            authorName: "ActionSense",
          });
        }
      } catch (e) {
        console.warn("LLM fallback error:", e);
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
          {/* 이름 설정 영역 */}
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
                      onClick={async () => {
                        const current = t.progress ?? 0;
                        const next = Math.min(100, current + 20);
                        try {
                          await updateDoc(doc(db, "actionSenseTasks", t.id), {
                            progress: next,
                          });
                        } catch (e) {
                          console.error("Progress update failed:", e);
                        }
                      }}
                    >
                      진행 +20%
                    </button>
                    <button
                      className="btn-danger"
                      onClick={async () => {
                        try {
                          await deleteDoc(doc(db, "actionSenseTasks", t.id));
                        } catch (e) {
                          console.error("Task delete failed:", e);
                        }
                      }}
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
