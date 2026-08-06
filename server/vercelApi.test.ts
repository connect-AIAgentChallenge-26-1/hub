import { describe, expect, it } from "vitest";
import api from "../api/[...route]";
import managerApi from "../api/manager/[route]";
import { managerLlmPromptVersion } from "./contracts/managerLlm";

describe("Vercel API entry", () => {
  it("serves the Hono health route through the Web fetch handler", async () => {
    const response = await api.fetch(new Request("https://example.test/api/health"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      api: "hono",
      storageMode: "memory",
      supabaseConfigured: false,
    });
  });

  it("serves manager LLM routes through the Vercel API entry", async () => {
    const response = await managerApi.fetch(
      new Request("https://example.test/api/manager/behavior-intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          promptVersion: managerLlmPromptVersion,
          outputKind: "behaviorIntent",
          managerContext: {
            currentMood: "waiting",
            recentEventCount: 0,
            lastQuestResult: null,
            memorySummary: "no recent event",
            rewardHints: [],
          },
          profile: {
            nickname: "Demo",
            rawGoalText: "Verify deployment",
            dailyMinutes: 30,
            targetDate: null,
            managerTone: "friendly",
          },
          persona: {
            petId: "pink-manager",
            tone: "friendly",
            questStyle: "balanced",
            feedbackStyle: "playful",
            behaviorStyle: "balanced",
          },
          managerProgress: {
            level: 1,
            stats: { diligence: 0, persistence: 0, creativity: 0, knowledge: 0, strength: 0, agility: 0, stamina: 0, charm: 0 },
          },
          questState: {
            status: "draft",
            currentQuest: {
              title: "Deployment smoke test",
              type: "time",
              amount: 15,
              unit: "minutes",
              difficulty: "normal",
              deadline: "today",
              rewardExp: 20,
            },
          },
          recentEvents: [],
          dailyCapacity: {
            localDate: "2026-08-07",
            baselineMinutes: 30,
            reservedMinutes: 0,
            usedMinutes: 0,
            successfulMinutes: 0,
            remainingMinutes: 30,
            varianceMinutes: -30,
            utilizationRatio: 0,
            status: "no_activity",
            bonusAwarded: false,
          },
        }),
      }),
    );

    expect(response.status).not.toBe(404);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        source: "rule_fallback",
        fallbackReason: "LLM_DISABLED",
        behaviorIntent: {
          behaviorStyle: "balanced",
        },
      },
    });
  });
});
