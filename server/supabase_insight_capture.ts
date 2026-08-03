import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { parseInsight, type Insight } from '@amadda/domain/insight';
import {
  createInsightCaptureService,
  type InsightCaptureAuthenticator,
  type InsightCaptureStore,
  type InsightCaptureStoreInput,
  type InsightCaptureStoreLookupResult,
  type InsightCaptureStoreResult,
} from './insight_capture_service.js';

const INSIGHT_COLUMNS = [
  'id',
  'user_id',
  'original_url',
  'normalized_url',
  'domain',
  'title',
  'title_origin',
  'memo',
  'category_id',
  'schema_version',
  'created_at',
  'updated_at',
].join(',');

const SERVER_AUTH_OPTIONS = {
  autoRefreshToken: false,
  detectSessionInUrl: false,
  persistSession: false,
} as const;

export type SupabaseInsightCaptureConfig = {
  publishableKey: string;
  url: string;
};

export function createSupabaseInsightCaptureService(
  config: SupabaseInsightCaptureConfig
) {
  const authClient = createClient(config.url, config.publishableKey, {
    auth: SERVER_AUTH_OPTIONS,
  });

  return createInsightCaptureService(
    createSupabaseInsightCaptureAuthenticator(authClient),
    (accessToken) => {
      const userClient = createClient(config.url, config.publishableKey, {
        auth: SERVER_AUTH_OPTIONS,
        global: {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      });

      return createSupabaseInsightCaptureStore(userClient);
    }
  );
}

export function createSupabaseInsightCaptureAuthenticator(
  client: SupabaseClient
): InsightCaptureAuthenticator {
  return {
    async authenticate(accessToken) {
      try {
        const { data, error } = await client.auth.getUser(accessToken);

        return error || !data.user ? null : data.user.id;
      } catch {
        return null;
      }
    },
  };
}

export function createSupabaseInsightCaptureStore(
  client: SupabaseClient
): InsightCaptureStore {
  return {
    async findByNormalizedUrl(userId, normalizedUrl) {
      try {
        const { data, error } = await client
          .from('insights')
          .select(INSIGHT_COLUMNS)
          .eq('user_id', userId)
          .eq('normalized_url', normalizedUrl)
          .maybeSingle();

        if (error) {
          return toLookupFailure(error.code);
        }

        if (!data) {
          return { status: 'not-found' };
        }

        const insight = parseCapturedInsight(data, userId);

        return insight
          ? { insight, status: 'found' }
          : { status: 'write-failed' };
      } catch {
        return { status: 'write-failed' };
      }
    },
    async create(input) {
      try {
        const { data, error } = await client
          .from('insights')
          .insert(toInsertRow(input))
          .select(INSIGHT_COLUMNS)
          .single();

        if (error) {
          return toCreateFailure(error.code);
        }

        const insight = parseCapturedInsight(data, input.userId);

        return insight
          ? { insight, status: 'created' }
          : { status: 'write-failed' };
      } catch {
        return { status: 'write-failed' };
      }
    },
  };
}

function toInsertRow(input: InsightCaptureStoreInput) {
  return {
    category_id: null,
    domain: input.domain,
    memo: null,
    normalized_url: input.normalizedUrl,
    original_url: input.originalUrl,
    schema_version: 1,
    title: input.title,
    title_origin: input.titleOrigin,
    user_id: input.userId,
  };
}

function toLookupFailure(errorCode: unknown): InsightCaptureStoreLookupResult {
  return {
    status: errorCode === '42501' ? 'permission-denied' : 'write-failed',
  };
}

function toCreateFailure(errorCode: unknown): InsightCaptureStoreResult {
  if (errorCode === '23505') {
    return { status: 'duplicate' };
  }

  return {
    status: errorCode === '42501' ? 'permission-denied' : 'write-failed',
  };
}

function parseCapturedInsight(value: unknown, userId: string): Insight | null {
  if (
    !isRecord(value) ||
    value.user_id !== userId ||
    value.schema_version !== 1
  ) {
    return null;
  }

  return parseInsight({
    categoryId: value.category_id,
    createdAt: value.created_at,
    domain: value.domain,
    id: value.id,
    memo: value.memo,
    normalizedUrl: value.normalized_url,
    originalUrl: value.original_url,
    title: value.title,
    titleOrigin: value.title_origin,
    updatedAt: value.updated_at,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
