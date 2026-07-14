// 결(結) — 채점 서버리스 프록시 (Vercel / Netlify Functions 호환)
//
// 목적: 2단계 LLM 채점을 서버에서 실행한다. ANTHROPIC_API_KEY는 서버 환경변수에만 둔다
//       (Anthropic API는 브라우저 직접 호출용이 아니다). 프론트엔드는 /api/score 로
//       {situation, draft, thread} 를 POST 하면 최종 채점 결과를 받는다.
//
// 배포:
//   1) 이 파일을 프로젝트 루트의 api/score.mjs 에 둔다.
//   2) 배포 환경변수에 ANTHROPIC_API_KEY 를 설정한다.
//   3) 루트 package.json 의 의존성(@anthropic-ai/sdk)을 설치한다.

import Anthropic from '@anthropic-ai/sdk';
import { scoreDraft } from '../scoring/pipeline.mjs';
import { createClaudeScorer } from '../scoring/claude.mjs';
import { checkOrigin, applyCors, clientIp, checkPayload } from './_guard.mjs';
import { checkRate } from './_ratelimit.mjs';

// 레이트리밋: IP당 분당 요청 수. 환경변수로 조정.
const SCORE_MAX = Number(process.env.SCORE_RATE_PER_MIN) || 10;

// 실제 Claude 호출(프로덕션·테스트 공용 로직). ANTHROPIC_API_KEY를 자동으로 읽는다.
const client = new Anthropic();
const callClaude = createClaudeScorer(client, { model: process.env.SCORE_MODEL });

export default async function handler(req, res) {
  // 1) Origin 검사 + CORS(허용된 Origin만 반사) + 프리플라이트 처리
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
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: { message: '서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다.' } });
    return;
  }

  // 2) 레이트리밋(Upstash 공유 저장소, 미설정 시 인메모리 폴백)
  const rl = await checkRate(clientIp(req), { prefix: 'score', max: SCORE_MAX, windowSec: 60 });
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter || 30));
    res.status(429).json({ error: { message: `요청이 너무 잦습니다. ${rl.retryAfter || 30}초 뒤 다시 시도해주세요.` } });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { situation, draft, thread } = body;

    // 3) 페이로드 캡(토큰·비용 폭주 방지)
    if (!situation) {
      res.status(400).json({ error: { message: 'situation 이 필요합니다.' } });
      return;
    }
    const pc = checkPayload({ draft, thread });
    if (!pc.ok) {
      res.status(400).json({ error: { message: pc.reason } });
      return;
    }

    const result = await scoreDraft({ situation, draft, thread: thread || [], callClaude });
    res.status(200);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(result));
  } catch (e) {
    // Anthropic SDK의 타입별 예외로 세분화
    if (e instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: { message: '요청 한도에 걸렸습니다. 잠시 뒤 다시 시도해주세요.' } });
    } else if (e instanceof Anthropic.APIError) {
      res.status(502).json({ error: { message: `Anthropic 오류(${e.status}): ${e.message}` } });
    } else if (e instanceof SyntaxError) {
      res.status(502).json({ error: { message: '채점 응답 파싱에 실패했습니다.' } });
    } else {
      res.status(500).json({ error: { message: `채점 실패: ${(e && e.message) || e}` } });
    }
  }
}
