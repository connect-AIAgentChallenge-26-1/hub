// 결(結) — Cloud Functions (LLM 프록시)
//
// Gemini 키를 브라우저에 노출하지 않고 서버(함수)에서만 쓴다. Firebase Hosting rewrite로
// 프론트엔드의 `/api/gemini` 호출이 이 함수로 전달된다(프론트 코드 변경 불필요).
//
// 키 설정(비밀): firebase functions:secrets:set GEMINI_API_KEY
//
// ⚠️ 남용(오픈 프록시) 방지: 공개 HTTPS 함수라 직접 호출이 가능하다. 실제 보호는
//    Firebase App Check(앱 정품 증명)로 하는 게 정석이다. 여기서는 모델 화이트리스트 +
//    페이로드/출력토큰 상한으로 비용 폭주만 막아둔다. App Check는 배포 후 콘솔에서 활성화 권장.

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

const ALLOWED_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.5-pro']);
const MAX_OUTPUT_TOKENS = 4096;
const MAX_PAYLOAD_BYTES = 60_000;

export const gemini = onRequest(
  { secrets: [GEMINI_API_KEY], cors: true, region: 'us-central1' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: { message: 'POST만 허용됩니다.' } });
      return;
    }

    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch {
      res.status(400).json({ error: { message: '요청 본문이 올바른 JSON이 아닙니다.' } });
      return;
    }

    const { model, ...payload } = body;
    if (!ALLOWED_MODELS.has(model)) {
      res.status(400).json({ error: { message: `허용되지 않은 모델입니다: ${model}` } });
      return;
    }

    // 비용 폭주 방지: payload 크기 + 출력 토큰 상한
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
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY.value() },
          body: JSON.stringify(payload),
        }
      );
      const text = await upstream.text();
      // 상태코드·본문 그대로 통과 → 프론트가 429 retryDelay 읽어 자동 재시도 가능
      res.status(upstream.status);
      res.set('Content-Type', 'application/json; charset=utf-8');
      res.send(text);
    } catch (e) {
      res.status(502).json({ error: { message: `Gemini 연결 실패: ${e && e.message}` } });
    }
  }
);

// (2차) Claude 1~5 채점 함수는 scoring/ 파이프라인을 functions/ 안으로 옮겨 여기에 추가한다.
// export const score = onRequest({ secrets: [ANTHROPIC_API_KEY], cors: true }, async (req, res) => { ... });
