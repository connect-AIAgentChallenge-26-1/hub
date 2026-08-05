import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildRateLimiter } from './rate-limit.js'

/**
 * `buildRateLimiter`는 `NODE_ENV` 게이팅 없이 항상 주어진 `max`를 쓰므로, 여기서 낮은 값으로
 * 429 응답(상태 코드 + `{ error }` 형식)을 직접 검증한다. `subsidiesRateLimiter` /
 * `matchRateLimiter`(실제 앱에 장착되는 값)는 테스트 환경에서 자동으로 완화되므로
 * (이슈 #138 — 기존 라우트 테스트 429 방지) 이 파일에서만 429 동작을 확인한다.
 */
function buildTestApp(max: number) {
  const app = express()
  app.use(buildRateLimiter(max))
  app.get('/ping', (_req, res) => {
    res.json({ ok: true })
  })
  return app
}

describe('buildRateLimiter', () => {
  it('제한 이내 요청은 정상 응답한다', async () => {
    const app = buildTestApp(2)
    const res = await request(app).get('/ping')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('제한을 초과하면 429와 { error } 응답을 반환한다', async () => {
    const app = buildTestApp(1)
    const first = await request(app).get('/ping')
    expect(first.status).toBe(200)

    const second = await request(app).get('/ping')
    expect(second.status).toBe(429)
    expect(second.body).toEqual({ error: 'Too many requests' })
  })
})
