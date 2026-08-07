import type { ManagerBehaviorIntent } from "../../src/domain/managerBehaviorIntent.js";
import type { DailyCapacityContext } from "../../src/domain/dailyCapacityPolicy.js";
import type { ManagerStats } from "../../src/domain/statGrowth.js";
import { normalizeManagerStatEvaluation, type ManagerStatEvaluation } from "../../src/domain/statGrowth.js";
import { createErrorResponse, type ApiErrorResponse, type ManagerContext, type QuestDifficulty, type QuestEventResult, type QuestEventType } from "./questEvents.js";

export const managerLlmPromptVersion = "manager-api-v3" as const;

export type ManagerLlmOutputKind = "managerLine" | "questSuggestion" | "difficultyEvaluation" | "statEvaluation" | "behaviorIntent" | "goalPlan" | "nextQuest" | "planRebalance" | "questAcceptancePreview";
export type ManagerLlmSource = "llm" | "rule_fallback";
export type ManagerLlmFallbackReason = "LLM_DISABLED" | "LLM_PROVIDER_ERROR" | "INVALID_LLM_OUTPUT" | "RATE_LIMITED" | "CLIENT_THROTTLED";
export type ManagerLlmDomain = "study" | "exam" | "exercise" | "cooking" | "creative" | "career" | "habit" | "general";
export type ManagerPlanNodeStatus = "planned" | "active" | "completed" | "adjusted" | "skipped";
export type ManagerQuestDifficulty = "easy" | "normal" | "hard";
export type ManagerTone = "calm" | "friendly" | "firm";

export interface ManagerLlmProfileInput {
  nickname: string;
  rawGoalText: string;
  dailyMinutes: number;
  targetDate?: string | null;
  managerTone: ManagerTone;
  clarificationAnswer?: string;
}

export interface ManagerLlmPersonaInput {
  petId: string;
  tone: ManagerTone;
  questStyle: "tiny" | "balanced" | "challenge";
  feedbackStyle: "gentle" | "playful" | "direct";
  behaviorStyle: "balanced" | "adventurous" | "shy";
}

export interface ManagerLlmQuestInput {
  title: string;
  type: "time" | "quantity" | "action";
  amount: number;
  unit: string;
  difficulty: ManagerQuestDifficulty;
  deadline: string;
  rewardExp: number;
}

export interface ManagerLlmDifficultyEvaluation { difficulty: ManagerQuestDifficulty; rewardExp: number; reason: string }

export interface ManagerGoalBrief {
  normalizedGoal: string;
  targetOutcome?: string;
  currentState?: string;
  deadline?: string;
  constraints: string[];
  preferences: string[];
  inferredDomains: ManagerLlmDomain[];
  assumptions: string[];
  uncertainties: string[];
  confidence: number;
  clarificationQuestion?: { question: string; options: string[] };
}

export interface ManagerLlmQuestSpec {
  id: string;
  displayTitle: string;
  instruction: string;
  purpose: string;
  completionCriteria: string[];
  estimatedMinutes: number;
  expectedOutput?: string;
  environmentConstraints: string[];
  prerequisites: string[];
  linkedMilestoneId: string;
  linkedWeeklyPlanId: string;
  adaptationReason?: string;
  status: ManagerPlanNodeStatus;
  tracking: { mode: "timer" | "counter" | "check"; targetAmount?: number; targetUnit?: string };
}

export interface ManagerLlmRecoveryQuest extends ManagerLlmQuestSpec { recoveryReason: string }

export interface ManagerGoalPlan {
  schemaVersion: "goal-plan-v3";
  horizon: "month" | "quarter";
  goalBrief: ManagerGoalBrief;
  finalGoal: { id: string; statement: string; successCriteria: string[]; status: ManagerPlanNodeStatus };
  milestones: Array<{ id: string; parentGoalId: string; statement: string; targetWeek: number; successCriteria: string[]; status: ManagerPlanNodeStatus }>;
  weeklyPlans: Array<{ id: string; weekIndex: number; milestoneIds: string[]; statement: string; targetOutcome: string; successCriteria: string[]; status: ManagerPlanNodeStatus }>;
  rollingDays: Array<{ dayOffset: number; focus: string; intendedOutcome: string; status: ManagerPlanNodeStatus }>;
  currentQuest: ManagerLlmQuestSpec;
  risks: string[];
  rebalancingPolicy: { onSuccess: string; onFailureTimeShortage: string; onFailureTooHard: string; onSkippedDays: string; onAnomaly: string };
}

export interface ManagerPlanRebalance {
  rebalancedPlan: ManagerGoalPlan;
  changes: Array<{
    scope: "daily" | "weekly" | "milestone" | "goal";
    reason: "success_streak" | "failure_time_shortage" | "failure_too_hard" | "skipped_days" | "weekly_boundary" | "anomaly" | "recovery_completed" | "daily_under_capacity" | "daily_capacity_reached" | "daily_over_capacity" | "profile_changed";
    before: string;
    after: string;
  }>;
  nextQuest: ManagerLlmRecoveryQuest;
}

export interface ManagerNextQuestDecision {
  nextQuest: ManagerLlmQuestSpec;
  updatedPlan: ManagerGoalPlan;
  capacityAssessment: DailyCapacityContext;
  managerLine: string;
  behaviorIntent: ManagerBehaviorIntent;
}

export interface ManagerQuestAcceptancePreview {
  finalizedQuest: ManagerLlmQuestSpec;
  difficulty: ManagerQuestDifficulty;
  rewardExp: number;
  statEvaluation: ManagerStatEvaluation;
  reason: string;
  assessment: {
    taskDomains: ManagerLlmDomain[];
    timeLoad: 1 | 2 | 3 | 4 | 5;
    cognitiveLoad: 1 | 2 | 3 | 4 | 5;
    physicalLoad: 1 | 2 | 3 | 4 | 5;
    skillNovelty: 1 | 2 | 3 | 4 | 5;
    outputComplexity: 1 | 2 | 3 | 4 | 5;
    recoveryRisk: 1 | 2 | 3 | 4 | 5;
    reason: string;
  };
  managerLine: string;
  behaviorIntent: ManagerBehaviorIntent;
}

