import React, { useState } from "react";
import "./RewardInsight.css";

const RewardInsight = () => {
  const [activeTab, setActiveTab] = useState("개발팀 • 릴리즈 준비");

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

  return (
    <div className="reward-insight-container">
      {/* Top Bar */}
      {/* Main Content Area */}
      <div className="main-content">
        {/* Reward Insight Panel */}
        <div className="reward-insight-panel">
          <div className="panel-header">
            <div className="tabs">
              <button
                className={`btn-secondary ${
                  activeTab === "개발팀 • 릴리즈 준비" ? "active" : ""
                }`}
                onClick={() => setActiveTab("개발팀 • 릴리즈 준비")}
              >
                개발팀 • 릴리즈 준비
              </button>
              {/* 다른 탭들 */}
            </div>
            <p>4명 참여 중</p>
          </div>

          <div className="chat-area">
            <div className="message">
              <p>
                <span>민준</span>
              </p>
              <p>
                <span>오후 3:20</span> 릴리즈 준비 어떻게 진행되고 있나요?
              </p>
            </div>
            <div className="message">
              <p>
                <span>서현</span>
              </p>
              <p>
                <span>오후 3:22</span> 테스트 케이스 모두 통과했고, 배포 준비
                완료했습니다.
              </p>
            </div>
            <div className="system-message">
              <p>
                <span>오후 3:25</span> 이번 릴리즈 정말 수고했어요! 최고에요 👍
              </p>
            </div>
            <div className="input-area">
              <input type="text" placeholder="메시지를 입력하세요..." />
              <button className="btn-primary">🚀</button>
            </div>
          </div>

          {/* Kudos Creation Modal (Example) */}
          <div className="kudos-modal">
            <h2>칭찬 리워드 생성</h2>
            <div className="form-group">
              <label>받는 사람</label>
              <select>
                <option>서현</option>
              </select>
            </div>
            <div className="form-group">
              <label>메시지 요약</label>
              <input
                type="text"
                value="릴리즈 기여도와 문제 해결 능력 칭찬"
                readOnly
              />
            </div>
            <div className="form-group">
              <label>배지 선택</label>
              <div className="badge-options">
                <span className="badge">⭐</span>
                <span className="badge">🚀</span>
                <span className="badge">💡</span>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary">취소</button>
              <button className="btn-primary">생성</button>
            </div>
          </div>
        </div>

        {/* Right Panel (Team Report) */}
        <div className="right-panel">
          <div className="team-report">
            <h2>팀 리포트</h2>
            <p>이번 주 Kudos 현황</p>
            <div className="kudos-score">
              <span>{teamReport.kudosThisWeek}</span>
            </div>
            <div className="engagement-score">
              <span>팀 참여율</span> {teamReport.teamEngagement}%
            </div>
            <div className="top-receivers">
              <h3>받은 사람 Top 3</h3>
              {teamReport.topReceivers.map((member, index) => (
                <p key={index}>
                  <span>{member.name}</span> #{index + 1} {member.kudos} kudos
                </p>
              ))}
            </div>
          </div>

          <div className="recent-kudos">
            <h2>최근 카드</h2>
            {recentKudos.map((kudos, index) => (
              <div key={index} className="kudos-card">
                <span className="avatar">{kudos.receiver.charAt(0)}</span>
                <p>{kudos.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RewardInsight;
