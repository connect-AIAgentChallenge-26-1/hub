import { describe, expect, it } from "vitest";
import {
  applyDifficultyEvaluationToQuest,
  applyQuestAcceptancePreviewToQuest,
  applyQuestPatch,
  acquireQuestPlanningLock,
  calculateQuestReward,
  createQuestDraftSnapshotKey,
  getQuestWorkflowWindows,
  getQuestCompletionResult,
  getQuestWindowView,
  isQuestAcceptancePreviewCurrent,
  releaseQuestPlanningLock,
} from "./questFlowPolicy";
import type { Quest } from "./questLogic";

const quest: Quest = {
  title: "핵심 정리 30분",
  type: "time",
  amount: 30,
  unit: "분",
  difficulty: "normal",
  deadline: "오늘 23:59",
  rewardExp: 28,
};

describe("quest flow policy", () => {
  it("maps quest status to the workflow windows that should be focused", () => {
    expect(getQuestWorkflowWindows("active")).toEqual(["runner", "manager"]);
    expect(getQuestWorkflowWindows("failed")).toEqual(["failure", "manager"]);
    expect(getQuestWorkflowWindows("recovery")).toEqual(["recovery", "manager"]);
    expect(getQuestWorkflowWindows("success")).toEqual(["manager"]);
    expect(getQuestWorkflowWindows("draft")).toBeNull();
  });

  it("records recovery completion separately from normal success", () => {
    expect(getQuestCompletionResult("recovery")).toBe("recovery");
    expect(getQuestCompletionResult("active")).toBe("success");
  });

  it("shows only the planning view while the next quest is being prepared", () => {
    expect(getQuestWindowView({ status: "success", hasQuestSpec: true, isPlanning: true })).toBe("planning");
    expect(getQuestWindowView({ status: "draft", hasQuestSpec: true, isPlanning: false })).toBe("draft");
    expect(getQuestWindowView({ status: "draft", hasQuestSpec: false, isPlanning: false })).toBe("empty");
  });

  it("allows only one quest planning request at a time", () => {
    const lock = { current: false };

    expect(acquireQuestPlanningLock(lock)).toBe(true);
    expect(acquireQuestPlanningLock(lock)).toBe(false);
    releaseQuestPlanningLock(lock);
    expect(acquireQuestPlanningLock(lock)).toBe(true);
  });

  it("recalculates reward and unit when a quest draft changes", () => {
    expect(applyQuestPatch(quest, { type: "quantity", amount: 12, difficulty: "hard" })).toEqual({
      ...quest,
      type: "quantity",
      amount: 12,
      difficulty: "hard",
      unit: "개",
      rewardExp: calculateQuestReward("hard", 12, "quantity"),
    });
  });

  it("applies a server difficulty evaluation before quest acceptance", () => {
    expect(
      applyDifficultyEvaluationToQuest(
        {
          title: "Read database chapters",
          type: "time",
          amount: 60,
          unit: "min",
          difficulty: "normal",
          deadline: "today 23:59",
          rewardExp: 16,
        },
        {
          difficulty: "hard",
          rewardExp: 52,
          reason: "large study block",
        },
      ),
    ).toEqual({
      title: "Read database chapters",
      type: "time",
      amount: 60,
      unit: "min",
      difficulty: "hard",
      deadline: "today 23:59",
      rewardExp: 52,
    });
  });

  it("keys a quest draft snapshot by user-editable fields", () => {
    const base = createQuestDraftSnapshotKey({
      title: "Read database chapters",
      type: "time",
      amount: 30,
      unit: "min",
      difficulty: "normal",
      deadline: "today 23:59",
      rewardExp: 16,
    });
    const changedRewardOnly = createQuestDraftSnapshotKey({
      title: "Read database chapters",
      type: "time",
      amount: 30,
      unit: "min",
      difficulty: "normal",
      deadline: "today 23:59",
      rewardExp: 30,
    });
    const changedAmount = createQuestDraftSnapshotKey({
      title: "Read database chapters",
      type: "time",
      amount: 45,
      unit: "min",
      difficulty: "normal",
      deadline: "today 23:59",
      rewardExp: 16,
    });
    const changedDifficultyOnly = createQuestDraftSnapshotKey({
      title: "Read database chapters",
      type: "time",
      amount: 30,
      unit: "min",
      difficulty: "hard",
      deadline: "today 23:59",
      rewardExp: 16,
    });

    expect(changedRewardOnly).toBe(base);
    expect(changedDifficultyOnly).toBe(base);
    expect(changedAmount).not.toBe(base);
  });

  it("accepts a reward preview only while the draft snapshot is unchanged", () => {
    const preview = {
      difficulty: "hard" as const,
      rewardExp: 48,
      statEvaluation: {
        difficulty: "hard" as const,
        statBudget: 15,
        primaryStats: ["knowledge" as const],
        statDeltas: [
          { stat: "knowledge" as const, amount: 12 },
          { stat: "diligence" as const, amount: 3 },
        ],
        reason: "server-side memo",
      },
      reason: "server-side reward memo",
    };
    const snapshotKey = createQuestDraftSnapshotKey(quest);

    expect(isQuestAcceptancePreviewCurrent(quest, { snapshotKey, preview })).toBe(true);
    expect(isQuestAcceptancePreviewCurrent({ ...quest, title: "Changed" }, { snapshotKey, preview })).toBe(false);
    expect(applyQuestAcceptancePreviewToQuest(quest, preview)).toEqual({
      ...quest,
      difficulty: "hard",
      rewardExp: 48,
    });
  });

  it("applies the complete finalized quest before acceptance", () => {
    expect(applyQuestAcceptancePreviewToQuest(quest, {
      finalizedQuest: {
        displayTitle: "오답 세 문제의 풀이 근거 적기",
        instruction: "오답 세 문제의 풀이 근거를 적는다.",
        estimatedMinutes: 25,
        tracking: { mode: "counter", targetAmount: 3, targetUnit: "문제" },
      },
      difficulty: "hard",
      rewardExp: 45,
      statEvaluation: {
        difficulty: "hard",
        statBudget: 15,
        primaryStats: ["knowledge"],
        statDeltas: [{ stat: "knowledge", amount: 15 }],
        reason: "오답 분석",
      },
      reason: "의미 중심 통합 평가",
    })).toEqual({
      ...quest,
      title: "오답 세 문제의 풀이 근거 적기",
      type: "quantity",
      amount: 3,
      unit: "문제",
      difficulty: "hard",
      rewardExp: 45,
    });
  });
});
