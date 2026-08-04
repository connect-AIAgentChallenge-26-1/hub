import type { Request, Response } from 'express'
import { rateLimit } from 'express-rate-limit'

/**
 * 이슈 #138 — 공개 API(rate limiting 없음) 대응.
 *
 * 테스트 환경(vitest → NODE_ENV=test)에서는 기존 라우트 테스트가 같은 앱 인스턴스에 반복
 * 요청을 보내므로(subsidies.test.ts, match.test.ts), 제한값을 매우 크게 잡아 429로 깨지지
 * 않게 한다. 미들웨어 자체는 테스트에서도 항상 붙어있어(설정만 완화) 프로덕션 설정 누락을
 * 방지한다. 실제 429 동작은 별도로 낮은 limit을 준 인스턴스를 만들어 유닛 테스트한다
 * (아래 `buildRateLimiter` export 참고).
 */
const isTestEnv = process.env.NODE_ENV === 'test'

/** 초과 시 이 프로젝트 에러 응답 컨벤션(`{ error: string }` + 429)으로 통일 */
function tooManyRequestsHandler(_req: Request, res: Response) {
  res.status(429).json({ error: 'Too many requests' })
}

/**
 * 주어진 `max` 값을 그대로 적용하는 분당 rate limiter. `NODE_ENV` 게이팅 없이 항상 지정한
 * 값을 쓰므로, 429 응답 자체(상태 코드·`{ error }` 형식)를 검증하는 유닛 테스트에서 직접
 * 낮은 값으로 호출해 쓴다 (`rate-limit.test.ts`).
 */
export function buildRateLimiter(maxPerMinute: number) {
  return rateLimit({
    windowMs: 60 * 1000,
    max: maxPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    handler: tooManyRequestsHandler,
  })
}

/**
 * 분당 요청 수 제한 미들웨어를 만든다. 테스트 환경에서는 `windowMs`는 그대로 두고 `max`만
 * 크게 올려, 라우터 장착 구조(순서·경로)는 테스트에서도 동일하게 검증되게 한다.
 */
export function createRateLimiter(maxPerMinute: number) {
  return buildRateLimiter(isTestEnv ? 10_000 : maxPerMinute)
}

/**
 * GET /api/subsidies, GET /api/subsidies/:id — 목록·상세 조회는 단순 브라우징이라 넉넉하게
 * 분당 100 (IP 기준). 소규모 MVP 단일 인스턴스라 과도하게 빡빡한 값은 지양한다.
 */
export const subsidiesRateLimiter = createRateLimiter(100)

/**
 * POST /api/match — 온보딩 완료 시뿐 아니라 결과 화면의 정렬 변경·페이지네이션마다도
 * 호출된다(`src/hooks/useSubsidies.ts`). 매 호출이 `match_requests` insert도 유발하므로
 * 목록 조회보다는 보수적으로, 그러나 정상 사용 흐름(정렬 여러 번 변경 + 페이지 넘김)엔
 * 여유가 있도록 분당 30 (IP 기준).
 */
export const matchRateLimiter = createRateLimiter(30)
