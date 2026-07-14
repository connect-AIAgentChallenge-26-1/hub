// 언코/결 — Gemini 프록시 (Vercel / Netlify Functions 호환)
//
// 목적: API 키를 브라우저에 내려보내지 않는다. 키는 서버 환경변수에만 둔다.
// 배포:
//   1) 이 파일을 프로젝트 루트의 api/gemini.mjs 에 둔다 (Vercel은 api/ 를 자동으로 함수로 인식).
//   2) 배포 환경변수에 GEMINI_API_KEY 를 설정한다.
//   3) 프론트엔드는 아무 설정도 필요 없다 — /api/gemini 를 자동으로 찾아 쓴다.
//
// 이 파일이 없는 정적 호스팅(GitHub Pages 등)에서는 프론트엔드가 404를 보고
// "방문자가 자기 키를 입력하는 모드"로 자동 폴백한다.
//
// 보안: score.mjs 와 동일한 가드(Origin 화이트리스트·레이트리밋·페이로드 캡)를 적용한다.
//       한계는 api/_guard.mjs 상단 주석 참고(공개 트래픽은 공유 저장소 레이트리밋 필요).

import { checkOrigin, applyCors, clientIp } from './_guard.mjs';
import { checkRate } from './_ratelimit.mjs';

const ALLOWED_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.5-pro']);
const GEMINI_MAX = Number(process.env.GEMINI_RATE_PER_MIN) || 15;
const MAX_OUTPUT_TOKENS = 4096;   // 출력 토큰 상한(비용 폭주 방지)
const MAX_PAYLOAD_BYTES = 60_000; // 전달 payload 크기 상한

export default async function handler(req, res) {
  // 1) Origin 검사 + CORS + 프리플라이트
  const origin = checkOrigin(req);
  if (origin.ok) applyCors(res, origin.origin);
  if (req.method === 'OPTIONS') {
    res.status(origin.ok ? 204 : 403).end();
    return;
  }
  if (!origin.ok) {
    res.status(403).json({ error: { message: origin.reason || '허용되지 않은 요청입니다.' } });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'POST만 허용됩니다.' } });
    return;
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(500).json({ error: { message: '서버에 GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' } });
    return;
  }

  // 2) 레이트리밋(Upstash 공유 저장소, 미설정 시 인메모리 폴백)
  const rl = await checkRate(clientIp(req), { prefix: 'gemini', max: GEMINI_MAX, windowSec: 60 });
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter || 30));
    res.status(429).json({ error: { message: `요청이 너무 잦습니다. ${rl.retryAfter || 30}초 뒤 다시 시도해주세요.` } });
    return;
  }

  // 3) 본문 파싱(잘못된 JSON은 여기서 400으로 정리 — 이전엔 try 밖이라 처리 안 되던 문제)
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    res.status(400).json({ error: { message: '요청 본문이 올바른 JSON이 아닙니다.' } });
    return;
  }

  const { model, ...payload } = body;
  // 모델명을 그대로 URL에 넣으므로 화이트리스트로 제한한다(경로 조작·임의 모델 호출 방지).
  if (!ALLOWED_MODELS.has(model)) {
    res.status(400).json({ error: { message: `허용되지 않은 모델입니다: ${model}` } });
    return;
  }

  // 4) payload 캡: 크기 제한 + 출력 토큰 상한 강제(임의 payload 통과로 인한 비용 폭주 방지)
  if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) {
    res.status(413).json({ error: { message: '요청이 너무 큽니다.' } });
    return;
  }
  if (payload.generationConfig && payload.generationConfig.maxOutputTokens > MAX_OUTPUT_TOKENS) {
    payload.generationConfig.maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(payload),
      }
    );
    const text = await upstream.text();
    // 상태코드와 본문을 그대로 통과시킨다 — 프론트엔드가 429의 retryDelay를 읽어
    // 자동 재시도할 수 있어야 하기 때문이다.
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: { message: `Gemini 연결 실패: ${e && e.message}` } });
  }
}
