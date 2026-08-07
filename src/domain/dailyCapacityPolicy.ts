export type DailyCapacityStatus = "no_activity" | "under_capacity" | "capacity_reached" | "over_capacity";

export interface DailyCapacityContext {
  localDate: string;
  baselineMinutes: number;
  reservedMinutes: number;
  usedMinutes: number;
  successfulMinutes: number;
  remainingMinutes: number;
  varianceMinutes: number;
  utilizationRatio: number;
  status: DailyCapacityStatus;
  bonusAwarded: boolean;
}

export interface DailyCapacityInput {
  baselineMinutes: number;
  reservedMinutes: number;
  usedMinutes: number;
  successfulMinutes: number;
  localDate?: string;
  bonusAwarded?: boolean;
}

export interface DailyCapacityRecord {
  result: "success" | "failed" | "recovery" | null;
  metadata?: Record<string, unknown>;
}

export function calculateDailyCapacity(input: DailyCapacityInput): DailyCapacityContext {
  const baselineMinutes = positiveInteger(input.baselineMinutes);
  const reservedMinutes = nonNegativeInteger(input.reservedMinutes);
  const usedMinutes = nonNegativeInteger(input.usedMinutes);
  const successfulMinutes = nonNegativeInteger(input.successfulMinutes);
  const status: DailyCapacityStatus = usedMinutes === 0
    ? "no_activity"
    : usedMinutes < baselineMinutes
      ? "under_capacity"
      : usedMinutes === baselineMinutes
        ? "capacity_reached"
        : "over_capacity";

  return {
    localDate: input.localDate ?? toLocalDate(new Date()),
    baselineMinutes,
    reservedMinutes,
    usedMinutes,
    successfulMinutes,
    remainingMinutes: baselineMinutes - usedMinutes - reservedMinutes,
    varianceMinutes: usedMinutes - baselineMinutes,
    utilizationRatio: usedMinutes / baselineMinutes,
    status,
    bonusAwarded: input.bonusAwarded === true,
  };
}

export function getEligibleQuestMinutes(input: {
  result: "success" | "failed" | "recovery" | null;
  actualMinutes?: number;
  estimatedMinutes: number;
}): number {
  if (input.result !== "success" && input.result !== "recovery") return 0;
  const estimatedMinutes = positiveInteger(input.estimatedMinutes);
  const actualMinutes = input.actualMinutes === undefined ? estimatedMinutes : positiveInteger(input.actualMinutes);
  return Math.min(actualMinutes, estimatedMinutes);
}

export function getDailyCapacityBonusExp(baselineMinutes: number): number {
  const minutes = positiveInteger(baselineMinutes);
  if (minutes <= 30) return 3;
  if (minutes <= 60) return 5;
  if (minutes <= 120) return 8;
  if (minutes <= 180) return 12;
  return 15;
}

export function summarizeDailyCapacity(input: {
  baselineMinutes: number;
  localDate: string;
  records: DailyCapacityRecord[];
  reservedMinutes?: number;
}): DailyCapacityContext {
  const records = input.records.filter((record) => record.metadata?.localDate === input.localDate);
  const snapshot = records.map((record) => numberMetadata(record.metadata, "dailyBaselineMinutes")).find((value) => value > 0);
  const baselineMinutes = snapshot ?? input.baselineMinutes;
  let usedMinutes = 0;
  let successfulMinutes = 0;

  for (const record of records) {
    if (record.result === null) continue;
    const actualMinutes = numberMetadata(record.metadata, "actualDurationMinutes");
    const estimatedMinutes = numberMetadata(record.metadata, "acceptedEstimatedMinutes")
      || numberMetadata(record.metadata, "plannedEstimatedMinutes");
    const used = actualMinutes || estimatedMinutes;
    usedMinutes += used;
    if (estimatedMinutes > 0) {
      successfulMinutes += getEligibleQuestMinutes({ result: record.result, actualMinutes: used || undefined, estimatedMinutes });
    }
  }

  return calculateDailyCapacity({
    baselineMinutes,
    reservedMinutes: input.reservedMinutes ?? 0,
    usedMinutes,
    successfulMinutes,
    localDate: input.localDate,
    bonusAwarded: records.some((record) => record.metadata?.rewardKind === "daily_capacity_completed"),
  });
}

export function toDailyMinutes(input: { hours: number; minutes: number }): number {
  return nonNegativeInteger(input.hours) * 60 + nonNegativeInteger(input.minutes);
}

export function splitDailyMinutes(totalMinutes: number): { hours: number; minutes: number } {
  const normalized = nonNegativeInteger(totalMinutes);
  return { hours: Math.floor(normalized / 60), minutes: normalized % 60 };
}

export function toLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function positiveInteger(value: number): number {
  return Math.max(1, Math.round(Number.isFinite(value) ? value : 1));
}

function nonNegativeInteger(value: number): number {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

function numberMetadata(metadata: Record<string, unknown> | undefined, key: string): number {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}
