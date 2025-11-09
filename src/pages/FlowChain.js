// src/pages/FlowChain.js
import React, { useEffect, useMemo, useState } from "react";
import "./FlowChain.css";
import { generateFlowReportMarkdown } from "../utils/openaiApi";

/**
 * FlowChain
 * - meetingRecords + ActionSense tasks 를 하나의 타임라인으로 연결
 * - 회의 → 액션 → 진행 → 보고서
 */

const LS_MEETINGS = "meetingRecords";
const LS_TASKS = "actionsense_tasks_v1";
const LS_REPORTS = "flowchain_reports_v1";

/* ======================= 안전한 날짜 유틸 ======================= */
function safeParseDate(input) {
  if (!input && input !== 0) return null;

  if (input instanceof Date && !isNaN(input)) return input;

  if (typeof input === "number") {
    const d = new Date(input);
    return isNaN(d) ? null : d;
  }

  if (typeof input === "string") {
    let d = new Date(input);
    if (!isNaN(d)) return d;

    let s = input
      .replace(/\./g, "/")
      .replace(/\s*오전\s*/i, " AM ")
      .replace(/\s*오후\s*/i, " PM ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\/\s/g, "/");

    d = new Date(s);
    if (!isNaN(d)) return d;

    const m = input.match(
      /(\d{4})\D{0,2}(\d{1,2})\D{0,2}(\d{1,2})(?:\D+(\d{1,2}))?(?:\D+(\d{1,2}))?/
    );
    if (m) {
      const [, y, mo, da, hh = "0", mm = "0"] = m;
      d = new Date(+y, +mo - 1, +da, +hh, +mm);
      if (!isNaN(d)) return d;
    }
  }
  return null;
}
function toISOorNow(input) {
  const d = safeParseDate(input) || new Date();
  return d.toISOString();
}
function fmtDateTime(input) {
  const d = safeParseDate(input);
  if (!d) return String(input ?? "");
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

/* ======================= 저장소 유틸 ======================= */
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

/* ======================= 연결 휴리스틱 ======================= */
// 회의 시각 기준 36시간 내 생성된 태스크를 연결
function linkTasksToMeeting(meeting, tasks) {
  const base = safeParseDate(meeting?.date);
  if (!base) return [];
  const baseMs = base.getTime();
  const maxDiffMs = 36 * 60 * 60 * 1000;

  return tasks.filter((t) => {
    const tDate = safeParseDate(t.createdAt || t.date);
    if (!tDate) return false;
    const diff = tDate.getTime() - baseMs;
    return diff >= 0 && diff <= maxDiffMs;
  });
}

/* ======================= 컴포넌트 ======================= */
const defaultProjects = [
  "모든 프로젝트",
  "프로젝트 Alpha",
  "프로젝트 Beta",
  "프로젝트 Gamma",
];
const defaultPeriods = ["전체", "이번 주", "이번 달", "지난 달"];

const FlowChain = () => {
  const [meetings, setMeetings] = useState(() => loadLS(LS_MEETINGS, []));
  const [tasks, setTasks] = useState(() => loadLS(LS_TASKS, []));
  const [reports, setReports] = useState(() => loadLS(LS_REPORTS, []));
  const [filters, setFilters] = useState({
    project: "모든 프로젝트",
    period: "전체",
    members: new Set(),
  });
  const [busy, setBusy] = useState(false);
  const [reportMarkdown, setReportMarkdown] = useState("");

  useEffect(() => {
    const onFocus = () => {
      setMeetings(loadLS(LS_MEETINGS, []));
      setTasks(loadLS(LS_TASKS, []));
      setReports(loadLS(LS_REPORTS, []));
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const isInPeriod = (dateLike) => {
    if (filters.period === "전체") return true;
    const d = safeParseDate(dateLike);
    if (!d) return true;
    const today = new Date();

    if (filters.period === "이번 주") {
      const diff = (today - d) / (1000 * 3600 * 24);
      return diff <= 7 && diff >= 0;
    }
    if (filters.period === "이번 달") {
      return (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth()
      );
    }
    if (filters.period === "지난 달") {
      const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return (
        d.getFullYear() === prev.getFullYear() &&
        d.getMonth() === prev.getMonth()
      );
    }
    return true;
  };

  function extractParticipants(utterances = []) {
    const s = new Set();
    for (const u of utterances) {
      if (u?.speaker) s.add(u.speaker);
    }
    return [...s];
  }

  const memberOptions = useMemo(() => {
    const set = new Set();

    meetings.forEach((mt) => {
      (mt.utterances || []).forEach((u) => {
        if (u && u.speaker) set.add(u.speaker);
      });
      (mt.actionItems || []).forEach((ai) => {
        if (ai && ai.assignedTo) set.add(ai.assignedTo);
      });
    });

    tasks.forEach((t) => {
      if (t && t.assignedTo) set.add(t.assignedTo);
    });

    return Array.from(set);
  }, [meetings, tasks]);

  useEffect(() => {
    if (memberOptions.length === 0) return;
    setFilters((f) => {
      if (!f.members || f.members.size === 0) {
        return { ...f, members: new Set(memberOptions) };
      }
      const next = new Set(f.members);
      let changed = false;
      memberOptions.forEach((n) => {
        if (!next.has(n)) {
          next.add(n);
          changed = true;
        }
      });
      if (!changed) return f;
      return { ...f, members: next };
    });
  }, [memberOptions]);

  const timeline = useMemo(() => {
    const nodes = [];

    const hasMemberFilter =
      memberOptions.length > 0 && filters.members instanceof Set;

    const meetingPassesMemberFilter = (participantsArr, actionItemsArr) => {
      if (!hasMemberFilter) return true;
      const names = new Set(participantsArr || []);
      (actionItemsArr || []).forEach((ai) => {
        if (ai && ai.assignedTo) names.add(ai.assignedTo);
      });
      for (const n of names) {
        if (filters.members.has(n)) return true;
      }
      return false;
    };

    const taskPassesMemberFilter = (task) => {
      if (!hasMemberFilter) return true;
      if (task.assignedTo && filters.members.has(task.assignedTo)) return true;
      return false;
    };

    for (const mt of meetings) {
      if (!isInPeriod(mt?.date)) continue;

      const participants = extractParticipants(mt.utterances || []);
      const actionItems = mt.actionItems || [];

      if (!meetingPassesMemberFilter(participants, actionItems)) continue;

      const linked = linkTasksToMeeting(mt, tasks);

      nodes.push({
        type: "meeting",
        id: mt.id || `meeting-${Math.random().toString(36).slice(2)}`,
        time: toISOorNow(mt?.date),
        title: (mt.summary || "회의").slice(0, 80),
        summary: mt.summary || "",
        utterances: mt.utterances || [],
        transcript: mt.transcript || mt.sttText || "",
        actionItems,
        linkedTasks: linked.map((t) => t.id).filter(Boolean),
        participants,
      });
    }

    const linkedSet = new Set(nodes.flatMap((n) => n.linkedTasks));
    for (const t of tasks) {
      const id = t.id || `TASK-${Math.random().toString(36).slice(2)}`;
      const created = t.createdAt || t.date || Date.now();
      if (!isInPeriod(created)) continue;
      if (linkedSet.has(id)) continue;
      if (!taskPassesMemberFilter(t)) continue;

      nodes.push({
        type: "task",
        id,
        time: toISOorNow(created),
        title: t.title || "업무",
        assignedTo: t.assignedTo || null,
        dueDate: t.dueDate || null,
        priority: t.priority || "보통",
        progress: t.progress ?? 0,
        tags: t.tags || [],
      });
    }

    nodes.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    return nodes;
  }, [meetings, tasks, filters.period, filters.members, memberOptions]);

  const stats = useMemo(() => {
    const meetingCnt = timeline.filter((n) => n.type === "meeting").length;
    const visibleTasks = timeline.filter((n) => n.type === "task");
    const taskCnt = visibleTasks.length;
    const progressAvg =
      visibleTasks.length > 0
        ? Math.round(
            visibleTasks.reduce((acc, t) => acc + (t.progress ?? 0), 0) /
              visibleTasks.length
          )
        : 0;
    return { meetingCnt, taskCnt, progressAvg };
  }, [timeline]);

  const handleGenerateReport = async () => {
    try {
      setBusy(true);
      const payload = {
        project: filters.project,
        period: filters.period,
        timeline,
      };
      const md = await generateFlowReportMarkdown(payload);
      if (md) {
        setReportMarkdown(md);
        const rec = {
          id: `report-${Date.now()}`,
          createdAt: new Date().toISOString(),
          project: filters.project,
          period: filters.period,
          markdown: md,
        };
        const merged = [rec, ...reports];
        setReports(merged);
        saveLS(LS_REPORTS, merged);
      }
    } finally {
      setBusy(false);
    }
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(reportMarkdown || "");
      alert("마크다운을 클립보드에 복사했습니다.");
    } catch {
      alert("복사 실패. 브라우저 권한을 확인해주세요.");
    }
  };

  const printMarkdown = () => {
    const win = window.open("", "_blank");
    const html = `
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>FlowChain Report</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Noto Sans KR", Arial, sans-serif; padding: 24px; }
          pre { white-space: pre-wrap; word-break: break-word; }
          h1,h2,h3 { margin: 0 0 8px; }
        </style>
      </head>
      <body>
        <h1>FlowChain Report</h1>
        <p><strong>프로젝트:</strong> ${
          filters.project
        } &nbsp; <strong>기간:</strong> ${filters.period}</p>
        <hr/>
        <pre>${escapeHtml(reportMarkdown || "")}</pre>
      </body>
      </html>`;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  const totalMembers = memberOptions.length;
  const selectedCount = filters.members ? filters.members.size : 0;
  const allState =
    totalMembers === 0
      ? "none"
      : selectedCount === 0
      ? "none"
      : selectedCount === totalMembers
      ? "all"
      : "partial";

  return (
    <div className="flowchain-container">
      {/* 메인 3컬럼 레이아웃 */}
      <div className="flowchain-main">
        {/* Left Navigation (Filters) */}
        <nav className="left-nav">
          <div className="filter-section">
            <h2>FlowChain 필터</h2>

            <div className="filter-group">
              <label>프로젝트</label>
              <select
                value={filters.project}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, project: e.target.value }))
                }
              >
                {defaultProjects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>기간</label>
              <select
                value={filters.period}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, period: e.target.value }))
                }
              >
                {defaultPeriods.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>멤버</label>

              {/* 상단: 전체 필터 (All) */}
              <div
                className="member-all-row"
                onClick={() => {
                  setFilters((f) => {
                    if (allState === "all") {
                      return { ...f, members: new Set() };
                    }
                    return { ...f, members: new Set(memberOptions) };
                  });
                }}
              >
                <span className={`checkbox-box checkbox-all-${allState}`} />
                <span className="member-all-label">전체</span>
                {totalMembers > 0 && (
                  <span className="member-count">
                    {selectedCount}/{totalMembers}
                  </span>
                )}
              </div>

              {/* 하단: 개별 멤버 */}
              <div className="member-list">
                {memberOptions.length === 0 ? (
                  <p className="no-members">아직 추출된 멤버가 없습니다.</p>
                ) : (
                  memberOptions.map((name) => {
                    const selected = filters.members?.has(name) ?? false;
                    return (
                      <div
                        key={name}
                        className="member-row"
                        onClick={() => {
                          setFilters((f) => {
                            const next = new Set(f.members || []);
                            if (next.has(name)) next.delete(name);
                            else next.add(name);
                            return { ...f, members: next };
                          });
                        }}
                      >
                        <span
                          className={`checkbox-box ${
                            selected ? "checkbox-checked" : "checkbox-unchecked"
                          }`}
                        />
                        <span className="member-label">{name}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <button
              className="reset-filter-button btn-secondary"
              onClick={() =>
                setFilters({
                  project: "모든 프로젝트",
                  period: "전체",
                  members: new Set(memberOptions),
                })
              }
            >
              필터 초기화
            </button>
          </div>
        </nav>

        {/* FlowChain Timeline */}
        <div className="flowchain-panel">
          <div className="panel-header">
            <h1>FlowChain • {filters.project}</h1>
            <p>회의부터 업무, 진행 현황, 보고서까지 하나의 타임라인으로 확인</p>
          </div>

          <div className="action-flow">
            {timeline.map((node) => {
              if (node.type === "meeting") {
                return (
                  <div key={node.id} className="action-card">
                    <span className="action-indicator" />
                    <div className="card-content">
                      <p className="time">{fmtDateTime(node.time)}</p>
                      <p className="type type-meeting">회의</p>
                      <h3 className="summary">{node.title}</h3>

                      {node.summary && (
                        <ul>
                          <li>{node.summary}</li>
                        </ul>
                      )}
                      {!!node.actionItems?.length && (
                        <ul>
                          {node.actionItems.map((ai, i) => (
                            <li key={i}>
                              [액션] {ai.text}
                              {ai.assignedTo ? ` • 담당:${ai.assignedTo}` : ""}
                              {ai.dueDate ? ` • 기한:${ai.dueDate}` : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                      {!!node.participants?.length && (
                        <p className="participants">
                          참여자: {node.participants.join(", ")}
                        </p>
                      )}
                      {!!node.linkedTasks?.length && (
                        <p className="decision-maker">
                          연결된 업무: {node.linkedTasks.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div key={node.id} className="action-card">
                  <span className="action-indicator task-indicator" />
                  <div className="card-content">
                    <p className="time">{fmtDateTime(node.time)}</p>
                    <p className="type type-task">업무</p>
                    <h3 className="summary">{node.title}</h3>
                    <ul>
                      <li>우선순위: {node.priority}</li>
                      <li>진행률: {node.progress ?? 0}%</li>
                      {node.assignedTo && <li>담당: {node.assignedTo}</li>}
                      {node.dueDate && <li>기한: {node.dueDate}</li>}
                    </ul>
                  </div>
                </div>
              );
            })}
            {timeline.length === 0 && (
              <p className="timeline-empty">
                선택된 필터에 해당하는 타임라인이 없습니다.
              </p>
            )}
          </div>
        </div>

        {/* Right Panel: 보고/현황 */}
        <div className="right-panel">
          <div className="export-options">
            <button
              className="btn-secondary"
              onClick={printMarkdown}
              disabled={!reportMarkdown}
            >
              PDF 내보내기
            </button>
            <button
              className="btn-secondary"
              onClick={copyMarkdown}
              disabled={!reportMarkdown}
            >
              마크다운 복사
            </button>
            <button
              className="btn-primary"
              onClick={handleGenerateReport}
              disabled={busy}
            >
              {busy ? "보고서 생성 중…" : "자동 보고서 생성"}
            </button>
          </div>

          <div className="project-status">
            <h2>프로젝트 현황</h2>
            <p className="event-count">
              <span>회의</span> {stats.meetingCnt}건
            </p>
            <p className="event-count">
              <span>업무</span> {stats.taskCnt}개
            </p>
            <p className="event-count">
              <span>평균 진행률</span> {stats.progressAvg}%
            </p>
          </div>

          <div className="participants-list">
            <h2>최근 보고서</h2>
            {reports.length === 0 ? (
              <p className="no-reports">아직 생성된 보고서가 없습니다.</p>
            ) : (
              <div className="reports-list">
                {reports.slice(0, 6).map((r) => (
                  <button
                    key={r.id}
                    className="btn-secondary report-item"
                    onClick={() => setReportMarkdown(r.markdown)}
                    title={`${fmtDateTime(r.createdAt)} • ${r.project} • ${
                      r.period
                    }`}
                  >
                    {fmtDateTime(r.createdAt)} 보고서 불러오기
                  </button>
                ))}
              </div>
            )}
          </div>

          {reportMarkdown && (
            <div className="markdown-preview">
              <h2>미리보기(마크다운)</h2>
              <div className="markdown-box">{reportMarkdown}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default FlowChain;
