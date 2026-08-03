import { describe, expect, it, vi } from 'vitest';

import type { Insight } from '@amadda/domain/insight';
import {
  createInsightCaptureService,
  type InsightCaptureAuthenticator,
  type InsightCaptureStore,
} from './insight_capture_service';

const USER_ID = '00000000-0000-4000-8000-000000000001';

describe('createInsightCaptureService', () => {
  it('normalizes an HTTP URL and stores it for the authenticated user', async () => {
    const createdInsight = createInsight();
    const store = createStore({
      create: vi.fn().mockResolvedValue({
        insight: createdInsight,
        status: 'created',
      }),
    });
    const service = createInsightCaptureService(
      createAuthenticator(USER_ID),
      () => store
    );

    await expect(
      service.capture('access-token', {
        source: 'web',
        title: '  Example article  ',
        url: ' https://Example.com/article?utm_source=campaign#summary ',
      })
    ).resolves.toEqual({ created: true, insight: createdInsight, ok: true });
    expect(store.create).toHaveBeenCalledWith({
      domain: 'example.com',
      normalizedUrl: 'https://example.com/article',
      originalUrl: 'https://Example.com/article?utm_source=campaign#summary',
      title: 'Example article',
      titleOrigin: 'capture',
      userId: USER_ID,
    });
  });

  it('returns an existing insight as a successful duplicate capture', async () => {
    const existingInsight = createInsight();
    const store = createStore({
      findByNormalizedUrl: vi.fn().mockResolvedValue({
        insight: existingInsight,
        status: 'found',
      }),
    });
    const service = createInsightCaptureService(
      createAuthenticator(USER_ID),
      () => store
    );

    await expect(
      service.capture('access-token', {
        source: 'chrome_extension',
        url: 'https://EXAMPLE.com/article?utm_source=campaign',
      })
    ).resolves.toEqual({ created: false, insight: existingInsight, ok: true });
    expect(store.create).not.toHaveBeenCalled();
  });

  it('returns the concurrently created insight after a unique conflict', async () => {
    const racedInsight = createInsight();
    const store = createStore({
      create: vi.fn().mockResolvedValue({ status: 'duplicate' }),
      findByNormalizedUrl: vi
        .fn()
        .mockResolvedValueOnce({ status: 'not-found' })
        .mockResolvedValueOnce({ insight: racedInsight, status: 'found' }),
    });
    const service = createInsightCaptureService(
      createAuthenticator(USER_ID),
      () => store
    );

    await expect(
      service.capture('access-token', {
        source: 'ios_share',
        url: 'https://example.com/article',
      })
    ).resolves.toEqual({ created: false, insight: racedInsight, ok: true });
    expect(store.findByNormalizedUrl).toHaveBeenCalledTimes(2);
  });

  it('rejects unauthenticated capture requests before storage access', async () => {
    const store = createStore();
    const service = createInsightCaptureService(
      createAuthenticator(null),
      () => store
    );

    await expect(
      service.capture('invalid-token', {
        source: 'web',
        url: 'https://example.com/article',
      })
    ).resolves.toEqual({ ok: false, reason: 'permission-denied' });
    expect(store.findByNormalizedUrl).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
  });

  it('rejects URLs outside the HTTP and HTTPS protocols', async () => {
    const store = createStore();
    const service = createInsightCaptureService(
      createAuthenticator(USER_ID),
      () => store
    );

    await expect(
      service.capture('access-token', {
        source: 'web',
        url: 'javascript:alert(1)',
      })
    ).resolves.toEqual({ ok: false, reason: 'unsupported-protocol' });
    expect(store.findByNormalizedUrl).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
  });

  it('rejects a malformed URL before storage access', async () => {
    const store = createStore();
    const service = createInsightCaptureService(
      createAuthenticator(USER_ID),
      () => store
    );

    await expect(
      service.capture('access-token', {
        source: 'web',
        url: 'not a url',
      })
    ).resolves.toEqual({ ok: false, reason: 'invalid-url' });
    expect(store.findByNormalizedUrl).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ source: 'unknown', url: 'https://example.com/article' }],
    [{ source: 'web' }],
    [{ source: 'web', url: 'x'.repeat(4097) }],
    [
      {
        source: 'web',
        title: 'x'.repeat(501),
        url: 'https://example.com/article',
      },
    ],
  ])('rejects an invalid capture contract: %o', async (request) => {
    const store = createStore();
    const service = createInsightCaptureService(
      createAuthenticator(USER_ID),
      () => store
    );

    await expect(service.capture('access-token', request)).resolves.toEqual({
      ok: false,
      reason: 'invalid-request',
    });
    expect(store.findByNormalizedUrl).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
  });
});

function createInsight(overrides: Partial<Insight> = {}): Insight {
  return {
    categoryId: null,
    createdAt: '2026-07-16T00:00:00.000Z',
    domain: 'example.com',
    id: '10000000-0000-4000-8000-000000000001',
    memo: null,
    normalizedUrl: 'https://example.com/article',
    originalUrl: 'https://example.com/article',
    title: 'Example article',
    titleOrigin: 'capture',
    updatedAt: '2026-07-16T00:00:00.000Z',
    ...overrides,
  };
}

function createAuthenticator(
  userId: string | null
): InsightCaptureAuthenticator {
  return {
    authenticate: vi.fn(async () => userId),
  };
}

function createStore(
  overrides: Partial<InsightCaptureStore> = {}
): InsightCaptureStore {
  return {
    create: vi.fn(async () => ({ status: 'write-failed' as const })),
    findByNormalizedUrl: vi.fn(async () => ({ status: 'not-found' as const })),
    ...overrides,
  };
}
