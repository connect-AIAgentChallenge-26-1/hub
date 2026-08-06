import { describe, expect, it } from "vitest";
import {
  managerLlmPromptVersion,
  requestManagerLlmOutputViaApi,
  requestManagerBehaviorIntentViaApi,
  requestManagerDifficultyEvaluationViaApi,
  requestManagerGoalPlanViaApi,
  requestManagerLineViaApi,
  requestManagerNextQuestViaApi,
  requestManagerPlanRebalanceViaApi,
  requestManagerQuestAcceptancePreviewViaApi,
  requestManagerQuestSuggestionViaApi,
  requestManagerStatEvaluationViaApi,
  type ManagerLlmRequest,
} from "./managerLlmApi";

const baseRequest: ManagerLlmRequest = {
  promptVersion: managerLlmPromptVersion,
  outputKind: "behaviorIntent",
  managerContext: {
    currentMood: "waiting",
    recentEventCount: 0,
    lastQuestResult: null,
    memorySummary: "no events",
    rewardHints: [],
  },
  profile: {
    nickname: "tester",
    rawGoalText: "certification study",
    dailyMinutes: 30,
    targetDate: "2026-12-01",
    managerTone: "friendly",
  },
  persona: {
    petId: "pink-manager",
    tone: "friendly",
    questStyle: "balanced",
    feedbackStyle: "playful",
    behaviorStyle: "balanced",
  },
  questState: { status: "draft" },
  recentEvents: [],
  managerProgress: {
    level: 1,
    stats: { diligence: 0, persistence: 0, creativity: 0, knowledge: 0, strength: 0, agility: 0, stamina: 0, charm: 0 },
  },
  dailyCapacity: {
    localDate: "2026-08-07",
    baselineMinutes: 180,
    reservedMinutes: 0,
    usedMinutes: 190,
    successfulMinutes: 180,
    remainingMinutes: -10,
    varianceMinutes: 10,
    utilizationRatio: 190 / 180,
    status: "over_capacity",
    bonusAwarded: true,
  },
};

const questSpecV3 = {
  id: "d1",
  displayTitle: "스쿼트 자세 기준 세우기",
  instruction: "빈 봉으로 스쿼트 3세트를 촬영하고 무릎과 허리 위치를 확인한다.",
  purpose: "안전한 기본 자세를 익힌다.",
  completionCriteria: ["3세트 촬영", "교정할 점 1개 기록"],
  expectedOutput: "자세 영상 3개와 교정 메모 1개",
  estimatedMinutes: 25,
  environmentConstraints: [],
  prerequisites: [],
  linkedMilestoneId: "m1",
  linkedWeeklyPlanId: "w1",
  status: "planned",
  tracking: { mode: "timer", targetAmount: 25, targetUnit: "min" },
} as const;

const goalPlanV2 = {
  schemaVersion: "goal-plan-v3",
  horizon: "month",
  goalBrief: {
    normalizedGoal: "Build strength safely",
    targetOutcome: "Complete a consistent strength routine",
    constraints: [],
    preferences: [],
    inferredDomains: ["exercise"],
    assumptions: [],
    uncertainties: [],
    confidence: 0.9,
  },
  finalGoal: { id: "goal-1", statement: "Build strength safely", successCriteria: ["Train consistently"], status: "active" },
  milestones: [{ id: "m1", parentGoalId: "goal-1", statement: "Build a base routine", targetWeek: 1, successCriteria: ["3 sessions"], status: "active" }],
  weeklyPlans: [{ id: "w1", weekIndex: 1, milestoneIds: ["m1"], statement: "Learn form", targetOutcome: "3 sessions", successCriteria: ["Finish safely"], status: "active" }],
  rollingDays: [{ dayOffset: 0, focus: "기본 자세 확인", intendedOutcome: "교정점 1개 확인", status: "active" }],
  currentQuest: questSpecV3,
  risks: ["fatigue"],
  rebalancingPolicy: {
    onSuccess: "increase one variable",
    onFailureTimeShortage: "shorten session",
    onFailureTooHard: "simplify completion criteria",
    onSkippedDays: "restart easy",
    onAnomaly: "review the affected future plan",
  },
} as const;

