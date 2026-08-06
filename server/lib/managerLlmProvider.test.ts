import { describe, expect, it } from "vitest";
import { managerLlmPromptVersion, type ManagerLlmRequest } from "../contracts/managerLlm";
import { createInMemoryManagerLlmRateLimiter, createManagerLlmRuntimeFromEnv, managerLlmEnvNames } from "./managerLlmProvider";

const request: ManagerLlmRequest = {
  promptVersion: managerLlmPromptVersion,
  outputKind: "managerLine",
  managerContext: { currentMood: "waiting", recentEventCount: 0, lastQuestResult: null, memorySummary: "기록 없음", rewardHints: [] },
  profile: { nickname: "루카스", rawGoalText: "백엔드 포트폴리오 만들기", dailyMinutes: 30, targetDate: null, managerTone: "friendly" },
  persona: { petId: "pink-manager", tone: "friendly", questStyle: "balanced", feedbackStyle: "playful", behaviorStyle: "balanced" },
  managerProgress: { level: 1, stats: { diligence: 0, persistence: 0, creativity: 0, knowledge: 0, strength: 0, agility: 0, stamina: 0, charm: 0 } },
  questState: { status: "draft" },
  recentEvents: [],
  dailyCapacity: { localDate: "2026-08-07", baselineMinutes: 30, reservedMinutes: 0, usedMinutes: 0, successfulMinutes: 0, remainingMinutes: 30, varianceMinutes: -30, utilizationRatio: 0, status: "no_activity", bonusAwarded: false },
};

function createRuntime(capture: (body: Record<string, unknown>) => void) {
  const fetchFn: typeof fetch = async (_url, init) => {
    capture(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify({ managerLine: "작게 시작해 보자." }) } }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return createManagerLlmRuntimeFromEnv((name) => name === managerLlmEnvNames.enabled ? "true" : name === managerLlmEnvNames.apiKey ? "test-key" : undefined, fetchFn);
}

function getToolParameters(body: Record<string, unknown>) {
  return (body as { tools: Array<{ function: { parameters: { properties: Record<string, unknown> } } }> }).tools[0]!.function.parameters;
}

