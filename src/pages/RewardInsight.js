// src/pages/RewardInsight.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./RewardInsight.css";
import "./ActionSense.css"; // 채팅 말풍선/레이아웃 스타일 재사용

// 로컬스토리지 키
const STORAGE_KEYS = {
  CHAT: "ri_chatMessages_v2",
  KUDOS_LIST: "ri_recentKudos_v2",
  KUDOS_COUNT: "ri_kudosCount_v2",
  TOP_RECEIVERS: "ri_topReceivers_v2",
  USER_NAME: "ri_user_name_v1",
};

// 팀 멤버 예시 (필요에 따라 수정 가능)
const TEAM_MEMBERS = ["서현", "민준", "지효", "태호"];

// 공통 load/save 함수
function loadState(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function saveState(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // 무시
  }
}

// 간단한 ID 생성
function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// 긍정 키워드 감지
function hasPositiveKeyword(text) {
  const keywords = [
    "수고",
    "고생",
    "고마워",
    "고맙",
    "감사",
    "최고",
    "잘했",
    "잘 했",
    "멋지",
    "대단",
    "덕분",
    "도와줘",
    "도와 줘",
    "도와줘서",
    "도와줘서 고마워",
    "도움",
    "칭찬",
    "뿌듯",
  ];
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

// 칭찬 대상 추출
function extractReceiverFromText(text) {
  for (const name of TEAM_MEMBERS) {
    if (text.includes(name)) return name;
  }
  // 이름이 안 나오면 기본값
  return TEAM_MEMBERS[0];
}

// 칭찬 요약 문장
function buildKudosSummary(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "고마웠던 순간을 기록하는 칭찬 카드";
  if (cleaned.length <= 40) return cleaned;
  return cleaned.slice(0, 40) + "…";
}

const RewardInsight = () => {
  // 이름 설정
  const [userName, setUserName] = useState(() => {
    const saved = loadState(STORAGE_KEYS.USER_NAME, null);
    return typeof saved === "string" ? saved : "";
  });
  const [nameInput, setNameInput] = useState(() => {
    const saved = loadState(STORAGE_KEYS.USER_NAME, null);
    return typeof saved === "string" ? saved : "";
  });
  const isNameReady = !!userName;

  // 채팅 메시지 (ActionSense 스타일 구조)
  const [messages, setMessages] = useState(() =>
    loadState(STORAGE_KEYS.CHAT, [
      {
        id: makeId(),
        role: "system",
        text: "칭찬 리워드 인사이트가 채팅 속 긍정적인 표현을 감지해 칭찬 카드로 전환해 줍니다. 예: “서현 오늘 발표 준비하느라 너무 수고했어, 고마워!”",
        authorName: "RewardInsight",
        createdAt: Date.now(),
        suggestion: null,
      },
      {
        id: makeId(),
        role: "user",
        text: "서현 오늘 릴리즈 준비하느라 진짜 고생 많았어. 덕분에 잘 끝났어!",
        authorName: "민준",
        createdAt: Date.now() + 1,
        suggestion: null,
      },
    ])
  );

  // 칭찬 카드 / 지표
  const [recentKudos, setRecentKudos] = useState(() =>
    loadState(STORAGE_KEYS.KUDOS_LIST, [
      {
        id: makeId(),
        receiver: "서현",
        message: "릴리즈 준비 기여도 칭찬",
        badge: "⭐",
      },
      {
        id: makeId(),
        receiver: "민준",
        message: "긴급 버그 대응",
        badge: "🚀",
      },
      {
        id: makeId(),
        receiver: "지효",
        message: "새로운 아이디어 제안",
        badge: "💡",
      },
    ])
  );

  const [kudosThisWeek, setKudosThisWeek] = useState(() =>
    loadState(STORAGE_KEYS.KUDOS_COUNT, 7)
  );

  const [topReceivers, setTopReceivers] = useState(() =>
    loadState(STORAGE_KEYS.TOP_RECEIVERS, [
      { name: "서현", kudos: 12 },
      { name: "민준", kudos: 8 },
      { name: "지효", kudos: 6 },
    ])
  );

  // 채팅 입력
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  // 모달 관련
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(null); // {receiver, message, badge}

  // 스크롤 및 포커스
  const endRef = useRef(null);
  const inputRef = useRef(null);

  // 샘플 문장 (빠른 테스트용)
  const quickSamples = [
    "서현 오늘 데이터 정리하느라 고생 많았어, 덕분에 리포트 잘 나왔어!",
    "민준 덕분에 배포가 매끄럽게 끝났어. 최고야.",
    "지효가 제안한 UX 아이디어 덕분에 전환율 올라간 것 같아, 고마워.",
    "오늘 모두 긴 회의하느라 수고했어요. 다음 스프린트도 화이팅!",
  ];

  // 팀 참여율 간단 계산
  const teamEngagement = useMemo(() => {
    return Math.min(100, 60 + kudosThisWeek * 3);
  }, [kudosThisWeek]);

  // 로컬스토리지 저장
  useEffect(() => {
    saveState(STORAGE_KEYS.CHAT, messages);
  }, [messages]);

  useEffect(() => {
    saveState(STORAGE_KEYS.KUDOS_LIST, recentKudos);
  }, [recentKudos]);

  useEffect(() => {
    saveState(STORAGE_KEYS.KUDOS_COUNT, kudosThisWeek);
  }, [kudosThisWeek]);

  useEffect(() => {
    saveState(STORAGE_KEYS.TOP_RECEIVERS, topReceivers);
  }, [topReceivers]);

  useEffect(() => {
    saveState(STORAGE_KEYS.USER_NAME, userName);
  }, [userName]);

  // 메시지/모달 변경 시 맨 아래로 스크롤
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, modalOpen]);

  // 이름 저장
  const handleSaveName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setUserName(trimmed);
  };

  // 메시지 추가 (ActionSense와 유사)
  const addMessage = (role, text, meta = {}) => {
    const m = {
      id: makeId(),
      role,
      text,
      authorName:
        meta.authorName ||
        (role === "user"
          ? userName || "나"
          : role === "assistant"
          ? "RewardInsight"
          : "시스템"),
      createdAt: Date.now(),
      suggestion: meta.suggestion || null,
    };
    setMessages((prev) => [...prev, m]);
    return m;
  };

  // 칭찬 카드 실제 생성 로직
  const createKudosCard = (payload) => {
    const receiver = payload.receiver || TEAM_MEMBERS[0];
    const message = (payload.message || "").trim() || "고마웠던 순간 기록";
    const badge = payload.badge || "⭐";

    const newKudos = {
      id: makeId(),
      receiver,
      message,
      badge,
      createdAt: Date.now(),
    };

    setRecentKudos((prev) => [newKudos, ...prev].slice(0, 30));
    setKudosThisWeek((prev) => prev + 1);

    setTopReceivers((prev) => {
      const list = [...prev];
      const idx = list.findIndex((m) => m.name === receiver);
      if (idx >= 0) {
        list[idx] = { ...list[idx], kudos: list[idx].kudos + 1 };
      } else {
        list.push({ name: receiver, kudos: 1 });
      }
      list.sort((a, b) => b.kudos - a.kudos);
      return list;
    });
  };

  // 메시지 분석 -> 칭찬 제안 만들기
  const runAnalyzerOnMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (!hasPositiveKeyword(trimmed)) return;

    const receiver = extractReceiverFromText(trimmed);
    const summary = buildKudosSummary(trimmed);

    const extracted = {
      receiver,
      message: summary,
      badge: "⭐",
    };

    const preview = `To. ${receiver} / "${summary}" / 배지: ⭐`;

    addMessage("assistant", "💡 방금 메시지를 칭찬 카드로 만들어 볼까요?", {
      suggestion: {
        extracted,
        preview,
        confidence: 0.9,
      },
      authorName: "RewardInsight",
    });
  };

  // 채팅 전송
  const handleSend = async () => {
    const text = input.trim();
    if (!text || busy || !isNameReady) return;

    setBusy(true);
    addMessage("user", text, { authorName: userName || "나" });
    setInput("");

    // 입력창에 바로 포커스
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    try {
      await runAnalyzerOnMessage(text);
    } finally {
      setBusy(false);
    }
  };

  // 제안 즉시 적용
  const handleAcceptSuggestion = (suggestion) => {
    createKudosCard(suggestion.extracted || {});
    addMessage(
      "system",
      `✅ 칭찬 카드를 생성했습니다: To. ${
        suggestion.extracted?.receiver || "팀원"
      }`,
      { authorName: "RewardInsight" }
    );
  };

  // 제안 수정 후 모달로 열기
  const handleOpenModalFromSuggestion = (suggestion) => {
    const extracted = suggestion.extracted || {};
    setDraft({
      receiver: extracted.receiver || TEAM_MEMBERS[0],
      message: extracted.message || "",
      badge: extracted.badge || "⭐",
    });
    setModalOpen(true);
  };

  // 상단 버튼으로 새 카드 만들기
  const handleOpenEmptyModal = () => {
    setDraft({
      receiver: TEAM_MEMBERS[0],
      message: "",
      badge: "⭐",
    });
    setModalOpen(true);
  };

  // 모달에서 생성
  const handleSubmitDraft = () => {
    if (!draft) return;
    createKudosCard(draft);
    setModalOpen(false);
    setDraft(null);
    addMessage("system", "✅ 수정한 내용으로 칭찬 카드를 생성했습니다.", {
      authorName: "RewardInsight",
    });
  };

  const visibleMessages = useMemo(() => messages, [messages]);

  return (
    <div className="reward-insight-container">
      <div className="reward-main">
        {/* HEADER */}
        <header className="ri-header">
          <div className="ri-header-left">
            <div className="ri-logo-puck">🏅</div>
            <div>
              <h2 className="ri-title">칭찬 리워드 인사이트</h2>
              <p className="ri-subtitle">
                채팅 속 긍정적인 순간을 포착해 칭찬 카드로 전환하고, 팀 분위기를
                시각화합니다.
              </p>
            </div>
          </div>
          <div className="ri-header-right">
            <div className="ri-summary-pill">
              이번 주 Kudos <span>{kudosThisWeek}</span>건
            </div>
            <button
              className="btn-primary ri-new-kudos-btn"
              type="button"
              onClick={handleOpenEmptyModal}
            >
              새 칭찬 카드 만들기
            </button>
          </div>
        </header>

        {/* MAIN GRID */}
        <div className="ri-grid">
          {/* LEFT: 채팅 패널 (ActionSense 스타일 차용) */}
          <section className="as-chat-card">
            {/* 이름 설정 */}
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
              <p className="as-chat-hint">
                팀 채팅에 자연스럽게 고마움, 수고, 감사 표현을 남기면 자동으로
                칭찬 카드로 전환할 수 있게 제안해 줍니다.
              </p>
            </div>

            {/* 채팅 메시지 리스트 */}
            <div className="as-chat-messages">
              {visibleMessages.map((m) => {
                const isMine = m.role === "user" && m.authorName === userName;
                const msgClass =
                  m.role === "assistant" || m.role === "system"
                    ? "other-message"
                    : isMine
                    ? "my-message"
                    : "other-message";

                return (
                  <div key={m.id} className={`as-message ${msgClass}`}>
                    <div className="as-bubble">
                      <div className="as-message-meta">
                        <span className="as-author-pill">
                          {m.authorName ||
                            (m.role === "user"
                              ? "사용자"
                              : m.role === "assistant"
                              ? "RewardInsight"
                              : "시스템")}
                        </span>
                      </div>
                      <p className="as-message-text">{m.text}</p>

                      {m.suggestion && (
                        <div className="as-suggestion">
                          <div className="as-suggestion-summary">
                            <span>제안: {m.suggestion.preview}</span>
                            <span className="as-conf">
                              신뢰도{" "}
                              {(m.suggestion.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="as-suggestion-actions">
                            <button
                              className="btn-primary"
                              type="button"
                              onClick={() =>
                                handleAcceptSuggestion(m.suggestion)
                              }
                            >
                              바로 칭찬 카드로
                            </button>
                            <button
                              className="btn-secondary"
                              type="button"
                              onClick={() =>
                                handleOpenModalFromSuggestion(m.suggestion)
                              }
                            >
                              수정 후 생성
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

            {/* 입력 영역 */}
            <div className="as-chat-input-row">
              <input
                ref={inputRef}
                type="text"
                className="as-chat-input"
                placeholder={
                  isNameReady
                    ? "예) 서현 오늘 발표 준비하느라 고생 많았어, 고마워!"
                    : "먼저 위에서 내 이름을 설정해 주세요."
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                disabled={busy || !isNameReady}
              />
              <button
                className="btn-primary as-send-button"
                type="button"
                onClick={handleSend}
                disabled={busy || !isNameReady}
              >
                보내기
              </button>
            </div>

            {/* 샘플 문장 버튼 */}
            <div className="as-sample-row">
              {quickSamples.map((s, i) => (
                <button
                  key={i}
                  className="btn-secondary as-sample-button"
                  type="button"
                  onClick={() => setInput(s)}
                >
                  샘플 {i + 1}
                </button>
              ))}
            </div>
          </section>

          {/* RIGHT: 팀 리포트 / 최근 칭찬 카드 */}
          <section className="ri-right-panel">
            <div className="ri-card team-report-card">
              <h3>팀 리포트</h3>
              <p className="ri-card-subtitle">이번 주 Kudos 현황</p>
              <div className="kudos-score">
                <span>{kudosThisWeek}</span>
                <p>이번 주 생성된 칭찬 카드</p>
              </div>
              <div className="engagement-score">
                <span>팀 참여율</span> {teamEngagement}%
              </div>
              <div className="top-receivers">
                <h4>받은 사람 Top 3</h4>
                {topReceivers.slice(0, 3).map((member, index) => (
                  <p key={member.name}>
                    <span>{member.name}</span># {index + 1} • {member.kudos}{" "}
                    kudos
                  </p>
                ))}
              </div>
            </div>

            <div className="ri-card recent-kudos-card">
              <h3>최근 칭찬 카드</h3>
              <div className="recent-kudos-list">
                {recentKudos.length === 0 && (
                  <p className="kudos-empty">
                    아직 생성된 칭찬 카드가 없습니다. 채팅에서 고마움과 수고를
                    표현해 보세요.
                  </p>
                )}
                {recentKudos.map((k, index) => (
                  <div key={k.id || index} className="kudos-card">
                    <span className="avatar">{k.receiver.charAt(0)}</span>
                    <div className="kudos-text">
                      <p className="kudos-main">
                        {k.badge ? `${k.badge} ` : ""}
                        {k.message}
                      </p>
                      <p className="kudos-meta">To. {k.receiver}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* 칭찬 카드 생성 모달 */}
      {modalOpen && (
        <div className="kudos-modal-backdrop">
          <div className="kudos-modal">
            <h2>칭찬 리워드 생성</h2>

            <div className="form-group">
              <label>받는 사람</label>
              <select
                value={draft?.receiver || TEAM_MEMBERS[0]}
                onChange={(e) =>
                  setDraft((d) => ({ ...(d || {}), receiver: e.target.value }))
                }
              >
                {Array.from(
                  new Set([...TEAM_MEMBERS, ...topReceivers.map((m) => m.name)])
                ).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>메시지 요약</label>
              <input
                type="text"
                value={draft?.message || ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...(d || {}), message: e.target.value }))
                }
              />
            </div>

            <div className="form-group">
              <label>배지 선택</label>
              <div className="badge-options">
                {["⭐", "🚀", "💡", "🤝"].map((badge) => (
                  <button
                    key={badge}
                    type="button"
                    className={
                      "badge" +
                      (draft?.badge === badge ? " badge-selected" : "")
                    }
                    onClick={() =>
                      setDraft((d) => ({ ...(d || {}), badge: badge }))
                    }
                  >
                    {badge}
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setDraft(null);
                }}
              >
                취소
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={handleSubmitDraft}
              >
                생성
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RewardInsight;