function createFetchResponse(data: Record<string, unknown>, capture: string[]) {
  const fetchFn: typeof fetch = async (url) => {
    capture.push(String(url));
    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return fetchFn;
}

describe("manager LLM API client", () => {
  it("calls the server behavior intent route instead of a provider URL", async () => {
    const capturedUrls: string[] = [];
    const result = await requestManagerBehaviorIntentViaApi(baseRequest, createFetchResponse({
      behaviorIntent: {
        behaviorStyle: "balanced",
        tone: "friendly",
        line: "server line",
        suggestedBehaviorBias: [],
      },
      source: "llm",
      promptVersion: managerLlmPromptVersion,
    }, capturedUrls));

    expect(capturedUrls).toEqual(["/api/manager/behavior-intent"]);
    expect(result.behaviorIntent.line).toBe("server line");
    expect(result.source).toBe("llm");
  });

  it("has typed helpers for all manager LLM output routes", async () => {
    const capturedUrls: string[] = [];

    await requestManagerLineViaApi(baseRequest, createFetchResponse({
      managerLine: "line",
      source: "llm",
      promptVersion: managerLlmPromptVersion,
    }, capturedUrls));
    await requestManagerQuestSuggestionViaApi(baseRequest, createFetchResponse({
      questSuggestion: {
        title: "Study 15 min",
        type: "time",
        amount: 15,
        unit: "min",
        difficulty: "normal",
        deadline: "today 23:59",
        rewardExp: 16,
      },
      source: "llm",
      promptVersion: managerLlmPromptVersion,
    }, capturedUrls));
    await requestManagerStatEvaluationViaApi(baseRequest, createFetchResponse({
      statEvaluation: {
        difficulty: "normal",
        statBudget: 7,
        primaryStats: ["knowledge"],
        statDeltas: [
          { stat: "knowledge", amount: 5 },
          { stat: "diligence", amount: 2 },
        ],
        reason: "study quest",
      },
      source: "llm",
      promptVersion: managerLlmPromptVersion,
    }, capturedUrls));
    await requestManagerDifficultyEvaluationViaApi(baseRequest, createFetchResponse({
      difficultyEvaluation: {
        difficulty: "hard",
        rewardExp: 40,
        reason: "large edited quest",
      },
      source: "llm",
      promptVersion: managerLlmPromptVersion,
    }, capturedUrls));

    expect(capturedUrls).toEqual([
      "/api/manager/line",
      "/api/manager/quest-suggestion",
      "/api/manager/stat-evaluation",
      "/api/manager/difficulty-evaluation",
    ]);
  });

  it("falls back locally instead of repeatedly calling the same output kind inside the client throttle window", async () => {
    const capturedUrls: string[] = [];
    const first = await requestManagerLlmOutputViaApi(
      { ...baseRequest, outputKind: "managerLine" },
      createFetchResponse({
        managerLine: "fresh line",
        source: "llm",
        promptVersion: managerLlmPromptVersion,
      }, capturedUrls),
      { nowMs: 10_000, throttleMs: 60_000 },
    );
    const second = await requestManagerLlmOutputViaApi(
      { ...baseRequest, outputKind: "managerLine" },
      createFetchResponse({
        managerLine: "should not call",
        source: "llm",
        promptVersion: managerLlmPromptVersion,
      }, capturedUrls),
      { nowMs: 20_000, throttleMs: 60_000 },
    );

    expect(first.source).toBe("llm");
    expect(second).toMatchObject({
      source: "rule_fallback",
      fallbackReason: "CLIENT_THROTTLED",
      managerLine: "fresh line",
    });
    expect(capturedUrls).toEqual(["/api/manager/line"]);
  });

  it("allows a changed request fingerprint inside the throttle window", async () => {
    const capturedUrls: string[] = [];
    const fetchFn = createFetchResponse({
      managerLine: "updated line",
      source: "llm",
      promptVersion: managerLlmPromptVersion,
    }, capturedUrls);

    await requestManagerLlmOutputViaApi({ ...baseRequest, outputKind: "managerLine" }, fetchFn, { nowMs: 310_000 });
    await requestManagerLlmOutputViaApi({
      ...baseRequest,
      outputKind: "managerLine",
      profile: { ...baseRequest.profile, rawGoalText: "a different goal" },
    }, fetchFn, { nowMs: 320_000 });

    expect(capturedUrls).toEqual(["/api/manager/line", "/api/manager/line"]);
  });

  it("calls the goal plan and quest acceptance preview routes", async () => {
    const capturedUrls: string[] = [];
    await requestManagerGoalPlanViaApi(baseRequest, createFetchResponse({
      goalPlan: goalPlanV2,
      source: "llm",
      promptVersion: managerLlmPromptVersion,
    }, capturedUrls), { throttleMs: 0 });

    await requestManagerQuestAcceptancePreviewViaApi(baseRequest, createFetchResponse({
      questAcceptancePreview: {
        finalizedQuest: goalPlanV2.currentQuest,
        difficulty: "easy",
        rewardExp: 8,
        statEvaluation: {
          difficulty: "easy",
          statBudget: 3,
          primaryStats: ["diligence"],
          statDeltas: [{ stat: "diligence", amount: 3 }],
          reason: "short task",
        },
        reason: "short task",
        assessment: {
          taskDomains: ["exercise"],
          timeLoad: 1,
          cognitiveLoad: 1,
          physicalLoad: 2,
          skillNovelty: 2,
          outputComplexity: 1,
          recoveryRisk: 1,
          reason: "short form practice",
        },
        managerLine: "자세에 집중해서 천천히 해보자.",
        behaviorIntent: {
          behaviorStyle: "balanced",
          tone: "friendly",
          line: "자세에 집중해서 천천히 해보자.",
          suggestedBehaviorBias: [],
        },
      },
      source: "llm",
      promptVersion: managerLlmPromptVersion,
    }, capturedUrls), { throttleMs: 0 });

    expect(capturedUrls).toEqual(["/api/manager/goal-plan", "/api/manager/quest-acceptance-preview"]);
  });

  it("calls the plan rebalance route and returns the next quest", async () => {
    const capturedUrls: string[] = [];
    const result = await requestManagerPlanRebalanceViaApi(baseRequest, createFetchResponse({
      planRebalance: {
        rebalancedPlan: goalPlanV2,
        changes: [{ scope: "daily", reason: "failure_too_hard", before: "45 min", after: "10 min" }],
        nextQuest: {
          ...goalPlanV2.currentQuest,
          recoveryReason: "lowered after difficulty failure",
        },
      },
      source: "llm",
      promptVersion: managerLlmPromptVersion,
    }, capturedUrls), { throttleMs: 0 });

    expect(capturedUrls).toEqual(["/api/manager/plan-rebalance"]);
    expect(result.planRebalance.nextQuest).toMatchObject({
      displayTitle: "스쿼트 자세 기준 세우기",
      recoveryReason: "lowered after difficulty failure",
    });
  });

  it("requests and returns another quest even after the daily baseline is exceeded", async () => {
    const capturedUrls: string[] = [];
    const result = await requestManagerNextQuestViaApi(baseRequest, createFetchResponse({
      nextQuest: {
        nextQuest: questSpecV3,
        updatedPlan: goalPlanV2,
        capacityAssessment: {
          status: "over_capacity",
          fatigueRisk: "high",
          rationale: "기준 시간을 넘겼지만 사용자가 다음 퀘스트를 요청했다.",
        },
        managerLine: "더 이어가되, 자세가 흐트러지면 바로 쉬자.",
        behaviorIntent: {
          behaviorStyle: "balanced",
          tone: "friendly",
          line: "더 이어가되, 자세가 흐트러지면 바로 쉬자.",
          suggestedBehaviorBias: [],
        },
      },
      source: "llm",
      promptVersion: managerLlmPromptVersion,
    }, capturedUrls), { throttleMs: 0 });

    expect(capturedUrls).toEqual(["/api/manager/next-quest"]);
    expect(result.nextQuest.nextQuest.displayTitle).toBe("스쿼트 자세 기준 세우기");
  });
});