describe("manager LLM v3 provider", () => {
  it("stays disabled without a key", () => {
    expect(createManagerLlmRuntimeFromEnv((name) => name === managerLlmEnvNames.enabled ? "true" : undefined).enabled).toBe(false);
  });

  it("uses only approved semantic inputs and explicitly ignores questStyle for amount and difficulty", async () => {
    let captured: Record<string, unknown> = {};
    const runtime = createRuntime((body) => { captured = body; });
    await runtime.provider?.generate({ ...request, outputKind: "goalPlan" });
    const prompt = (captured.messages as Array<{ content: string }>).map((message) => message.content).join("\n");
    expect(prompt).toContain("dailyMinutes is a soft planning baseline, never a hard stop");
    expect(prompt).toContain("Always return a next quest when the user explicitly requests one");
    expect(prompt).toContain("persona.questStyle is compatibility-only");
    expect(prompt).toContain("Never use persona.questStyle to choose difficulty, reward, or amount");
  });

  it("requires the goal-plan-v3 rolling focus and one current semantic quest", async () => {
    let captured: Record<string, unknown> = {};
    const runtime = createRuntime((body) => { captured = body; });
    await runtime.provider?.generate({ ...request, outputKind: "goalPlan" });
    const parameters = getToolParameters(captured);
    const plan = parameters.properties.goalPlan as { required: string[]; properties: Record<string, { maxItems?: number; items?: { properties: Record<string, unknown> }; properties?: Record<string, unknown> }> };
    expect(captured).toMatchObject({ model: "gpt-5-mini" });
    expect(plan.required).toEqual(["schemaVersion", "horizon", "goalBrief", "finalGoal", "milestones", "weeklyPlans", "rollingDays", "currentQuest", "risks", "rebalancingPolicy"]);
    expect(plan.properties.rollingDays.maxItems).toBe(7);
    expect(plan.properties.currentQuest.properties).toHaveProperty("displayTitle");
    expect(plan.properties.currentQuest.properties).toHaveProperty("instruction");
    expect(plan.properties.currentQuest.properties).not.toHaveProperty("taskStatement");
    const goalBrief = plan.properties.goalBrief as { properties: { clarificationQuestion: { properties: Record<string, unknown> } } };
    expect(goalBrief.properties.clarificationQuestion.properties).toEqual(expect.objectContaining({ question: expect.any(Object), options: expect.any(Object) }));
  });

  it("requires next-quest to return a quest even when capacity is already exceeded", async () => {
    let captured: Record<string, unknown> = {};
    const runtime = createRuntime((body) => { captured = body; });
    await runtime.provider?.generate({ ...request, outputKind: "nextQuest", dailyCapacity: { ...request.dailyCapacity, usedMinutes: 45, successfulMinutes: 30, remainingMinutes: -15, varianceMinutes: 15, utilizationRatio: 1.5, status: "over_capacity" } });
    const nextQuest = getToolParameters(captured).properties.nextQuest as { required: string[] };
    expect(nextQuest.required).toEqual(["nextQuest", "updatedPlan", "capacityAssessment", "managerLine", "behaviorIntent"]);
    const userInput = JSON.parse((captured.messages as Array<{ role: string; content: string }>).find((message) => message.role === "user")!.content);
    expect(userInput).toMatchObject({ dailyCapacity: { status: "over_capacity", remainingMinutes: -15 } });
  });

  it("forbids another question after clarificationAnswer", async () => {
    let captured: Record<string, unknown> = {};
    const runtime = createRuntime((body) => { captured = body; });
    await runtime.provider?.generate({ ...request, outputKind: "goalPlan", profile: { ...request.profile, clarificationAnswer: "README" } });
    const prompt = (captured.messages as Array<{ content: string }>).map((message) => message.content).join("\n");
    expect(prompt).toContain("clarificationAnswer is present");
    expect(prompt).toContain("do not ask another question");
  });

  it("requires six assessment factors and top-level reason in the integrated decision", async () => {
    let captured: Record<string, unknown> = {};
    const runtime = createRuntime((body) => { captured = body; });
    await runtime.provider?.generate({ ...request, outputKind: "questAcceptancePreview" });
    const preview = getToolParameters(captured).properties.questAcceptancePreview as { required: string[]; properties: { assessment: { required: string[] } } };
    expect(preview.required).toEqual(["finalizedQuest", "difficulty", "rewardExp", "statEvaluation", "reason", "assessment", "managerLine", "behaviorIntent"]);
    expect(preview.properties.assessment.required).toEqual(["taskDomains", "timeLoad", "cognitiveLoad", "physicalLoad", "skillNovelty", "outputComplexity", "recoveryRisk", "reason"]);
  });

  it("requires rebalancedPlan, expanded change enums, and recoveryReason", async () => {
    let captured: Record<string, unknown> = {};
    const runtime = createRuntime((body) => { captured = body; });
    await runtime.provider?.generate({ ...request, outputKind: "planRebalance", triggerEventId: "event-1" });
    const rebalance = getToolParameters(captured).properties.planRebalance as { required: string[]; properties: Record<string, unknown> };
    expect(rebalance.required).toEqual(["rebalancedPlan", "changes", "nextQuest"]);
    expect(JSON.stringify(rebalance)).toContain("weekly_boundary");
    expect(JSON.stringify(rebalance)).toContain("recovery_completed");
    expect(JSON.stringify(rebalance)).toContain("recoveryReason");
    const userInput = JSON.parse((captured.messages as Array<{ role: string; content: string }>).find((message) => message.role === "user")!.content);
    expect(userInput).toMatchObject({ triggerEventId: "event-1" });
  });

  it("applies rate limits per output kind", () => {
    const now = new Date("2026-08-06T00:00:00.000Z");
    const limiter = createInMemoryManagerLlmRateLimiter({ minIntervalMs: 30_000, dailyLimit: 10, now: () => now });
    expect(limiter.check("managerLine").allowed).toBe(true);
    expect(limiter.check("managerLine").allowed).toBe(false);
    expect(limiter.check("behaviorIntent").allowed).toBe(true);
  });
});
