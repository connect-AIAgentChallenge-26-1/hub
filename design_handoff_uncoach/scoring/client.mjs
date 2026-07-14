// 결(結) — 브라우저용 채점 클라이언트
//
// 브라우저는 2단계 LLM 채점을 직접 못 한다(Anthropic 키 노출) → /api/score 프록시로 위임.
// 1단계 신호는 즉시 UI 힌트로도 쓸 수 있게 extractSignals 를 재수출한다.

export { extractSignals } from './signals.mjs';

/**
 * 서버리스 프록시로 채점을 위임한다.
 * @returns {Promise<{scores,reasons,total,focusAxis,signals,...}>}
 */
export async function scoreViaProxy({ situation, draft, thread = [] }, { proxyUrl = '/api/score' } = {}) {
  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ situation, draft, thread }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}
