import type { WindowId } from "../data/windowRegistry";
import type { ManagerStatEvaluation } from "./statGrowth";
import type { ManagerBehaviorIntent } from "./managerBehaviorIntent";
import type { Difficulty, Quest, QuestType } from "./questLogic";

export type QuestStatus = "draft" | "active" | "success" | "failed" | "recovery";

export type QuestCompletionResult = "success" | "recovery";
export type QuestWindowView = QuestStatus | "planning" | "empty";
export interface QuestPlanningLock { current: boolean }

export interface QuestAcceptancePreview {
  finalizedQuest?: {
    displayTitle: string;
    instruction: string;
    estimatedMinutes: number;
    tracking: {
      mode: "timer" | "counter" | "check";
      targetAmount?: number;
      targetUnit?: string;
    };
  };
  difficulty: Difficulty;
  rewardExp: number;
  statEvaluation: ManagerStatEvaluation;
  reason: string;
  managerLine?: string;
  behaviorIntent?: ManagerBehaviorIntent;
}

export interface QuestAcceptancePreviewState {
  snapshotKey: string;
  preview: QuestAcceptancePreview;
}

export function getQuestWorkflowWindows(status: QuestStatus): WindowId[] | null {
  if (status === "active") return ["runner", "manager"];
  if (status === "failed") return ["failure", "manager"];
  if (status === "recovery") return ["recovery", "manager"];
  if (status === "success") return ["manager"];
  return null;
}

export function getQuestCompletionResult(status: QuestStatus): QuestCompletionResult {
  return status === "recovery" ? "recovery" : "success";
}

export function getQuestWindowView(input: { status: QuestStatus; hasQuestSpec: boolean; isPlanning: boolean }): QuestWindowView {
  if (input.isPlanning) return "planning";
  if (input.status === "draft" && !input.hasQuestSpec) return "empty";
  return input.status;
}

export function acquireQuestPlanningLock(lock: QuestPlanningLock): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseQuestPlanningLock(lock: QuestPlanningLock): void {
  lock.current = false;
}

export function getQuestUnit(type: QuestType) {
  if (type === "time") return "분";
  if (type === "quantity") return "개";
  return "회";
}

export function calculateQuestReward(difficulty: Difficulty, amount: number, type: QuestType) {
  const base = difficulty === "easy" ? 6 : difficulty === "hard" ? 28 : 16;
  const amountBonus = type === "time" ? Math.floor(amount / 10) * 4 : Math.floor(amount / 5) * 3;
  return Math.max(5, Math.min(60, base + amountBonus));
}

export function applyQuestPatch(current: Quest, patch: Partial<Quest>): Quest {
  const nextType = patch.type ?? current.type;
  const nextAmount = patch.amount ?? current.amount;
  const nextDifficulty = patch.difficulty ?? current.difficulty;
  const nextUnit = patch.type && patch.type !== current.type ? getQuestUnit(patch.type) : patch.unit ?? current.unit;

  return {
    ...current,
    ...patch,
    type: nextType,
    amount: nextAmount,
    difficulty: nextDifficulty,
    unit: nextUnit,
    rewardExp: calculateQuestReward(nextDifficulty, nextAmount, nextType),
  };
}

export function applyDifficultyEvaluationToQuest(
  current: Quest,
  evaluation: { difficulty: Difficulty; rewardExp: number; reason?: string },
): Quest {
  return {
    ...current,
    difficulty: evaluation.difficulty,
    rewardExp: evaluation.rewardExp,
  };
}

export function createQuestDraftSnapshotKey(quest: Quest): string {
  return JSON.stringify({
    title: quest.title,
    type: quest.type,
    amount: quest.amount,
    unit: quest.unit,
    deadline: quest.deadline,
  });
}

export function isQuestAcceptancePreviewCurrent(quest: Quest, previewState: QuestAcceptancePreviewState | null): boolean {
  return previewState?.snapshotKey === createQuestDraftSnapshotKey(quest);
}

export function applyQuestAcceptancePreviewToQuest(quest: Quest, preview: QuestAcceptancePreview): Quest {
  const finalized = preview.finalizedQuest;
  const type: QuestType = finalized?.tracking.mode === "counter"
    ? "quantity"
    : finalized?.tracking.mode === "check"
      ? "action"
      : "time";
  const amount = finalized
    ? Math.max(1, Math.round(finalized.tracking.targetAmount ?? (type === "time" ? finalized.estimatedMinutes : 1)))
    : quest.amount;
  return {
    ...quest,
    ...(finalized ? {
      title: finalized.displayTitle,
      type,
      amount,
      unit: finalized.tracking.targetUnit ?? getQuestUnit(type),
    } : {}),
    difficulty: preview.difficulty,
    rewardExp: preview.rewardExp,
  };
}
