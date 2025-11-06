import React, { useState } from 'react';
import './AIScheduler.css';

const AIScheduler = () => {
  const [date, setDate] = useState(new Date(2025, 9, 16)); // 2025년 10월 16일
  const [title, setTitle] = useState('주간 스탠드업');
  const [startTime, setStartTime] = useState('오전 10:00');
  const [endTime, setEndTime] = useState('오전 10:30');
  const [location, setLocation] = useState('회의실 A');
  const [participants, setParticipants] = useState(['민준', '서현', '지후']);

  const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay(); // 0 for Sunday, 1 for Monday

  const renderCalendarDays = () => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const numDays = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);
    const calendarDays = [];

    // Empty leading days
    for (let i = 0; i < startDay; i++) {
      calendarDays.push(<div key={`empty-${i}`} className="empty-day"></div>);
    }

    // Days of the month
    for (let i = 1; i <= numDays; i++) {
      const isToday = year === new Date().getFullYear() && month === new Date().getMonth() && i === new Date().getDate();
      const isSelected = year === date.getFullYear() && month === date.getMonth() && i === date.getDate();
      calendarDays.push(
        <div
          key={i}
          className={`calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
          onClick={() => setDate(new Date(year, month, i))}
        >
          {i}
        </div>
      );
    }
    return calendarDays;
  };

  const goToPreviousMonth = () => {
    setDate(prevDate => new Date(prevDate.getFullYear(), prevDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setDate(prevDate => new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 1));
  };


  return (
    <div className="ai-scheduler-container">
      {/* Top Bar */}
      {/* Main Content Area */}
      <div className="main-content">
        {/* Scheduler Panel */}
        <div className="scheduler-panel">
          <div className="panel-header">
            <h1>AI 일정 비서</h1>
          </div>

          <div className="schedule-form">
            <div className="form-group">
              <label>제목</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label>날짜</label>
              <input type="date" value={date.toISOString().split('T')[0]} onChange={(e) => setDate(new Date(e.target.value))} />
            </div>
            <div className="form-group-inline">
              <div className="form-group">
                <label>시작</label>
                <input type="text" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="form-group">
                <label>종료</label>
                <input type="text" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label>장소</label>
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="form-group">
              <label>참석자</label>
              <div className="participants-input">
                {participants.map((p, i) => (
                  <span key={i} className="participant-tag">{p} <button>x</button></span>
                ))}
                <input type="text" placeholder="+ 추가" />
              </div>
            </div>
            <div className="form-actions">
              <button className="modify-button">수정</button>
              <button className="register-button">일정 등록</button>
            </div>
          </div>

          <div className="natural-language-input">
            <p>내일 오전 10시에 회의 참가, 회의실 A</p>
          </div>
        </div>

        {/* Right Panel (Calendar) */}
        <div className="right-panel">
          <div className="calendar-header">
            <button onClick={goToPreviousMonth}>&lt;</button>
            <h2>{date.getFullYear()}년 {date.getMonth() + 1}월</h2>
            <button onClick={goToNextMonth}>&gt;</button>
          </div>
          <div className="calendar-grid">
            <div className="calendar-weekday">일</div>
            <div className="calendar-weekday">월</div>
            <div className="calendar-weekday">화</div>
            <div className="calendar-weekday">수</div>
            <div className="calendar-weekday">목</div>
            <div className="calendar-weekday">금</div>
            <div className="calendar-weekday">토</div>
            {renderCalendarDays()}
          </div>
          <div className="quick-actions">
            <h2>빠른 액션</h2>
            <button>Google 캘린더로 내보내기</button>
            <button>팀원들에게 공유</button>
            <button>일정 설정</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIScheduler;
