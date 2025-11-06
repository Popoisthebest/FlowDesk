// src/pages/AIMeetingAssistant.js
import React, { useState, useEffect, useRef } from "react";
import "./AIMeetingAssistant.css";
import {
  speechToTextFetch as speechToText,
  generateSummary,
  extractActionItems,
  diarizeTranscript,
} from "../utils/openaiApi";

const speakerPalette = {
  발화자1: "#2F6BFF", // 전자블루
  발화자2: "#A7F3D0", // 라임 포인트
  발화자3: "#E5E7EB", // 실버그레이
};

const AIMeetingAssistant = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // 임시 캡션(녹음 중 UX용)
  const [interim, setInterim] = useState("");

  // 최종 산출물
  const [dialogue, setDialogue] = useState([]); // [{speaker,text}]
  const [summary, setSummary] = useState("");
  const [actionItems, setActionItems] = useState([]);

  // 녹음 관련
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Web Speech API (optional)
  const recognitionRef = useRef(null);

  // 파형 관련
  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const waveformCleanupRef = useRef(null);

  /* Web Speech API: 녹음 중 임시 캡션만 표시, 확정 텍스트는 저장하지 않음 */
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
        // 요구사항: STT는 녹음 종료 후에만 표기 → 확정문장은 여기서 버림
        if (finalTranscript) setInterim("");
      };

      recog.onerror = (e) => console.warn("SpeechRecognition error:", e);
      recognitionRef.current = recog;
    }
  }, []);

  /* 파형 드로잉 시작 */
  const startWaveform = (stream) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const ctx = canvas.getContext("2d");

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#e6f7ff";
      ctx.fillRect(0, 0, width, height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = "#2F6BFF";
      ctx.beginPath();

      const sliceWidth = (width * 1.0) / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    };
    draw();

    // cleanup 함수 반환 (한 번만 호출되도록 외부에서 관리)
    const cleanup = () => {
      try {
        cancelAnimationFrame(rafRef.current);
      } catch {}
      try {
        window.removeEventListener("resize", resize);
      } catch {}
      try {
        if (audioCtx && audioCtx.state !== "closed") {
          audioCtx.close();
        }
      } catch {}
      analyserRef.current = null;
      audioCtxRef.current = null;
    };
    return cleanup;
  };

  /* 미디어/파형 정리 */
  const cleanupMedia = () => {
    try {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    mediaStreamRef.current = null;

    try {
      cancelAnimationFrame(rafRef.current);
    } catch {}
    try {
      waveformCleanupRef.current?.();
    } finally {
      waveformCleanupRef.current = null;
    }

    analyserRef.current = null;
    audioCtxRef.current = null;
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

      // 파형 시작 및 cleanup ref 보관
      const stopWave = startWaveform(stream);
      waveformCleanupRef.current = stopWave;

      // MediaRecorder 설정
      let recorder;
      try {
        recorder = new MediaRecorder(stream, {
          mimeType: "audio/webm; codecs=opus",
          audioBitsPerSecond: 128000,
        });
      } catch {
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        setIsProcessing(true);
        try {
          // 파형/오디오 정리 — 반드시 한 번만
          try {
            waveformCleanupRef.current?.();
          } finally {
            waveformCleanupRef.current = null;
          }

          const audioBlob = new Blob(audioChunksRef.current, {
            type: "audio/webm",
          });

          // 1) STT (전체 끝난 뒤 한 번에)
          const transcript = await speechToText(audioBlob);

          if (transcript) {
            // 2) 화자 분리 → 채팅 형식으로 표시
            const utterances = await diarizeTranscript(transcript);
            setDialogue(utterances || []);

            // 3) 요약
            const sum = await generateSummary(transcript);
            if (sum) setSummary(sum);

            // 4) 액션 아이템
            const items = await extractActionItems(transcript);
            if (items) setActionItems(items);

            // 5) 로컬 기록 저장
            const record = {
              id: `meeting-${Date.now()}`,
              date: new Date().toLocaleString(),
              transcript,
              utterances,
              summary: sum || "",
              actionItems: items || [],
            };
            const existing =
              JSON.parse(localStorage.getItem("meetingRecords") || "[]") || [];
            localStorage.setItem(
              "meetingRecords",
              JSON.stringify([...(existing || []), record])
            );
          } else {
            setDialogue([{ speaker: "시스템", text: "STT 처리 실패" }]);
          }
        } catch (err) {
          console.error("처리 파이프라인 오류:", err);
          alert("음성 처리 중 오류가 발생했습니다.");
        } finally {
          audioChunksRef.current = [];
          setIsProcessing(false);
        }
      };

      recorder.start();
      setIsRecording(true);

      try {
        recognitionRef.current?.start();
      } catch {}
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
        recognitionRef.current?.stop();
      } catch {}
    } finally {
      cleanupMedia();
    }
  };

  return (
    <div className="ai-meeting-assistant-container">
      <div className="main-content">
        <div className="meeting-assistant-panel">
          <div className="panel-header">
            <h1>AI 회의 비서</h1>
            <span className="status-badge">
              {isRecording
                ? "실시간 기록 중"
                : isProcessing
                ? "분석 중…"
                : "기록 대기 중"}
            </span>
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessing}
            >
              {isRecording ? "녹음 중지" : "녹음 시작"}
            </button>
          </div>

          {/* 실시간 음성 인식 (파형) */}
          <div className="realtime-audio-recognition">
            <h2>실시간 음성 인식</h2>
            <canvas className="waveform" ref={canvasRef} />
            {isRecording && interim && (
              <div className="stt-output" style={{ marginTop: 10 }}>
                <p style={{ opacity: 0.6 }}>{interim}</p>
              </div>
            )}
          </div>

          {/* 녹음 종료 후: 대화 형식 STT */}
          <div className="realtime-text">
            <h2>녹취록 (대화 형식)</h2>
            <div className="stt-output">
              {dialogue?.length ? (
                dialogue.map((u, i) => (
                  <p key={`${u.speaker}-${i}`}>
                    <span
                      style={{
                        fontWeight: "bold",
                        color: speakerPalette[u.speaker] || "#2F6BFF",
                        marginRight: 8,
                      }}
                    >
                      {u.speaker}
                    </span>
                    {u.text}
                  </p>
                ))
              ) : (
                <p>녹음을 완료하면 대화 형식으로 표시됩니다.</p>
              )}
            </div>
          </div>

          <div className="summary-actions">
            <h2>핵심 요약 자동 생성</h2>
            <div className="summary-card">
              <p>{summary || "요약된 내용이 여기에 표시됩니다."}</p>
            </div>
          </div>

          <div className="action-items">
            <h2>자동 추출된 액션 아이템</h2>
            {actionItems?.length ? (
              <ul className="action-items-list">
                {actionItems.map((item, idx) => (
                  <li key={item.id ?? idx} className="action-item-card">
                    <span className="action-item-text">{item.text}</span>
                    <span className="assigned-to">
                      {item.assignedTo && `담당: ${item.assignedTo}`}
                      {item.dueDate && `  (기한: ${item.dueDate})`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="no-items">추출된 액션 아이템이 없습니다.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIMeetingAssistant;
