import { createHmac, timingSafeEqual } from 'node:crypto';

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { createClient as createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 70;

const TOSS_API_ORIGIN = 'https://api.tosspayments.com';
const TOSS_TIMEOUT_MS = 65_000;

const PLANS = {
  basic: {
    amount: 4_900,
    orderName: '갓생러 플래너 Basic 월간 구독',
  },
  pro: {
    amount: 9_900,
    orderName: '갓생러 플래너 Pro 월간 구독',
  },
} as const;

type PlanId = keyof typeof PLANS;
type TossErrorBody = {
  code?: string;
  message?: string;
};
type TossBillingKeyResponse = {
  billingKey: string;
  customerKey: string;
};
type TossPaymentResponse = {
  paymentKey: string;
  orderId: string;
  status: string;
  approvedAt?: string;
  method?: string;
  card?: {
    issuerCode?: string;
    acquirerCode?: string;
    number?: string;
    cardType?: string;
  };
};

class TossApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TossApiError';
  }
}

const jsonError = (message: string, status: number, code: string) =>
  NextResponse.json({ error: { code, message } }, { status });

const isPlanId = (value: unknown): value is PlanId =>
  typeof value === 'string' && Object.hasOwn(PLANS, value);

const requireEnvironment = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tossSecretKey = process.env.TOSS_SECRET_KEY;
  const tossClientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
  const customerKeySecret = process.env.TOSS_CUSTOMER_KEY_SECRET;

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !tossSecretKey ||
    !tossClientKey ||
    !customerKeySecret
  ) {
    throw new Error('PAYMENT_ENV_MISSING');
  }

  if (customerKeySecret.length < 32) {
    throw new Error('CUSTOMER_KEY_SECRET_TOO_SHORT');
  }

  return {
    customerKeySecret,
    serviceRoleKey,
    supabaseUrl,
    tossClientKey,
    tossSecretKey,
  };
};

const getAuthenticatedUser = async () => {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
};

const createAdminClient = (
  supabaseUrl: string,
  serviceRoleKey: string,
) =>
  createServiceClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

const createCustomerKey = (userId: string, secret: string) => {
  const digest = createHmac('sha256', secret)
    .update(`toss-customer:${userId}`)
    .digest('base64url')
    .slice(0, 40);

  return `gs_${digest}`;
};

const createOrderId = (
  userId: string,
  plan: PlanId,
  signature: string,
  secret: string,
) => {
  const digest = createHmac('sha256', secret)
    .update(`${userId}:${plan}:${signature}`)
    .digest('hex')
    .slice(0, 24);

  return `gs-${plan}-${digest}`;
};

const createIdempotencyKey = (scope: string, secret: string) =>
  createHmac('sha256', secret).update(scope).digest('hex');

const nextMonthlyDate = (from: Date) => {
  const next = new Date(from);
  const originalDate = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDayOfNextMonth = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(originalDate, lastDayOfNextMonth));
  return next;
};

