// 새 패키지 없이 직접 구현한 최소한의 rate limit — 같은 IP에서 짧은 시간에
// 쓰기 요청(POST/PATCH/DELETE)이 몰리는 걸 막는다. 조회(GET)는 대상이 아니다.
// 메모리 기반이라 서버가 재시작되면 초기화되고, 여러 인스턴스 간 공유되지 않는다 —
// 이 프로젝트 규모(단일 Render 인스턴스)에서는 충분하다.
export function rateLimit({ windowMs, max }) {
  const hits = new Map()

  // 오래 떠 있는 서버에서 다녀간 IP가 계속 쌓이지 않도록 주기적으로 만료된 항목을 정리한다.
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of hits) {
      if (now > entry.resetAt) hits.delete(key)
    }
  }, windowMs).unref()

  return function rateLimitMiddleware(req, res, next) {
    if (req.method === 'GET') return next()

    const now = Date.now()
    const key = req.ip
    const entry = hits.get(key)

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    if (entry.count >= max) {
      return res.status(429).json({ data: null, error: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요' })
    }

    entry.count += 1
    next()
  }
}
