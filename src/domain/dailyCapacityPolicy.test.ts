import { describe, expect, it } from "vitest";
import {
  calculateDailyCapacity,
  getDailyCapacityBonusExp,
  getEligibleQuestMinutes,
  summarizeDailyCapacity,
  splitDailyMinutes,
  toDailyMinutes,
} from "./dailyCapacityPolicy";

describe("daily capacity policy", () => {
  it("classifies time against a soft daily baseline without clamping the variance", () => {
    expect(calculateDailyCapacity({ baselineMinutes: 180, usedMinutes: 45, reservedMinutes: 60, successfulMinutes: 45 })).toMatchObject({
      status: "under_capacity",
      remainingMinutes: 75,
      varianceMinutes: -135,
      utilizationRatio: 0.25,
    });
    expect(calculateDailyCapacity({ baselineMinutes: 180, usedMinutes: 180, reservedMinutes: 0, successfulMinutes: 180 }).status).toBe("capacity_reached");
    expect(calculateDailyCapacity({ baselineMinutes: 180, usedMinutes: 215, reservedMinutes: 0, successfulMinutes: 180 })).toMatchObject({
      status: "over_capacity",
      remainingMinutes: -35,
      varianceMinutes: 35,
    });
  });

  it("counts only bounded successful quest time toward the completion bonus", () => {
    expect(getEligibleQuestMinutes({ result: "success", actualMinutes: 80, estimatedMinutes: 60 })).toBe(60);
    expect(getEligibleQuestMinutes({ result: "recovery", actualMinutes: 20, estimatedMinutes: 30 })).toBe(20);
    expect(getEligibleQuestMinutes({ result: "failed", actualMinutes: 80, estimatedMinutes: 60 })).toBe(0);
  });

  it("awards the configured once-per-day completion tier", () => {
    expect(getDailyCapacityBonusExp(30)).toBe(3);
    expect(getDailyCapacityBonusExp(60)).toBe(5);
    expect(getDailyCapacityBonusExp(120)).toBe(8);
    expect(getDailyCapacityBonusExp(180)).toBe(12);
    expect(getDailyCapacityBonusExp(240)).toBe(15);
  });

  it("converts integer hour and minute controls to the existing minute storage", () => {
    expect(toDailyMinutes({ hours: 3, minutes: 0 })).toBe(180);
    expect(splitDailyMinutes(185)).toEqual({ hours: 3, minutes: 5 });
  });

  it("aggregates failures into usage but excludes them from successful minutes", () => {
    const context = summarizeDailyCapacity({
      baselineMinutes: 180,
      localDate: "2026-08-07",
      records: [
        { result: "success", metadata: { localDate: "2026-08-07", actualDurationMinutes: 80, acceptedEstimatedMinutes: 60 } },
        { result: "failed", metadata: { localDate: "2026-08-07", actualDurationMinutes: 100, acceptedEstimatedMinutes: 90 } },
        { result: "recovery", metadata: { localDate: "2026-08-07", actualDurationMinutes: 30, acceptedEstimatedMinutes: 30 } },
      ],
    });

    expect(context).toMatchObject({ usedMinutes: 210, successfulMinutes: 90, status: "over_capacity", bonusAwarded: false });
  });

  it("uses the accepted baseline snapshot and detects an existing daily bonus", () => {
    const context = summarizeDailyCapacity({
      baselineMinutes: 240,
      localDate: "2026-08-07",
      records: [
        { result: "success", metadata: { localDate: "2026-08-07", dailyBaselineMinutes: 180, actualDurationMinutes: 180, acceptedEstimatedMinutes: 180 } },
        { result: null, metadata: { localDate: "2026-08-07", rewardKind: "daily_capacity_completed" } },
      ],
    });

    expect(context.baselineMinutes).toBe(180);
    expect(context.bonusAwarded).toBe(true);
  });
});
