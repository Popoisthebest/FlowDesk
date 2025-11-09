import React, { useState } from "react";
import "./AIScheduler.css";

const AIScheduler = () => {
  const [date, setDate] = useState(new Date(2025, 9, 16));
  const [title, setTitle] = useState("주간 스탠드업 미팅");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("10:30");
  const [location, setLocation] = useState("회의실 A");
  const [participants, setParticipants] = useState(["민준", "서현", "지후"]);
  const [newParticipant, setNewParticipant] = useState("");

  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = (y, m) => new Date(y, m, 1).getDay();

  const renderCalendarDays = () => {
    const y = date.getFullYear();
    const m = date.getMonth();
    const numDays = daysInMonth(y, m);
    const startDay = firstDayOfMonth(y, m);
    const days = [];

    for (let i = 0; i < startDay; i++)
      days.push(<div key={`empty-${i}`} className="empty-day"></div>);

    for (let d = 1; d <= numDays; d++) {
      const isToday =
        y === new Date().getFullYear() &&
        m === new Date().getMonth() &&
        d === new Date().getDate();
      const isSelected = d === date.getDate();
      days.push(
        <div
          key={d}
          className={`calendar-day ${isToday ? "today" : ""} ${
            isSelected ? "selected" : ""
          }`}
          onClick={() => setDate(new Date(y, m, d))}
        >
          {d}
        </div>
      );
    }
    return days;
  };

  const goToPreviousMonth = () =>
    setDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const goToNextMonth = () =>
    setDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));

  const addParticipant = (e) => {
    e.preventDefault();
    if (newParticipant.trim() && !participants.includes(newParticipant)) {
      setParticipants([...participants, newParticipant.trim()]);
      setNewParticipant("");
    }
  };

  const removeParticipant = (name) =>
    setParticipants(participants.filter((p) => p !== name));

  return (
    <div className="ai-scheduler-container">
      <div className="scheduler-main">
        {/* HEADER */}
        <header className="scheduler-header">
          <div className="scheduler-header-left">
            <div className="scheduler-logo-puck">📅</div>
            <div>
              <h2 className="scheduler-title">AI 일정 비서</h2>
              <p className="scheduler-subtitle">
                자연어로 입력하면 자동으로 일정을 인식하고 캘린더에 등록합니다.
              </p>
            </div>
          </div>
          <button className="btn-primary schedule-run-btn">
            일정 자동 인식
          </button>
        </header>

        {/* MAIN GRID */}
        <div className="scheduler-grid">
          {/* LEFT: 일정 생성 */}
          <section className="scheduler-left">
            <div className="schedule-card">
              <h3>새 일정 등록</h3>
              <div className="form-group">
                <label>제목</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="일정 제목 입력"
                />
              </div>

              <div className="form-group-inline">
                <div className="form-group">
                  <label>시작</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>종료</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>날짜</label>
                <input
                  type="date"
                  value={date.toISOString().split("T")[0]}
                  onChange={(e) => setDate(new Date(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label>장소</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>참석자</label>
                <div className="participants-input">
                  {participants.map((p) => (
                    <span key={p} className="participant-tag">
                      {p}
                      <button onClick={() => removeParticipant(p)}>×</button>
                    </span>
                  ))}
                  <form onSubmit={addParticipant}>
                    <input
                      type="text"
                      value={newParticipant}
                      onChange={(e) => setNewParticipant(e.target.value)}
                      placeholder="+ 추가"
                    />
                  </form>
                </div>
              </div>

              <div className="form-actions">
                <button className="btn-secondary">수정</button>
                <button className="btn-primary">일정 등록</button>
              </div>
            </div>

            <div className="natural-language-card">
              <h4>자연어 입력</h4>
              <p>예: “내일 오전 10시에 회의실 A에서 디자인 리뷰”</p>
              <div className="natural-input">
                <input
                  type="text"
                  placeholder="자연어로 일정 입력..."
                  style={{ width: "100%" }}
                />
              </div>
            </div>
          </section>

          {/* RIGHT: 캘린더 + 퀵액션 */}
          <section className="scheduler-right">
            <div className="calendar-card">
              <div className="calendar-header">
                <button className="btn-secondary" onClick={goToPreviousMonth}>
                  &lt;
                </button>
                <h3>
                  {date.getFullYear()}년 {date.getMonth() + 1}월
                </h3>
                <button className="btn-secondary" onClick={goToNextMonth}>
                  &gt;
                </button>
              </div>

              <div className="calendar-grid">
                {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                  <div key={d} className="calendar-weekday">
                    {d}
                  </div>
                ))}
                {renderCalendarDays()}
              </div>
            </div>

            <div className="quick-actions">
              <h3>빠른 액션</h3>
              <button className="btn-primary">Google 캘린더로 내보내기</button>
              <button className="btn-secondary">팀원들과 공유</button>
              <button className="btn-secondary">일정 관리 보기</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AIScheduler;
