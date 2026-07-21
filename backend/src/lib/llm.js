// LLM 클라이언트 래퍼 (ADR-008 · llm-agent-plan §4~5).
// - 외부 LLM 호출은 반드시 backend에서만. 키는 .env(GEMINI_API_KEY)에서만 읽는다(프론트 노출 금지).
// - responseSchema 로 JSON 강제. 429/503 시 유한 모델 폴백(고정 배열 단일 패스 → 무한루프 구조적 차단).
// - 실패·타임아웃·키 없음이면 null 반환 → 호출부가 규칙 설문으로 폴백한다.
// - 제공자는 Gemini 우선(교체 가능하게 함수 경계로 감쌈).
import { GoogleGenAI, Type } from "@google/genai";

const API_KEY = process.env.GEMINI_API_KEY || "";
export const isLlmAvailable = Boolean(API_KEY);

// 저비용 flash급 우선 → 대체 1개. 정확한 ID는 Gemini 공식 문서로 확정/조정(llm-agent-plan §1).
// 429(쿼터)·503(과부하) 시 다음 모델로 넘어간다. 배열 길이만큼만 시도 → 무한루프 없음.
const MODEL_CHAIN = ["gemini-2.5-flash", "gemini-2.0-flash"];
const CALL_TIMEOUT_MS = 12000;

const MBTI_TYPES = new Set([
  "ISTJ", "ISFJ", "INFJ", "INTJ", "ISTP", "ISFP", "INFP", "INTP",
  "ESTP", "ESFP", "ENFP", "ENTP", "ESTJ", "ESFJ", "ENFJ", "ENTJ",
]);

// 간이 MBTI 추정 출력 계약(비진단·간이 추정). llm-agent-plan §3 / AI_Pipeline_Design.md.
const ESTIMATE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    mbti: { type: Type.STRING, description: "4글자 대문자 MBTI 또는 빈 문자열(불명확)" },
    confidence: { type: Type.STRING, enum: ["low", "mid"], description: "간이 추정 확신도(high 없음)" },
    rationale: { type: Type.STRING, description: "대화에서 관찰된 근거 1~2문장(가능성 표현)" },
    uncertainty: { type: Type.STRING, description: "한계·주의 1문장" },
    disallowed_check: { type: Type.BOOLEAN, description: "진단·성적예측·유형 우열 표현을 넣지 않았으면 true" },
  },
  required: ["mbti", "confidence", "rationale", "uncertainty", "disallowed_check"],
};

const SYSTEM_INSTRUCTION = [
  "너는 사용자의 짧은 대화(약 2회)를 바탕으로 MBTI 4글자를 '간이 추정'하는 보조자다.",
  "이것은 공식 판정이 아니라 탐색적 간이 추정이다. 진단·성적 예측·유형 간 우열 표현을 절대 하지 않는다.",
  "확신이 낮거나 근거가 부족하면 mbti를 빈 문자열로 두고 confidence를 low로 한다.",
  "항상 가능성의 언어(…일 수 있음)를 쓰고, 사용자를 평가하지 않는다.",
  "출력은 반드시 주어진 JSON 스키마를 따른다.",
].join(" ");

// 타임아웃 경쟁 래퍼. SDK 자체 abort 지원 여부와 무관하게 상한 지연을 보장한다.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("llm_timeout")), ms)),
  ]);
}

function statusOf(error) {
  return error?.status ?? error?.code ?? error?.response?.status ?? null;
}

// 429/503 은 과부하성 → 다음 모델로. 그 외 오류는 재시도 이득이 적어 즉시 중단.
function isRetriable(error) {
  const status = Number(statusOf(error));
  return status === 429 || status === 503;
}

// 대화 원문 → 간이 추정 JSON. 실패 시 null(호출부가 규칙 폴백).
export async function estimateMbtiFromChat(messages = []) {
  if (!isLlmAvailable) {
    return null;
  }
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const contents = messages
    .filter((m) => m && typeof m.text === "string" && m.text.trim())
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text.slice(0, 1000) }],
    }));

  if (contents.length === 0) {
    return null;
  }

  for (const model of MODEL_CHAIN) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: ESTIMATE_SCHEMA,
            temperature: 0.4,
          },
        }),
        CALL_TIMEOUT_MS,
      );

      const parsed = safeParseJson(response?.text);
      const validated = validateEstimate(parsed);
      if (validated) {
        return { ...validated, model };
      }
      // JSON 은 왔지만 계약 위반 → 폴백(다음 모델로 넘기지 않고 종료: 재호출 이득 적음).
      return null;
    } catch (error) {
      if (isRetriable(error)) {
        continue; // 다음 모델 시도(배열 끝나면 루프 종료 → 무한루프 없음).
      }
      return null; // 비재시도성 오류 → 규칙 폴백.
    }
  }
  return null; // 모든 모델 소진 → 규칙 폴백.
}

function safeParseJson(text) {
  if (!text || typeof text !== "string") {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// 서버측 출력 검증: mbti 는 16유형만, disallowed_check 필수 통과. 위반 시 null.
function validateEstimate(obj) {
  if (!obj || typeof obj !== "object") {
    return null;
  }
  if (obj.disallowed_check !== true) {
    return null;
  }
  const rawMbti = typeof obj.mbti === "string" ? obj.mbti.trim().toUpperCase() : "";
  const mbti = MBTI_TYPES.has(rawMbti) ? rawMbti : null;
  return {
    mbti, // null 이면 "불명확" — 호출부가 규칙 설문으로 유도
    confidence: obj.confidence === "mid" ? "mid" : "low",
    rationale: typeof obj.rationale === "string" ? obj.rationale.slice(0, 400) : "",
    uncertainty: typeof obj.uncertainty === "string" ? obj.uncertainty.slice(0, 300) : "",
  };
}
