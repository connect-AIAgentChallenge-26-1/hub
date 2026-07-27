'use client';

import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useMemo,
  useState,
} from 'react';

import type {
  PaidFeature,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../lib/guards/subscriptionGuard';
import SubscriptionModal from '../payment/SubscriptionModal';

const FEATURE_LABELS: Record<PaidFeature, string> = {
  'streak-shield': '스트릭 방어권',
  'unlimited-ai-parse': '무제한 AI 파싱',
  'background-push': '백그라운드 푸시',
};

export type ProFeatureWrapperProps = {
  children: ReactNode;
  feature: PaidFeature;
  /**
   * 서버 가드에서 계산한 값을 넘기는 방식이 가장 안전합니다.
   * 생략하면 plan/status/currentPeriodEnd로 화면 잠금 상태를 계산합니다.
   */
  hasAccess?: boolean;
  plan?: SubscriptionPlan;
  subscriptionStatus?: SubscriptionStatus | null;
  currentPeriodEnd?: string | null;
  className?: string;
  customerEmail?: string;
  customerName?: string;
  showBadge?: boolean;
  onAccessGranted?: (plan: 'basic' | 'pro') => void;
};

const hasActivePaidPlan = (
  plan: SubscriptionPlan,
  status: SubscriptionStatus | null,
  currentPeriodEnd: string | null,
) => {
  if (
    (plan !== 'basic' && plan !== 'pro') ||
    status !== 'active' ||
    !currentPeriodEnd
  ) {
    return false;
  }

  const end = new Date(currentPeriodEnd);
  return Number.isFinite(end.getTime()) && end.getTime() > Date.now();
};

/**
 * 유료 기능의 UX 잠금 컴포넌트입니다.
 * 이 컴포넌트만으로 API 보안을 대신할 수 없으므로 실제 기능 API에서도
 * subscriptionGuard의 assert 함수를 반드시 호출해야 합니다.
 */
export default function ProFeatureWrapper({
  children,
  feature,
  hasAccess,
  plan = 'free',
  subscriptionStatus = null,
  currentPeriodEnd = null,
  className = '',
  customerEmail,
  customerName,
  showBadge = true,
  onAccessGranted,
}: ProFeatureWrapperProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [upgradedPlan, setUpgradedPlan] = useState<'basic' | 'pro' | null>(
    null,
  );

  const unlocked = useMemo(
    () =>
      upgradedPlan !== null ||
      hasAccess === true ||
      (hasAccess === undefined &&
        hasActivePaidPlan(plan, subscriptionStatus, currentPeriodEnd)),
    [
      currentPeriodEnd,
      hasAccess,
      plan,
      subscriptionStatus,
      upgradedPlan,
    ],
  );

  const openUpgrade = (
    event: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setModalOpen(true);
  };

  return (
    <>
      <div
        className={`relative isolate inline-flex max-w-full ${className}`}
        data-feature={feature}
        data-locked={!unlocked}
      >
        <div
          aria-hidden={!unlocked}
          className={
            unlocked
              ? 'contents'
              : 'pointer-events-none select-none opacity-70 saturate-75'
          }
        >
          {children}
        </div>

        {!unlocked && (
          <button
            aria-label={`${FEATURE_LABELS[feature]} 사용을 위한 유료 플랜 보기`}
            className="absolute inset-0 z-10 cursor-pointer rounded-[inherit] bg-transparent outline-none ring-cyan-500/60 transition focus-visible:ring-2 focus-visible:ring-offset-2"
            onClick={openUpgrade}
            type="button"
          >
            {showBadge && (
              <span className="absolute -right-2 -top-2 rounded-full border border-white/80 bg-gradient-to-r from-teal-700 to-cyan-600 px-2.5 py-1 text-[10px] font-black tracking-[0.08em] text-white shadow-md shadow-cyan-900/15">
                PRO
              </span>
            )}
            <span className="sr-only">
              유료 플랜을 구독하면 {FEATURE_LABELS[feature]} 기능을 사용할 수
              있습니다.
            </span>
          </button>
        )}
      </div>

      <SubscriptionModal
        currentPlan={upgradedPlan ?? plan}
        customerEmail={customerEmail}
        customerName={customerName}
        onClose={() => setModalOpen(false)}
        onSubscribed={(nextPlan) => {
          setUpgradedPlan(nextPlan);
          setModalOpen(false);
          onAccessGranted?.(nextPlan);
        }}
        open={modalOpen}
      />
    </>
  );
}
