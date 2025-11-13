import React, { useState, useEffect } from "react";
import "./AIScheduler.css";
import { extractEventDetails } from "../utils/openaiApi";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";

/* ====== 날짜 유틸 ====== */
// 로컬 기준으로 YYYY-MM-DD 문자열 생성
function formatDateForInput(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
  const diff = 6 - day; // 토요일을 주말 끝으로 봄
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function lastDayOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(0, 0, 0, 0);
  return d;
}

// 월=0, 화=1, ... 일=6 (월요일 기준 인덱스)
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

// 기준 날짜가 속한 "이번주 월요일" 구하기 (월요일을 주 시작으로)
function getMondayOfWeek(date) {
  const d = startOfDay(date);
  const dow = d.getDay(); // 0=일
  const diffFromMon = (dow + 6) % 7; // 월(1) -> 0, 화(2)->1, ..., 일(0)->6
  d.setDate(d.getDate() - diffFromMon);
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

/* ====== 한국어 날짜 파서 (주/요일 로직 개선 버전) ====== */
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

  // "이번주/다음주/다다음주/다다다음주 + 요일" 처리
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

      if (weekOffset === 0 && target < today) {
        target.setDate(target.getDate() + 7);
      }

      return toYMD(target);
    }
  }

  // 단독 요일: "화요일에 회의" → 가장 가까운 미래의 해당 요일
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

  // 2025-11-13 / 2025.11.13 형태
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

  // 11-13 / 11.13 형태 (올해 기준)
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

/* ====== 간단한 시간 파서 (오전 9시 / 9:30 등) ====== */
function parseTimeFromKorean(str) {
  if (!str) return null;
  const text = String(str);

  const m1 = text.match(/(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분?)?/);
  if (m1) {
    let hour = parseInt(m1[2], 10);
    const minute = m1[3] ? parseInt(m1[3], 10) : 0;
    const ampm = m1[1];

    if (ampm === "오전") {
      if (hour === 12) hour = 0;
    } else if (ampm === "오후") {
      if (hour !== 12) hour += 12;
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(
      2,
      "0"
    )}`;
  }

  const m2 = text.match(/(\d{1,2}):(\d{2})/);
  if (m2) {
    const hour = parseInt(m2[1], 10);
    const minute = parseInt(m2[2], 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(
      2,
      "0"
    )}`;
  }

  return null;
}

