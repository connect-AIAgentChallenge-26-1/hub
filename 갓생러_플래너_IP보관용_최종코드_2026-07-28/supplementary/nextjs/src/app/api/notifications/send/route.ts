import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, type Message } from 'firebase-admin/messaging';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import {
  createRateLimitHeaders,
  rateLimit,
} from '../../../../lib/rateLimiter';
import {
  checkSubscriptionForUser,
  getPaidSubscriberIds,
} from '../../../../lib/guards/subscriptionGuard';
import { createClient as createSupabaseClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_TARGET_USERS = 1_000;
const FCM_BATCH_SIZE = 500;
const ANDROID_CHANNEL_ID = 'planner-alerts';
const USER_PUSH_DAILY_LIMIT = 20;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type NotificationType = 'delay' | 'energy-care';

interface SendRequest {
  type: NotificationType;
  userIds: string[];
  title: string;
  body: string;
  data: Record<string, string>;
  dryRun: boolean;
}

interface PushTokenRow {
  token: string;
}

const secureEquals = (actual: string, expected: string): boolean => {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
};

const isCronAuthorized = (request: Request): boolean => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authorization = request.headers.get('authorization') ?? '';
  return secureEquals(authorization, `Bearer ${cronSecret}`);
};

const getFirebaseMessaging = () => {
  if (getApps().length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('FIREBASE_CONFIG_MISSING');
    }

    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }

  return getMessaging();
};

const getServiceSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('SUPABASE_SERVICE_KEY_MISSING');

  return createServiceClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const toStringData = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 20)
      .map(([key, item]) => [
        key.slice(0, 100),
        String(item ?? '').slice(0, 1_000),
      ]),
  );
};

const normalizeRequest = (
  value: unknown,
  authenticatedUserId: string | null,
  cronAuthorized: boolean,
): SendRequest => {
  if (!value || typeof value !== 'object') throw new Error('INVALID_REQUEST');
  const object = value as Record<string, unknown>;
  const type = String(object.type) as NotificationType;
  if (type !== 'delay' && type !== 'energy-care') {
    throw new Error('INVALID_REQUEST');
  }

  const requestedUserIds = Array.isArray(object.userIds)
    ? object.userIds.map(String)
    : typeof object.userId === 'string'
      ? [object.userId]
      : [];
  const userIds = cronAuthorized
    ? [...new Set(requestedUserIds)]
        .filter((userId) => UUID_PATTERN.test(userId))
        .slice(0, MAX_TARGET_USERS)
    : authenticatedUserId
      ? [authenticatedUserId]
      : [];
  if (userIds.length === 0) throw new Error('NO_TARGETS');

  const defaults =
    type === 'delay'
      ? {
          title: '일정이 조금 늦어지고 있어요',
          body: '뒤쪽 일정을 정리할 수 있도록 지금 플래너를 확인해 보세요.',
        }
      : {
          title: '지금은 방전 케어가 필요한 시간이에요',
          body: '무거운 작업 대신 15분짜리 가벼운 작업부터 시작해 보세요.',
        };

  return {
    type,
    userIds,
    title:
      String(object.title ?? '').trim().slice(0, 100) || defaults.title,
    body: String(object.body ?? '').trim().slice(0, 500) || defaults.body,
    data: {
      ...toStringData(object.data),
      type,
      route: '/planner',
    },
    dryRun: cronAuthorized && object.dryRun === true,
  };
};

