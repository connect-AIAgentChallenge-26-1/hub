// 백엔드 연구 데이터 API 클라이언트 (에이전트 c, 프론트).
// 서버가 없어도 앱은 동작해야 하므로 호출부에서 실패를 잡는다.

const BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
const ANON_KEY = "hub-anon-id";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`api ${res.status}`);
  }
  return res.json();
}

// 익명 참가자 ID(개인정보 아님)를 브라우저에 1개 유지한다.
export function getAnonId() {
  let id = localStorage.getItem(ANON_KEY);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() ?? `anon-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(ANON_KEY, id);
  }
  return id;
}

export function getHealth() {
  return request("/api/health");
}

export function getAnalysis() {
  return request("/api/analysis");
}

export function saveResult(payload) {
  return request("/api/results", { method: "POST", body: JSON.stringify(payload) });
}

export function listResults(anonId) {
  return request(`/api/results?anonId=${encodeURIComponent(anonId)}`);
}

export function deleteResults(anonId) {
  return request(`/api/results?anonId=${encodeURIComponent(anonId)}`, { method: "DELETE" });
}

// 간이 MBTI 추정 채팅(ADR-008). 동의한 사용자의 대화 원문을 이 경로로만 보낸다.
// 서버가 없거나 실패하면 호출부가 규칙 설문으로 폴백하도록 null 유사 응답을 던진다.
export function estimateMbtiFromChat(messages) {
  return request("/api/mbti-chat", {
    method: "POST",
    body: JSON.stringify({ consent: true, messages }),
  });
}
