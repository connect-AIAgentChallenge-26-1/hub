import { createHash, timingSafeEqual } from 'node:crypto';

import type { InsightCaptureResult } from '@amadda/domain/insight';
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';

import type { ServerInsightCaptureService } from './insight_capture_service.js';
import type {
  InsightMemoResult,
  ServerInsightMemoService,
} from './insight_memo_service.js';
import {
  NotionImportServiceError,
  type NotionImportService,
} from './insight_import/notion_import_service.js';
import type {
  InsightRetrieveResult,
  ServerInsightRetrieveService,
} from './retrieve/insight_retrieve_service.js';

export type CreateAppOptions = {
  captureService?: ServerInsightCaptureService;
  cleanupService?: ImportCleanupService;
  cronSecret?: string;
  logger?: Pick<Console, 'error'>;
  memoService?: ServerInsightMemoService;
  notionImportService?: NotionImportService;
  retrieveService?: ServerInsightRetrieveService;
};

export type ImportCleanupService = {
  cleanup(): Promise<{ deletedJobCount: number }>;
};

const captureJsonParser = express.json({ limit: '8kb' });
const importJsonParser = express.json({ limit: '64kb' });
const ANDROID_WEBVIEW_ORIGINS = new Set([
  'https://localhost',
  'http://localhost',
]);
const CORS_ALLOWED_HEADERS = 'Authorization, Content-Type';
const CORS_ALLOWED_METHODS = 'GET, POST, PATCH, OPTIONS';

const allowAndroidWebViewCors: RequestHandler = (request, response, next) => {
  response.vary('Origin');

  const origin = request.header('origin');
  if (!origin || !ANDROID_WEBVIEW_ORIGINS.has(origin)) {
    next();
    return;
  }

  response.set({
    'Access-Control-Allow-Headers': CORS_ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': CORS_ALLOWED_METHODS,
    'Access-Control-Allow-Origin': origin,
  });

  if (request.method === 'OPTIONS') {
    response.sendStatus(204);
    return;
  }

  next();
};

const parseCaptureJson: RequestHandler = (request, response, next) => {
  captureJsonParser(request, response, (error) => {
    if (error) {
      response.status(400).json({ ok: false, reason: 'invalid-request' });
      return;
    }

    next();
  });
};

const parseImportJson: RequestHandler = (request, response, next) => {
  importJsonParser(request, response, (error) => {
    if (error) {
      response.status(400).json({ ok: false, reason: 'invalid-request' });
      return;
    }

    next();
  });
};

export function createApp({
  captureService,
  cleanupService,
  cronSecret,
  logger = console,
  memoService,
  notionImportService,
  retrieveService,
}: CreateAppOptions = {}) {
  const app = express();

  app.use('/api', allowAndroidWebViewCors);

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true });
  });

  app.get('/api/cron/import-cleanup', async (request, response) => {
    const suppliedSecret = getBearerToken(request.header('authorization'));

    if (
      !cronSecret ||
      !suppliedSecret ||
      !hasMatchingSecret(suppliedSecret, cronSecret)
    ) {
      response.status(401).json({ ok: false, reason: 'permission-denied' });
      return;
    }

    if (!cleanupService) {
      response.status(503).json({ ok: false, reason: 'write-failed' });
      return;
    }

    const { deletedJobCount } = await cleanupService.cleanup();

    response.json({ ok: true, deletedJobCount });
  });

  app.post(
    '/api/imports/notion/start',
    parseImportJson,
    async (request, response) => {
      const accessToken = requireBearerToken(request, response);
      if (!accessToken) {
        return;
      }
      if (!notionImportService) {
        response.status(503).json({ ok: false, reason: 'write-failed' });
        return;
      }
      if (
        !isRecord(request.body) ||
        typeof request.body.includePageUrls !== 'boolean' ||
        (request.body.returnMode !== 'android' &&
          request.body.returnMode !== 'web')
      ) {
        response.status(400).json({ ok: false, reason: 'invalid-request' });
        return;
      }

      const result = await notionImportService.start(
        accessToken,
        request.body.includePageUrls,
        request.body.returnMode
      );
      response.json(result);
    }
  );

  app.get('/api/imports/notion/callback', async (request, response) => {
    if (!notionImportService) {
      response.status(503).json({ ok: false, reason: 'write-failed' });
      return;
    }

    const query = Object.fromEntries(
      ['code', 'error', 'state']
        .map((key) => [key, getQueryParameter(request.query[key])])
        .filter((entry): entry is [string, string] => Boolean(entry[1]))
    );
    const result = await notionImportService.handleCallback(query);
    response.redirect(302, result.redirectUrl);
  });

  app.get(
    '/api/imports/notion/:connectionId/status',
    async (request, response) => {
      const route = getNotionRouteContext(
        request,
        response,
        notionImportService
      );
      if (!route) {
        return;
      }

      const result = await route.service.status(
        route.accessToken,
        route.connectionId
      );
      response.json(result);
    }
  );

  app.post(
    '/api/imports/notion/:connectionId/analyze',
    parseImportJson,
    async (request, response) => {
      const route = getNotionRouteContext(
        request,
        response,
        notionImportService
      );
      if (!route) {
        return;
      }
      if (!isRecord(request.body) || !Array.isArray(request.body.mappings)) {
        response.status(400).json({ ok: false, reason: 'invalid-request' });
        return;
      }

      const result = await route.service.analyze(
        route.accessToken,
        route.connectionId,
        request.body.mappings
      );
      response.json(result);
    }
  );

  for (const action of ['complete', 'cancel'] as const) {
    app.post(
      `/api/imports/notion/:connectionId/${action}`,
      parseImportJson,
      async (request, response) => {
        const route = getNotionRouteContext(
          request,
          response,
          notionImportService
        );
        if (!route) {
          return;
        }

        const result = await route.service[action](
          route.accessToken,
          route.connectionId
        );
        response.json(result);
      }
    );
  }

  app.post(
    '/api/insights/capture',
    parseCaptureJson,
    async (request, response) => {
      const accessToken = getBearerToken(request.header('authorization'));

      if (!accessToken) {
        response.status(401).json({ ok: false, reason: 'permission-denied' });
        return;
      }

      if (!captureService) {
        response.status(503).json({ ok: false, reason: 'write-failed' });
        return;
      }

      const result = await captureService.capture(accessToken, request.body);

      response.status(getCaptureStatus(result)).json(result);
    }
  );

  app.patch(
    '/api/insights/:insightId/memo',
    parseCaptureJson,
    async (request, response) => {
      const accessToken = getBearerToken(request.header('authorization'));

      if (!accessToken) {
        response.status(401).json({ ok: false, reason: 'permission-denied' });
        return;
      }

      if (!memoService) {
        response.status(503).json({ ok: false, reason: 'write-failed' });
        return;
      }

      const result = await memoService.update(
        accessToken,
        getRouteParameter(request.params.insightId),
        request.body
      );

      response.status(getMemoStatus(result)).json(result);
    }
  );

  app.post(
    '/api/insights/retrieve',
    parseCaptureJson,
    async (request, response) => {
      const accessToken = getBearerToken(request.header('authorization'));

      if (!accessToken) {
        response.status(401).json({ ok: false, reason: 'permission-denied' });
        return;
      }

      if (!retrieveService) {
        response.status(503).json({ ok: false, reason: 'retrieve-failed' });
        return;
      }

      const result = await retrieveService.retrieve(accessToken, request.body);

      response.status(getRetrieveStatus(result)).json(result);
    }
  );

  app.use(createCaptureErrorHandler(logger));

  return app;
}

