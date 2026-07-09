// ShowUp 위험도 계산 순수 함수
// 계산 로직은 이 파일에만 존재해야 한다.
// MVP 초기에는 클라이언트에서 호출, 이후 Cloud Function 으로 이전 가능.

import type { Timestamp } from 'firebase/firestore';
import type {
  Incident,
  IncidentType,
  Reservation,
  RiskLevel,
  RiskStats,
} from '../types/schema';

export const RISK_WEIGHTS = {
  noShow: 8,
  lateCancel: 4,
  late: 2,
  abuse: 10,
  dispute: 6,
  unreasonable: 4,
  visited: -1,
  recentNoShow: 5,
} as const;

export const RISK_LEVELS = {
  low: { min: 0, max: 23 },
  medium: { min: 24, max: 39 },
  high: { min: 40, max: Number.POSITIVE_INFINITY },
} as const;

const INCIDENT_WEIGHTS: Record<IncidentType, number> = {
  abuse: RISK_WEIGHTS.abuse,
  dispute: RISK_WEIGHTS.dispute,
  late: RISK_WEIGHTS.late,
  unreasonable: RISK_WEIGHTS.unreasonable,
};

export interface RiskInputs {
  reservations: Reservation[];
  incidents: Incident[];
  now?: Date;
}

/**
 * 예약과 사건 이력으로 riskStats 를 계산한다.
 * - score 는 0 이하로 내려가지 않음.
 * - abuse 1회 이상이면 최소 medium (level 계산 시 별도 보장).
 */
export function calculateRiskStats(
  inputs: RiskInputs,
  base: Partial<RiskStats> = {},
): RiskStats {
  const { reservations, incidents, now = new Date() } = inputs;

  let totalVisits = base.totalVisits ?? 0;
  let noShowCount = base.noShowCount ?? 0;
  let lateCancelCount = base.lateCancelCount ?? 0;

  // 예약 이력 집계
  for (const r of reservations) {
    if (r.status === 'visited') {
      totalVisits += 1;
    } else if (r.status === 'noShow') {
      noShowCount += 1;
    } else if (r.status === 'cancelled' && r.cancelledSameDay) {
      lateCancelCount += 1;
    }
  }

  const incidentCounts: RiskStats['incidentCounts'] = {
    abuse: 0,
    dispute: 0,
    late: 0,
    unreasonable: 0,
  };

  for (const incident of incidents) {
    incidentCounts[incident.type] += 1;
  }

  // 사건 점수
  const incidentScore = Object.entries(incidentCounts).reduce(
    (sum, [type, count]) => sum + INCIDENT_WEIGHTS[type as IncidentType] * count,
    0,
  );

  // 예약 점수
  const reservationScore =
    noShowCount * RISK_WEIGHTS.noShow +
    lateCancelCount * RISK_WEIGHTS.lateCancel +
    totalVisits * RISK_WEIGHTS.visited;

  // 최근 30일 내 노쇼 가중 (최신성 보너스: 한 번만 +5)
  const recentThresholdDays = 30;
  const recentThresholdMs = recentThresholdDays * 24 * 60 * 60 * 1000;
  let hasRecentNoShow = false;
  let lastNoShowAt: RiskStats['lastNoShowAt'] = base.lastNoShowAt ?? null;

  for (const r of reservations) {
    if (r.status !== 'noShow') continue;
    const createdAtDate = toDate(r.createdAt);
    if (!createdAtDate) continue;
    if (!lastNoShowAt || toDate(lastNoShowAt)! < createdAtDate) {
      lastNoShowAt = r.createdAt as Timestamp;
    }
    const diffMs = now.getTime() - createdAtDate.getTime();
    if (diffMs <= recentThresholdMs) {
      hasRecentNoShow = true;
    }
  }

  const recentNoShowScore = hasRecentNoShow ? RISK_WEIGHTS.recentNoShow : 0;

  const score = Math.max(
    0,
    reservationScore + incidentScore + recentNoShowScore,
  );

  return {
    totalVisits,
    noShowCount,
    lateCancelCount,
    incidentCounts,
    score,
    lastNoShowAt,
    updatedAt: base.updatedAt ?? (now as unknown as Timestamp),
  };
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  return null;
}

/** score 로 등급을 계산한다. */
export function calculateRiskLevel(score: number): RiskLevel {
  if (score >= RISK_LEVELS.high.min) return 'high';
  if (score >= RISK_LEVELS.medium.min) return 'medium';
  return 'low';
}

/**
 * 등급을 계산할 때 abuse 1회 이상이면 최소 medium 을 보장한다.
 * plan.md §4.2 특별 규칙 반영.
 */
export function resolveRiskLevel(
  score: number,
  incidentCounts: { abuse: number },
): RiskLevel {
  const base = calculateRiskLevel(score);
  if (incidentCounts.abuse >= 1 && base === 'low') {
    return 'medium';
  }
  return base;
}

/** 경고 배너 발동 조건 */
export function shouldAlert(
  riskStats: Pick<RiskStats, 'noShowCount' | 'incidentCounts'>,
): boolean {
  return riskStats.noShowCount >= 3 || riskStats.incidentCounts.abuse >= 1;
}

/** 경고 배너 문구 생성 */
export function buildAlertMessage(
  noShowCount: number,
  abuseCount: number,
): string {
  const parts: string[] = [];
  if (noShowCount > 0) parts.push(`노쇼 ${noShowCount}회`);
  if (abuseCount > 0) parts.push(`사건 ${abuseCount}회`);
  const head = parts.length > 0 ? parts.join(' · ') : '주의 고객';
  return `${head} — 예약금 요청 또는 사전 확인을 권장합니다`;
}

export function createRiskAlertPayload(riskStats: RiskStats): {
  show: boolean;
  noShowCount: number;
  abuseCount: number;
  message: string;
} {
  const noShowCount = riskStats.noShowCount;
  const abuseCount = riskStats.incidentCounts.abuse;
  return {
    show: shouldAlert(riskStats),
    noShowCount,
    abuseCount,
    message: buildAlertMessage(noShowCount, abuseCount),
  };
}
