import React, { useState } from "react";
import "./RewardInsight.css";

const RewardInsight = () => {
  const [activeTab, setActiveTab] = useState("개발팀 • 릴리즈 준비");
  const [chatInput, setChatInput] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selectedReceiver, setSelectedReceiver] = useState("서현");
  const [selectedBadge, setSelectedBadge] = useState("⭐");
  const [kudosMessage, setKudosMessage] = useState(
    "릴리즈 기여도와 문제 해결 능력 칭찬"
  );

  const teamReport = {
    kudosThisWeek: 7,
    teamEngagement: 85,
    topReceivers: [
      { name: "서현", kudos: 12 },
      { name: "민준", kudos: 8 },
      { name: "지효", kudos: 6 },
    ],
  };

  const recentKudos = [
    { receiver: "서현", message: "릴리즈 기여도 칭찬" },
    { receiver: "민준", message: "빠른 버그 수정" },
    { receiver: "지효", message: "새로운 기능 제안" },
  ];

  const sampleChat = [
    {
      sender: "민준",
      time: "오후 3:20",
      text: "릴리즈 준비 어떻게 진행되고 있나요?",
      type: "user",
    },
    {
      sender: "서현",
      time: "오후 3:22",
      text: "테스트 케이스 모두 통과했고, 배포 준비 완료했습니다.",
      type: "user",
    },
    {
      sender: "시스템",
      time: "오후 3:25",
      text: "이번 릴리즈 정말 수고했어요! 최고에요 👍\n→ 서현에게 칭찬 리워드로 전환해 볼까요?",
      type: "system",
    },
  ];

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    // 실제 채팅/분석 로직 대신 샘플 알림
    alert(
      "현재는 데모 상태입니다. 추후 채팅 내용을 분석해 칭찬 리워드를 제안할 예정입니다."
    );
    setChatInput("");
  };

  const handleCreateKudos = () => {
    alert(
      `칭찬 카드 생성!\n\n받는 사람: ${selectedReceiver}\n배지: ${selectedBadge}\n메시지: ${kudosMessage}`
    );
    setShowModal(false);
  };

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
              이번 주 Kudos <strong>{teamReport.kudosThisWeek}</strong>건
            </div>
            <button
              className="btn-primary ri-new-kudos-btn"
              type="button"
              onClick={() => setShowModal(true)}
            >
              새 칭찬 카드 만들기
            </button>
          </div>
        </header>

        {/* MAIN GRID */}
        <div className="ri-grid">
          {/* LEFT: 채팅 + 감지 영역 */}
          <section className="ri-chat-panel">
            {/* 탭 */}
            <div className="ri-tabs-row">
              <div className="ri-tabs">
                <button
                  className={
                    "ri-tab" +
                    (activeTab === "개발팀 • 릴리즈 준비" ? " active" : "")
                  }
                  onClick={() => setActiveTab("개발팀 • 릴리즈 준비")}
                >
                  개발팀 • 릴리즈 준비
                </button>
                <button
                  className={
                    "ri-tab" +
                    (activeTab === "디자인팀 • UX 개선" ? " active" : "")
                  }
                  onClick={() => setActiveTab("디자인팀 • UX 개선")}
                >
                  디자인팀 • UX 개선
                </button>
              </div>
              <p className="ri-tab-meta">4명 참여 중</p>
            </div>

            {/* 채팅 카드 */}
            <div className="ri-chat-card">
              <div className="ri-chat-messages">
                {sampleChat.map((m, idx) => {
                  if (m.type === "system") {
                    return (
                      <div key={idx} className="ri-message system">
                        <div className="ri-system-bubble">
                          <p className="ri-message-time">{m.time}</p>
                          <p className="ri-message-text">
                            {m.text.split("\n").map((line, i) => (
                              <span key={i}>
                                {line}
                                <br />
                              </span>
                            ))}
                          </p>
                          <div className="ri-system-actions">
                            <button
                              className="btn-primary"
                              type="button"
                              onClick={() => setShowModal(true)}
                            >
                              칭찬 카드로 만들기
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={idx} className="ri-message user">
                      <div className="ri-avatar">{m.sender.charAt(0)}</div>
                      <div className="ri-bubble">
                        <p className="ri-message-header">
                          <span className="ri-sender">{m.sender}</span>
                          <span className="ri-message-time">{m.time}</span>
                        </p>
                        <p className="ri-message-text">{m.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 입력 영역 */}
              <div className="ri-chat-input-row">
                <input
                  type="text"
                  placeholder="메시지를 입력하면, 긍정적인 표현을 자동으로 포착해 드릴게요."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                />
                <button
                  className="btn-primary ri-send-btn"
                  type="button"
                  onClick={handleSendChat}
                >
                  전송
                </button>
              </div>
            </div>
          </section>

          {/* RIGHT: 팀 리포트 / 최근 카드 */}
          <section className="ri-right-panel">
            {/* 팀 리포트 카드 */}
            <div className="ri-card team-report-card">
              <h3>팀 리포트</h3>
              <p className="ri-card-subtitle">이번 주 Kudos 현황</p>
              <div className="kudos-score">
                <span>{teamReport.kudosThisWeek}</span>
                <p>이번 주 생성된 칭찬 카드</p>
              </div>
              <div className="engagement-score">
                <span>팀 참여율</span> {teamReport.teamEngagement}%
              </div>
              <div className="top-receivers">
                <h4>받은 사람 Top 3</h4>
                {teamReport.topReceivers.map((member, index) => (
                  <p key={index}>
                    <span>{member.name}</span># {index + 1} • {member.kudos}{" "}
                    kudos
                  </p>
                ))}
              </div>
            </div>

            {/* 최근 칭찬 카드 리스트 */}
            <div className="ri-card recent-kudos-card">
              <h3>최근 칭찬 카드</h3>
              <div className="recent-kudos-list">
                {recentKudos.map((kudos, index) => (
                  <div key={index} className="kudos-card">
                    <span className="avatar">{kudos.receiver.charAt(0)}</span>
                    <div className="kudos-text">
                      <p className="kudos-main">{kudos.message}</p>
                      <p className="kudos-meta">To. {kudos.receiver}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* MODAL: 칭찬 리워드 생성 */}
      {showModal && (
        <div className="kudos-modal-backdrop">
          <div className="kudos-modal">
            <h2>칭찬 리워드 생성</h2>

            <div className="form-group">
              <label>받는 사람</label>
              <select
                value={selectedReceiver}
                onChange={(e) => setSelectedReceiver(e.target.value)}
              >
                {teamReport.topReceivers.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>메시지 요약</label>
              <input
                type="text"
                value={kudosMessage}
                onChange={(e) => setKudosMessage(e.target.value)}
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
                      (selectedBadge === badge ? " badge-selected" : "")
                    }
                    onClick={() => setSelectedBadge(badge)}
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
                onClick={() => setShowModal(false)}
              >
                취소
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={handleCreateKudos}
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
