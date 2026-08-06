import type { DailyCapacityContext } from "../../domain/dailyCapacityPolicy";
import type { ManagerBehaviorIntent } from "../../domain/managerBehaviorIntent";
import type { ManagerPersona } from "../../domain/managerPersonaPolicy";
import type { ManagerStatEvaluation, ManagerStats } from "../../domain/statGrowth";
import type { Quest } from "../../domain/questLogic";
import type { ManagerContext, QuestEventType } from "./questLogApi";

export const managerLlmPromptVersion = "manager-api-v3";

export type ManagerLlmOutputKind = "managerLine" | "questSuggestion" | "difficultyEvaluation" | "statEvaluation" | "behaviorIntent" | "goalPlan" | "nextQuest" | "planRebalance" | "questAcceptancePreview";
export type ManagerLlmDomain = "study" | "exam" | "exercise" | "cooking" | "creative" | "career" | "habit" | "general";
export type ManagerPlanNodeStatus = "planned" | "active" | "completed" | "adjusted" | "skipped";

export interface ManagerLlmProfileInput {
  nickname: string;
  rawGoalText: string;
  dailyMinutes: number;
  targetDate?: string | null;
  managerTone: "calm" | "friendly" | "firm";
  clarificationAnswer?: string;
}

export interface ManagerLlmPersonaInput extends ManagerPersona { petId: string }

export interface ManagerLlmQuestStateInput {
  status: "draft" | "active" | "success" | "failed" | "recovery";
  currentQuest?: Quest;
  previousQuestTitle?: string | null;
  failureReason?: string | null;
}

export interface ManagerLlmRecentEventInput {
  type: QuestEventType;
  title: string;
  result: "success" | "failed" | "recovery" | null;
  difficulty: "easy" | "normal" | "hard";
  createdAt: string;
  failureReason?: string | null;
  actualDurationMinutes?: number;
  plannedEstimatedMinutes?: number;
  completionCriteria: string[];
  evaluationReason?: string;
}

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
  difficulty: "easy" | "normal" | "hard";
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

export interface ManagerLlmRequest {
  promptVersion: typeof managerLlmPromptVersion;
  outputKind: ManagerLlmOutputKind;
  managerContext: ManagerContext;
  profile: ManagerLlmProfileInput;
  persona: ManagerLlmPersonaInput;
  managerProgress: { level: number; stats: ManagerStats };
  questState: ManagerLlmQuestStateInput;
  recentEvents: ManagerLlmRecentEventInput[];
  dailyCapacity: DailyCapacityContext;
  questDraft?: ManagerLlmQuestSpec;
  triggerEventId?: string;
  activePlanId?: string | null;
  activePlan?: ManagerGoalPlan;
}

export interface ManagerLlmOutput {
  managerLine?: string;
  questSuggestion?: Quest;
  difficultyEvaluation?: { difficulty: "easy" | "normal" | "hard"; rewardExp: number; reason: string };
  statEvaluation?: ManagerStatEvaluation;
  behaviorIntent?: ManagerBehaviorIntent;
  goalPlan?: ManagerGoalPlan;
  nextQuest?: ManagerNextQuestDecision;
  planRebalance?: ManagerPlanRebalance;
  questAcceptancePreview?: ManagerQuestAcceptancePreview;
  source: "llm" | "rule_fallback";
  fallbackReason?: "LLM_DISABLED" | "LLM_PROVIDER_ERROR" | "INVALID_LLM_OUTPUT" | "RATE_LIMITED" | "CLIENT_THROTTLED";
  promptVersion: typeof managerLlmPromptVersion;
  storedPlanId?: string;
  storedRevisionId?: string;
}

interface ManagerLlmSuccessResponse { ok: true; data: ManagerLlmOutput }
interface ManagerLlmErrorResponse { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } }
type ManagerLlmApiResponse = ManagerLlmSuccessResponse | ManagerLlmErrorResponse;

const routeByKind: Record<ManagerLlmOutputKind, string> = {
  managerLine: "/api/manager/line", questSuggestion: "/api/manager/quest-suggestion", difficultyEvaluation: "/api/manager/difficulty-evaluation",
  statEvaluation: "/api/manager/stat-evaluation", behaviorIntent: "/api/manager/behavior-intent", goalPlan: "/api/manager/goal-plan",
  nextQuest: "/api/manager/next-quest", planRebalance: "/api/manager/plan-rebalance", questAcceptancePreview: "/api/manager/quest-acceptance-preview",
};