const tossRequest = async <T>(
  path: string,
  init: RequestInit,
  secretKey: string,
): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOSS_TIMEOUT_MS);

  try {
    const response = await fetch(`${TOSS_API_ORIGIN}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      signal: controller.signal,
    });
    const body = (await response.json()) as T | TossErrorBody;

    if (!response.ok) {
      const error = body as TossErrorBody;
      throw new TossApiError(
        response.status,
        error.code ?? 'TOSS_PAYMENT_FAILED',
        error.message ?? '결제 처리에 실패했습니다.',
      );
    }

    return body as T;
  } catch (error) {
    if (error instanceof TossApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TossApiError(
        504,
        'TOSS_TIMEOUT',
        '결제 승인 응답이 지연되고 있습니다. 결제 내역을 확인해 주세요.',
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const issueBillingKey = (
  authKey: string,
  customerKey: string,
  secretKey: string,
) =>
  tossRequest<TossBillingKeyResponse>(
    '/v1/billing/authorizations/issue',
    {
      method: 'POST',
      body: JSON.stringify({ authKey, customerKey }),
      headers: {
        'Idempotency-Key': createIdempotencyKey(
          `billing-key:${authKey}:${customerKey}`,
          secretKey,
        ),
      },
    },
    secretKey,
  );

const approveBillingPayment = (
  billingKey: string,
  customerKey: string,
  orderId: string,
  plan: PlanId,
  customer: { email?: string; name?: string },
  secretKey: string,
) => {
  const selectedPlan = PLANS[plan];

  return tossRequest<TossPaymentResponse>(
    `/v1/billing/${encodeURIComponent(billingKey)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        amount: selectedPlan.amount,
        customerEmail: customer.email,
        customerKey,
        customerName: customer.name,
        orderId,
        orderName: selectedPlan.orderName,
      }),
      headers: {
        'Idempotency-Key': createIdempotencyKey(
          `billing-payment:${orderId}`,
          secretKey,
        ),
      },
    },
    secretKey,
  );
};

const paymentSnapshot = (payment: TossPaymentResponse) => ({
  approvedAt: payment.approvedAt ?? null,
  card: payment.card
    ? {
        acquirerCode: payment.card.acquirerCode ?? null,
        cardType: payment.card.cardType ?? null,
        issuerCode: payment.card.issuerCode ?? null,
        maskedNumber: payment.card.number ?? null,
      }
    : null,
  method: payment.method ?? null,
  status: payment.status,
});

const safeSubscription = (subscription: Record<string, unknown> | null) =>
  subscription
    ? {
        amount: subscription.amount,
        currentPeriodEnd: subscription.current_period_end,
        nextBillingAt: subscription.next_billing_at,
        plan: subscription.plan,
        status: subscription.status,
      }
    : null;

const isAuthorizedCron = (request: NextRequest) => {
  const cronSecret = process.env.CRON_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (!cronSecret || !supplied) {
    return false;
  }

  const expectedBuffer = Buffer.from(cronSecret);
  const suppliedBuffer = Buffer.from(supplied);

  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
};

export async function GET() {
  try {
    const env = requireEnvironment();
    const user = await getAuthenticatedUser();

    if (!user) {
      return jsonError('로그인이 필요합니다.', 401, 'UNAUTHORIZED');
    }

    const admin = createAdminClient(env.supabaseUrl, env.serviceRoleKey);
    const { data, error } = await admin
      .from('subscriptions')
      .select('plan, amount, status, current_period_end, next_billing_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      clientKey: env.tossClientKey,
      customerKey: createCustomerKey(user.id, env.customerKeySecret),
      subscription: safeSubscription(data),
    });
  } catch (error) {
    console.error('[payment/billing:GET]', error);
    return jsonError(
      '구독 정보를 불러오지 못했습니다.',
      500,
      'SUBSCRIPTION_LOOKUP_FAILED',
    );
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError('요청 본문이 올바른 JSON이 아닙니다.', 400, 'INVALID_JSON');
  }

  if (body.action === 'renew') {
    return renewSubscription(request, body);
  }
  if (body.action !== 'issue') {
    return jsonError('지원하지 않는 결제 작업입니다.', 400, 'INVALID_ACTION');
  }

  return activateSubscription(body);
}

