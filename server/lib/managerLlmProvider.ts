import { managerLlmPromptVersion, type ManagerLlmOutputKind, type ManagerLlmRequest } from "../contracts/managerLlm.js";
import type { ManagerLlmProvider, ManagerLlmRateLimiter, ManagerLlmRuntime } from "../routes/managerLlm.js";

export const managerLlmEnvNames = { apiKey: "OPENAI_API_KEY", model: "OPENAI_MODEL", fallbackModel: "OPENAI_FALLBACK_MODEL", enabled: "LLM_MANAGER_ENABLED", minIntervalMs: "LLM_MANAGER_MIN_INTERVAL_MS", dailyLimit: "LLM_MANAGER_DAILY_LIMIT" } as const;
export interface OpenAiManagerLlmConfig { apiKey: string; model: string; fallbackModel: string }
const defaultModel = "gpt-5-nano";
const defaultFallbackModel = "gpt-5-mini";

export function createManagerLlmRuntimeFromEnv(getEnv: (name: string) => string | undefined, fetchFn: typeof fetch = fetch): ManagerLlmRuntime {
  const apiKey = getEnv(managerLlmEnvNames.apiKey)?.trim();
  if (getEnv(managerLlmEnvNames.enabled)?.trim().toLowerCase() !== "true" || !apiKey) return { enabled: false };
  return { enabled: true, provider: createOpenAiManagerLlmProvider({ apiKey, model: getEnv(managerLlmEnvNames.model)?.trim() || defaultModel, fallbackModel: getEnv(managerLlmEnvNames.fallbackModel)?.trim() || defaultFallbackModel }, fetchFn), rateLimiter: createInMemoryManagerLlmRateLimiter({ minIntervalMs: readPositiveInteger(getEnv(managerLlmEnvNames.minIntervalMs), 30_000), dailyLimit: readPositiveInteger(getEnv(managerLlmEnvNames.dailyLimit), 80) }) };
}