function addMinutesToHHMM(hhmm, minutesToAdd) {
  const [hStr, mStr] = hhmm.split(":");
  let total = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + minutesToAdd;
  if (total < 0) total += 24 * 60;
  total = total % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/* ====== 컴포넌트 ====== */
const AIScheduler = () => {
  const [date, setDate] = useState(new Date());
  const [title, setTitle] = useState("주간 스탠드업 미팅");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("10:30");
  const [location, setLocation] = useState("회의실 A");
  const [participants, setParticipants] = useState(["민준", "서현", "지후"]);
  const [newParticipant, setNewParticipant] = useState("");

  const [naturalInput, setNaturalInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiMessage, setAiMessage] = useState("");

  // dashboard / calendar 두 가지 모드
  const [viewMode, setViewMode] = useState("dashboard");

  // Firestore에 저장된 일정 목록
  const [events, setEvents] = useState([]);

  // 전체 캘린더에서 클릭한 일정의 상세 정보
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Firestore: 일정 구독
  useEffect(() => {
    const colRef = collection(db, "aiSchedulerEvents");
    const q = query(colRef, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          title: data.title || "제목 없음",
          date: data.date, // "YYYY-MM-DD"
          startTime: data.startTime || "",
          endTime: data.endTime || "",
          location: data.location || "",
          participants: data.participants || [],
          createdAt: data.createdAt,
        };
      });
      setEvents(list);
    });

    return () => unsub();
  }, []);

  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = (y, m) => new Date(y, m, 1).getDay();

  const renderCalendarDays = () => {
    const y = date.getFullYear();
    const m = date.getMonth();
    const numDays = daysInMonth(y, m);
    const startDay = firstDayOfMonth(y, m);
    const days = [];

    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`empty-${i}`} className="empty-day"></div>);
    }

    for (let d = 1; d <= numDays; d++) {
      const now = new Date();
      const isToday =
        y === now.getFullYear() && m === now.getMonth() && d === now.getDate();
      const isSelected =
        d === date.getDate() &&
        y === date.getFullYear() &&
        m === date.getMonth();

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

  // 전체 일정 관리용 월간 캘린더 그리드
  const renderFullCalendarGrid = () => {
    const y = date.getFullYear();
    const m = date.getMonth();
    const numDays = daysInMonth(y, m);
    const startDay = firstDayOfMonth(y, m);
    const cells = [];

    for (let i = 0; i < startDay; i++) {
      cells.push(
        <div key={`full-empty-${i}`} className="calendar-full-day empty"></div>
      );
    }

    for (let d = 1; d <= numDays; d++) {
      const dateStr = `${y}-${pad2(m + 1)}-${pad2(d)}`;
      const dayEvents = events.filter((ev) => ev.date === dateStr);

      const now = new Date();
      const isToday =
        y === now.getFullYear() && m === now.getMonth() && d === now.getDate();

      cells.push(
        <div
          key={dateStr}
          className={`calendar-full-day ${isToday ? "today" : ""}`}
        >
          <div className="calendar-full-day-header">
            <span className="day-number">{d}</span>
          </div>
          <div className="calendar-full-events">
            {dayEvents.map((ev) => (
              <div
                key={ev.id}
                className="calendar-event-pill"
                onClick={() => setSelectedEvent(ev)}
              >
                <span className="event-time">
                  {ev.startTime ? ev.startTime : ""}
                </span>
                <span className="event-title">{ev.title}</span>
                <button
                  className="event-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteEvent(ev.id);
                    if (selectedEvent && selectedEvent.id === ev.id) {
                      setSelectedEvent(null);
                    }
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return cells;
  };

  const goToPreviousMonth = () =>
    setDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const goToNextMonth = () =>
    setDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));

  const addParticipant = (e) => {
    e.preventDefault();
    if (
      newParticipant.trim() &&
      !participants.includes(newParticipant.trim())
    ) {
      setParticipants([...participants, newParticipant.trim()]);
      setNewParticipant("");
    }
  };

  const removeParticipant = (name) =>
    setParticipants(participants.filter((p) => p !== name));

  // 일정 등록 → Firestore 저장
  const handleRegisterSchedule = async () => {
    try {
      const event = {
        title,
        date: formatDateForInput(date), // "YYYY-MM-DD"
        startTime,
        endTime,
        location,
        participants,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "aiSchedulerEvents"), event);
      setAiMessage("일정이 등록되었습니다.");
    } catch (e) {
      console.error("일정 등록 중 오류:", e);
      setAiMessage("일정 등록 중 오류가 발생했습니다.");
    }
  };

  // 일정 삭제
  const handleDeleteEvent = async (id) => {
    try {
      await deleteDoc(doc(db, "aiSchedulerEvents", id));
    } catch (e) {
      console.error("일정 삭제 중 오류:", e);
    }
  };

  /* 자연어 → 일정 자동 인식 */
  const handleAutoDetectFromNatural = async () => {
    if (!naturalInput.trim()) {
      alert("자연어 일정 문장을 먼저 입력해 주세요.");
      return;
    }

    const now = new Date();

    try {
      setIsProcessing(true);
      setAiMessage("");

      const inputText = naturalInput.trim();
      const result = await extractEventDetails(inputText);
      // 예상 result 확장: { eventName, eventDate, offsetDays? }

      if (!result || (!result.eventName && !result.eventDate)) {
        setAiMessage(
          "일정 정보를 제대로 찾지 못했어요. 내용을 조금 더 구체적으로 적어주세요."
        );
        return;
      }

      if (result.eventName) {
        setTitle(result.eventName);
      }

      // 1단계: 규칙 기반 한국어 파서
      let normalizedYMD = normalizeDateKorean(inputText, now);

      // 2단계: LLM이 offsetDays(정수)를 준 경우, 그걸 사용해 "오늘 + N일"
      let offsetDays = null;
      if (
        result &&
        typeof result.offsetDays === "number" &&
        Number.isFinite(result.offsetDays)
      ) {
        offsetDays = result.offsetDays;
      } else if (result && typeof result.relative === "string") {
        const m = result.relative.match(/(\d+)\s*일\s*후/);
        if (m) offsetDays = parseInt(m[1], 10);
      }

      if (!normalizedYMD && offsetDays != null) {
        const base = startOfDay(now);
        base.setDate(base.getDate() + offsetDays);
        normalizedYMD = toYMD(base);
      }

      // 3단계: 그래도 없으면 eventDate를 마지막 fallback으로 사용
      if (!normalizedYMD && result.eventDate) {
        const fromLLM = normalizeDateKorean(String(result.eventDate), now);
        if (fromLLM) {
          normalizedYMD = fromLLM;
        } else {
          const fallback = new Date(result.eventDate);
          if (!isNaN(fallback.getTime())) {
            normalizedYMD = toYMD(fallback);
          }
        }
      }

      if (normalizedYMD) {
        const parts = normalizedYMD.split("-");
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          const d = parseInt(parts[2], 10);
          const parsed = new Date(y, m - 1, d);
          if (!isNaN(parsed.getTime())) {
            setDate(parsed);
          }
        }
      }

      // 시간은 "오전 9시" 또는 결과 eventDate에 포함된 시간을 이용
      const timeSource = result.eventDate || inputText;
      const parsedHHMM = parseTimeFromKorean(timeSource);
      if (parsedHHMM) {
        setStartTime(parsedHHMM);
        setEndTime(addMinutesToHHMM(parsedHHMM, 30));
      }

      setAiMessage(
        "AI가 일정 정보를 채워두었어요. 확인 후 필요하면 수정하세요."
      );
    } catch (error) {
      console.error("자연어 일정 인식 중 오류:", error);
      setAiMessage("AI 분석 중 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleHeaderAutoDetectClick = () => {
    handleAutoDetectFromNatural();
  };

  // 선택된 날짜의 일정만 필터링 (대시보드 오른쪽 사이드 카드에서 사용)
  const selectedYMD = formatDateForInput(date);
  const eventsForSelectedDate = events.filter((ev) => ev.date === selectedYMD);

  return (
    <div className="ai-scheduler-container">
      <div
        className={`scheduler-main ${
          viewMode === "calendar" ? "full-calendar-mode" : ""
        }`}
      >
        <header className="scheduler-header">
          <div className="scheduler-header-left">
            <div className="scheduler-logo-puck">📅</div>
            <div>
              <h2 className="scheduler-title">AI 일정 비서</h2>
              <p className="scheduler-subtitle">
                {viewMode === "dashboard"
                  ? "자연어로 입력하면 자동으로 일정을 인식하고 캘린더에 등록합니다."
                  : "등록된 일정을 한눈에 보는 전체 캘린더입니다."}
              </p>
            </div>
          </div>
          <button
            className="btn-primary schedule-run-btn"
            onClick={handleHeaderAutoDetectClick}
            disabled={isProcessing}
          >
            {isProcessing ? "AI 분석 중..." : "일정 자동 인식"}
          </button>
        </header>

        {viewMode === "dashboard" ? (
          <div className="scheduler-grid">
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
                    value={formatDateForInput(date)}
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
                  <button className="btn-secondary">임시 저장</button>
                  <button
                    className="btn-primary"
                    onClick={handleRegisterSchedule}
                  >
                    일정 등록
                  </button>
                </div>

                {aiMessage && (
                  <p
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: "#166534",
                    }}
                  >
                    {aiMessage}
                  </p>
                )}
              </div>

              <div className="natural-language-card">
                <h4>자연어 입력</h4>
                <p>예: 다음주 화요일 오전 9시에 회의실 A에서 디자인 리뷰</p>
                <div className="natural-input">
                  <input
                    type="text"
                    placeholder="자연어로 일정 입력..."
                    style={{ width: "100%" }}
                    value={naturalInput}
                    onChange={(e) => setNaturalInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAutoDetectFromNatural();
                      }
                    }}
                  />
                </div>
              </div>
            </section>

            <section className="scheduler-right">
              <div className="calendar-card">
                <div className="calendar-header">
                  <button className="btn-secondary" onClick={goToPreviousMonth}>
                    {"<"}
                  </button>
                  <h3>
                    {date.getFullYear()}년 {date.getMonth() + 1}월
                  </h3>
                  <button className="btn-secondary" onClick={goToNextMonth}>
                    {">"}
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

              <div className="schedule-list-card">
                <h3>{selectedYMD} 일정</h3>
                {eventsForSelectedDate.length === 0 ? (
                  <p className="schedule-empty">등록된 일정이 없습니다.</p>
                ) : (
                  <ul className="schedule-list">
                    {eventsForSelectedDate.map((ev) => (
                      <li key={ev.id} className="schedule-item">
                        <div className="schedule-item-main">
                          <div className="schedule-item-time">
                            {ev.startTime} ~ {ev.endTime}
                          </div>
                          <div className="schedule-item-title">{ev.title}</div>
                          {ev.location && (
                            <div className="schedule-item-location">
                              장소: {ev.location}
                            </div>
                          )}
                          {ev.participants?.length > 0 && (
                            <div className="schedule-item-participants">
                              참석: {ev.participants.join(", ")}
                            </div>
                          )}
                        </div>
                        <button
                          className="btn-secondary schedule-delete-btn"
                          onClick={() => handleDeleteEvent(ev.id)}
                        >
                          삭제
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="quick-actions">
                <h3>빠른 액션</h3>
                <button className="btn-primary">
                  Google 캘린더로 내보내기
                </button>
                <button className="btn-secondary">팀원들과 공유</button>
                <button
                  className="btn-secondary"
                  onClick={() => setViewMode("calendar")}
                >
                  일정 관리 보기
                </button>
              </div>
            </section>
          </div>
        ) : (
          <section className="calendar-management-page">
            <div className="calendar-management-header">
              <button
                className="btn-secondary back-to-dashboard-btn"
                onClick={() => setViewMode("dashboard")}
              >
                ← 일정 등록 화면으로 돌아가기
              </button>
              <div className="calendar-management-title">
                <h3>
                  {date.getFullYear()}년 {date.getMonth() + 1}월 전체 일정
                </h3>
                <div className="calendar-management-nav">
                  <button className="btn-tertiary" onClick={goToPreviousMonth}>
                    이전 달
                  </button>
                  <button className="btn-tertiary" onClick={goToNextMonth}>
                    다음 달
                  </button>
                </div>
              </div>
            </div>

            <div className="calendar-full-grid">
              {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                <div key={d} className="calendar-weekday full">
                  {d}
                </div>
              ))}
              {renderFullCalendarGrid()}
            </div>
          </section>
        )}
      </div>

      {selectedEvent && (
        <div
          className="event-detail-modal-backdrop"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="event-detail-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="event-detail-header">
              <h3>{selectedEvent.title}</h3>
              <button
                className="event-detail-close"
                onClick={() => setSelectedEvent(null)}
              >
                ×
              </button>
            </div>
            <div className="event-detail-body">
              <p className="event-detail-row">
                <span className="event-detail-label">날짜</span>
                <span className="event-detail-value">{selectedEvent.date}</span>
              </p>
              <p className="event-detail-row">
                <span className="event-detail-label">시간</span>
                <span className="event-detail-value">
                  {selectedEvent.startTime || "시간 미정"}
                  {selectedEvent.endTime ? ` ~ ${selectedEvent.endTime}` : ""}
                </span>
              </p>
              {selectedEvent.location && (
                <p className="event-detail-row">
                  <span className="event-detail-label">장소</span>
                  <span className="event-detail-value">
                    {selectedEvent.location}
                  </span>
                </p>
              )}
              {selectedEvent.participants &&
                selectedEvent.participants.length > 0 && (
                  <p className="event-detail-row">
                    <span className="event-detail-label">참석자</span>
                    <span className="event-detail-value">
                      {selectedEvent.participants.join(", ")}
                    </span>
                  </p>
                )}
            </div>
            <div className="event-detail-footer">
              <button
                className="btn-danger"
                onClick={async () => {
                  await handleDeleteEvent(selectedEvent.id);
                  setSelectedEvent(null);
                }}
              >
                일정 삭제
              </button>
              <button
                className="btn-secondary"
                onClick={() => setSelectedEvent(null)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIScheduler;
