// src/utils/openaiApi.js
const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;
const OPENAI_BASE = "https://api.openai.com/v1";

function requireKey() {
  if (!OPENAI_API_KEY) {
    const msg =
      "OpenAI API 키가 설정되지 않았습니다. .env(.local)에 REACT_APP_OPENAI_API_KEY를 설정하세요.";
    console.error(msg);
    alert(msg);
    return false;
  }
  return true;
}

/* -------------------- STT (fetch) -------------------- */
export async function speechToTextFetch(audioBlob) {
  if (!requireKey()) return null;
  try {
    const fd = new FormData();
    fd.append(
      "file",
      new File([audioBlob], "audio.webm", { type: "audio/webm" })
    );
    fd.append("model", "whisper-1");
    fd.append("language", "ko");

    const res = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: fd,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("STT HTTP Error:", res.status, text);
      alert("OpenAI STT 호출 실패");
      return null;
    }
    const data = await res.json();
    return data.text;
  } catch (err) {
    console.error("STT fetch error:", err);
    alert("OpenAI STT 연결 오류");
    return null;
  }
}

/* -------------------- 요약 -------------------- */
export async function generateSummary(text) {
  if (!requireKey()) return null;
  try {
    const payload = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that summarizes meeting transcripts in Korean.",
        },
        {
          role: "user",
          content: `다음 회의록을 한국어로 간결하게 요약해주세요:\n\n${text}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    };

    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Summary HTTP Error:", res.status, body);
      alert("OpenAI 요약 호출 실패");
      return null;
    }

    const data = await res.json();
    return (data.choices?.[0]?.message?.content || "").trim();
  } catch (err) {
    console.error("Summary fetch error:", err);
    alert("OpenAI 요약 연결 오류");
    return null;
  }
}

/* -------------------- 이벤트 추출 (JSON) -------------------- */
export async function extractEventDetails(text) {
  if (!requireKey()) return null;
  try {
    const payload = {
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "자연어에서 이벤트 제목/날짜를 추출해 JSON으로 반환. 필드: {eventName: string, eventDate: ISO8601 string}. 날짜/시간 없으면 연도=현재, 시간=09:00:00. 이벤트 없으면 빈 객체. 반드시 유효한 JSON만 응답.",
        },
        { role: "user", content: `텍스트에서 이벤트 JSON:\n\n${text}` },
      ],
      temperature: 0.2,
      max_tokens: 200,
    };

    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Event HTTP Error:", res.status, body);
      alert("OpenAI 이벤트 추출 호출 실패");
      return {};
    }

    const data = await res.json();
    const content = (data.choices?.[0]?.message?.content || "").trim();
    try {
      return JSON.parse(content);
    } catch (e) {
      console.error("Event JSON parse error:", e, content);
      alert("이벤트 JSON 파싱 실패");
      return {};
    }
  } catch (err) {
    console.error("Event fetch error:", err);
    alert("OpenAI 이벤트 추출 연결 오류");
    return {};
  }
}

/* -------------------- 액션 아이템 추출 (JSON, 유연 파싱) -------------------- */
export async function extractActionItems(text) {
  if (!requireKey()) return null;
  try {
    const payload = {
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "회의록에서 액션 아이템을 JSON 배열로만 반환. 각 항목은 {id:number, text:string, assignedTo:string|null, dueDate:string|null}. 없으면 []만 반환. JSON 외 텍스트 금지.",
        },
        {
          role: "user",
          content: `다음 회의록에서 액션 아이템을 JSON 배열로 반환:\n\n${text}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 500,
    };

    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("ActionItems HTTP Error:", res.status, body);
      alert("OpenAI 액션 아이템 호출 실패");
      return [];
    }

    const data = await res.json();
    const content = (data.choices?.[0]?.message?.content || "").trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("ActionItems JSON parse error:", e, content);
      alert("액션 아이템 JSON 파싱 실패");
      return [];
    }

    // 1) 순수 배열
    if (Array.isArray(parsed)) return parsed;

    // 2) 흔한 래핑 키들
    const candidateKeys = [
      "actionItems",
      "actions",
      "items",
      "list",
      "tasks",
      "todos",
      "action_items",
    ];
    for (const k of candidateKeys) {
      if (Array.isArray(parsed?.[k])) return parsed[k];
    }

    // 3) 객체 값 중 첫 번째 배열(폴백)
    for (const v of Object.values(parsed || {})) {
      if (Array.isArray(v)) return v;
    }

    console.warn("예상 외 JSON 형식:", parsed);
    return [];
  } catch (err) {
    console.error("ActionItems fetch error:", err);
    alert("OpenAI 액션 아이템 연결 오류");
    return [];
  }
}