export const rewardExpRangeByDifficulty: Record<ManagerQuestDifficulty, { min: number; max: number }> = {
  easy: { min: 5, max: 15 }, normal: { min: 16, max: 35 }, hard: { min: 36, max: 60 },
};

export interface ManagerLlmQuestStateInput {
  status: "draft" | "active" | "success" | "failed" | "recovery";
  currentQuest?: ManagerLlmQuestInput;
  previousQuestTitle?: string | null;
  failureReason?: string | null;
}
export interface ManagerLlmRecentEventInput {
  type: QuestEventType;
  title: string;
  result: QuestEventResult | null;
  difficulty: QuestDifficulty;
  createdAt: string;
  failureReason?: string | null;
  actualDurationMinutes?: number;
  plannedEstimatedMinutes?: number;
  completionCriteria: string[];
  evaluationReason?: string;
}

export interface ManagerProgressInput { level: number; stats: ManagerStats }

export interface ManagerLlmRequest {
  promptVersion: typeof managerLlmPromptVersion;
  outputKind: ManagerLlmOutputKind;
  managerContext: ManagerContext;
  profile: ManagerLlmProfileInput;
  persona: ManagerLlmPersonaInput;
  managerProgress: ManagerProgressInput;
  questState: ManagerLlmQuestStateInput;
  recentEvents: ManagerLlmRecentEventInput[];
  dailyCapacity: DailyCapacityContext;
  questDraft?: ManagerLlmQuestSpec;
  triggerEventId?: string;
  activePlanId?: string | null;
  activePlan?: ManagerGoalPlan;
}

export interface ManagerLlmOutputFallback {
  managerLine: string;
  difficultyEvaluation: ManagerLlmDifficultyEvaluation;
  behaviorIntent: ManagerBehaviorIntent;
  statEvaluation: ManagerStatEvaluation;
  questSuggestion?: ManagerLlmQuestInput;
  goalPlan?: ManagerGoalPlan;
  nextQuest?: ManagerNextQuestDecision;
  planRebalance?: ManagerPlanRebalance;
  questAcceptancePreview?: ManagerQuestAcceptancePreview;
}

export interface ManagerLlmOutputData {
  managerLine?: string;
  questSuggestion?: ManagerLlmQuestInput;
  difficultyEvaluation?: ManagerLlmDifficultyEvaluation;
  statEvaluation?: ManagerStatEvaluation;
  behaviorIntent?: ManagerBehaviorIntent;
  goalPlan?: ManagerGoalPlan;
  nextQuest?: ManagerNextQuestDecision;
  planRebalance?: ManagerPlanRebalance;
  questAcceptancePreview?: ManagerQuestAcceptancePreview;
  source: ManagerLlmSource;
  fallbackReason?: ManagerLlmFallbackReason;
  promptVersion: typeof managerLlmPromptVersion;
  storedPlanId?: string;
  storedRevisionId?: string;
}

export interface ManagerLlmResponse { ok: true; data: ManagerLlmOutputData }
export type ManagerLlmApiResponse = ManagerLlmResponse | ApiErrorResponse;

export function parseManagerLlmRequest(value: unknown): { ok: true; data: ManagerLlmRequest } | ApiErrorResponse {
  if (!isRecord(value)) return createErrorResponse("VALIDATION_ERROR", "Request body must be an object.");
  if (value.promptVersion !== managerLlmPromptVersion) return createErrorResponse("VALIDATION_ERROR", "promptVersion is invalid.", { field: "promptVersion" });
  if (!isOutputKind(value.outputKind)) return createErrorResponse("VALIDATION_ERROR", "outputKind is invalid.", { field: "outputKind" });
  const managerContext = parseManagerContext(value.managerContext);
  const profile = parseProfile(value.profile);
  const persona = parsePersona(value.persona);
  const managerProgress = parseManagerProgress(value.managerProgress);
  const questState = parseQuestState(value.questState);
  const dailyCapacity = parseDailyCapacity(value.dailyCapacity);
  if (!managerContext) return createErrorResponse("VALIDATION_ERROR", "managerContext is invalid.", { field: "managerContext" });
  if (!profile) return createErrorResponse("VALIDATION_ERROR", "profile is invalid.", { field: "profile" });
  if (!persona) return createErrorResponse("VALIDATION_ERROR", "persona is invalid.", { field: "persona" });
  if (!managerProgress) return createErrorResponse("VALIDATION_ERROR", "managerProgress is invalid.", { field: "managerProgress" });
  if (!questState) return createErrorResponse("VALIDATION_ERROR", "questState is invalid.", { field: "questState" });
  if (!dailyCapacity) return createErrorResponse("VALIDATION_ERROR", "dailyCapacity is invalid.", { field: "dailyCapacity" });
  if (!Array.isArray(value.recentEvents)) return createErrorResponse("VALIDATION_ERROR", "recentEvents must be an array.", { field: "recentEvents" });
  const questDraft = value.questDraft === undefined ? undefined : parseQuestSpec(value.questDraft) ?? undefined;
  if (value.questDraft !== undefined && !questDraft) return createErrorResponse("VALIDATION_ERROR", "questDraft is invalid.", { field: "questDraft" });
  const activePlan = value.activePlan === undefined ? undefined : parseGoalPlan(value.activePlan) ?? undefined;
  if (value.activePlan !== undefined && !activePlan) return createErrorResponse("VALIDATION_ERROR", "activePlan is invalid.", { field: "activePlan" });
  const triggerEventId = optionalIdentifier(value.triggerEventId, 80);
  if (triggerEventId === null) return createErrorResponse("VALIDATION_ERROR", "triggerEventId is invalid.", { field: "triggerEventId" });
  return {
    ok: true,
    data: {
      promptVersion: managerLlmPromptVersion,
      outputKind: value.outputKind,
      managerContext,
      profile,
      persona,
      managerProgress,
      questState,
      recentEvents: value.recentEvents.slice(0, 12).flatMap(parseRecentEvent),
      dailyCapacity,
      ...(questDraft ? { questDraft } : {}),
      ...(triggerEventId ? { triggerEventId } : {}),
      activePlanId: nullableBoundedString(value.activePlanId, 80),
      activePlan,
    },
  };
}

