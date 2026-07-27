'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type PlanId = 'free' | 'basic' | 'pro';
type PaidPlanId = Exclude<PlanId, 'free'>;

type SubscriptionSummary = {
  amount: number;
  currentPeriodEnd: string;
  nextBillingAt: string;
  plan: PaidPlanId;
  status: 'active' | 'past_due' | 'canceled';
};

type BillingConfig = {
  clientKey: string;
  customerKey: string;
  subscription: SubscriptionSummary | null;
};

type TossPayment = {
  requestBillingAuth(options: {
    method: 'CARD';
    successUrl: string;
    failUrl: string;
    customerEmail?: string;
    customerName?: string;
    windowTarget?: 'self' | 'iframe';
  }): Promise<void>;
};

type TossPaymentsInstance = {
  payment(options: { customerKey: string }): TossPayment;
};

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => TossPaymentsInstance;
  }
}

export type SubscriptionModalProps = {
  open: boolean;
  onClose: () => void;
  currentPlan?: PlanId;
  customerEmail?: string;
  customerName?: string;
  onSubscribed?: (plan: PaidPlanId) => void;
};

const PLANS: Array<{
  id: PlanId;
  name: string;
  price: number;
  description: string;
  features: string[];
  accent: string;
  recommended?: boolean;
}> = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    description: '갓생 루틴을 가볍게 시작해요.',
    features: ['기본 플래너', 'AI 비서 하루 5회', '로컬 기록 저장'],
    accent: 'border-slate-200 bg-white',
  },
  {
    id: 'basic',
    name: 'Basic',
    price: 4_900,
    description: '매일의 계획을 빈틈없이 관리해요.',
    features: ['AI 비서 확장 사용', '스마트 타임블로킹', '갓생 지수 리포트'],
    accent: 'border-cyan-300 bg-cyan-50/70',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 9_900,
    description: '깊은 몰입과 자동화를 모두 열어요.',
    features: ['Basic의 모든 기능', '딥워크·허수 시간 분석', '선제 브리핑·우선 지원'],
    accent:
      'border-teal-500 bg-gradient-to-br from-teal-50 via-white to-cyan-50',
    recommended: true,
  },
];

let tossScriptPromise: Promise<void> | null = null;

const loadTossPayments = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('브라우저에서만 결제할 수 있습니다.'));
  }
  if (window.TossPayments) {
    return Promise.resolve();
  }
  if (tossScriptPromise) {
    return tossScriptPromise;
  }

  tossScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-toss-payments-sdk]',
    );
    const script = existing ?? document.createElement('script');

    const handleLoad = () => resolve();
    const handleError = () => {
      tossScriptPromise = null;
      reject(new Error('결제 모듈을 불러오지 못했습니다.'));
    };

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });

    if (!existing) {
      script.src = 'https://js.tosspayments.com/v2/standard';
      script.async = true;
      script.dataset.tossPaymentsSdk = 'true';
      document.head.appendChild(script);
    }
  });

  return tossScriptPromise;
};

const readApiError = async (response: Response) => {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return body?.error?.message ?? '결제 처리 중 오류가 발생했습니다.';
};

const removeBillingQuery = () => {
  const url = new URL(window.location.href);
  [
    'authKey',
    'billing',
    'code',
    'customerKey',
    'message',
    'plan',
  ].forEach((key) => url.searchParams.delete(key));
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
};

const formatWon = (amount: number) =>
  new Intl.NumberFormat('ko-KR').format(amount);

