import { describe, expect, it } from "vitest";
import {
  managerLlmPromptVersion,
  parseManagerLlmRequest,
  resolveManagerLlmOutput,
  type ManagerGoalPlan,
  type ManagerLlmOutputFallback,
  type ManagerLlmQuestSpec,
} from "./managerLlm";

const quest: ManagerLlmQuestSpec = {
  id: "q1",
  displayTitle: "호흡을 유지하며 3km 달리기",
  instruction: "편안한 속도로 달리고 마지막에 호흡과 보폭을 기록한다.",
  purpose: "지속 가능한 기본 페이스를 확인한다.",
  completionCriteria: ["3km 달리기 완료", "호흡과 보폭 메모 1개"],
  estimatedMinutes: 35,
  expectedOutput: "거리와 몸 상태 기록",
  environmentConstraints: [],
  prerequisites: [],
  linkedMilestoneId: "m1",
  linkedWeeklyPlanId: "w1",
  status: "planned",
  tracking: { mode: "counter", targetAmount: 3, targetUnit: "km" },
};

const plan: ManagerGoalPlan = {
  schemaVersion: "goal-plan-v3",
  horizon: "month",
  goalBrief: {
    normalizedGoal: "호흡과 보폭을 유지하며 달리기 능력을 높인다.",
    constraints: ["하루 기준 시간 180분"],
    preferences: [],
    inferredDomains: ["exercise"],
    assumptions: [],
    uncertainties: [],
    confidence: 0.8,
  },
  finalGoal: { id: "g1", statement: "10km 안정적으로 달리기", successCriteria: ["10km 완주"], status: "active" },
  milestones: [{ id: "m1", parentGoalId: "g1", statement: "기본 페이스 확인", targetWeek: 1, successCriteria: ["3km 안정 완주"], status: "active" }],
  weeklyPlans: Array.from({ length: 4 }, (_, index) => ({ id: `w${index + 1}`, weekIndex: index + 1, milestoneIds: ["m1"], statement: "기본 주행 적응", targetOutcome: "주행 기록", successCriteria: ["계획한 달리기 완료"], status: index === 0 ? "active" as const : "planned" as const })),
  rollingDays: Array.from({ length: 7 }, (_, index) => ({ dayOffset: index, focus: "기본 페이스", intendedOutcome: "호흡 기록", status: index === 0 ? "active" as const : "planned" as const })),
  currentQuest: quest,
  risks: [],
  rebalancingPolicy: { onSuccess: "유지", onFailureTimeShortage: "분할", onFailureTooHard: "축소", onSkippedDays: "재시작", onAnomaly: "재검토" },
};

function requestBody() {
  return {
    promptVersion: managerLlmPromptVersion,
    outputKind: "nextQuest",
    managerContext: { currentMood: "happy", recentEventCount: 1, lastQuestResult: "success", memorySummary: "첫 퀘스트 완료", rewardHints: [] },
    profile: { nickname: "루카스", rawGoalText: "달리기를 더 잘하고 싶다", dailyMinutes: 180, targetDate: null, managerTone: "friendly" },
    persona: { petId: "pink-manager", tone: "friendly", questStyle: "balanced", feedbackStyle: "playful", behaviorStyle: "balanced" },
    managerProgress: { level: 2, stats: { diligence: 1, persistence: 1, creativity: 0, knowledge: 0, strength: 2, agility: 2, stamina: 2, charm: 0 } },
    questState: { status: "success", currentQuest: { title: quest.displayTitle, type: "quantity", amount: 3, unit: "km", difficulty: "normal", deadline: "오늘 23:59", rewardExp: 20 } },
    recentEvents: [{ type: "quest_completed", title: quest.displayTitle, result: "success", difficulty: "normal", createdAt: "2026-08-07T01:00:00.000Z", failureReason: null, actualDurationMinutes: 185, plannedEstimatedMinutes: 180, completionCriteria: quest.completionCriteria, evaluationReason: "지구력 중심" }],
    dailyCapacity: { localDate: "2026-08-07", baselineMinutes: 180, reservedMinutes: 0, usedMinutes: 185, successfulMinutes: 180, remainingMinutes: -5, varianceMinutes: 5, utilizationRatio: 185 / 180, status: "over_capacity" as const, bonusAwarded: true },
    activePlan: plan,
    questDraft: quest,
  };
}

