import { createRuleFallbackStatEvaluation, type ManagerStatEvaluation } from "../../src/domain/statGrowth.js";
import type { ManagerBehaviorIntent } from "../../src/domain/managerBehaviorIntent.js";
import type {
  ManagerGoalBrief,
  ManagerGoalPlan,
  ManagerLlmDifficultyEvaluation,
  ManagerLlmDomain,
  ManagerLlmOutputFallback,
  ManagerLlmQuestInput,
  ManagerLlmQuestSpec,
  ManagerLlmRequest,
  ManagerNextQuestDecision,
  ManagerPlanRebalance,
  ManagerQuestAcceptancePreview,
} from "../contracts/managerLlm.js";

export function createManagerLlmFallback(request: ManagerLlmRequest): ManagerLlmOutputFallback {
  const managerLine = createManagerLine(request);
  const behaviorIntent = createBehaviorIntent(request, managerLine);
  const goalPlan = createGoalPlan(request);
  const questDraft = request.questDraft ?? request.activePlan?.currentQuest ?? goalPlan.currentQuest;
  const difficultyEvaluation = evaluateDifficulty(questDraft);
  const statEvaluation = createCleanStatEvaluation(request, difficultyEvaluation.difficulty);
  const nextQuest = createNextQuestDecision(request, request.activePlan ?? goalPlan, behaviorIntent);

  return {
    managerLine,
    questSuggestion: request.questState.currentQuest ?? toLegacyQuest(questDraft, difficultyEvaluation),
    difficultyEvaluation,
    statEvaluation,
    behaviorIntent,
    goalPlan,
    nextQuest,
    planRebalance: createPlanRebalance(request.activePlan ?? goalPlan, request),
    questAcceptancePreview: createAcceptancePreview(questDraft, request, difficultyEvaluation, statEvaluation, behaviorIntent),
  };
}

function createGoalBrief(request: ManagerLlmRequest): ManagerGoalBrief {
  const normalizedGoal = request.profile.rawGoalText.trim().slice(0, 240);
  const answer = request.profile.clarificationAnswer;
  return {
    normalizedGoal,
    targetOutcome: answer?.slice(0, 240) ?? "확인 가능한 작은 결과를 꾸준히 만든다.",
    deadline: request.profile.targetDate ?? undefined,
    constraints: [`하루 기준 시간 ${request.profile.dailyMinutes}분`],
    preferences: ["실행 가능한 결과 중심"],
    inferredDomains: inferDomains(normalizedGoal),
    assumptions: answer ? [`추가 답변: ${answer}`] : ["첫 실행 결과를 보고 계획을 조정한다."],
    uncertainties: answer ? [] : ["현재 수준과 구체적인 완료 결과가 확인되지 않았다."],
    confidence: answer ? 0.72 : 0.55,
    ...(answer ? {} : {
      clarificationQuestion: {
        question: "이 목표를 달성했다고 판단할 수 있는 결과는 무엇인가요?",
        options: ["완성된 결과물", "측정 가능한 기록", "반복 가능한 습관"],
      },
    }),
  };
}

function createGoalPlan(request: ManagerLlmRequest): ManagerGoalPlan {
  const goalBrief = createGoalBrief(request);
  const weekCount = resolveFallbackWeekCount(request.profile.targetDate);
  const currentQuest = createMinimalQuest(request, "q1");
  return {
    schemaVersion: "goal-plan-v3",
    horizon: weekCount > 4 ? "quarter" : "month",
    goalBrief,
    finalGoal: { id: "g1", statement: goalBrief.normalizedGoal, successCriteria: [goalBrief.targetOutcome ?? "목표 결과를 확인한다."], status: "active" },
    milestones: [
      { id: "m1", parentGoalId: "g1", statement: "첫 확인 가능한 결과 만들기", targetWeek: 1, successCriteria: ["작은 결과 하나를 남긴다."], status: "active" },
      { id: "m2", parentGoalId: "g1", statement: "반복 가능한 실행 흐름 만들기", targetWeek: weekCount, successCriteria: ["안정적인 실행 기록을 남긴다."], status: "planned" },
    ],
    weeklyPlans: Array.from({ length: weekCount }, (_, index) => ({
      id: `w${index + 1}`,
      weekIndex: index + 1,
      milestoneIds: index < 2 ? ["m1"] : ["m2"],
      statement: index === 0 ? "작게 시작하고 결과 확인하기" : "기록을 보고 다음 단계를 조정하기",
      targetOutcome: index === 0 ? "첫 결과 하나" : `주간 실행 기록 ${index + 1}`,
      successCriteria: ["이번 주에 확인 가능한 결과를 남긴다."],
      status: index === 0 ? "active" as const : "planned" as const,
    })),
    rollingDays: Array.from({ length: 7 }, (_, dayOffset) => ({
      dayOffset,
      focus: dayOffset === 0 ? "첫 실행 범위 확인" : "직전 결과를 바탕으로 다음 행동 선택",
      intendedOutcome: "확인 가능한 작은 결과 하나",
      status: dayOffset === 0 ? "active" as const : "planned" as const,
    })),
    currentQuest,
    risks: ["시간 부족", "완료 기준 불명확", "초기 분량 과다"],
    rebalancingPolicy: {
      onSuccess: "성공 기록을 바탕으로 다음 행동의 질을 조정한다.",
      onFailureTimeShortage: "더 짧은 실행 단위로 나눈다.",
      onFailureTooHard: "선행 작업과 더 작은 완료 결과를 제시한다.",
      onSkippedDays: "가장 작은 실행 단계부터 다시 시작한다.",
      onAnomaly: "기준 시간과 실제 기록의 차이를 검토한다.",
    },
  };
}