export default function SubscriptionModal({
  open,
  onClose,
  currentPlan = 'free',
  customerEmail,
  customerName,
  onSubscribed,
}: SubscriptionModalProps) {
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PaidPlanId>('pro');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);

  const effectivePlan =
    config?.subscription?.status === 'active'
      ? config.subscription.plan
      : currentPlan;

  const loadBillingConfig = useCallback(async () => {
    const response = await fetch('/api/payment/billing', {
      cache: 'no-store',
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(await readApiError(response));
    }
    const nextConfig = (await response.json()) as BillingConfig;
    setConfig(nextConfig);
    return nextConfig;
  }, []);

  const completeBillingRedirect = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const billingState = params.get('billing');
    if (!billingState) {
      return;
    }

    if (billingState === 'fail') {
      setMessage({
        tone: 'error',
        text:
          params.get('message') ??
          '카드 등록이 취소되었거나 완료되지 않았습니다.',
      });
      removeBillingQuery();
      return;
    }

    const authKey = params.get('authKey');
    const customerKey = params.get('customerKey');
    const storedPlan = window.sessionStorage.getItem('billing-plan');
    const requestedPlan = params.get('plan') ?? storedPlan;

    if (
      !authKey ||
      !customerKey ||
      (requestedPlan !== 'basic' && requestedPlan !== 'pro')
    ) {
      setMessage({
        tone: 'error',
        text: '결제 인증 정보가 올바르지 않습니다. 다시 시도해 주세요.',
      });
      removeBillingQuery();
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/payment/billing', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'issue',
          authKey,
          customerKey,
          plan: requestedPlan,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      await loadBillingConfig();
      setMessage({
        tone: 'success',
        text: `${requestedPlan === 'pro' ? 'Pro' : 'Basic'} 구독이 시작되었습니다.`,
      });
      window.sessionStorage.removeItem('billing-plan');
      onSubscribed?.(requestedPlan);
    } catch (error) {
      setMessage({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : '결제 승인에 실패했습니다.',
      });
    } finally {
      removeBillingQuery();
      setLoading(false);
    }
  }, [loadBillingConfig, onSubscribed]);

  useEffect(() => {
    void completeBillingRedirect();
  }, [completeBillingRedirect]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setMessage(null);
    void loadBillingConfig().catch((error) => {
      setMessage({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : '구독 정보를 불러오지 못했습니다.',
      });
    });
  }, [loadBillingConfig, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [loading, onClose, open]);

  const selected = useMemo(
    () => PLANS.find((plan) => plan.id === selectedPlan)!,
    [selectedPlan],
  );

  const startBilling = async () => {
    if (!agreed || loading) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const billingConfig = config ?? (await loadBillingConfig());
      await loadTossPayments();
      if (!window.TossPayments) {
        throw new Error('결제 모듈 초기화에 실패했습니다.');
      }

      const tossPayments = window.TossPayments(billingConfig.clientKey);
      const payment = tossPayments.payment({
        customerKey: billingConfig.customerKey,
      });
      const successUrl = new URL(window.location.href);
      successUrl.searchParams.set('billing', 'success');
      successUrl.searchParams.set('plan', selectedPlan);
      const failUrl = new URL(window.location.href);
      failUrl.searchParams.set('billing', 'fail');
      failUrl.searchParams.set('plan', selectedPlan);

      window.sessionStorage.setItem('billing-plan', selectedPlan);
      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl: successUrl.toString(),
        failUrl: failUrl.toString(),
        customerEmail,
        customerName,
        windowTarget: 'self',
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : '결제창을 열지 못했습니다.',
      });
      setLoading(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !loading) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="subscription-title"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-white/70 bg-[#f7fcfc] shadow-[0_30px_90px_rgba(8,47,73,0.28)]"
        role="dialog"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-cyan-100 bg-[#f7fcfc]/95 px-6 py-5 backdrop-blur md:px-8">
          <div>
            <p className="mb-1 text-xs font-bold tracking-[0.2em] text-teal-600">
              GOD-SAENG MEMBERSHIP
            </p>
            <h2
              className="text-2xl font-black tracking-tight text-slate-900"
              id="subscription-title"
            >
              나에게 맞는 몰입 플랜
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              필요한 만큼 시작하고, 더 깊게 몰입해 보세요.
            </p>
          </div>
          <button
            aria-label="구독 창 닫기"
            className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-xl text-slate-500 transition hover:border-cyan-300 hover:text-teal-700 disabled:opacity-40"
            disabled={loading}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="p-6 md:p-8">
          {message && (
            <div
              className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                message.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}
              role="status"
            >
              {message.text}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            {PLANS.map((plan) => {
              const isCurrent = effectivePlan === plan.id;
              const isSelected = selectedPlan === plan.id;

              return (
                <article
                  className={`relative rounded-3xl border p-5 transition ${plan.accent} ${
                    isSelected && plan.id !== 'free'
                      ? 'ring-2 ring-teal-500 ring-offset-2'
                      : 'hover:-translate-y-0.5 hover:shadow-lg'
                  }`}
                  key={plan.id}
                >
                  {plan.recommended && (
                    <span className="absolute -top-3 right-5 rounded-full bg-teal-700 px-3 py-1 text-[11px] font-black tracking-wide text-white shadow-md">
                      BEST
                    </span>
                  )}
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black text-slate-900">
                      {plan.name}
                    </h3>
                    {isCurrent && (
                      <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white">
                        현재 플랜
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex items-end gap-1">
                    <strong className="text-3xl font-black tracking-tight text-slate-950">
                      {formatWon(plan.price)}원
                    </strong>
                    {plan.price > 0 && (
                      <span className="pb-1 text-xs text-slate-500">/ 월</span>
                    )}
                  </div>
                  <p className="mt-2 min-h-10 text-sm leading-5 text-slate-600">
                    {plan.description}
                  </p>
                  <ul className="mt-5 space-y-2.5">
                    {plan.features.map((feature) => (
                      <li
                        className="flex gap-2 text-sm font-medium text-slate-700"
                        key={feature}
                      >
                        <span
                          aria-hidden="true"
                          className="mt-0.5 text-teal-600"
                        >
                          ✓
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {plan.id !== 'free' && (
                    <button
                      className={`mt-6 w-full rounded-2xl px-4 py-3 text-sm font-black transition ${
                        isSelected
                          ? 'bg-teal-700 text-white shadow-lg shadow-teal-700/20'
                          : 'border border-teal-200 bg-white text-teal-800 hover:bg-teal-50'
                      }`}
                      disabled={isCurrent || loading}
                      onClick={() => setSelectedPlan(plan.id as PaidPlanId)}
                      type="button"
                    >
                      {isCurrent
                        ? '이용 중'
                        : isSelected
                          ? '선택됨'
                          : `${plan.name} 선택`}
                    </button>
                  )}
                </article>
              );
            })}
          </div>

          <div className="mt-6 rounded-3xl border border-cyan-200 bg-white p-5 md:flex md:items-center md:justify-between md:gap-6">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                checked={agreed}
                className="mt-0.5 h-5 w-5 rounded border-slate-300 accent-teal-700"
                onChange={(event) => setAgreed(event.target.checked)}
                type="checkbox"
              />
              <span className="text-sm leading-6 text-slate-600">
                매월{' '}
                <strong className="text-slate-900">
                  {formatWon(selected.price)}원
                </strong>
                이 등록한 결제수단으로 자동 결제되는 것에 동의합니다.
                <span className="block text-xs text-slate-400">
                  카드 정보는 토스페이먼츠 결제창에서 안전하게 등록됩니다.
                </span>
              </span>
            </label>
            <button
              className="mt-4 min-w-56 rounded-2xl bg-gradient-to-r from-teal-700 to-cyan-600 px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-cyan-700/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-45 md:mt-0"
              disabled={!agreed || loading || effectivePlan === selectedPlan}
              onClick={() => void startBilling()}
              type="button"
            >
              {loading
                ? '안전하게 처리 중…'
                : `${selected.name} 월 ${formatWon(selected.price)}원 시작`}
            </button>
          </div>

          <p className="mt-4 text-center text-xs leading-5 text-slate-400">
            실제 결제일과 다음 결제 예정일은 결제 완료 후 구독 정보에
            표시됩니다. 결제 승인에는 잠시 시간이 걸릴 수 있습니다.
          </p>
        </div>
      </section>
    </div>
  );
}
