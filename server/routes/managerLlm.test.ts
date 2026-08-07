import { describe, expect, it } from "vitest";
import { createApiApp } from "../app";
import { managerLlmPromptVersion } from "../contracts/managerLlm";
import { createMemoryQuestEventStore } from "../lib/questEventStore";

function createRequestBody() {
  return {
    promptVersion: managerLlmPromptVersion,
    outputKind: "goalPlan",
    managerContext: { currentMood: "waiting", recentEventCount: 0, lastQuestResult: null, memorySummary: "기록 없음", rewardHints: [] },
    profile: { nickname: "루카스", rawGoalText: "백엔드 포트폴리오 만들기", dailyMinutes: 180, targetDate: null, managerTone: "friendly" },
    persona: { petId: "pink-manager", tone: "friendly", questStyle: "balanced", feedbackStyle: "playful", behaviorStyle: "balanced" },
    managerProgress: { level: 1, stats: { diligence: 0, persistence: 0, creativity: 0, knowledge: 0, strength: 0, agility: 0, stamina: 0, charm: 0 } },
    questState: { status: "draft" },
    recentEvents: [],
    dailyCapacity: { localDate: "2026-08-07", baselineMinutes: 180, reservedMinutes: 0, usedMinutes: 0, successfulMinutes: 0, remainingMinutes: 180, varianceMinutes: -180, utilizationRatio: 0, status: "no_activity", bonusAwarded: false },
  };
}

describe("manager LLM v3 routes", () => {
  it("returns a provisional v3 plan without storing it before clarification", async () => {
    const storedPlans: unknown[] = [];
    const app = createApiApp(createMemoryQuestEventStore(), undefined, { enabled: false }, {
      async saveGoalPlan(input) { storedPlans.push(input); return { id: "plan-1", createdAt: "2026-08-07T00:00:00.000Z" }; },
      async savePlanRevision() { throw new Error("not expected"); },
    });
    const response = await app.request("/api/manager/goal-plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(createRequestBody()) });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, data: { source: "rule_fallback", promptVersion: "manager-api-v3", goalPlan: { schemaVersion: "goal-plan-v3", rollingDays: expect.any(Array), currentQuest: expect.any(Object), goalBrief: { clarificationQuestion: expect.any(Object) } } } });
    expect(payload.data).not.toHaveProperty("storedPlanId");
    expect(storedPlans).toEqual([]);
  });

  it("stores an accepted plan after the clarification answer", async () => {
    const storedPlans: unknown[] = [];
    const app = createApiApp(createMemoryQuestEventStore(), undefined, { enabled: false }, {
      async saveGoalPlan(input) { storedPlans.push(input); return { id: "plan-1", createdAt: "2026-08-07T00:00:00.000Z" }; },
      async savePlanRevision() { throw new Error("not expected"); },
    });
    const body = createRequestBody();
    const response = await app.request("/api/manager/goal-plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, profile: { ...body.profile, clarificationAnswer: "GitHub README" } }) });
    const payload = await response.json();
    expect(payload.data.storedPlanId).toBe("plan-1");
    expect(payload.data.goalPlan.goalBrief).not.toHaveProperty("clarificationQuestion");
    expect(storedPlans).toEqual([expect.objectContaining({ clarificationAnswer: "GitHub README" })]);
  });

  it("returns and persists a next quest even over the daily baseline", async () => {
    const revisions: unknown[] = [];
    const store = {
      async saveGoalPlan() { return { id: "plan-1", createdAt: "2026-08-07T00:00:00.000Z" }; },
      async savePlanRevision(input: unknown) { revisions.push(input); return { id: "revision-1", createdAt: "2026-08-07T01:00:00.000Z" }; },
    };
    const app = createApiApp(createMemoryQuestEventStore(), undefined, { enabled: false }, store);
    const body = createRequestBody();
    const goalResponse = await app.request("/api/manager/goal-plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, profile: { ...body.profile, clarificationAnswer: "README" } }) });
    const goalPayload = await goalResponse.json();
    const response = await app.request("/api/manager/next-quest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, outputKind: "nextQuest", activePlanId: "plan-1", triggerEventId: "event-1", activePlan: goalPayload.data.goalPlan, questDraft: goalPayload.data.goalPlan.currentQuest, dailyCapacity: { ...body.dailyCapacity, usedMinutes: 210, successfulMinutes: 180, remainingMinutes: -30, varianceMinutes: 30, utilizationRatio: 210 / 180, status: "over_capacity", bonusAwarded: true } }) });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ data: { nextQuest: { nextQuest: expect.any(Object), updatedPlan: { currentQuest: expect.any(Object) }, capacityAssessment: { status: "over_capacity" } }, storedRevisionId: "revision-1" } });
    expect(revisions).toHaveLength(1);
  });

  it("keeps the integrated acceptance route", async () => {
    const app = createApiApp(createMemoryQuestEventStore(), undefined, { enabled: false });
    const body = createRequestBody();
    const response = await app.request("/api/manager/quest-acceptance-preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, outputKind: "questAcceptancePreview" }) });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ data: { questAcceptancePreview: { finalizedQuest: expect.any(Object), difficulty: expect.any(String), rewardExp: expect.any(Number), statEvaluation: expect.any(Object), managerLine: expect.any(String), behaviorIntent: expect.any(Object) } } });
  });
});