export function resolveManagerLlmOutput(input: { outputKind: ManagerLlmOutputKind; rawOutput: unknown; fallback: ManagerLlmOutputFallback; request?: ManagerLlmRequest }): ManagerLlmResponse {
  const resolved = getResolvedOutput(input.outputKind, input.rawOutput, input.fallback, input.request);
  return { ok: true, data: resolved ?? createFallbackOutput(input.outputKind, input.fallback, "INVALID_LLM_OUTPUT") };
}

export function createFallbackOutput(outputKind: ManagerLlmOutputKind, fallback: ManagerLlmOutputFallback, fallbackReason: ManagerLlmFallbackReason): ManagerLlmOutputData {
  const base = { source: "rule_fallback" as const, fallbackReason, promptVersion: managerLlmPromptVersion };
  if (outputKind === "managerLine") return { managerLine: fallback.managerLine, ...base };
  if (outputKind === "difficultyEvaluation") return { difficultyEvaluation: fallback.difficultyEvaluation, ...base };
  if (outputKind === "behaviorIntent") return { behaviorIntent: fallback.behaviorIntent, ...base };
  if (outputKind === "statEvaluation") return { statEvaluation: fallback.statEvaluation, ...base };
  if (outputKind === "goalPlan") return { goalPlan: fallback.goalPlan, ...base };
  if (outputKind === "nextQuest") return { nextQuest: fallback.nextQuest, ...base };
  if (outputKind === "planRebalance") return { planRebalance: fallback.planRebalance, ...base };
  if (outputKind === "questAcceptancePreview") return { questAcceptancePreview: fallback.questAcceptancePreview, ...base };
  return { questSuggestion: fallback.questSuggestion, ...base };
}

function getResolvedOutput(outputKind: ManagerLlmOutputKind, rawOutput: unknown, fallback: ManagerLlmOutputFallback, request?: ManagerLlmRequest): ManagerLlmOutputData | null {
  if (!isRecord(rawOutput)) return null;
  const base = { source: "llm" as const, promptVersion: managerLlmPromptVersion };
  if (outputKind === "managerLine") { const managerLine = boundedManagerLine(rawOutput.managerLine); return managerLine ? { managerLine, ...base } : null; }
  if (outputKind === "behaviorIntent") { const behaviorIntent = parseBehaviorIntent(rawOutput.behaviorIntent); return behaviorIntent ? { behaviorIntent, ...base } : null; }
  if (outputKind === "difficultyEvaluation") { const difficultyEvaluation = parseDifficultyEvaluation(rawOutput.difficultyEvaluation); return difficultyEvaluation ? { difficultyEvaluation, ...base } : null; }
  if (outputKind === "statEvaluation") { const statEvaluation = parseStatEvaluation(rawOutput.statEvaluation, fallback.statEvaluation); return statEvaluation ? { statEvaluation, ...base } : null; }
  if (outputKind === "goalPlan") {
    const goalPlan = parseGoalPlan(rawOutput.goalPlan);
    if (!goalPlan || (request?.profile.clarificationAnswer && goalPlan.goalBrief.clarificationQuestion)) return null;
    return { goalPlan, ...base };
  }
  if (outputKind === "nextQuest") {
    const nextQuest = parseNextQuestDecision(rawOutput.nextQuest, request);
    if (!nextQuest || (request?.activePlan && !preservesCompletedNodes(request.activePlan, nextQuest.updatedPlan))) return null;
    return { nextQuest, ...base };
  }
  if (outputKind === "planRebalance") {
    const planRebalance = parsePlanRebalance(rawOutput.planRebalance);
    if (!planRebalance || (request?.activePlan && !preservesCompletedNodes(request.activePlan, planRebalance.rebalancedPlan))) return null;
    return { planRebalance, ...base };
  }
  if (outputKind === "questAcceptancePreview") {
    const preview = parseQuestAcceptancePreview(rawOutput.questAcceptancePreview, fallback.questAcceptancePreview);
    const draft = request?.questDraft;
    if (!preview || (draft && (
      preview.finalizedQuest.id !== draft.id
      || preview.finalizedQuest.linkedMilestoneId !== draft.linkedMilestoneId
      || preview.finalizedQuest.linkedWeeklyPlanId !== draft.linkedWeeklyPlanId
      || preview.finalizedQuest.status !== draft.status
    ))) return null;
    return { questAcceptancePreview: preview, ...base };
  }
  const questSuggestion = parseQuest(rawOutput.questSuggestion);
  if (!questSuggestion || (request && isQuestTitleTooCloseToGoal(questSuggestion.title, request.profile.rawGoalText))) return null;
  return { questSuggestion, ...base };
}

function parseProfile(value: unknown): ManagerLlmProfileInput | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["nickname", "rawGoalText", "dailyMinutes", "targetDate", "managerTone", "clarificationAnswer"])) return null;
  const nickname = boundedString(value.nickname, 40);
  const rawGoalText = boundedString(value.rawGoalText, 2_000);
  const dailyMinutes = Number(value.dailyMinutes);
  const targetDate = optionalDate(value.targetDate);
  const clarificationAnswer = optionalBoundedString(value.clarificationAnswer, 1_000);
  if (!nickname || !rawGoalText || !Number.isInteger(dailyMinutes) || dailyMinutes < 1 || dailyMinutes > 1_440 || targetDate === undefined || !isTone(value.managerTone)) return null;
  return { nickname, rawGoalText, dailyMinutes, targetDate, managerTone: value.managerTone, ...(clarificationAnswer ? { clarificationAnswer } : {}) };
}