async function activateSubscription(body: Record<string, unknown>) {
  let env: ReturnType<typeof requireEnvironment>;

  try {
    env = requireEnvironment();
  } catch (error) {
    console.error('[payment/billing:env]', error);
    return jsonError(
      '결제 서버 설정이 완료되지 않았습니다.',
      500,
      'PAYMENT_NOT_CONFIGURED',
    );
  }

  const user = await getAuthenticatedUser();
  if (!user) {
    return jsonError('로그인이 필요합니다.', 401, 'UNAUTHORIZED');
  }

  const authKey = typeof body.authKey === 'string' ? body.authKey.trim() : '';
  const suppliedCustomerKey =
    typeof body.customerKey === 'string' ? body.customerKey.trim() : '';
  const plan = body.plan;

  if (!authKey || authKey.length > 500 || !isPlanId(plan)) {
    return jsonError(
      'authKey와 올바른 구독 플랜이 필요합니다.',
      400,
      'INVALID_BILLING_REQUEST',
    );
  }

  const customerKey = createCustomerKey(user.id, env.customerKeySecret);
  if (suppliedCustomerKey && suppliedCustomerKey !== customerKey) {
    return jsonError(
      '결제 고객 정보가 로그인 사용자와 일치하지 않습니다.',
      403,
      'CUSTOMER_KEY_MISMATCH',
    );
  }

  const admin = createAdminClient(env.supabaseUrl, env.serviceRoleKey);
  const planInfo = PLANS[plan];
  const orderId = createOrderId(
    user.id,
    plan,
    authKey,
    env.customerKeySecret,
  );

  try {
    const { data: existingTransaction } = await admin
      .from('payment_transactions')
      .select('payment_key, status')
      .eq('order_id', orderId)
      .maybeSingle();

    if (existingTransaction?.payment_key) {
      const { data: currentSubscription } = await admin
        .from('subscriptions')
        .select('plan, amount, status, current_period_end, next_billing_at')
        .eq('user_id', user.id)
        .maybeSingle();

      return NextResponse.json({
        duplicated: true,
        subscription: safeSubscription(currentSubscription),
      });
    }

    const billing = await issueBillingKey(
      authKey,
      customerKey,
      env.tossSecretKey,
    );
    const payment = await approveBillingPayment(
      billing.billingKey,
      customerKey,
      orderId,
      plan,
      {
        email: user.email,
        name:
          typeof user.user_metadata?.name === 'string'
            ? user.user_metadata.name
            : undefined,
      },
      env.tossSecretKey,
    );

    if (payment.status !== 'DONE') {
      throw new TossApiError(
        502,
        'PAYMENT_NOT_COMPLETED',
        '결제가 완료 상태로 승인되지 않았습니다.',
      );
    }

    const periodStart = new Date(payment.approvedAt ?? Date.now());
    const periodEnd = nextMonthlyDate(periodStart);
    const { data: storedSubscriptions, error: persistenceError } =
      await admin.rpc('record_subscription_payment', {
        p_amount: planInfo.amount,
        p_billing_key: billing.billingKey,
        p_customer_key: customerKey,
        p_order_id: payment.orderId,
        p_paid_at: payment.approvedAt ?? new Date().toISOString(),
        p_payment_key: payment.paymentKey,
        p_payment_status: payment.status,
        p_period_end: periodEnd.toISOString(),
        p_period_start: periodStart.toISOString(),
        p_plan: plan,
        p_raw_response: paymentSnapshot(payment),
        p_user_id: user.id,
      });

    if (persistenceError || !storedSubscriptions?.[0]) {
      throw persistenceError ?? new Error('SUBSCRIPTION_PERSISTENCE_EMPTY');
    }
    const subscription = storedSubscriptions[0];

    return NextResponse.json({
      payment: {
        approvedAt: payment.approvedAt ?? null,
        orderId: payment.orderId,
        status: payment.status,
      },
      subscription: safeSubscription(subscription),
    });
  } catch (error) {
    console.error('[payment/billing:activate]', error);

    if (error instanceof TossApiError) {
      return jsonError(error.message, error.status, error.code);
    }

    return jsonError(
      '결제는 승인되었을 수 있습니다. 재시도하기 전에 결제 내역을 확인해 주세요.',
      500,
      'BILLING_PERSISTENCE_FAILED',
    );
  }
}

