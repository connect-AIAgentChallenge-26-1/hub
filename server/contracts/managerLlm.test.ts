import { describe, expect, it } from "vitest";
import { createManagerLlmFallback } from "../lib/managerLlmFallback";
import { managerLlmPromptVersion, parseManagerLlmRequest, resolveManagerLlmOutput, type ManagerLlmRequest } from "./managerLlm";

function createRequest(overrides: Partial<ManagerLlmRequest> = {}): ManagerLlmRequest {
  return {
    promptVersion: managerLlmPromptVersion,
    outputKind: "goalPlan",
    managerContext: { currentMood: "waiting", recentEventCount: 0, lastQuestResult: null, memorySummary: "기록 없음", rewardHints: [] },
    profile: { nickname: "루카스", rawGoalText: "백엔드 포트폴리오 만들기", dailyMinutes: 60, targetDate: null, managerTone: "friendly" },
    persona: { petId: "pink-manager", tone: "friendly", questStyle: "balanced", feedbackStyle: "playful", behaviorStyle: "balanced" },
    managerProgress: { level: 1, stats: { diligence: 0, persistence: 0, creativity: 0, knowledge: 0, strength: 0, agility: 0, stamina: 0, charm: 0 } },
    questState: { status: "draft" },
    recentEvents: [],
    dailyCapacity: { localDate: "2026-08-07", baselineMinutes: 60, reservedMinutes: 0, usedMinutes: 0, successfulMinutes: 0, remainingMinutes: 60, varianceMinutes: -60, utilizationRatio: 0, status: "no_activity", bonusAwarded: false },
    ...overrides,
  };
}

describe("manager LLM v3 contract", () => {
  it("accepts detailed context and keeps up to twelve recent events", () => {
    const request = createRequest();
    const event = { type: "quest_completed", title: "README 개요 작성", result: "success", difficulty: "easy", createdAt: "2026-08-07T00:00:00.000Z", failureReason: null, actualDurationMinutes: 12, plannedEstimatedMinutes: 15, completionCriteria: ["개요 저장"], evaluationReason: "짧은 작성 작업" };
    const parsed = parseManagerLlmRequest({ ...request, recentEvents: Array.from({ length: 15 }, () => event) });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.recentEvents).toHaveLength(12);
    expect(parsed.data.recentEvents[0]).toMatchObject({ actualDurationMinutes: 12, completionCriteria: ["개요 저장"] });
  });

  it("rejects legacy profile fields and invalid capacity", () => {
    const request = createRequest();
    expect(parseManagerLlmRequest({ ...request, profile: { ...request.profile, category: "career" } }).ok).toBe(false);
    expect(parseManagerLlmRequest({ ...request, dailyCapacity: { ...request.dailyCapacity, baselineMinutes: 0 } }).ok).toBe(false);
  });

  it("accepts one clarification question but rejects another after an answer", () => {
    const request = createRequest();
    const fallback = createManagerLlmFallback(request);
    const plan = fallback.goalPlan!;
    expect(resolveManagerLlmOutput({ outputKind: "goalPlan", rawOutput: { goalPlan: plan }, fallback, request }).data.source).toBe("llm");
    const answered = createRequest({ profile: { ...request.profile, clarificationAnswer: "README" } });
    expect(resolveManagerLlmOutput({ outputKind: "goalPlan", rawOutput: { goalPlan: plan }, fallback, request: answered }).data.source).toBe("rule_fallback");
  });

  it("rejects an incomplete quarter horizon", () => {
    const request = createRequest();
    const fallback = createManagerLlmFallback(request);
    const result = resolveManagerLlmOutput({ outputKind: "goalPlan", rawOutput: { goalPlan: { ...fallback.goalPlan, horizon: "quarter" } }, fallback });
    expect(result.data.source).toBe("rule_fallback");
  });

  it("rejects acceptance identity changes and invalid reward ranges", () => {
    const request = createRequest({ outputKind: "questAcceptancePreview" });
    const fallback = createManagerLlmFallback(request);
    const draft = fallback.goalPlan!.currentQuest;
    const identity = resolveManagerLlmOutput({ outputKind: "questAcceptancePreview", rawOutput: { questAcceptancePreview: { ...fallback.questAcceptancePreview, finalizedQuest: { ...draft, id: "changed" } } }, fallback, request: { ...request, questDraft: draft } });
    const reward = resolveManagerLlmOutput({ outputKind: "questAcceptancePreview", rawOutput: { questAcceptancePreview: { ...fallback.questAcceptancePreview, difficulty: "easy", rewardExp: 20 } }, fallback });
    expect(identity.data.source).toBe("rule_fallback");
    expect(reward.data.source).toBe("rule_fallback");
  });

  it("uses managerLine as the single authority for the duplicated behavior line", () => {
    const request = createRequest({ outputKind: "questAcceptancePreview" });
    const fallback = createManagerLlmFallback(request);
    const preview = fallback.questAcceptancePreview!;
    const result = resolveManagerLlmOutput({
      outputKind: "questAcceptancePreview",
      rawOutput: { questAcceptancePreview: { ...preview, behaviorIntent: { ...preview.behaviorIntent, line: "중복 생성된 다른 문장" } } },
      fallback,
      request: { ...request, questDraft: preview.finalizedQuest },
    });
    expect(result.data).toMatchObject({ source: "llm", questAcceptancePreview: { behaviorIntent: { line: preview.managerLine } } });
  });

  it("preserves completed milestone and weekly nodes during rebalancing", () => {
    const request = createRequest({ outputKind: "planRebalance" });
    const fallback = createManagerLlmFallback(request);
    const activePlan = { ...fallback.goalPlan!, milestones: fallback.goalPlan!.milestones.map((node, index) => index === 0 ? { ...node, status: "completed" as const } : node) };
    const changedPlan = { ...activePlan, milestones: activePlan.milestones.map((node, index) => index === 0 ? { ...node, statement: "변경됨" } : node) };
    const result = resolveManagerLlmOutput({ outputKind: "planRebalance", rawOutput: { planRebalance: { ...fallback.planRebalance, rebalancedPlan: changedPlan } }, fallback, request: { ...request, activePlan } });
    expect(result.data.source).toBe("rule_fallback");
  });
});
