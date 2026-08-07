import { describe, expect, it } from "vitest";
import { managerLlmPromptVersion, type ManagerLlmRequest } from "../contracts/managerLlm";
import { createManagerLlmFallback } from "./managerLlmFallback";

const baseRequest: ManagerLlmRequest = {
  promptVersion: managerLlmPromptVersion,
  outputKind: "goalPlan",
  managerContext: { currentMood: "waiting", recentEventCount: 0, lastQuestResult: null, memorySummary: "기록 없음", rewardHints: [] },
  profile: { nickname: "루카스", rawGoalText: "달리기를 더 잘하고 싶다", dailyMinutes: 180, targetDate: null, managerTone: "friendly" },
  persona: { petId: "pink-manager", tone: "friendly", questStyle: "balanced", feedbackStyle: "playful", behaviorStyle: "balanced" },
  managerProgress: { level: 1, stats: { diligence: 0, persistence: 0, creativity: 0, knowledge: 0, strength: 0, agility: 0, stamina: 0, charm: 0 } },
  questState: { status: "draft" },
  recentEvents: [],
  dailyCapacity: { localDate: "2026-08-07", baselineMinutes: 180, reservedMinutes: 0, usedMinutes: 0, successfulMinutes: 0, remainingMinutes: 180, varianceMinutes: -180, utilizationRatio: 0, status: "no_activity", bonusAwarded: false },
};

describe("manager LLM v3 fallback", () => {
  it("creates one semantic current quest without mapping the full baseline to a timer", () => {
    const fallback = createManagerLlmFallback(baseRequest);
    expect(fallback.goalPlan).toMatchObject({ schemaVersion: "goal-plan-v3", rollingDays: expect.any(Array), currentQuest: { displayTitle: expect.any(String), instruction: expect.any(String) } });
    expect(fallback.goalPlan?.rollingDays).toHaveLength(7);
    expect(fallback.goalPlan?.currentQuest.estimatedMinutes).toBeLessThan(180);
    expect(fallback.goalPlan?.currentQuest.displayTitle).not.toContain("핵심 정리");
  });

  it("always creates a next quest after the baseline is exceeded", () => {
    const initial = createManagerLlmFallback(baseRequest).goalPlan!;
    const fallback = createManagerLlmFallback({ ...baseRequest, outputKind: "nextQuest", activePlan: initial, questDraft: initial.currentQuest, dailyCapacity: { ...baseRequest.dailyCapacity, usedMinutes: 210, successfulMinutes: 180, remainingMinutes: -30, varianceMinutes: 30, utilizationRatio: 210 / 180, status: "over_capacity", bonusAwarded: true } });
    expect(fallback.nextQuest).toMatchObject({ nextQuest: { displayTitle: expect.any(String) }, updatedPlan: { currentQuest: { id: expect.any(String) } }, capacityAssessment: { status: "over_capacity" } });
    expect(fallback.nextQuest?.updatedPlan.currentQuest).toEqual(fallback.nextQuest?.nextQuest);
  });

  it("keeps the acceptance decision within fixed game economy bounds", () => {
    const fallback = createManagerLlmFallback(baseRequest);
    expect(fallback.questAcceptancePreview).toMatchObject({ difficulty: expect.stringMatching(/easy|normal|hard/), rewardExp: expect.any(Number), statEvaluation: { statBudget: expect.any(Number) } });
  });

  it("contains readable Korean in every user-visible fallback string", () => {
    const copy = JSON.stringify(createManagerLlmFallback(baseRequest));
    expect(copy).toContain("목표");
    expect(copy).not.toMatch(/[占癰疫]/u);
  });
});