async function renewSubscription(
  request: NextRequest,
  body: Record<string, unknown>,
) {
  if (!isAuthorizedCron(request)) {
    return jsonError('크론 인증에 실패했습니다.', 401, 'INVALID_CRON_SECRET');
  }

  const userId = typeof body.userId === 'string' ? body.userId : '';
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      userId,
    )
  ) {
    return jsonError('올바른 userId가 필요합니다.', 400, 'INVALID_USER_ID');
  }

  try {
    const env = requireEnvironment();
    const admin = createAdminClient(env.supabaseUrl, env.serviceRoleKey);
    const { data: subscription, error } = await admin
      .from('subscriptions')
      .select(
        'id, user_id, plan, amount, customer_key, billing_key, status, next_billing_at',
      )
      .eq('user_id', userId)
      .single();

    if (error || !subscription) {
      return jsonError('구독을 찾을 수 없습니다.', 404, 'SUBSCRIPTION_NOT_FOUND');
    }
    if (subscription.status !== 'active' || !isPlanId(subscription.plan)) {
      return jsonError('결제 가능한 활성 구독이 아닙니다.', 409, 'SUBSCRIPTION_INACTIVE');
    }
    const renewalPlan = PLANS[subscription.plan];

    const dueAt = new Date(subscription.next_billing_at);
    if (!Number.isFinite(dueAt.getTime()) || dueAt.getTime() > Date.now()) {
      return jsonError('아직 다음 결제일이 아닙니다.', 409, 'SUBSCRIPTION_NOT_DUE');
    }

    const billingSignature = dueAt.toISOString().slice(0, 10);
    const orderId = createOrderId(
      userId,
      subscription.plan,
      billingSignature,
      env.customerKeySecret,
    );
    const { data: duplicated } = await admin
      .from('payment_transactions')
      .select('payment_key')
      .eq('order_id', orderId)
      .maybeSingle();

    if (duplicated?.payment_key) {
      return NextResponse.json({ duplicated: true, orderId });
    }

    const { data: profile } = await admin
      .from('users')
      .select('email, user_name')
      .eq('id', userId)
      .single();
    const payment = await approveBillingPayment(
      subscription.billing_key,
      subscription.customer_key,
      orderId,
      subscription.plan,
      {
        email: profile?.email,
        name: profile?.user_name,
      },
      env.tossSecretKey,
    );

    if (payment.status !== 'DONE') {
      throw new TossApiError(
        502,
        'PAYMENT_NOT_COMPLETED',
        '정기 결제가 완료 상태로 승인되지 않았습니다.',
      );
    }

    const periodStart = new Date(payment.approvedAt ?? Date.now());
    const periodEnd = nextMonthlyDate(periodStart);
    const { error: persistenceError } = await admin.rpc(
      'record_subscription_payment',
      {
        p_amount: renewalPlan.amount,
        p_billing_key: subscription.billing_key,
        p_customer_key: subscription.customer_key,
        p_order_id: payment.orderId,
        p_paid_at: payment.approvedAt ?? periodStart.toISOString(),
        p_payment_key: payment.paymentKey,
        p_payment_status: payment.status,
        p_period_end: periodEnd.toISOString(),
        p_period_start: periodStart.toISOString(),
        p_plan: subscription.plan,
        p_raw_response: paymentSnapshot(payment),
        p_user_id: userId,
      },
    );

    if (persistenceError) {
      throw persistenceError;
    }

    return NextResponse.json({
      payment: {
        approvedAt: payment.approvedAt ?? null,
        orderId: payment.orderId,
        status: payment.status,
      },
      subscription: {
        amount: renewalPlan.amount,
        nextBillingAt: periodEnd.toISOString(),
        plan: subscription.plan,
        status: 'active',
      },
    });
  } catch (error) {
    console.error('[payment/billing:renew]', error);

    if (error instanceof TossApiError) {
      return jsonError(error.message, error.status, error.code);
    }

    return jsonError(
      '정기 결제 처리 중 오류가 발생했습니다.',
      500,
      'RENEWAL_FAILED',
    );
  }
}