const defaultClientThrottleMs = 60_000;
const lastOutputByRequest = new Map<string, { requestedAtMs: number; output: ManagerLlmOutput }>();
export interface ManagerLlmClientOptions { nowMs?: number; throttleMs?: number }

async function requireOutput<K extends keyof ManagerLlmOutput>(input: ManagerLlmRequest, kind: ManagerLlmOutputKind, key: K, fetchFn: typeof fetch, options?: ManagerLlmClientOptions): Promise<ManagerLlmOutput & Required<Pick<ManagerLlmOutput, K>>> {
  const output = await requestManagerLlmOutputViaApi({ ...input, outputKind: kind }, fetchFn, options);
  if (output[key] === undefined) throw new Error(`Manager ${String(key)} response was empty.`);
  return output as ManagerLlmOutput & Required<Pick<ManagerLlmOutput, K>>;
}

export const requestManagerBehaviorIntentViaApi = (input: ManagerLlmRequest, fetchFn: typeof fetch = fetch) => requireOutput(input, "behaviorIntent", "behaviorIntent", fetchFn);
export const requestManagerLineViaApi = (input: ManagerLlmRequest, fetchFn: typeof fetch = fetch) => requireOutput(input, "managerLine", "managerLine", fetchFn);
export const requestManagerQuestSuggestionViaApi = (input: ManagerLlmRequest, fetchFn: typeof fetch = fetch) => requireOutput(input, "questSuggestion", "questSuggestion", fetchFn);
export const requestManagerDifficultyEvaluationViaApi = (input: ManagerLlmRequest, fetchFn: typeof fetch = fetch) => requireOutput(input, "difficultyEvaluation", "difficultyEvaluation", fetchFn);
export const requestManagerStatEvaluationViaApi = (input: ManagerLlmRequest, fetchFn: typeof fetch = fetch) => requireOutput(input, "statEvaluation", "statEvaluation", fetchFn);
export const requestManagerGoalPlanViaApi = (input: ManagerLlmRequest, fetchFn: typeof fetch = fetch, options?: ManagerLlmClientOptions) => requireOutput(input, "goalPlan", "goalPlan", fetchFn, options);
export const requestManagerNextQuestViaApi = (input: ManagerLlmRequest, fetchFn: typeof fetch = fetch, options?: ManagerLlmClientOptions) => requireOutput(input, "nextQuest", "nextQuest", fetchFn, options);
export const requestManagerPlanRebalanceViaApi = (input: ManagerLlmRequest, fetchFn: typeof fetch = fetch, options?: ManagerLlmClientOptions) => requireOutput(input, "planRebalance", "planRebalance", fetchFn, options);
export const requestManagerQuestAcceptancePreviewViaApi = (input: ManagerLlmRequest, fetchFn: typeof fetch = fetch, options?: ManagerLlmClientOptions) => requireOutput(input, "questAcceptancePreview", "questAcceptancePreview", fetchFn, options);

export async function requestManagerLlmOutputViaApi(input: ManagerLlmRequest, fetchFn: typeof fetch = fetch, options: ManagerLlmClientOptions = {}): Promise<ManagerLlmOutput> {
  const nowMs = options.nowMs ?? Date.now();
  const throttleMs = options.throttleMs ?? defaultClientThrottleMs;
  const requestKey = JSON.stringify(input);
  const previous = lastOutputByRequest.get(requestKey);
  if (previous && nowMs >= previous.requestedAtMs && nowMs - previous.requestedAtMs < throttleMs) {
    return { ...previous.output, source: "rule_fallback", fallbackReason: "CLIENT_THROTTLED" };
  }
  const response = await fetchFn(routeByKind[input.outputKind], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  const payload = (await response.json()) as ManagerLlmApiResponse;
  if (!response.ok || !payload.ok) throw new Error(payload.ok ? "Manager LLM request failed." : payload.error.message);
  lastOutputByRequest.set(requestKey, { requestedAtMs: nowMs, output: payload.data });
  return payload.data;
}
