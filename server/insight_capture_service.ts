import {
  isInsightCaptureSource,
  normalizeInsightUrl,
  type Insight,
  type InsightCaptureFailureReason,
  type InsightCaptureRequest,
  type InsightCaptureResult,
  type InsightTitleOrigin,
} from '@amadda/domain/insight';

const MAX_URL_LENGTH = 4096;
const MAX_TITLE_LENGTH = 500;

export type InsightCaptureAuthenticator = {
  authenticate(accessToken: string): Promise<string | null>;
};

export type InsightCaptureStore = {
  create(input: InsightCaptureStoreInput): Promise<InsightCaptureStoreResult>;
  findByNormalizedUrl(
    userId: string,
    normalizedUrl: string
  ): Promise<InsightCaptureStoreLookupResult>;
};

export type InsightCaptureStoreFactory = (
  accessToken: string
) => InsightCaptureStore;

export type InsightCaptureStoreInput = {
  domain: string;
  normalizedUrl: string;
  originalUrl: string;
  title: string;
  titleOrigin: InsightTitleOrigin;
  userId: string;
};

export type InsightCaptureStoreResult =
  | { insight: Insight; status: 'created' }
  | {
      status:
        | Exclude<
            InsightCaptureFailureReason,
            'invalid-request' | 'invalid-url' | 'unsupported-protocol'
          >
        | 'duplicate';
    };

export type InsightCaptureStoreLookupResult =
  | { insight: Insight; status: 'found' }
  | { status: 'not-found' | 'permission-denied' | 'write-failed' };

export type ServerInsightCaptureService = {
  capture(accessToken: string, request: unknown): Promise<InsightCaptureResult>;
};

export function createInsightCaptureService(
  authenticator: InsightCaptureAuthenticator,
  createStore: InsightCaptureStoreFactory
): ServerInsightCaptureService {
  return {
    async capture(accessToken, request) {
      const userId = await authenticator.authenticate(accessToken);

      if (!userId) {
        return { ok: false, reason: 'permission-denied' };
      }

      const store = createStore(accessToken);

      const parsedRequest = parseCaptureRequest(request);

      if (!parsedRequest.ok) {
        return parsedRequest;
      }

      const normalizedUrl = normalizeInsightUrl(parsedRequest.request.url);

      if (!normalizedUrl.ok) {
        return normalizedUrl;
      }

      const existingInsight = await store.findByNormalizedUrl(
        userId,
        normalizedUrl.normalizedUrl
      );

      if (existingInsight.status === 'found') {
        return { created: false, insight: existingInsight.insight, ok: true };
      }

      if (existingInsight.status !== 'not-found') {
        return { ok: false, reason: existingInsight.status };
      }

      const title = getCaptureTitle(
        parsedRequest.request.title,
        normalizedUrl.domain
      );
      const createResult = await store.create({
        domain: normalizedUrl.domain,
        normalizedUrl: normalizedUrl.normalizedUrl,
        originalUrl: normalizedUrl.originalUrl,
        title: title.value,
        titleOrigin: title.origin,
        userId,
      });

      if (createResult.status === 'created') {
        return { created: true, insight: createResult.insight, ok: true };
      }

      if (createResult.status !== 'duplicate') {
        return { ok: false, reason: createResult.status };
      }

      const racedInsight = await store.findByNormalizedUrl(
        userId,
        normalizedUrl.normalizedUrl
      );

      if (racedInsight.status === 'found') {
        return { created: false, insight: racedInsight.insight, ok: true };
      }

      return racedInsight.status === 'permission-denied'
        ? { ok: false, reason: 'permission-denied' }
        : { ok: false, reason: 'write-failed' };
    },
  };
}

function parseCaptureRequest(
  value: unknown
):
  | { ok: true; request: InsightCaptureRequest }
  | { ok: false; reason: 'invalid-request' } {
  if (!isRecord(value) || !isInsightCaptureSource(value.source)) {
    return { ok: false, reason: 'invalid-request' };
  }

  if (typeof value.url !== 'string' || value.url.length > MAX_URL_LENGTH) {
    return { ok: false, reason: 'invalid-request' };
  }

  if (
    value.title !== undefined &&
    (typeof value.title !== 'string' || value.title.length > MAX_TITLE_LENGTH)
  ) {
    return { ok: false, reason: 'invalid-request' };
  }

  return {
    ok: true,
    request: {
      source: value.source,
      title: value.title,
      url: value.url,
    },
  };
}

function getCaptureTitle(title: string | undefined, domain: string) {
  const captureTitle = title?.trim();

  return captureTitle
    ? { origin: 'capture' as const, value: captureTitle }
    : { origin: 'fallback' as const, value: domain };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
