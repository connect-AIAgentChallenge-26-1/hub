// 결(結) — 공유 저장소 기반 레이트리밋 (Upstash Redis) + 인메모리 폴백
//
// 서버리스 함수는 요청마다 다른 인스턴스에서 실행될 수 있어 인메모리 카운터는
// 인스턴스별로 따로 센다 → 공격자가 요청을 흩뿌리면 실효 제한이 무너진다.
// Upstash Redis(공유 저장소)를 쓰면 인스턴스가 몇 개든 "하나의 진짜 한도"가 걸린다.
//
// 동작:
//   - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 이 있으면 Upstash 슬라이딩 윈도 사용.
//   - 없거나 패키지 미설치면 인메모리(_guard.rateLimit)로 자동 폴백 → 로컬/미설정도 그대로 동작.
//
// 설정:
//   1) upstash.com 에서 Redis DB 생성(무료 티어 있음).
//   2) 배포 환경변수에 UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN 설정.
//   3) 의존성 설치: @upstash/ratelimit, @upstash/redis (package.json에 포함).
//   (Vercel을 쓰면 Vercel KV로도 동일하게 가능 — 내부적으로 Upstash.)

import { rateLimit as memRateLimit } from './_guard.mjs';

let upstash = null;                 // null=미확인, false=미사용(폴백), {Ratelimit, redis}=사용
const instances = new Map();        // `${prefix}:${max}:${windowSec}` -> Ratelimit 인스턴스

async function getUpstash() {
  if (upstash !== null) return upstash;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { upstash = false; return false; }
  try {
    // 동적 import: 패키지가 없어도(미설정 배포) 여기서만 실패하고 폴백한다.
    const [{ Ratelimit }, { Redis }] = await Promise.all([
      import('@upstash/ratelimit'),
      import('@upstash/redis'),
    ]);
    upstash = { Ratelimit, redis: new Redis({ url, token }) };
  } catch {
    upstash = false; // 패키지 미설치 등 → 인메모리 폴백
  }
  return upstash;
}

/**
 * @param {string} key 보통 클라이언트 IP
 * @param {{max?:number, windowSec?:number, prefix?:string}} opts
 * @returns {Promise<{ok:boolean, retryAfter?:number, backend:'upstash'|'memory'}>}
 */
export async function checkRate(key, { max = 10, windowSec = 60, prefix = 'rl' } = {}) {
  const u = await getUpstash();

  if (!u) {
    const r = memRateLimit(`${prefix}:${key}`, { windowMs: windowSec * 1000, max });
    return { ok: r.ok, retryAfter: r.retryAfter, backend: 'memory' };
  }

  const cacheKey = `${prefix}:${max}:${windowSec}`;
  let rl = instances.get(cacheKey);
  if (!rl) {
    rl = new u.Ratelimit({
      redis: u.redis,
      limiter: u.Ratelimit.slidingWindow(max, `${windowSec} s`),
      prefix,
      analytics: false,
    });
    instances.set(cacheKey, rl);
  }

  const res = await rl.limit(key);
  const retryAfter = res.success ? undefined : Math.max(1, Math.ceil((res.reset - Date.now()) / 1000));
  return { ok: res.success, retryAfter, backend: 'upstash' };
}