export function createOpenAiManagerLlmProvider(config: OpenAiManagerLlmConfig, fetchFn: typeof fetch = fetch): ManagerLlmProvider {
  return { async generate(request) {
    const response = await fetchFn("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model: isPlanningKind(request.outputKind) ? config.fallbackModel : config.model, messages: [{ role: "system", content: createSystemPrompt(request) }, { role: "user", content: JSON.stringify(toPromptInput(request)) }], tools: [{ type: "function", function: { name: "emit_manager_result", description: "Return the requested manager output.", strict: true, parameters: createOutputSchema(request.outputKind) } }], tool_choice: { type: "function", function: { name: "emit_manager_result" } }, parallel_tool_calls: false }) });
    if (!response.ok) throw new Error(await readOpenAiError(response));
    return parseOpenAiToolArguments(await response.json());
  } };
}

export function createInMemoryManagerLlmRateLimiter(input: { minIntervalMs: number; dailyLimit: number; now?: () => Date }): ManagerLlmRateLimiter {
  const now = input.now ?? (() => new Date()); let day = ""; let calls = 0; const last: Partial<Record<ManagerLlmOutputKind, number>> = {};
  return { check(kind) { const current = now(); const key = current.toISOString().slice(0, 10); if (key !== day) { day = key; calls = 0; for (const item of Object.keys(last) as ManagerLlmOutputKind[]) delete last[item]; } const time = current.getTime(); if (calls >= input.dailyLimit || (last[kind] && time - last[kind]! < input.minIntervalMs)) return { allowed: false }; calls += 1; last[kind] = time; return { allowed: true }; } };
}

function isPlanningKind(kind: ManagerLlmOutputKind) { return kind === "goalPlan" || kind === "nextQuest" || kind === "planRebalance" || kind === "questAcceptancePreview"; }
function createSystemPrompt(request: ManagerLlmRequest): string {
  const common = [
    `You are the server-side electronic manager model for ${managerLlmPromptVersion}.`,
    "Return only the required tool call. Never expose secrets or implementation details.",
    "Use readable, gentle Korean and never blame the user. managerLine must fit in one or two short lines and stay within 96 characters.",
    "Preserve every explicit fact from rawGoalText. Put uncertain interpretations in assumptions or uncertainties and never invent personal facts.",
    "Base planning and quest decisions on rawGoalText, dailyMinutes, targetDate, GoalBrief, activePlan, detailed recentEvents, dailyCapacity, managerProgress, and questDraft semantics.",
    "dailyMinutes is a soft planning baseline, never a hard stop. Use it to size normal sessions, but allow intentional work beyond it.",
    "Always return a next quest when the user explicitly requests one, including when dailyCapacity is capacity_reached or over_capacity.",
    "QuestSpec.displayTitle is the visible concise title. QuestSpec.instruction is the actionable sentence. Do not copy client templates or decorate titles with duration and difficulty labels.",
    "persona.questStyle is compatibility-only. Never use persona.questStyle to choose difficulty, reward, or amount. Never use tracking mode alone for those decisions.",
  ];
  if (request.outputKind === "goalPlan") common.push(
    "Build a causal plan from finalGoal to milestones, weeklyPlans, a rolling seven-day focus, and exactly one currentQuest. Each node needs a concrete observable success criterion.",
    "Do not pre-generate a queue of concrete quests. rollingDays contains only focus and intended outcome; currentQuest is the only concrete quest.",
    "Return goal-plan-v3 with at most one structured clarification question containing 2-5 concise choices.",
    request.profile.clarificationAnswer
      ? "clarificationAnswer is present; incorporate it and do not ask another question."
      : "Ask one clarification question only if the missing answer would materially change the plan; otherwise make a conservative assumption.",
  );
  if (request.outputKind === "nextQuest") common.push(
    "Review the remaining milestone and weekly horizon, update only justified future plan parts, and always return exactly one nextQuest.",
    "Use remainingMinutes as context, not validation. When the baseline is exceeded, consider fatigue and task variety while still honoring the explicit request.",
    "Return updatedPlan.currentQuest identical to nextQuest, plus the supplied capacity assessment, one short manager line, and matching behavior intent.",
  );
  if (request.outputKind === "planRebalance") common.push(
    "Review the entire remaining milestone and weekly horizon, then make the smallest justified changes to future nodes.",
    "Completed nodes and their IDs are immutable. Preserve them exactly. Explain changes using recent success, failure reason, actual duration, skipped days, or anomaly evidence.",
    "Return the full rebalancedPlan and one immediately actionable nextQuest with recoveryReason.",
  );
  if (request.outputKind === "questAcceptancePreview") common.push(
    "Judge the quest from its semantic task, purpose, completion criteria, expected output, constraints, prerequisites, time, domains, and recent evidence.",
    "Evaluate all six load factors independently before difficulty. EXP must stay in easy 5-15, normal 16-35, or hard 36-60.",
    "Stat budget must be 3 for easy, 7 for normal, and 15 for hard, distributed only to stats justified by the task.",
    "Return a finalized QuestSpec, six-factor assessment, difficulty, reward, stat evaluation, manager line, behavior intent, and reason.",
  );
  return common.join("\n");
}

function toPromptInput(request: ManagerLlmRequest) { return { promptVersion: request.promptVersion, outputKind: request.outputKind, managerContext: request.managerContext, profile: request.profile, persona: request.persona, managerProgress: request.managerProgress, questState: request.questState, recentEvents: request.recentEvents.slice(0, 12), dailyCapacity: request.dailyCapacity, questDraft: request.questDraft ?? null, triggerEventId: request.triggerEventId ?? null, activePlanId: request.activePlanId ?? null, activePlan: request.activePlan ?? null }; }

function createOutputSchema(kind: ManagerLlmOutputKind): Record<string, unknown> {
  if (kind === "managerLine") return obj(["managerLine"], { managerLine: str() });
  if (kind === "behaviorIntent") return obj(["behaviorIntent"], { behaviorIntent: behaviorSchema() });
  if (kind === "statEvaluation") return obj(["statEvaluation"], { statEvaluation: statSchema() });
  if (kind === "difficultyEvaluation") return obj(["difficultyEvaluation"], { difficultyEvaluation: obj(["difficulty", "rewardExp", "reason"], { difficulty: difficulty(), rewardExp: reward(), reason: str() }) });
  if (kind === "goalPlan") return obj(["goalPlan"], { goalPlan: planSchema() });
  if (kind === "nextQuest") return obj(["nextQuest"], { nextQuest: obj(["nextQuest", "updatedPlan", "capacityAssessment", "managerLine", "behaviorIntent"], { nextQuest: questSpecSchema(), updatedPlan: planSchema(), capacityAssessment: capacitySchema(), managerLine: str(), behaviorIntent: behaviorSchema() }) });
  if (kind === "planRebalance") return obj(["planRebalance"], { planRebalance: obj(["rebalancedPlan", "changes", "nextQuest"], { rebalancedPlan: planSchema(), changes: { type: "array", minItems: 1, maxItems: 20, items: obj(["scope", "reason", "before", "after"], { scope: { type: "string", enum: ["daily", "weekly", "milestone", "goal"] }, reason: { type: "string", enum: ["success_streak", "failure_time_shortage", "failure_too_hard", "skipped_days", "weekly_boundary", "anomaly", "recovery_completed", "daily_under_capacity", "daily_capacity_reached", "daily_over_capacity", "profile_changed"] }, before: str(), after: str() }) }, nextQuest: recoveryQuestSchema() }) });
  if (kind === "questAcceptancePreview") return obj(["questAcceptancePreview"], { questAcceptancePreview: obj(["finalizedQuest", "difficulty", "rewardExp", "statEvaluation", "reason", "assessment", "managerLine", "behaviorIntent"], { finalizedQuest: questSpecSchema(), difficulty: difficulty(), rewardExp: reward(), statEvaluation: statSchema(), reason: str(), assessment: assessmentSchema(), managerLine: str(), behaviorIntent: behaviorSchema() }) });
  return obj(["questSuggestion"], { questSuggestion: obj(["title", "type", "amount", "unit", "difficulty", "deadline", "rewardExp"], { title: str(), type: { type: "string", enum: ["time", "quantity", "action"] }, amount: { type: "integer", minimum: 1 }, unit: str(), difficulty: difficulty(), deadline: str(), rewardExp: reward() }) });
}

function planSchema() { return obj(["schemaVersion", "horizon", "goalBrief", "finalGoal", "milestones", "weeklyPlans", "rollingDays", "currentQuest", "risks", "rebalancingPolicy"], { schemaVersion: { type: "string", enum: ["goal-plan-v3"] }, horizon: { type: "string", enum: ["month", "quarter"] }, goalBrief: goalBriefSchema(), finalGoal: obj(["id", "statement", "successCriteria", "status"], { id: str(), statement: str(), successCriteria: stringArray(1, 10), status: status() }), milestones: { type: "array", minItems: 1, maxItems: 24, items: obj(["id", "parentGoalId", "statement", "targetWeek", "successCriteria", "status"], { id: str(), parentGoalId: str(), statement: str(), targetWeek: { type: "integer", minimum: 1, maximum: 52 }, successCriteria: stringArray(1, 10), status: status() }) }, weeklyPlans: { type: "array", minItems: 4, maxItems: 52, items: obj(["id", "weekIndex", "milestoneIds", "statement", "targetOutcome", "successCriteria", "status"], { id: str(), weekIndex: { type: "integer", minimum: 1, maximum: 52 }, milestoneIds: stringArray(1, 12), statement: str(), targetOutcome: str(), successCriteria: stringArray(1, 10), status: status() }) }, rollingDays: { type: "array", minItems: 1, maxItems: 7, items: obj(["dayOffset", "focus", "intendedOutcome", "status"], { dayOffset: { type: "integer", minimum: 0, maximum: 6 }, focus: str(), intendedOutcome: str(), status: status() }) }, currentQuest: questSpecSchema(), risks: stringArray(0, 12), rebalancingPolicy: obj(["onSuccess", "onFailureTimeShortage", "onFailureTooHard", "onSkippedDays", "onAnomaly"], { onSuccess: str(), onFailureTimeShortage: str(), onFailureTooHard: str(), onSkippedDays: str(), onAnomaly: str() }) }); }
function goalBriefSchema() { return obj(["normalizedGoal", "targetOutcome", "currentState", "deadline", "constraints", "preferences", "inferredDomains", "assumptions", "uncertainties", "confidence", "clarificationQuestion"], { normalizedGoal: { type: "string", maxLength: 240 }, targetOutcome: nullableString(), currentState: nullableString(), deadline: nullableString(), constraints: stringArray(0, 10), preferences: stringArray(0, 10), inferredDomains: domains(), assumptions: stringArray(0, 10), uncertainties: stringArray(0, 10), confidence: { type: "number", minimum: 0, maximum: 1 }, clarificationQuestion: { type: ["object", "null"], additionalProperties: false, required: ["question", "options"], properties: { question: str(), options: stringArray(2, 5) } } }); }
function questSpecSchema() { return obj(["id", "displayTitle", "instruction", "purpose", "completionCriteria", "estimatedMinutes", "expectedOutput", "environmentConstraints", "prerequisites", "linkedMilestoneId", "linkedWeeklyPlanId", "adaptationReason", "status", "tracking"], { id: str(), displayTitle: str(), instruction: str(), purpose: str(), completionCriteria: stringArray(1, 10), estimatedMinutes: { type: "integer", minimum: 1, maximum: 480 }, expectedOutput: nullableString(), environmentConstraints: stringArray(0, 10), prerequisites: stringArray(0, 10), linkedMilestoneId: str(), linkedWeeklyPlanId: str(), adaptationReason: nullableString(), status: status(), tracking: obj(["mode", "targetAmount", "targetUnit"], { mode: { type: "string", enum: ["timer", "counter", "check"] }, targetAmount: { type: ["number", "null"], exclusiveMinimum: 0 }, targetUnit: nullableString() }) }); }
function capacitySchema() { return obj(["localDate", "baselineMinutes", "reservedMinutes", "usedMinutes", "successfulMinutes", "remainingMinutes", "varianceMinutes", "utilizationRatio", "status", "bonusAwarded"], { localDate: str(), baselineMinutes: { type: "integer", minimum: 1, maximum: 1440 }, reservedMinutes: { type: "integer", minimum: 0 }, usedMinutes: { type: "integer", minimum: 0 }, successfulMinutes: { type: "integer", minimum: 0 }, remainingMinutes: { type: "number" }, varianceMinutes: { type: "number" }, utilizationRatio: { type: "number", minimum: 0 }, status: { type: "string", enum: ["no_activity", "under_capacity", "capacity_reached", "over_capacity"] }, bonusAwarded: { type: "boolean" } }); }
function recoveryQuestSchema() { const base = questSpecSchema() as { required: string[]; properties: Record<string, unknown> }; return obj([...base.required, "recoveryReason"], { ...base.properties, recoveryReason: str() }); }
function assessmentSchema() { return obj(["taskDomains", "timeLoad", "cognitiveLoad", "physicalLoad", "skillNovelty", "outputComplexity", "recoveryRisk", "reason"], { taskDomains: domains(), timeLoad: factor(), cognitiveLoad: factor(), physicalLoad: factor(), skillNovelty: factor(), outputComplexity: factor(), recoveryRisk: factor(), reason: str() }); }
function behaviorSchema() { return obj(["behaviorStyle", "tone", "line", "suggestedBehaviorBias"], { behaviorStyle: { type: "string", enum: ["balanced", "adventurous", "shy"] }, tone: { type: "string", enum: ["calm", "friendly", "firm"] }, line: str(), suggestedBehaviorBias: { type: "array", maxItems: 10, items: obj(["state", "weightDelta", "reason"], { state: { type: "string", enum: ["idle", "wander", "approach_ladder", "climb_ladder", "approach_platform", "jump_to_platform", "hide_behind_window", "hang_on_window", "escape_window", "rest"] }, weightDelta: { type: "integer", minimum: -2, maximum: 2 }, reason: str() }) } }); }
function statSchema() { const keys = ["diligence", "persistence", "creativity", "knowledge", "strength", "agility", "stamina", "charm"]; return obj(["difficulty", "statBudget", "primaryStats", "statDeltas", "reason"], { difficulty: difficulty(), statBudget: { type: "integer", enum: [3, 7, 15] }, primaryStats: { type: "array", items: { type: "string", enum: keys } }, statDeltas: { type: "array", items: obj(["stat", "amount"], { stat: { type: "string", enum: keys }, amount: { type: "integer", minimum: 1 } }) }, reason: str() }); }
function obj(required: string[], properties: Record<string, unknown>) { return { type: "object", additionalProperties: false, required, properties }; }
function str() { return { type: "string" }; }
function nullableString() { return { type: ["string", "null"] }; }
function stringArray(minItems: number, maxItems: number) { return { type: "array", minItems, maxItems, items: str() }; }
function domains() { return { type: "array", minItems: 1, maxItems: 8, items: { type: "string", enum: ["study", "exam", "exercise", "cooking", "creative", "career", "habit", "general"] } }; }
function difficulty() { return { type: "string", enum: ["easy", "normal", "hard"] }; }
function reward() { return { type: "integer", minimum: 5, maximum: 60 }; }
function status() { return { type: "string", enum: ["planned", "active", "completed", "adjusted", "skipped"] }; }
function factor() { return { type: "integer", minimum: 1, maximum: 5 }; }
function parseOpenAiToolArguments(value: unknown): unknown { const choice = arr(rec(value)?.choices)[0]; const message = rec(rec(choice)?.message); const call = arr(message?.tool_calls)[0]; const fn = rec(rec(call)?.function); const args = typeof fn?.arguments === "string" ? fn.arguments : null; if (args) return JSON.parse(args) as unknown; const content = typeof message?.content === "string" ? message.content : null; if (content) return JSON.parse(content) as unknown; throw new Error("OpenAI response did not include tool arguments."); }
async function readOpenAiError(response: Response): Promise<string> { try { const payload = rec(await response.json()); const error = rec(payload?.error); const code = typeof error?.code === "string" ? error.code : "unknown"; const param = typeof error?.param === "string" ? error.param : "none"; const message = typeof error?.message === "string" ? error.message.slice(0, 320) : "No provider message."; return `OpenAI request failed: ${response.status} code=${code} param=${param} message=${message}`; } catch { return `OpenAI request failed: ${response.status}`; } }
function rec(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function arr(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function readPositiveInteger(value: string | undefined, fallback: number) { const parsed = Number(value); return value && Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; }
