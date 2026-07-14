// 결(結) — 서버리스 프록시 공용 가드 (Origin 화이트리스트 + 레이트리밋 + 페이로드 캡)
//
// 파일명이 _ 로 시작하므로 Vercel은 이 파일을 라우트(엔드포인트)로 만들지 않는다.
//
// ⚠️ 솔직한 한계: Origin 검사는 "브라우저의 타 사이트 임베드"만 막는다. curl 같은
//    스크립트는 Origin을 위조하거나 생략할 수 있으므로, 키 소진 남용의 실질 방어는
//    레이트리밋 + 페이로드 캡이다. 아래 레이트리밋은 인메모리라 서버리스 인스턴스마다
//    독립적이다(웜 인스턴스의 폭주만 잡음). 공개 트래픽을 제대로 막으려면 공유 저장소
//    (Vercel KV / Upstash Redis)로 옮기고, 필요하면 Cloudflare Turnstile 등을 얹어라.

// ── Origin 화이트리스트 ────────────────────────────────────────────────────────
// 허용: (1) Origin 호스트가 요청 호스트와 동일(같은 배포에서 온 요청),
//       (2) 환경변수 ALLOWED_ORIGINS(콤마 구분)에 포함된 Origin.
// Origin 헤더가 없는 요청은 기본 차단(스크립트 남용 차단). 서버-서버 호출을 허용하려면
// ALLOW_NO_ORIGIN=1 을 설정한다.
export function checkOrigin(req) {
  const origin = req.headers.origin;
  const allow = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  if (!origin) {
    if (process.env.ALLOW_NO_ORIGIN === '1') return { ok: true, origin: null };
    return { ok: false, origin: null, reason: 'Origin 헤더가 없습니다.' };
  }
  try {
    if (new URL(origin).host === req.headers.host) return { ok: true, origin };
  } catch { /* 잘못된 Origin */ }
  if (allow.includes(origin)) return { ok: true, origin };
  return { ok: false, origin, reason: '허용되지 않은 Origin' };
}

// 허용된 Origin에만 CORS 헤더를 반사한다.
export function applyCors(res, origin) {
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// ── 레이트리밋(인메모리 슬라이딩 윈도) ─────────────────────────────────────────
const hits = new Map(); // key -> number[] (요청 타임스탬프)

export function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/**
 * @returns {{ok:boolean, retryAfter?:number}}
 */
export function rateLimit(key, { windowMs = 60_000, max = 10 } = {}) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);

  // 메모리 누수 방지: 가끔 만료된 키 정리
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
  }

  if (arr.length > max) {
    const oldest = arr[0];
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - oldest)) / 1000) };
  }
  return { ok: true };
}

// ── 페이로드 캡(토큰·비용 폭주 방지) ───────────────────────────────────────────
export const LIMITS = { draftMaxChars: 4000, threadMaxMsgs: 20, threadMsgMaxChars: 4000 };

export function checkPayload({ draft, thread }) {
  if (typeof draft !== 'string' || draft.trim().length < 2) {
    return { ok: false, reason: 'draft(2자 이상)가 필요합니다.' };
  }
  if (draft.length > LIMITS.draftMaxChars) {
    return { ok: false, reason: `draft가 너무 깁니다(최대 ${LIMITS.draftMaxChars}자).` };
  }
  if (thread != null) {
    if (!Array.isArray(thread) || thread.length > LIMITS.threadMaxMsgs) {
      return { ok: false, reason: `thread는 최대 ${LIMITS.threadMaxMsgs}개까지입니다.` };
    }
    for (const t of thread) {
      if (t && typeof t.text === 'string' && t.text.length > LIMITS.threadMsgMaxChars) {
        return { ok: false, reason: 'thread 항목이 너무 깁니다.' };
      }
    }
  }
  return { ok: true };
}
