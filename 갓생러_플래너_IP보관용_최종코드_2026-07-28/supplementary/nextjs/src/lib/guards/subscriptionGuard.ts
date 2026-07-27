import 'server-only';

import { createClient as createServiceClient } from '@supabase/supabase-js';

import { createClient as createSupabaseServerClient } from '../supabase/server';

export type SubscriptionPlan = 'free' | 'basic' | 'pro';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled';
export type PaidFeature =
  | 'streak-shield'
  | 'unlimited-ai-parse'
  | 'background-push';

export type SubscriptionSnapshot = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus | null;
  currentPeriodEnd: string | null;
};

export type SubscriptionAccessResult = SubscriptionSnapshot & {
  allowed: boolean;
  feature: PaidFeature;
  reason:
    | 'allowed'
    | 'unauthenticated'
    | 'free-plan'
    | 'inactive-subscription'
    | 'expired-subscription'
    | 'subscription-unavailable';
  userId: string | null;
};

const PAID_PLANS: ReadonlySet<SubscriptionPlan> = new Set(['basic', 'pro']);

export const PAID_FEATURE_LABELS: Record<PaidFeature, string> = {
  'streak-shield': '스트릭 방어권',
  'unlimited-ai-parse': '무제한 AI 파싱',
  'background-push': '백그라운드 푸시',
};

/**
 * DB 조회 없이 이미 받은 구독 스냅샷을 판정할 때 사용합니다.
 * 클라이언트 표시용으로 재사용할 수 있지만 실제 API 권한 검사는
 * checkCurrentUserSubscription() 또는 assertCurrentUserSubscription()을 사용해야 합니다.
 */
export const canUsePaidFeature = (
  snapshot: SubscriptionSnapshot,
  now: Date = new Date(),
) => {
  if (!PAID_PLANS.has(snapshot.plan) || snapshot.status !== 'active') {
    return false;
  }

  if (!snapshot.currentPeriodEnd) {
    return false;
  }

  const periodEnd = new Date(snapshot.currentPeriodEnd);
  return (
    Number.isFinite(periodEnd.getTime()) &&
    periodEnd.getTime() > now.getTime()
  );
};

export class SubscriptionGuardError extends Error {
  readonly code:
    | 'AUTH_REQUIRED'
    | 'PAID_SUBSCRIPTION_REQUIRED'
    | 'SUBSCRIPTION_CHECK_FAILED';
  readonly status: 401 | 402 | 503;

  constructor(result: SubscriptionAccessResult) {
    const unauthenticated = result.reason === 'unauthenticated';
    const unavailable = result.reason === 'subscription-unavailable';
    super(
      unauthenticated
        ? '로그인이 필요합니다.'
        : unavailable
          ? '구독 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.'
          : `${PAID_FEATURE_LABELS[result.feature]}은 유료 구독자 전용 기능입니다.`,
    );
    this.name = 'SubscriptionGuardError';
    this.code = unauthenticated
      ? 'AUTH_REQUIRED'
      : unavailable
        ? 'SUBSCRIPTION_CHECK_FAILED'
        : 'PAID_SUBSCRIPTION_REQUIRED';
    this.status = unauthenticated ? 401 : unavailable ? 503 : 402;
  }
}

const denied = (
  feature: PaidFeature,
  reason: SubscriptionAccessResult['reason'],
  userId: string | null,
  snapshot: Partial<SubscriptionSnapshot> = {},
): SubscriptionAccessResult => ({
  allowed: false,
  currentPeriodEnd: snapshot.currentPeriodEnd ?? null,
  feature,
  plan: snapshot.plan ?? 'free',
  reason,
  status: snapshot.status ?? null,
  userId,
});

const getAdminClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createServiceClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

/**
 * Route Handler/Server Action에서 현재 로그인 사용자의 유료 권한을 확인합니다.
 * 브라우저가 보낸 plan 값은 신뢰하지 않고 서버 전용 subscriptions 테이블을 조회합니다.
 */
export async function checkCurrentUserSubscription(
  feature: PaidFeature,
): Promise<SubscriptionAccessResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return denied(feature, 'unauthenticated', null);
  }

  return checkSubscriptionForUser(user.id, feature);
}

/**
 * 크론/서버 작업처럼 이미 신뢰할 수 있는 userId가 있을 때 사용합니다.
 * service_role을 사용하므로 이 파일은 절대 Client Component에서 import하지 않습니다.
 */
export async function checkSubscriptionForUser(
  userId: string,
  feature: PaidFeature,
): Promise<SubscriptionAccessResult> {
  const admin = getAdminClient();
  if (!admin) {
    return denied(feature, 'subscription-unavailable', userId);
  }

  const { data, error } = await admin
    .from('subscriptions')
    .select('plan, status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[subscriptionGuard]', {
      code: error.code,
      feature,
      userId,
    });
    return denied(feature, 'subscription-unavailable', userId);
  }

  if (!data) {
    return denied(feature, 'free-plan', userId);
  }

  const snapshot: SubscriptionSnapshot = {
    currentPeriodEnd:
      typeof data.current_period_end === 'string'
        ? data.current_period_end
        : null,
    plan:
      data.plan === 'basic' || data.plan === 'pro' ? data.plan : 'free',
    status:
      data.status === 'active' ||
      data.status === 'past_due' ||
      data.status === 'canceled'
        ? data.status
        : null,
  };

  if (snapshot.status !== 'active') {
    return denied(feature, 'inactive-subscription', userId, snapshot);
  }

  if (!canUsePaidFeature(snapshot)) {
    return denied(feature, 'expired-subscription', userId, snapshot);
  }

  return {
    ...snapshot,
    allowed: true,
    feature,
    reason: 'allowed',
    userId,
  };
}

/**
 * 백그라운드 작업에서 여러 대상 중 현재 결제기간이 유효한 사용자만 한 번에 고릅니다.
 * 푸시 크론처럼 대량 처리할 때 사용자마다 DB를 다시 조회하는 N+1 문제를 피합니다.
 */
export async function getPaidSubscriberIds(
  userIds: readonly string[],
): Promise<Set<string>> {
  const uniqueUserIds = [...new Set(userIds)].slice(0, 1_000);
  if (uniqueUserIds.length === 0) {
    return new Set();
  }

  const admin = getAdminClient();
  if (!admin) {
    throw new Error('SUBSCRIPTION_SERVICE_UNAVAILABLE');
  }

  const { data, error } = await admin
    .from('subscriptions')
    .select('user_id')
    .in('user_id', uniqueUserIds)
    .in('plan', ['basic', 'pro'])
    .eq('status', 'active')
    .gt('current_period_end', new Date().toISOString());

  if (error) {
    console.error('[subscriptionGuard:bulk]', {
      code: error.code,
      targetCount: uniqueUserIds.length,
    });
    throw new Error('SUBSCRIPTION_SERVICE_UNAVAILABLE');
  }

  return new Set(
    (data ?? [])
      .map((row) => row.user_id)
      .filter((userId): userId is string => typeof userId === 'string'),
  );
}

export async function assertCurrentUserSubscription(
  feature: PaidFeature,
): Promise<SubscriptionAccessResult> {
  const result = await checkCurrentUserSubscription(feature);

  if (!result.allowed) {
    throw new SubscriptionGuardError(result);
  }

  return result;
}

export async function assertSubscriptionForUser(
  userId: string,
  feature: PaidFeature,
): Promise<SubscriptionAccessResult> {
  const result = await checkSubscriptionForUser(userId, feature);

  if (!result.allowed) {
    throw new SubscriptionGuardError(result);
  }

  return result;
}