function createCaptureErrorHandler(
  logger: Pick<Console, 'error'>
): ErrorRequestHandler {
  return (error, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (error instanceof NotionImportServiceError) {
      response.status(getNotionImportStatus(error.code)).json({
        ok: false,
        reason: error.code,
      });
      return;
    }

    try {
      logger.error('요청 처리 중 예외 발생', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        method: request.method,
        path: request.path,
      });
    } catch {
      // 로거 장애가 안전한 오류 응답을 다시 깨뜨리지 않도록 격리한다.
    }
    response.status(503).json({ ok: false, reason: 'write-failed' });
  };
}

function getNotionImportStatus(reason: NotionImportServiceError['code']) {
  if (reason === 'permission-denied') {
    return 401;
  }
  if (reason === 'not-found') {
    return 404;
  }
  if (reason === 'invalid-request') {
    return 400;
  }
  if (reason === 'provider-rate-limited') {
    return 429;
  }
  if (reason === 'reauthorize') {
    return 409;
  }
  return 503;
}

function requireBearerToken(
  request: Parameters<RequestHandler>[0],
  response: Parameters<RequestHandler>[1]
) {
  const accessToken = getBearerToken(request.header('authorization'));

  if (!accessToken) {
    response.status(401).json({ ok: false, reason: 'permission-denied' });
    return null;
  }

  return accessToken;
}

function getNotionRouteContext(
  request: Parameters<RequestHandler>[0],
  response: Parameters<RequestHandler>[1],
  service: NotionImportService | undefined
) {
  const accessToken = requireBearerToken(request, response);
  if (!accessToken) {
    return null;
  }
  if (!service) {
    response.status(503).json({ ok: false, reason: 'write-failed' });
    return null;
  }

  const connectionId = getRouteParameter(request.params.connectionId);
  if (!isUuid(connectionId)) {
    response.status(400).json({ ok: false, reason: 'invalid-request' });
    return null;
  }

  return { accessToken, connectionId, service };
}

function getBearerToken(authorization: string | undefined) {
  const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? '');

  return match?.[1];
}

function hasMatchingSecret(suppliedSecret: string, expectedSecret: string) {
  const suppliedDigest = createHash('sha256').update(suppliedSecret).digest();
  const expectedDigest = createHash('sha256').update(expectedSecret).digest();

  return timingSafeEqual(suppliedDigest, expectedDigest);
}

function getRouteParameter(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function getQueryParameter(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getCaptureStatus(result: InsightCaptureResult) {
  if (result.ok) {
    return 200;
  }

  if (result.reason === 'permission-denied') {
    return 401;
  }

  if (
    result.reason === 'invalid-request' ||
    result.reason === 'invalid-url' ||
    result.reason === 'unsupported-protocol'
  ) {
    return 400;
  }

  return 503;
}

function getMemoStatus(result: InsightMemoResult) {
  if (result.ok) {
    return 200;
  }

  if (result.reason === 'permission-denied') {
    return 401;
  }

  if (result.reason === 'invalid-request') {
    return 400;
  }

  if (result.reason === 'not-found') {
    return 404;
  }

  return 503;
}

function getRetrieveStatus(result: InsightRetrieveResult) {
  if (result.ok) {
    return 200;
  }

  if (result.reason === 'permission-denied') {
    return 401;
  }

  if (result.reason === 'invalid-request') {
    return 400;
  }

  return 503;
}
