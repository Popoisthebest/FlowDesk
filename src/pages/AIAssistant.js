import React from "react";
import "./AIAssistant.css"; // CSS 파일 임포트

const AIAssistant = () => {
  return (
    <div className="ai-assistant-container">
      {/* Top Bar */}
      <header className="top-bar">
        <div className="logo">FlowDesk</div>
        <div className="search-bar">
          <input type="text" placeholder="회의 검색" />
        </div>
        <div className="user-profile">
          {/* User icon and other actions */}
          <button>🔍</button>
          <button>🔔</button>
          <button>⚙️</button>
          <button>👤</button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="main-content">
        {/* Meeting Assistant Content */}
        <div className="meeting-assistant-panel">
          <div className="panel-header">
            <h1>AI 회의 비서</h1>
            <span className="status">실시간 기록 중</span>
            <span className="time">
              <span className="circle"></span> 14:30 - 진행 중
            </span>
          </div>

          <div className="meeting-details">
            <div className="realtime-speech-recognition">
              <h2>실시간 음성 인식</h2>
              <div className="waveform-display">
                {/* Waveform will be dynamically rendered here */}
                <img
                  src="logo.svg"
                  alt="waveform"
                  style={{ width: "100px", height: "auto" }}
                />{" "}
                {/* Placeholder */}
              </div>
            </div>

            <div className="speech-to-text">
              <h2>실시간 음성 → 텍스트</h2>
              <div className="chat-history">
                <div className="message minjun">
                  <span className="speaker">민준</span>
                  <p>이번 스프린트 목표는 액션센스 정확도 95%입니다.</p>
                  <span className="timestamp">14:32</span>
                </div>
                <div className="message seohyeon">
                  <span className="speaker">서현</span>
                  <p>
                    현재 테스트 결과를 보면 92% 정도 나오고 있어요. 추가
                    최적화가 필요할 것 같습니다.
                  </p>
                  <span className="timestamp">14:33</span>
                </div>
                <div className="message jihyo">
                  <span className="speaker">지효</span>
                  <p>테스트 케이스를 더 다양하게 집중해보겠습니다.</p>
                  <span className="timestamp">14:34</span>
                </div>
                <div className="message minjun">
                  <span className="speaker">민준</span>
                  <p>좋습니다. 그리고 문장 사전 업데이트도 필요해 보이네요.</p>
                  <span className="timestamp">14:35</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Auto Generated Tasks Panel */}
        <div className="auto-generated-tasks-panel">
          <h2>자동 생성된 할 일</h2>
          <p className="task-description">AI가 회의 내용을 분석하여 생성</p>

          <div className="task-card">
            <h3>액션센스 문장 사전 업데이트</h3>
            <p className="assignee">담당: 민준</p>
            <p className="progress">진행: 1/28</p>
          </div>
          <div className="task-card">
            <h3>요약 템플릿 수정</h3>
            <p className="assignee">담당: 서현</p>
          </div>
          <div className="task-card">
            <h3>테스트 케이스 정리</h3>
            <p className="assignee">담당: 지효</p>
          </div>

          <button className="view-all-button">모두 보기</button>
          <button className="add-to-calendar-button">내 캘린더로</button>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;
