// src/pages/AIMeetingAssistant.js
import React, { useState, useEffect, useRef } from "react";
import "./AIMeetingAssistant.css";
import {
  speechToTextFetch as speechToText,
  generateSummary,
  extractActionItems,
  diarizeTranscript,
} from "../utils/openaiApi";

const speakerColorMap = {
  발화자1: "#2563eb",
  발화자2: "#16a34a",
  발화자3: "#eab308",
};

const AIMeetingAssistant = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const [interim, setInterim] = useState("");
  const [dialogue, setDialogue] = useState([]); // [{speaker,text}]
  const [summary, setSummary] = useState("");
  const [actionItems, setActionItems] = useState([]);

  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const recognitionRef = useRef(null);

  // 녹음 타이머
  useEffect(() => {
    let timerId;
    if (isRecording) {
      timerId = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [isRecording]);

  // Web Speech API: 실시간 캡션(UX용, 최종 텍스트는 STT 결과 사용)
  useEffect(() => {
    const w = window;
    if ("SpeechRecognition" in w || "webkitSpeechRecognition" in w) {
      const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
      const recog = new SR();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = "ko-KR";

      recog.onresult = (event) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + " ";
          } else {
            setInterim(transcript);
          }
        }
        if (finalTranscript) {
          // 최종 문장은 녹음 종료 후 STT로 처리할 거라 여기서는 초기화만
          setInterim("");
        }
      };

      recog.onerror = (e) =>
        console.warn("SpeechRecognition error in MeetingAssistant:", e);

      recognitionRef.current = recog;
    }
  }, []);

  const cleanupMedia = () => {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    } catch (e) {
      console.warn("Media stream cleanup warning:", e);
    } finally {
      mediaStreamRef.current = null;
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const startRecording = async () => {
    setDialogue([]);
    setSummary("");
    setActionItems([]);
    setInterim("");
    setIsProcessing(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      let recorder;
      try {
        recorder = new MediaRecorder(stream, {
          mimeType: "audio/webm; codecs=opus",
          audioBitsPerSecond: 128000,
        });
      } catch (e) {
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsProcessing(true);
        try {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: "audio/webm",
          });

          // 1) STT
          const transcript = await speechToText(audioBlob);

          if (transcript) {
            // 2) 화자 분리 (대화 형식)
            let utterances = [];
            try {
              const diarized = await diarizeTranscript(transcript);
              if (Array.isArray(diarized) && diarized.length > 0) {
                utterances = diarized;
              } else {
                utterances = [{ speaker: "발화자1", text: transcript }];
              }
            } catch (e) {
              console.warn("diarizeTranscript error:", e);
              utterances = [{ speaker: "발화자1", text: transcript }];
            }
            setDialogue(utterances);

            // 3) 요약
            try {
              const sum = await generateSummary(transcript);
              if (sum) setSummary(sum);
            } catch (e) {
              console.warn("generateSummary error:", e);
            }

            // 4) 액션 아이템
            try {
              const items = await extractActionItems(transcript);
              if (items) setActionItems(items);
            } catch (e) {
              console.warn("extractActionItems error:", e);
            }

            // 5) 기록 저장
            try {
              const record = {
                id: `meeting-${Date.now()}`,
                date: new Date().toLocaleString(),
                transcript,
                utterances,
                summary,
                actionItems,
              };
              const existing =
                JSON.parse(localStorage.getItem("meetingRecords") || "[]") ||
                [];
              localStorage.setItem(
                "meetingRecords",
                JSON.stringify([...(existing || []), record])
              );
            } catch (e) {
              console.warn("localStorage save error:", e);
            }
          } else {
            setDialogue([
              { speaker: "시스템", text: "STT 처리에 실패했습니다." },
            ]);
          }
        } catch (err) {
          console.error("음성 처리 파이프라인 오류:", err);
          alert("음성 처리 중 오류가 발생했습니다.");
        } finally {
          audioChunksRef.current = [];
          setIsProcessing(false);
        }
      };

      recorder.start();
      setIsRecording(true);

      try {
        recognitionRef.current && recognitionRef.current.start();
      } catch (_) {}
    } catch (e) {
      console.error("마이크 접근 오류:", e);
      alert("마이크 권한이 없거나 장치 접근에 실패했습니다.");
      cleanupMedia();
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    try {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      try {
        recognitionRef.current && recognitionRef.current.stop();
      } catch (_) {}
    } finally {
      cleanupMedia();
    }
  };

  const participantCount = React.useMemo(() => {
    const set = new Set();
    dialogue.forEach((u) => {
      if (u.speaker) set.add(u.speaker);
    });
    return set.size || 0;
  }, [dialogue]);

  const transcriptLines = dialogue.length || 0;
  const keyPointCount = actionItems.length || 0;

  const showAnalysis =
    (summary && summary.trim().length > 0) || keyPointCount > 0;

  return (
    <div className="ai-meeting-assistant-container">
      {/* 상단 헤더 */}
      <header className="meeting-header">
        <div className="meeting-header-left">
          <div className="meeting-icon-wrapper">
            <svg
              className="meeting-book-icon"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </div>
          <div>
            <h2 className="meeting-title">AI 회의 비서</h2>
            <p className="meeting-subtitle">
              실시간 회의 녹음 · 자동 녹취록 · 핵심 요약 · 액션 아이템 생성
            </p>
          </div>
        </div>

        <button
          className="header-history-button"
          type="button"
          onClick={() => alert("회의 기록 보기 기능은 추후 연결 예정입니다.")}
        >
          최근 회의 기록
        </button>
      </header>

      {/* 메인 콘텐츠 */}
      <div className="meeting-main">
        {/* 녹음 컨트롤 카드 */}
        <section className="recording-card">
          <div className="recording-card-header">
            <div className="recording-title-wrap">
              <h3>실시간 음성 인식</h3>
              {isRecording && (
                <span className="recording-badge">● 녹음 중</span>
              )}
              {isProcessing && !isRecording && (
                <span className="processing-badge">AI 분석 중…</span>
              )}
            </div>
            {isRecording && (
              <div className="recording-timer">
                <span className="timer-label">경과 시간</span>
                <span className="timer-value">{formatTime(recordingTime)}</span>
              </div>
            )}
          </div>

          <div className="recording-body">
            <button
              type="button"
              className={
                "record-toggle-button" +
                (isRecording ? " recording" : " idle") +
                (isProcessing ? " disabled" : "")
              }
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessing}
            >
              <div className="record-toggle-inner">
                {isRecording ? (
                  <div className="record-square" />
                ) : (
                  <div className="record-mic-dot" />
                )}
              </div>
              {isRecording && <div className="record-pulse-ring" />}
            </button>

            <p className="recording-helper-text">
              {isProcessing
                ? "AI가 방금 회의 내용을 분석하고 있어요."
                : isRecording
                ? "녹음을 중지하려면 버튼을 다시 클릭하세요."
                : "회의가 시작되면 버튼을 눌러 녹음을 시작하세요."}
            </p>

            {/* 단순 애니메이션 파형 (실제 오디오 분석 아님, UI용) */}
            {isRecording && (
              <div className="fake-wave-row">
                {Array.from({ length: 20 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="fake-wave-bar"
                    style={{
                      animationDelay: `${idx * 0.03}s`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 통계 카드 */}
        <section className="meeting-stats-row">
          <div className="stat-card stat-participants">
            <div className="stat-icon">👥</div>
            <div>
              <p className="stat-label">참여자</p>
              <p className="stat-value">
                {participantCount ? `${participantCount}명` : "-"}
              </p>
            </div>
          </div>

          <div className="stat-card stat-lines">
            <div className="stat-icon">📝</div>
            <div>
              <p className="stat-label">녹취록 길이</p>
              <p className="stat-value">
                {transcriptLines ? `${transcriptLines}줄` : "-"}
              </p>
            </div>
          </div>

          <div className="stat-card stat-keypoints">
            <div className="stat-icon">✨</div>
            <div>
              <p className="stat-label">핵심 액션 아이템</p>
              <p className="stat-value">
                {keyPointCount ? `${keyPointCount}개` : "-"}
              </p>
            </div>
          </div>
        </section>

        {/* 본문 그리드: 왼쪽 녹취록 / 오른쪽 요약+액션 */}
        <section className="meeting-grid">
          {/* 왼쪽: 대화 형식 녹취록 */}
          <div className="transcript-card">
            <div className="transcript-header">
              <h3>녹취록 (대화 형식)</h3>
              <p>회의가 끝나면 화자별 대화 내용이 자동으로 정리됩니다.</p>
            </div>

            {isRecording && interim && (
              <div className="interim-badge-row">
                <span className="interim-pill">실시간 인식 중</span>
                <span className="interim-text">{interim}</span>
              </div>
            )}

            <div className="transcript-scroll-area">
              {dialogue && dialogue.length > 0 ? (
                dialogue.map((u, idx) => {
                  const speaker = u.speaker || "발화자";
                  const initial = speaker[0] || "?";
                  return (
                    <div key={idx} className="transcript-item">
                      <div
                        className="transcript-avatar"
                        style={{
                          background: speakerColorMap[speaker] || "#6366f1",
                        }}
                      >
                        {initial}
                      </div>
                      <div className="transcript-bubble-wrap">
                        <div className="transcript-meta">
                          <span className="transcript-speaker">{speaker}</span>
                        </div>
                        <div className="transcript-bubble">
                          <p>{u.text}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="transcript-empty">
                  <p>아직 녹취록이 없습니다.</p>
                  <p>회의를 녹음하면 이 영역에 대화 내용이 표시됩니다.</p>
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽: 요약 + 액션 아이템 */}
          <div className="right-column">
            <div className="summary-card-v2">
              <div className="summary-header">
                <h3>핵심 요약</h3>
                <p>회의가 끝나면 AI가 자동으로 요약합니다.</p>
              </div>
              <div className="summary-body">
                {summary ? (
                  <p>{summary}</p>
                ) : (
                  <p className="summary-placeholder">
                    회의를 한 번 녹음해보면, 이곳에 핵심 내용이 문단 형태로
                    정리됩니다.
                  </p>
                )}
              </div>
            </div>

            <div className="action-card-v2">
              <div className="action-header">
                <h3>자동 추출된 액션 아이템</h3>
                <p>
                  대화 속 “해야 할 일”을 감지해서 업무 카드로 만들어 줍니다.
                </p>
              </div>
              <div className="action-body">
                {actionItems && actionItems.length > 0 ? (
                  <ul className="action-list">
                    {actionItems.map((item, idx) => (
                      <li key={item.id ?? idx} className="action-row">
                        <div className="action-bullet">•</div>
                        <div className="action-content">
                          <p className="action-text">{item.text}</p>
                          <p className="action-meta">
                            {item.assignedTo && (
                              <span>담당: {item.assignedTo}</span>
                            )}
                            {item.dueDate && (
                              <span>
                                {item.assignedTo ? " · " : ""}
                                기한: {item.dueDate}
                              </span>
                            )}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="action-placeholder">
                    회의가 끝나면, “해야 할 일”들이 자동으로 리스트업 됩니다.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AIMeetingAssistant;