const chunk = <T,>(values: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

const isInvalidTokenError = (code: string | undefined): boolean =>
  code === 'messaging/registration-token-not-registered' ||
  code === 'messaging/invalid-registration-token';

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { success: false, error: '요청 본문이 너무 큽니다.' },
      { status: 413 },
    );
  }

  const cronAuthorized = isCronAuthorized(request);
  let authenticatedUserId: string | null = null;

  if (!cronAuthorized) {
    const supabase = createSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: '인증되지 않은 요청입니다.' },
        { status: 401 },
      );
    }
    authenticatedUserId = user.id;

    const subscription = await checkSubscriptionForUser(
      user.id,
      'background-push',
    );
    if (!subscription.allowed) {
      return NextResponse.json(
        {
          success: false,
          code:
            subscription.reason === 'subscription-unavailable'
              ? 'SUBSCRIPTION_CHECK_FAILED'
              : 'PAID_SUBSCRIPTION_REQUIRED',
          error:
            subscription.reason === 'subscription-unavailable'
              ? '구독 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.'
              : '백그라운드 푸시는 유료 구독자 전용 기능입니다.',
        },
        {
          status:
            subscription.reason === 'subscription-unavailable' ? 503 : 402,
        },
      );
    }

    const userRate = await rateLimit(user.id, {
      limit: USER_PUSH_DAILY_LIMIT,
      namespace: 'push-send',
    });
    if (!userRate.success) {
      return NextResponse.json(
        {
          success: false,
          error: '오늘 발송 가능한 알림 요청 수를 모두 사용했습니다.',
          resetAt: new Date(userRate.resetAt).toISOString(),
        },
        {
          status: 429,
          headers: createRateLimitHeaders(userRate),
        },
      );
    }
  }

  let input: SendRequest;
  try {
    input = normalizeRequest(
      await request.json(),
      authenticatedUserId,
      cronAuthorized,
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: '알림 type과 대상 사용자 형식을 확인해 주세요.',
      },
      { status: 400 },
    );
  }

  try {
    const paidUserIds = await getPaidSubscriberIds(input.userIds);
    input.userIds = input.userIds.filter((userId) =>
      paidUserIds.has(userId),
    );
    if (input.userIds.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        failed: 0,
        message: '활성 유료 구독 대상이 없습니다.',
      });
    }

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('push_tokens')
      .select('token')
      .in('user_id', input.userIds)
      .eq('enabled', true)
      .limit(5_000);
    if (error) throw error;

    const tokens = [
      ...new Set(((data ?? []) as PushTokenRow[]).map((row) => row.token)),
    ];
    if (tokens.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        failed: 0,
        message: '등록된 활성 FCM 토큰이 없습니다.',
      });
    }

    const messaging = getFirebaseMessaging();
    let sent = 0;
    let failed = 0;
    const invalidTokens: string[] = [];

    for (const tokenBatch of chunk(tokens, FCM_BATCH_SIZE)) {
      const messages: Message[] = tokenBatch.map((token) => ({
        token,
        notification: {
          title: input.title,
          body: input.body,
        },
        data: input.data,
        android: {
          priority: 'high',
          ttl: 60 * 60 * 1000,
          notification: {
            channelId: ANDROID_CHANNEL_ID,
            sound: 'default',
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
            'apns-collapse-id': `godsaeng-${input.type}`,
          },
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
      }));

      const result = await messaging.sendEach(messages, input.dryRun);
      sent += result.successCount;
      failed += result.failureCount;

      result.responses.forEach((response, index) => {
        if (isInvalidTokenError(response.error?.code)) {
          invalidTokens.push(tokenBatch[index]);
        }
      });
    }

    if (invalidTokens.length > 0 && !input.dryRun) {
      await supabase
        .from('push_tokens')
        .delete()
        .in('token', invalidTokens);
    }

    return NextResponse.json({
      success: true,
      type: input.type,
      targetedDevices: tokens.length,
      sent,
      failed,
      removedInvalidTokens: input.dryRun ? 0 : invalidTokens.length,
      dryRun: input.dryRun,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const configurationError =
      message === 'FIREBASE_CONFIG_MISSING' ||
      message === 'SUPABASE_SERVICE_KEY_MISSING' ||
      message === 'SUBSCRIPTION_SERVICE_UNAVAILABLE';

    return NextResponse.json(
      {
        success: false,
        error: configurationError
          ? '푸시 발송 서버 환경변수가 설정되지 않았습니다.'
          : 'FCM 푸시 발송에 실패했습니다.',
      },
      { status: configurationError ? 503 : 502 },
    );
  }
}