function parseGoalBrief(value: unknown): ManagerGoalBrief | null {
  if (!isRecord(value)) return null;
  const normalizedGoal = boundedString(value.normalizedGoal, 240);
  const targetOutcome = optionalBoundedString(value.targetOutcome, 240);
  const currentState = optionalBoundedString(value.currentState, 240);
  const deadline = optionalBoundedString(value.deadline, 40);
  const constraints = parseStringArrayExact(value.constraints, 10, 180);
  const preferences = parseStringArrayExact(value.preferences, 10, 180);
  const inferredDomains = parseDomains(value.inferredDomains, 8);
  const assumptions = parseStringArrayExact(value.assumptions, 10, 180);
  const uncertainties = parseStringArrayExact(value.uncertainties, 10, 180);
  const confidence = Number(value.confidence);
  const clarificationQuestion = value.clarificationQuestion == null ? undefined : parseClarificationQuestion(value.clarificationQuestion) ?? undefined;
  if (!normalizedGoal || !constraints || !preferences || !inferredDomains || !assumptions || !uncertainties || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  if (value.clarificationQuestion != null && !clarificationQuestion) return null;
  return { normalizedGoal, ...(targetOutcome ? { targetOutcome } : {}), ...(currentState ? { currentState } : {}), ...(deadline ? { deadline } : {}), constraints, preferences, inferredDomains, assumptions, uncertainties, confidence, ...(clarificationQuestion ? { clarificationQuestion } : {}) };
}

function parseClarificationQuestion(value: unknown): ManagerGoalBrief["clarificationQuestion"] | null {
  if (!isRecord(value)) return null;
  const question = boundedString(value.question, 240);
  const options = parseRequiredStringArray(value.options, 5, 120);
  return question && options && options.length >= 2 ? { question, options } : null;
}

function parseGoalPlan(value: unknown): ManagerGoalPlan | null {
  if (!isRecord(value) || value.schemaVersion !== "goal-plan-v3" || (value.horizon !== "month" && value.horizon !== "quarter")) return null;
  const goalBrief = parseGoalBrief(value.goalBrief);
  const finalGoal = parseFinalGoal(value.finalGoal);
  const milestones = parseStrictArray(value.milestones, parseMilestone, 1, 24);
  const weeklyPlans = parseStrictArray(value.weeklyPlans, parseWeeklyPlan, 1, 52);
  const rollingDays = parseStrictArray(value.rollingDays, parseRollingDay, 1, 7);
  const currentQuest = parseQuestSpec(value.currentQuest);
  const risks = parseStringArrayExact(value.risks, 12, 180);
  const rebalancingPolicy = parseRebalancingPolicy(value.rebalancingPolicy);
  if (!goalBrief || !finalGoal || !milestones || !weeklyPlans || !rollingDays || !currentQuest || !risks || !rebalancingPolicy) return null;
  const minimumWeekCount = value.horizon === "quarter" ? 8 : 4;
  if (weeklyPlans.length < minimumWeekCount || !hasUniqueIds(milestones) || !hasUniqueIds(weeklyPlans)) return null;
  if (milestones.some((item) => item.parentGoalId !== finalGoal.id)) return null;
  const milestoneIds = new Set(milestones.map((item) => item.id));
  if (weeklyPlans.some((item) => item.milestoneIds.some((id) => !milestoneIds.has(id)))) return null;
  const weeklyIds = new Set(weeklyPlans.map((item) => item.id));
  if (!milestoneIds.has(currentQuest.linkedMilestoneId) || !weeklyIds.has(currentQuest.linkedWeeklyPlanId)) return null;
  return { schemaVersion: "goal-plan-v3", horizon: value.horizon, goalBrief, finalGoal, milestones, weeklyPlans, rollingDays, currentQuest, risks, rebalancingPolicy };
}

function parseRollingDay(value: unknown): ManagerGoalPlan["rollingDays"][number] | null {
  if (!isRecord(value) || !isNodeStatus(value.status)) return null;
  const dayOffset = Number(value.dayOffset);
  const focus = boundedString(value.focus, 240);
  const intendedOutcome = boundedString(value.intendedOutcome, 240);
  return Number.isInteger(dayOffset) && dayOffset >= 0 && dayOffset <= 6 && focus && intendedOutcome
    ? { dayOffset, focus, intendedOutcome, status: value.status }
    : null;
}

function hasUniqueIds(nodes: Array<{ id: string }>): boolean {
  return new Set(nodes.map((node) => node.id)).size === nodes.length;
}

function parseFinalGoal(value: unknown): ManagerGoalPlan["finalGoal"] | null {
  if (!isRecord(value) || !isNodeStatus(value.status)) return null;
  const id = boundedString(value.id, 60); const statement = boundedString(value.statement, 300); const successCriteria = parseRequiredStringArray(value.successCriteria, 10, 180);
  return id && statement && successCriteria ? { id, statement, successCriteria, status: value.status } : null;
}

function parseMilestone(value: unknown): ManagerGoalPlan["milestones"][number] | null {
  if (!isRecord(value) || !isNodeStatus(value.status)) return null;
  const id = boundedString(value.id, 60); const parentGoalId = boundedString(value.parentGoalId, 60); const statement = boundedString(value.statement, 240); const targetWeek = Number(value.targetWeek); const successCriteria = parseRequiredStringArray(value.successCriteria, 10, 180);
  return id && parentGoalId && statement && Number.isInteger(targetWeek) && targetWeek >= 1 && targetWeek <= 52 && successCriteria ? { id, parentGoalId, statement, targetWeek, successCriteria, status: value.status } : null;
}

function parseWeeklyPlan(value: unknown): ManagerGoalPlan["weeklyPlans"][number] | null {
  if (!isRecord(value) || !isNodeStatus(value.status)) return null;
  const id = boundedString(value.id, 60); const weekIndex = Number(value.weekIndex); const milestoneIds = parseRequiredStringArray(value.milestoneIds, 12, 60); const statement = boundedString(value.statement, 240); const targetOutcome = boundedString(value.targetOutcome, 240); const successCriteria = parseRequiredStringArray(value.successCriteria, 10, 180);
  return id && Number.isInteger(weekIndex) && weekIndex >= 1 && weekIndex <= 52 && milestoneIds && statement && targetOutcome && successCriteria ? { id, weekIndex, milestoneIds, statement, targetOutcome, successCriteria, status: value.status } : null;
}

function parseQuestSpec(value: unknown): ManagerLlmQuestSpec | null {
  if (!isRecord(value) || !isNodeStatus(value.status)) return null;
  const id = boundedString(value.id, 60); const displayTitle = boundedString(value.displayTitle, 120); const instruction = boundedString(value.instruction, 320); const purpose = boundedString(value.purpose, 300); const completionCriteria = parseRequiredStringArray(value.completionCriteria, 10, 180); const estimatedMinutes = Number(value.estimatedMinutes); const expectedOutput = optionalBoundedString(value.expectedOutput, 240); const environmentConstraints = parseStringArrayExact(value.environmentConstraints, 10, 180); const prerequisites = parseStringArrayExact(value.prerequisites, 10, 180); const linkedMilestoneId = boundedString(value.linkedMilestoneId, 60); const linkedWeeklyPlanId = boundedString(value.linkedWeeklyPlanId, 60); const adaptationReason = optionalBoundedString(value.adaptationReason, 240); const tracking = parseTracking(value.tracking);
  if (!id || !displayTitle || !instruction || !purpose || !completionCriteria || !Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 480 || !environmentConstraints || !prerequisites || !linkedMilestoneId || !linkedWeeklyPlanId || !tracking) return null;
  return { id, displayTitle, instruction, purpose, completionCriteria, estimatedMinutes, ...(expectedOutput ? { expectedOutput } : {}), environmentConstraints, prerequisites, linkedMilestoneId, linkedWeeklyPlanId, ...(adaptationReason ? { adaptationReason } : {}), status: value.status, tracking };
}

function parseTracking(value: unknown): ManagerLlmQuestSpec["tracking"] | null {
  if (!isRecord(value) || (value.mode !== "timer" && value.mode !== "counter" && value.mode !== "check")) return null;
  const targetAmount = value.targetAmount == null ? undefined : Number(value.targetAmount); const targetUnit = optionalBoundedString(value.targetUnit, 40);
  if (targetAmount !== undefined && (!Number.isFinite(targetAmount) || targetAmount <= 0)) return null;
  if ((value.mode === "timer" || value.mode === "counter") && (targetAmount === undefined || !targetUnit)) return null;
  return { mode: value.mode, ...(targetAmount !== undefined ? { targetAmount } : {}), ...(targetUnit ? { targetUnit } : {}) };
}

function parseRebalancingPolicy(value: unknown): ManagerGoalPlan["rebalancingPolicy"] | null {
  if (!isRecord(value)) return null;
  const onSuccess = boundedString(value.onSuccess, 240); const onFailureTimeShortage = boundedString(value.onFailureTimeShortage, 240); const onFailureTooHard = boundedString(value.onFailureTooHard, 240); const onSkippedDays = boundedString(value.onSkippedDays, 240); const onAnomaly = boundedString(value.onAnomaly, 240);
  return onSuccess && onFailureTimeShortage && onFailureTooHard && onSkippedDays && onAnomaly ? { onSuccess, onFailureTimeShortage, onFailureTooHard, onSkippedDays, onAnomaly } : null;
}

function parsePlanRebalance(value: unknown): ManagerPlanRebalance | null {
  if (!isRecord(value)) return null;
  const rebalancedPlan = parseGoalPlan(value.rebalancedPlan); const changes = parseStrictArray(value.changes, parsePlanChange, 1, 20); const nextQuest = parseRecoveryQuest(value.nextQuest);
  return rebalancedPlan && changes && nextQuest ? { rebalancedPlan, changes, nextQuest } : null;
}

function parseNextQuestDecision(value: unknown, request?: ManagerLlmRequest): ManagerNextQuestDecision | null {
  if (!isRecord(value)) return null;
  const nextQuest = parseQuestSpec(value.nextQuest);
  const parsedPlan = parseGoalPlan(value.updatedPlan);
  const updatedPlan = parsedPlan && nextQuest && planContainsQuestReferences(parsedPlan, nextQuest)
    ? { ...parsedPlan, currentQuest: nextQuest }
    : null;
  const capacityAssessment = request?.dailyCapacity ?? parseDailyCapacity(value.capacityAssessment);
  const managerLine = boundedManagerLine(value.managerLine);
  const behaviorIntent = managerLine && isRecord(value.behaviorIntent)
    ? parseBehaviorIntent({ ...value.behaviorIntent, line: managerLine })
    : null;
  if (!nextQuest || !updatedPlan || !capacityAssessment || !managerLine || !behaviorIntent) return null;
  return { nextQuest, updatedPlan, capacityAssessment, managerLine, behaviorIntent };
}

function preservesCompletedNodes(previous: ManagerGoalPlan, next: ManagerGoalPlan): boolean {
  if (previous.finalGoal.status === "completed" && JSON.stringify(previous.finalGoal) !== JSON.stringify(next.finalGoal)) return false;
  return completedNodesAreEqual(previous.milestones, next.milestones)
    && completedNodesAreEqual(previous.weeklyPlans, next.weeklyPlans);
}

function completedNodesAreEqual<T extends { id: string; status: ManagerPlanNodeStatus }>(previous: T[], next: T[]): boolean {
  const nextById = new Map(next.map((node) => [node.id, node]));
  return previous
    .filter((node) => node.status === "completed")
    .every((node) => JSON.stringify(node) === JSON.stringify(nextById.get(node.id)));
}

function parsePlanChange(value: unknown): ManagerPlanRebalance["changes"][number] | null {
  if (!isRecord(value) || !isPlanChangeScope(value.scope) || !isPlanChangeReason(value.reason)) return null;
  const before = boundedString(value.before, 240); const after = boundedString(value.after, 240);
  return before && after ? { scope: value.scope, reason: value.reason, before, after } : null;
}

function parseRecoveryQuest(value: unknown): ManagerLlmRecoveryQuest | null {
  const quest = parseQuestSpec(value); if (!quest || !isRecord(value)) return null; const recoveryReason = boundedString(value.recoveryReason, 240); return recoveryReason ? { ...quest, recoveryReason } : null;
}

function parseQuestAcceptancePreview(value: unknown, fallback: ManagerQuestAcceptancePreview | undefined): ManagerQuestAcceptancePreview | null {
  if (!isRecord(value) || !fallback || !isDifficulty(value.difficulty)) return null;
  const finalizedQuest = parseQuestSpec(value.finalizedQuest); const rewardExp = Number(value.rewardExp); const statEvaluation = parseStatEvaluation(value.statEvaluation, fallback.statEvaluation); const reason = boundedString(value.reason, 320); const assessment = parseAssessment(value.assessment); const managerLine = boundedManagerLine(value.managerLine); const behaviorIntent = managerLine && isRecord(value.behaviorIntent) ? parseBehaviorIntent({ ...value.behaviorIntent, line: managerLine }) : null;
  if (!finalizedQuest || !Number.isInteger(rewardExp) || !isRewardExpInDifficultyRange(value.difficulty, rewardExp) || !statEvaluation || statEvaluation.difficulty !== value.difficulty || !reason || !assessment || !managerLine || !behaviorIntent) return null;
  return { finalizedQuest, difficulty: value.difficulty, rewardExp, statEvaluation, reason, assessment, managerLine, behaviorIntent };
}

function parseAssessment(value: unknown): ManagerQuestAcceptancePreview["assessment"] | null {
  if (!isRecord(value)) return null;
  const taskDomains = parseDomains(value.taskDomains, 8); const reason = boundedString(value.reason, 320);
  if (!taskDomains || !reason || !isFactor(value.timeLoad) || !isFactor(value.cognitiveLoad) || !isFactor(value.physicalLoad) || !isFactor(value.skillNovelty) || !isFactor(value.outputComplexity) || !isFactor(value.recoveryRisk)) return null;
  return { taskDomains, timeLoad: value.timeLoad, cognitiveLoad: value.cognitiveLoad, physicalLoad: value.physicalLoad, skillNovelty: value.skillNovelty, outputComplexity: value.outputComplexity, recoveryRisk: value.recoveryRisk, reason };
}

function parseDifficultyEvaluation(value: unknown): ManagerLlmDifficultyEvaluation | null { if (!isRecord(value) || !isDifficulty(value.difficulty)) return null; const rewardExp = Number(value.rewardExp); const reason = boundedString(value.reason, 240); return Number.isInteger(rewardExp) && isRewardExpInDifficultyRange(value.difficulty, rewardExp) && reason ? { difficulty: value.difficulty, rewardExp, reason } : null; }
function parseStatEvaluation(value: unknown, fallback: ManagerStatEvaluation): ManagerStatEvaluation | null { const normalized = normalizeManagerStatEvaluation(value, fallback); return normalized === fallback ? null : normalized; }

function parseBehaviorIntent(value: unknown): ManagerBehaviorIntent | null {
  if (!isRecord(value) || !isBehaviorStyle(value.behaviorStyle) || !isTone(value.tone)) return null;
  const line = boundedManagerLine(value.line); if (!line || !Array.isArray(value.suggestedBehaviorBias)) return null;
  const suggestedBehaviorBias = value.suggestedBehaviorBias.flatMap((item) => { if (!isRecord(item) || !isBehaviorState(item.state) || !Number.isInteger(item.weightDelta) || Number(item.weightDelta) < -2 || Number(item.weightDelta) > 2) return []; const reason = boundedString(item.reason, 120); return reason ? [{ state: item.state, weightDelta: Number(item.weightDelta), reason }] : []; });
  return suggestedBehaviorBias.length === value.suggestedBehaviorBias.length ? { behaviorStyle: value.behaviorStyle, tone: value.tone, line, suggestedBehaviorBias } : null;
}

function parseQuest(value: unknown, allowUnscored = false): ManagerLlmQuestInput | null {
  if (!isRecord(value)) return null;
  const title = boundedString(value.title, 120);
  const unit = boundedString(value.unit, 30);
  const deadline = boundedString(value.deadline, 60);
  const amount = Number(value.amount);
  const rewardExp = Number(value.rewardExp);
  if (!title || !unit || !deadline || !isQuestType(value.type) || !isDifficulty(value.difficulty) || !Number.isInteger(amount) || amount < 1 || !Number.isInteger(rewardExp)) return null;
  const rewardIsValid = allowUnscored && rewardExp === 0
    ? true
    : isRewardExpInDifficultyRange(value.difficulty, rewardExp);
  return rewardIsValid ? { title, type: value.type, amount, unit, difficulty: value.difficulty, deadline, rewardExp } : null;
}
function parseManagerContext(value: unknown): ManagerContext | null { if (!isRecord(value)) return null; const recentEventCount = Number(value.recentEventCount); const memorySummary = boundedString(value.memorySummary, 400); if (!isManagerMood(value.currentMood) || !Number.isInteger(recentEventCount) || recentEventCount < 0 || !memorySummary || !Array.isArray(value.rewardHints) || (value.lastQuestResult !== null && !isQuestEventResult(value.lastQuestResult))) return null; return { currentMood: value.currentMood, recentEventCount, lastQuestResult: value.lastQuestResult, memorySummary, rewardHints: value.rewardHints.filter((item): item is string => typeof item === "string").slice(0, 8) }; }
function parsePersona(value: unknown): ManagerLlmPersonaInput | null { if (!isRecord(value)) return null; const petId = boundedString(value.petId, 60); return petId && isTone(value.tone) && isQuestStyle(value.questStyle) && isFeedbackStyle(value.feedbackStyle) && isBehaviorStyle(value.behaviorStyle) ? { petId, tone: value.tone, questStyle: value.questStyle, feedbackStyle: value.feedbackStyle, behaviorStyle: value.behaviorStyle } : null; }
function parseManagerProgress(value: unknown): ManagerProgressInput | null {
  if (!isRecord(value) || !Number.isInteger(value.level) || Number(value.level) < 1 || !isRecord(value.stats)) return null;
  const stats = value.stats;
  const statNames = ["diligence", "persistence", "creativity", "knowledge", "strength", "agility", "stamina", "charm"] as const;
  if (!statNames.every((stat) => Number.isFinite(stats[stat]) && Number(stats[stat]) >= 0)) return null;
  return { level: Number(value.level), stats: Object.fromEntries(statNames.map((stat) => [stat, Number(stats[stat])])) as ManagerStats };
}
function parseDailyCapacity(value: unknown): DailyCapacityContext | null {
  if (!isRecord(value) || !/^\d{4}-\d{2}-\d{2}$/.test(String(value.localDate)) || !isDailyCapacityStatus(value.status) || typeof value.bonusAwarded !== "boolean") return null;
  const numberFields = ["baselineMinutes", "reservedMinutes", "usedMinutes", "successfulMinutes", "remainingMinutes", "varianceMinutes", "utilizationRatio"] as const;
  if (!numberFields.every((field) => Number.isFinite(value[field]))) return null;
  if (!Number.isInteger(value.baselineMinutes) || Number(value.baselineMinutes) < 1 || Number(value.baselineMinutes) > 1_440) return null;
  if (["reservedMinutes", "usedMinutes", "successfulMinutes"].some((field) => Number(value[field]) < 0)) return null;
  return { localDate: String(value.localDate), baselineMinutes: Number(value.baselineMinutes), reservedMinutes: Number(value.reservedMinutes), usedMinutes: Number(value.usedMinutes), successfulMinutes: Number(value.successfulMinutes), remainingMinutes: Number(value.remainingMinutes), varianceMinutes: Number(value.varianceMinutes), utilizationRatio: Number(value.utilizationRatio), status: value.status, bonusAwarded: value.bonusAwarded };
}
function parseQuestState(value: unknown): ManagerLlmQuestStateInput | null { if (!isRecord(value) || !isQuestStatus(value.status)) return null; const previousQuestTitle = nullableBoundedString(value.previousQuestTitle, 160); const failureReason = nullableBoundedString(value.failureReason, 120); const currentQuest = value.currentQuest === undefined ? undefined : parseQuest(value.currentQuest, value.status === "draft") ?? undefined; if (value.currentQuest !== undefined && !currentQuest) return null; return { status: value.status, currentQuest, previousQuestTitle, failureReason }; }
function parseRecentEvent(value: unknown): ManagerLlmRecentEventInput[] {
  if (!isRecord(value) || !isQuestEventType(value.type)) return [];
  const title = boundedString(value.title, 160); const createdAt = boundedString(value.createdAt, 40); const completionCriteria = parseStringArrayExact(value.completionCriteria, 10, 180); const failureReason = nullableBoundedString(value.failureReason, 160); const evaluationReason = optionalBoundedString(value.evaluationReason, 320); const actualDurationMinutes = optionalPositiveNumber(value.actualDurationMinutes); const plannedEstimatedMinutes = optionalPositiveNumber(value.plannedEstimatedMinutes);
  if (!title || !createdAt || !completionCriteria || (value.result !== null && !isQuestEventResult(value.result)) || !isDifficulty(value.difficulty) || actualDurationMinutes === null || plannedEstimatedMinutes === null) return [];
  return [{ type: value.type, title, result: value.result, difficulty: value.difficulty, createdAt, failureReason, ...(actualDurationMinutes === undefined ? {} : { actualDurationMinutes }), ...(plannedEstimatedMinutes === undefined ? {} : { plannedEstimatedMinutes }), completionCriteria, ...(evaluationReason ? { evaluationReason } : {}) }];
}

function isQuestTitleTooCloseToGoal(title: string, goal: string): boolean { const normalizedTitle = normalizeComparableText(title); const normalizedGoal = normalizeComparableText(goal); if (!normalizedTitle || !normalizedGoal) return false; if (normalizedTitle === normalizedGoal) return true; return ["핵심정리", "정리", "공부", "연습", "다음단계", "corereview", "summary", "study", "practice", "nextstep"].some((suffix) => normalizedTitle === `${normalizedGoal}${suffix}`); }
function planContainsQuestReferences(plan: ManagerGoalPlan, quest: ManagerLlmQuestSpec): boolean { return plan.milestones.some((item) => item.id === quest.linkedMilestoneId) && plan.weeklyPlans.some((item) => item.id === quest.linkedWeeklyPlanId); }
function normalizeComparableText(value: string): string { return value.toLowerCase().replace(/[\s:;,.!?\-_/()[\]{}'"`]+/g, ""); }
function isRewardExpInDifficultyRange(difficulty: ManagerQuestDifficulty, rewardExp: number): boolean { const range = rewardExpRangeByDifficulty[difficulty]; return rewardExp >= range.min && rewardExp <= range.max; }
function boundedString(value: unknown, maxLength: number): string | null { if (typeof value !== "string") return null; const trimmed = value.trim(); return trimmed ? trimmed.slice(0, maxLength) : null; }
function optionalBoundedString(value: unknown, maxLength: number): string | undefined { if (value == null || value === "") return undefined; return boundedString(value, maxLength) ?? undefined; }
function nullableBoundedString(value: unknown, maxLength: number): string | null { return value == null ? null : boundedString(value, maxLength); }
function optionalDate(value: unknown): string | null | undefined { if (value == null || value === "") return null; if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined; const date = new Date(`${value}T00:00:00Z`); return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : value; }
function optionalIdentifier(value: unknown, maxLength: number): string | undefined | null { if (value == null || value === "") return undefined; if (typeof value !== "string") return null; const trimmed = value.trim(); return trimmed && trimmed.length <= maxLength ? trimmed : null; }
function optionalPositiveNumber(value: unknown): number | undefined | null { if (value == null) return undefined; const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function parseStringArrayExact(value: unknown, maxItems: number, maxLength: number): string[] | null { if (!Array.isArray(value) || value.length > maxItems) return null; const parsed = value.flatMap((item) => { const result = boundedString(item, maxLength); return result ? [result] : []; }); return parsed.length === value.length ? parsed : null; }
function parseRequiredStringArray(value: unknown, maxItems: number, maxLength: number): string[] | null { const parsed = parseStringArrayExact(value, maxItems, maxLength); return parsed && parsed.length > 0 ? parsed : null; }
function parseStrictArray<T>(value: unknown, parser: (item: unknown) => T | null, minItems: number, maxItems: number): T[] | null { if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) return null; const parsed = value.flatMap((item) => { const result = parser(item); return result ? [result] : []; }); return parsed.length === value.length ? parsed : null; }
function parseDomains(value: unknown, maxItems: number): ManagerLlmDomain[] | null { if (!Array.isArray(value) || value.length < 1 || value.length > maxItems || !value.every(isDomain)) return null; return value; }
function boundedManagerLine(value: unknown): string | null { if (typeof value !== "string") return null; const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 2).map((line) => line.slice(0, 48)); return lines.length ? lines.join("\n") : null; }
function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean { return Object.keys(value).every((key) => allowed.includes(key)); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isOutputKind(value: unknown): value is ManagerLlmOutputKind { return ["managerLine", "questSuggestion", "difficultyEvaluation", "statEvaluation", "behaviorIntent", "goalPlan", "nextQuest", "planRebalance", "questAcceptancePreview"].includes(String(value)); }
function isDomain(value: unknown): value is ManagerLlmDomain { return ["study", "exam", "exercise", "cooking", "creative", "career", "habit", "general"].includes(String(value)); }
function isNodeStatus(value: unknown): value is ManagerPlanNodeStatus { return ["planned", "active", "completed", "adjusted", "skipped"].includes(String(value)); }
function isFactor(value: unknown): value is 1 | 2 | 3 | 4 | 5 { return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5; }
function isManagerMood(value: unknown): value is ManagerContext["currentMood"] { return value === "waiting" || value === "focused" || value === "happy" || value === "recovering"; }
function isQuestEventType(value: unknown): value is QuestEventType { return ["quest_suggested", "quest_accepted", "quest_completed", "quest_failed", "recovery_started", "recovery_completed", "manager_reaction", "reward_unlocked"].includes(String(value)); }
function isQuestEventResult(value: unknown): value is QuestEventResult { return value === "success" || value === "failed" || value === "recovery"; }
function isQuestType(value: unknown): value is ManagerLlmQuestInput["type"] { return value === "time" || value === "quantity" || value === "action"; }
function isDifficulty(value: unknown): value is ManagerQuestDifficulty { return value === "easy" || value === "normal" || value === "hard"; }
function isTone(value: unknown): value is ManagerTone { return value === "calm" || value === "friendly" || value === "firm"; }
function isQuestStyle(value: unknown): value is ManagerLlmPersonaInput["questStyle"] { return value === "tiny" || value === "balanced" || value === "challenge"; }
function isFeedbackStyle(value: unknown): value is ManagerLlmPersonaInput["feedbackStyle"] { return value === "gentle" || value === "playful" || value === "direct"; }
function isBehaviorStyle(value: unknown): value is ManagerLlmPersonaInput["behaviorStyle"] { return value === "balanced" || value === "adventurous" || value === "shy"; }
function isBehaviorState(value: unknown): value is ManagerBehaviorIntent["suggestedBehaviorBias"][number]["state"] { return ["idle", "wander", "approach_ladder", "climb_ladder", "approach_platform", "jump_to_platform", "hide_behind_window", "hang_on_window", "escape_window", "rest"].includes(String(value)); }
function isQuestStatus(value: unknown): value is ManagerLlmQuestStateInput["status"] { return value === "draft" || value === "active" || value === "success" || value === "failed" || value === "recovery"; }
function isPlanChangeScope(value: unknown): value is ManagerPlanRebalance["changes"][number]["scope"] { return value === "daily" || value === "weekly" || value === "milestone" || value === "goal"; }
function isPlanChangeReason(value: unknown): value is ManagerPlanRebalance["changes"][number]["reason"] { return value === "success_streak" || value === "failure_time_shortage" || value === "failure_too_hard" || value === "skipped_days" || value === "weekly_boundary" || value === "anomaly" || value === "recovery_completed" || value === "daily_under_capacity" || value === "daily_capacity_reached" || value === "daily_over_capacity" || value === "profile_changed"; }
function isDailyCapacityStatus(value: unknown): value is DailyCapacityContext["status"] { return value === "no_activity" || value === "under_capacity" || value === "capacity_reached" || value === "over_capacity"; }