function createMinimalQuest(request: ManagerLlmRequest, id: string): ManagerLlmQuestSpec {
  const estimatedMinutes = Math.min(30, Math.max(10, Math.round(request.profile.dailyMinutes / 6)));
  return {
    id,
    displayTitle: "오늘의 첫 실행 범위 정하기",
    instruction: `"${request.profile.rawGoalText.slice(0, 80)}" 목표에서 오늘 끝낼 수 있는 결과 하나를 정하고 바로 시작한다.`,
    purpose: "장기 목표를 확인 가능한 다음 행동으로 바꾼다.",
    completionCriteria: ["오늘 끝낼 결과 하나를 적는다.", "첫 행동을 한 번 실행한다."],
    estimatedMinutes,
    expectedOutput: "오늘의 결과와 첫 실행 기록",
    environmentConstraints: [],
    prerequisites: [],
    linkedMilestoneId: "m1",
    linkedWeeklyPlanId: "w1",
    status: "planned",
    tracking: { mode: "timer", targetAmount: estimatedMinutes, targetUnit: "분" },
  };
}

function createNextQuestDecision(request: ManagerLlmRequest, plan: ManagerGoalPlan, behaviorIntent: ManagerBehaviorIntent): ManagerNextQuestDecision {
  const previous = request.questDraft ?? plan.currentQuest;
  const suffix = Math.max(2, request.managerContext.recentEventCount + 2);
  const estimatedMinutes = Math.min(30, Math.max(10, previous.estimatedMinutes));
  const nextQuest: ManagerLlmQuestSpec = {
    ...previous,
    id: `${previous.id}-next-${suffix}`,
    displayTitle: `${previous.displayTitle.slice(0, 90)} 이어서 하기`,
    instruction: `직전 결과를 확인하고 ${previous.purpose}에 필요한 다음 행동 하나를 실행한다.`,
    completionCriteria: ["직전 결과를 확인한다.", "다음 결과 하나를 남긴다."],
    estimatedMinutes,
    adaptationReason: `하루 시간 상태 ${request.dailyCapacity.status} 반영`,
    status: "planned",
    tracking: { mode: "timer", targetAmount: estimatedMinutes, targetUnit: "분" },
  };
  return {
    nextQuest,
    updatedPlan: { ...plan, currentQuest: nextQuest },
    capacityAssessment: request.dailyCapacity,
    managerLine: behaviorIntent.line,
    behaviorIntent,
  };
}

function createPlanRebalance(plan: ManagerGoalPlan, request: ManagerLlmRequest): ManagerPlanRebalance {
  const behaviorIntent = createBehaviorIntent(request, createManagerLine(request));
  const decision = createNextQuestDecision(request, plan, behaviorIntent);
  const failed = request.managerContext.lastQuestResult === "failed" || request.questState.status === "failed";
  const reason = failed ? "failure_time_shortage" as const : request.dailyCapacity.status === "over_capacity" ? "daily_over_capacity" as const : request.dailyCapacity.status === "capacity_reached" ? "daily_capacity_reached" as const : "daily_under_capacity" as const;
  return {
    rebalancedPlan: decision.updatedPlan,
    changes: [{ scope: "daily", reason, before: plan.currentQuest.displayTitle, after: decision.nextQuest.displayTitle }],
    nextQuest: { ...decision.nextQuest, recoveryReason: failed ? "실패 이유를 반영해 더 작은 다음 행동으로 조정했습니다." : "오늘 기록을 반영해 다음 행동을 준비했습니다." },
  };
}

function evaluateDifficulty(quest: ManagerLlmQuestSpec): ManagerLlmDifficultyEvaluation {
  const semanticLoad = quest.completionCriteria.length + quest.prerequisites.length + (quest.expectedOutput ? 1 : 0);
  const difficulty = quest.estimatedMinutes <= 15 && semanticLoad <= 3 ? "easy" : quest.estimatedMinutes > 60 || semanticLoad >= 6 ? "hard" : "normal";
  return { difficulty, rewardExp: difficulty === "easy" ? 10 : difficulty === "normal" ? 24 : 45, reason: "예상 시간과 완료 결과의 복잡도를 함께 반영한 임시 평가입니다." };
}