describe("manager LLM v3 contract", () => {
  it("accepts an unscored draft quest before quest acceptance preview", () => {
    const request = {
      ...requestBody(),
      outputKind: "questAcceptancePreview",
      questState: {
        status: "draft",
        currentQuest: {
        title: "칼질 기본 동작 연습",
        type: "time",
        amount: 20,
        unit: "분",
        difficulty: "easy",
        deadline: "오늘 23:59",
        rewardExp: 0,
        },
      },
    };

    expect(parseManagerLlmRequest(request)).toMatchObject({ ok: true });
  });

  it("rejects an invalid active quest difficulty without throwing", () => {
    const request = requestBody();
    const invalidRequest = {
      ...request,
      questState: {
        ...request.questState,
        currentQuest: { ...request.questState.currentQuest, difficulty: "invalid" },
      },
    };

    expect(() => parseManagerLlmRequest(invalidRequest)).not.toThrow();
    expect(parseManagerLlmRequest(invalidRequest)).toMatchObject({ ok: false });
  });

  it("preserves the complete planning context for next-quest decisions", () => {
    const parsed = parseManagerLlmRequest(requestBody());
    expect(parsed).toMatchObject({ ok: true, data: { outputKind: "nextQuest", dailyCapacity: { status: "over_capacity", remainingMinutes: -5 }, managerProgress: { level: 2 }, activePlan: { schemaVersion: "goal-plan-v3" } } });
  });

  it("accepts an on-demand next quest even after the baseline is exceeded", () => {
    const behaviorIntent = { behaviorStyle: "balanced" as const, tone: "friendly" as const, line: "조금 넘었지만 원한다면 다음 걸음도 함께 가자.", suggestedBehaviorBias: [] };
    const baseFallback = createManagerFallbackForTest();
    const fallback: ManagerLlmOutputFallback = {
      ...baseFallback,
      managerLine: behaviorIntent.line,
      behaviorIntent,
      nextQuest: { nextQuest: quest, updatedPlan: plan, capacityAssessment: requestBody().dailyCapacity, managerLine: behaviorIntent.line, behaviorIntent },
    };
    const parsed = parseManagerLlmRequest(requestBody());
    const result = resolveManagerLlmOutput({ outputKind: "nextQuest", rawOutput: { nextQuest: fallback.nextQuest }, fallback, request: parsed.ok ? parsed.data : undefined });
    expect(result.data).toMatchObject({ source: "llm", nextQuest: { nextQuest: { displayTitle: quest.displayTitle }, capacityAssessment: { status: "over_capacity" } } });
  });

  it("normalizes duplicated next-quest fields from their authoritative values", () => {
    const behaviorIntent = { behaviorStyle: "balanced" as const, tone: "friendly" as const, line: "서로 다른 중복 문장", suggestedBehaviorBias: [] };
    const baseFallback = createManagerFallbackForTest();
    const fallback: ManagerLlmOutputFallback = {
      ...baseFallback,
      nextQuest: { nextQuest: quest, updatedPlan: plan, capacityAssessment: requestBody().dailyCapacity, managerLine: "다음 퀘스트를 시작하자.", behaviorIntent: { ...behaviorIntent, line: "다음 퀘스트를 시작하자." } },
    };
    const request = parseManagerLlmRequest(requestBody());
    const raw = {
      nextQuest: {
        nextQuest: quest,
        updatedPlan: { ...plan, currentQuest: { ...quest, displayTitle: "중복 생성된 다른 제목" } },
        capacityAssessment: { ...requestBody().dailyCapacity, usedMinutes: 0, status: "no_activity" },
        managerLine: "다음 퀘스트를 시작하자.",
        behaviorIntent,
      },
    };

    const result = resolveManagerLlmOutput({ outputKind: "nextQuest", rawOutput: raw, fallback, request: request.ok ? request.data : undefined });
    expect(result.data).toMatchObject({
      source: "llm",
      nextQuest: {
        updatedPlan: { currentQuest: { displayTitle: quest.displayTitle } },
        capacityAssessment: { status: "over_capacity", usedMinutes: 185 },
        behaviorIntent: { line: "다음 퀘스트를 시작하자." },
      },
    });
  });

  it("rejects a normalized next quest with unknown plan references", () => {
    const behaviorIntent = { behaviorStyle: "balanced" as const, tone: "friendly" as const, line: "Ready for the next quest.", suggestedBehaviorBias: [] };
    const baseFallback = createManagerFallbackForTest();
    const fallback: ManagerLlmOutputFallback = {
      ...baseFallback,
      nextQuest: { nextQuest: quest, updatedPlan: plan, capacityAssessment: requestBody().dailyCapacity, managerLine: behaviorIntent.line, behaviorIntent },
    };
    const request = parseManagerLlmRequest(requestBody());
    const invalidQuest = { ...quest, linkedMilestoneId: "missing-milestone", linkedWeeklyPlanId: "missing-week" };
    const result = resolveManagerLlmOutput({
      outputKind: "nextQuest",
      rawOutput: {
        nextQuest: {
          nextQuest: invalidQuest,
          updatedPlan: plan,
          capacityAssessment: requestBody().dailyCapacity,
          managerLine: behaviorIntent.line,
          behaviorIntent,
        },
      },
      fallback,
      request: request.ok ? request.data : undefined,
    });

    expect(result.data.source).toBe("rule_fallback");
  });
});

function createManagerFallbackForTest(): ManagerLlmOutputFallback {
  return {
    managerLine: "다음 행동을 준비했어.",
    difficultyEvaluation: { difficulty: "normal", rewardExp: 20, reason: "테스트" },
    behaviorIntent: { behaviorStyle: "balanced", tone: "friendly", line: "다음 행동을 준비했어.", suggestedBehaviorBias: [] },
    statEvaluation: { difficulty: "normal", statBudget: 7, primaryStats: ["diligence"], statDeltas: [{ stat: "diligence", amount: 5 }, { stat: "stamina", amount: 2 }], reason: "테스트" },
  };
}