/* -------------------- 화자 분리 (대화형 JSON) -------------------- */
export async function diarizeTranscript(text) {
  if (!requireKey()) return [];
  try {
    const payload = {
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `다음 한국어 회의 텍스트를 실제 대화처럼 화자별로 분리해 JSON만 반환하세요.
             출력 스키마:
             { "utterances": [ { "speaker": "발화자1", "text": "..." }, { "speaker": "발화자2", "text": "..." } ] }
             규칙:
             - 발화 순서대로 쪼개고 적절히 단락
             - 이름이 없으면 "발화자1/2/3"
             - JSON 이외 텍스트 금지`,
        },
        { role: "user", content: text },
      ],
      temperature: 0.2,
      max_tokens: 1200,
    };

    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Diarization HTTP Error:", res.status, body);
      alert("OpenAI 화자 분리 호출 실패");
      return [];
    }

    const data = await res.json();
    const content = (data.choices?.[0]?.message?.content || "").trim();

    let parsed = {};
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("Diarization JSON parse error:", e, content);
      alert("화자 분리 JSON 파싱 실패");
      return [];
    }
    return Array.isArray(parsed.utterances) ? parsed.utterances : [];
  } catch (err) {
    console.error("Diarization fetch error:", err);
    alert("OpenAI 화자 분리 연결 오류");
    return [];
  }
}

/* ---- 호환성: 기존 코드가 speechToText 이름을 기대한다면 이 별칭을 export ---- */
export { speechToTextFetch as speechToText };

/* -------------------- FlowChain 보고서 생성 (Markdown) -------------------- */
export async function generateFlowReportMarkdown(payload) {
  // payload: { project, period, timeline }
  if (!requireKey()) return "";

  // 타임라인을 요약 가능한 프롬프트로 직렬화
  const items = (payload.timeline || []).map((n) => {
    if (n.type === "meeting") {
      return {
        type: "회의",
        time: n.time,
        title: n.title,
        summary: n.summary,
        participants: n.participants || [],
        actionItems: (n.actionItems || []).map((a) => ({
          text: a.text,
          assignedTo: a.assignedTo || null,
          dueDate: a.dueDate || null,
        })),
        linkedTasks: n.linkedTasks || [],
      };
    }
    return {
      type: "업무",
      time: n.time,
      title: n.title,
      assignedTo: n.assignedTo || null,
      dueDate: n.dueDate || null,
      priority: n.priority || "보통",
      progress: n.progress ?? 0,
      tags: n.tags || [],
    };
  });

  const prompt = `
당신은 PM 비서입니다. 아래 타임라인을 바탕으로 한국어 **마크다운 보고서**를 작성하세요.

요구 형식(마크다운):
# 프로젝트 보고서 – ${payload.project}
- 기간: ${payload.period}
- 생성일: ${new Date().toLocaleString("ko-KR")}

## 1) 회의 개요
- 핵심 논의: Bullet 3~6개

## 2) 결정 사항
- 의사결정/정책/가이드라인: Bullet 3~6개

## 3) 실행/진행 현황
- 주요 업무별 상태(담당, 기한, 진행률 포함): Bullet 4~8개

## 4) 리스크/이슈 및 대응
- 리스크 항목과 대응 계획: Bullet 3~6개

## 5) 다음 액션
- 구체적 다음 단계(담당/목표일): Bullet 3~6개

주의:
- 사실 위주 간결 서술, 중복 최소화
- 날짜는 YYYY-MM-DD 형식
- '없음'은 쓰지 말고 해당 섹션을 간략화
- 표 필요 시 간단한 마크다운 표 사용 가능

타임라인(JSON):
${JSON.stringify(items, null, 2)}
  `.trim();

  try {
    const body = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a Korean project reporting assistant. Output must be Markdown.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.25,
      max_tokens: 1400,
    };

    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const t = await res.text();
      console.error("Report HTTP Error:", res.status, t);
      alert("OpenAI 보고서 생성 호출 실패");
      return "";
    }
    const data = await res.json();
    return (data.choices?.[0]?.message?.content || "").trim();
  } catch (e) {
    console.error("Report fetch error:", e);
    alert("OpenAI 보고서 생성 연결 오류");
    return "";
  }
}
