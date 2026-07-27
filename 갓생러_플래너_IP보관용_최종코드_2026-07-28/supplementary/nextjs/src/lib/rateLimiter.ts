import 'server-only';

const DEFAULT_FREE_DAILY_LIMIT = 5;
const DEFAULT_TIME_ZONE = 'Asia/Seoul';

interface MemoryEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  source: 'upstash' | 'memory';
}

interface RateLimitOptions {
  limit?: number;
  namespace?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __godsaengRateLimitStore: Map<string, MemoryEntry> | undefined;
}

const memoryStore =
  globalThis.__godsaengRateLimitStore ??
  (globalThis.__godsaengRateLimitStore = new Map<string, MemoryEntry>());

const getDailyWindow = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const readPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const year = readPart('year');
  const month = readPart('month');
  const day = readPart('day');
  const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // 한국은 DST가 없으므로 UTC+9를 빼면 다음 KST 자정을 얻습니다.
  const koreaOffsetMs = 9 * 60 * 60 * 1000;
  const nextMidnight = Date.UTC(year, month - 1, day + 1) - koreaOffsetMs;
  const resetAt = Math.max(nextMidnight, now.getTime() + 60 * 1000);

  return {
    dateKey,
    resetAt,
    ttlSeconds: Math.max(
      60,
      Math.ceil((resetAt - now.getTime()) / 1000),
    ),
  };
};

const consumeMemoryLimit = (
  key: string,
  limit: number,
  resetAt: number,
): RateLimitResult => {
  const now = Date.now();
  const existing = memoryStore.get(key);
  const entry =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt };

  entry.count += 1;
  memoryStore.set(key, entry);

  // 장시간 실행되는 개발 서버에서 만료 키가 무한히 쌓이지 않도록 정리합니다.
  if (memoryStore.size > 5_000) {
    memoryStore.forEach((value, storedKey) => {
      if (value.resetAt <= now) memoryStore.delete(storedKey);
    });
  }

  return {
    success: entry.count <= limit,
    limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.resetAt,
    source: 'memory',
  };
};

const consumeUpstashLimit = async (
  key: string,
  limit: number,
  resetAt: number,
  ttlSeconds: number,
): Promise<RateLimitResult | null> => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, ttlSeconds, 'NX'],
      ]),
      cache: 'no-store',
    });

    if (!response.ok) return null;
    const result = (await response.json()) as Array<{
      result?: number;
      error?: string;
    }>;
    const count = Number(result[0]?.result);
    if (!Number.isFinite(count)) return null;

    return {
      success: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt,
      source: 'upstash',
    };
  } catch {
    return null;
  }
};

/**
 * 동일 identifier의 AI 요청을 한국 시간 기준 날짜별로 제한합니다.
 * Upstash 환경변수가 있으면 Redis를 사용하고, 없거나 장애가 나면 메모리로 폴백합니다.
 */
export const rateLimit = async (
  identifier: string,
  options: RateLimitOptions = {},
): Promise<RateLimitResult> => {
  const limit = Math.max(
    1,
    Math.floor(options.limit ?? DEFAULT_FREE_DAILY_LIMIT),
  );
  const namespace = options.namespace ?? 'ai';
  const { dateKey, resetAt, ttlSeconds } = getDailyWindow();
  const key = `${namespace}:${dateKey}:${identifier}`;

  const upstashResult = await consumeUpstashLimit(
    key,
    limit,
    resetAt,
    ttlSeconds,
  );
  if (upstashResult) return upstashResult;

  return consumeMemoryLimit(key, limit, resetAt);
};

export const createRateLimitHeaders = (
  result: RateLimitResult,
): Record<string, string> => ({
  'X-RateLimit-Limit': String(result.limit),
  'X-RateLimit-Remaining': String(result.remaining),
  'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
});