function createAcceptancePreview(quest: ManagerLlmQuestSpec, request: ManagerLlmRequest, evaluation: ManagerLlmDifficultyEvaluation, statEvaluation: ManagerStatEvaluation, behaviorIntent: ManagerBehaviorIntent): ManagerQuestAcceptancePreview {
  const domains = request.activePlan?.goalBrief.inferredDomains ?? inferDomains(request.profile.rawGoalText);
  return {
    finalizedQuest: quest,
    difficulty: evaluation.difficulty,
    rewardExp: evaluation.rewardExp,
    statEvaluation,
    reason: "현재 목표와 퀘스트 의미를 기준으로 임시 보상을 계산했습니다.",
    assessment: {
      taskDomains: domains,
      timeLoad: toFactor(Math.ceil(quest.estimatedMinutes / 20)),
      cognitiveLoad: toFactor(domains.some((domain) => domain === "study" || domain === "exam" || domain === "career") ? 3 : 2),
      physicalLoad: toFactor(domains.includes("exercise") ? 4 : 1),
      skillNovelty: toFactor(quest.prerequisites.length > 0 ? 3 : 2),
      outputComplexity: toFactor(quest.completionCriteria.length >= 3 ? 4 : 2),
      recoveryRisk: toFactor(request.managerContext.lastQuestResult === "failed" ? 4 : 1),
      reason: "예상 시간, 완료 기준, 실행 조건과 최근 기록을 함께 확인했습니다.",
    },
    managerLine: behaviorIntent.line,
    behaviorIntent,
  };
}

function createCleanStatEvaluation(request: ManagerLlmRequest, difficulty: "easy" | "normal" | "hard"): ManagerStatEvaluation {
  const domains = request.activePlan?.goalBrief.inferredDomains ?? inferDomains(request.profile.rawGoalText);
  const questType = domains.includes("exercise") ? "action" : request.questState.currentQuest?.type ?? "time";
  return createRuleFallbackStatEvaluation({ questType, eventType: request.questState.status === "failed" ? "quest_failed" : request.questState.status === "recovery" ? "recovery_completed" : "quest_completed", difficulty });
}

function createBehaviorIntent(request: ManagerLlmRequest, line: string): ManagerBehaviorIntent {
  return { behaviorStyle: request.persona.behaviorStyle, tone: request.persona.tone, line, suggestedBehaviorBias: [] };
}

function createManagerLine(request: ManagerLlmRequest): string {
  if (request.questState.status === "failed" || request.managerContext.lastQuestResult === "failed") return "괜찮아. 실패 이유를 반영해 다음 행동을 다시 맞출게.";
  if (request.dailyCapacity.status === "over_capacity") return "기준 시간은 넘었어. 원한다면 무리하지 않는 다음 행동을 이어가자.";
  if (request.dailyCapacity.status === "capacity_reached") return "오늘 기준 시간을 채웠어. 더 하고 싶다면 다음 행동도 준비할게.";
  return `${request.profile.nickname}, 목표를 향한 다음 행동부터 차분히 시작하자.`;
}

function toLegacyQuest(quest: ManagerLlmQuestSpec, evaluation: ManagerLlmDifficultyEvaluation): ManagerLlmQuestInput {
  const type = quest.tracking.mode === "counter" ? "quantity" : quest.tracking.mode === "check" ? "action" : "time";
  return { title: quest.displayTitle, type, amount: Math.max(1, Math.round(quest.tracking.targetAmount ?? (type === "time" ? quest.estimatedMinutes : 1))), unit: quest.tracking.targetUnit ?? (type === "time" ? "분" : "회"), difficulty: evaluation.difficulty, deadline: "오늘 23:59", rewardExp: evaluation.rewardExp };
}

function inferDomains(rawGoalText: string): ManagerLlmDomain[] {
  const goal = rawGoalText.toLowerCase();
  if (/시험|자격증|수능|exam|certificate/.test(goal)) return ["exam", "study"];
  if (/운동|달리기|근력|러닝|exercise|run/.test(goal)) return ["exercise", "habit"];
  if (/요리|레시피|cooking|recipe/.test(goal)) return ["cooking"];
  if (/그림|음악|글쓰기|창작|creative|design/.test(goal)) return ["creative"];
  if (/취업|포트폴리오|면접|career|job/.test(goal)) return ["career", "study"];
  if (/공부|학습|study|learn/.test(goal)) return ["study"];
  if (/습관|매일|habit/.test(goal)) return ["habit"];
  return ["general"];
}

function resolveFallbackWeekCount(targetDate: string | null | undefined): number {
  if (!targetDate) return 4;
  const targetTime = Date.parse(`${targetDate}T23:59:59`);
  if (!Number.isFinite(targetTime)) return 4;
  const requestedWeeks = Math.ceil((targetTime - Date.now()) / (7 * 24 * 60 * 60 * 1_000));
  return requestedWeeks <= 4 ? 4 : Math.max(8, Math.min(12, requestedWeeks));
}

function toFactor(value: number): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, value)) as 1 | 2 | 3 | 4 | 5;
}
