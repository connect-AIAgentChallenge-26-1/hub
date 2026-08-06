import { describe, expect, it } from "vitest";
import { managerLlmPromptVersion, type ManagerLlmRequest } from "../contracts/managerLlm";
import { createManagerLlmFallback } from "./managerLlmFallback";
import { createSupabaseManagerPlanStore } from "./supabase";

const request: ManagerLlmRequest = {
  promptVersion: managerLlmPromptVersion,
  outputKind: "goalPlan",
  managerContext: { currentMood: "waiting", recentEventCount: 0, lastQuestResult: null, memorySummary: "기록 없음", rewardHints: [] },
  profile: { nickname: "루카스", rawGoalText: "백엔드 포트폴리오 만들기", dailyMinutes: 30, targetDate: "2026-09-30", managerTone: "friendly", clarificationAnswer: "README" },
  persona: { petId: "pink-manager", tone: "friendly", questStyle: "balanced", feedbackStyle: "playful", behaviorStyle: "balanced" },
  managerProgress: { level: 1, stats: { diligence: 0, persistence: 0, creativity: 0, knowledge: 0, strength: 0, agility: 0, stamina: 0, charm: 0 } },
  questState: { status: "draft" },
  recentEvents: [],
  dailyCapacity: { localDate: "2026-08-07", baselineMinutes: 30, reservedMinutes: 0, usedMinutes: 0, successfulMinutes: 0, remainingMinutes: 30, varianceMinutes: -30, utilizationRatio: 0, status: "no_activity", bonusAwarded: false },
};

describe("supabase manager plan v3 store", () => {
  it("stores a v3 snapshot and calls the atomic revision RPC", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response(JSON.stringify([{ id: "row-1", created_at: "2026-08-06T00:00:00.000Z" }]), { status: 201, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const fallback = createManagerLlmFallback(request);
      const store = createSupabaseManagerPlanStore({ url: "https://example.supabase.co", serviceRoleKey: "test-key" });
      await store.saveGoalPlan({ rawGoalText: request.profile.rawGoalText, dailyMinutes: 30, targetDate: "2026-09-30", managerTone: "friendly", nickname: "루카스", clarificationAnswer: "README", source: "llm", promptVersion: managerLlmPromptVersion, goalPlan: fallback.goalPlan! });
      await store.savePlanRevision({ planId: "row-1", triggerEventId: "11111111-1111-1111-1111-111111111111", rawGoalText: request.profile.rawGoalText, source: "rule_fallback", fallbackReason: "LLM_DISABLED", promptVersion: managerLlmPromptVersion, rebalance: fallback.planRebalance! });
    } finally { globalThis.fetch = originalFetch; }

    expect(calls.map((call) => call.url)).toEqual(["https://example.supabase.co/rest/v1/manager_goal_plans", "https://example.supabase.co/rest/v1/rpc/append_manager_plan_revision_v3"]);
    expect(calls[0]?.body).toMatchObject({ raw_goal_text: request.profile.rawGoalText, plan_version: 3, goal_brief_json: expect.any(Object), plan_json: expect.objectContaining({ schemaVersion: "goal-plan-v3" }) });
    expect(calls[0]?.body).not.toHaveProperty("category");
    expect(calls[1]?.body).toMatchObject({ p_plan_id: "row-1", p_trigger_event_id: "11111111-1111-1111-1111-111111111111", p_after_plan_json: expect.objectContaining({ schemaVersion: "goal-plan-v3" }), p_goal_brief_json: expect.any(Object), p_next_quest_json: expect.objectContaining({ recoveryReason: expect.any(String) }) });
  });
});
