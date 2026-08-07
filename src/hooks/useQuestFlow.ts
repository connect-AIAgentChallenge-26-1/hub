import type { Dispatch, SetStateAction } from "react";
import type { WindowId } from "../data/windowRegistry";
import type { CreateQuestEventRequest } from "../layers/storage/questLogApi";
import type { ManagerState, UserProfile } from "../domain/appState";
import { getPersonaLine } from "../domain/managerPersonaPolicy";
import {
  applyQuestAcceptancePreviewToQuest,
  applyQuestPatch,
  createQuestDraftSnapshotKey,
  getQuestCompletionResult,
  getQuestWorkflowWindows,
  isQuestAcceptancePreviewCurrent,
  type QuestAcceptancePreviewState,
  type QuestStatus,
} from "../domain/questFlowPolicy";
import { createRecoveryQuest, type Quest } from "../domain/questLogic";

export interface UseQuestFlowInput {
  quest: Quest;
  questStatus: QuestStatus;
  profile: UserProfile;
  manager: ManagerState;
  selectedFailureReason: string;
  setQuest: Dispatch<SetStateAction<Quest>>;
  setQuestStatus: Dispatch<SetStateAction<QuestStatus>>;
  setManager: Dispatch<SetStateAction<ManagerState>>;
  setPreviousQuestTitle: Dispatch<SetStateAction<string>>;
  setWorkflowWindows: (nextWindows: WindowId[]) => void;
  resetOpenWindows: (nextWindows: WindowId[]) => void;
  openWindow: (id: WindowId) => void;
  addExp: (manager: ManagerState, exp: number, line: string) => ManagerState;
  getManagerPersona: (manager: ManagerState, profile: UserProfile) => Parameters<typeof getPersonaLine>[1];
  recordOutcomeStreak: (result: "success" | "failed") => void;
  saveQuestEvent: (request: CreateQuestEventRequest) => void;
  recommendQuest?: () => void;
  acceptancePreview: QuestAcceptancePreviewState | null;
  acceptedPreview: QuestAcceptancePreviewState | null;
  setAcceptancePreview: Dispatch<SetStateAction<QuestAcceptancePreviewState | null>>;
  setAcceptedPreview: Dispatch<SetStateAction<QuestAcceptancePreviewState | null>>;
  onAcceptNeedsPreview?: () => void;
  onQuestAccepted?: () => void;
  onQuestStopped?: () => void;
  createQuestEventRequest: (
    quest: Quest,
    result: NonNullable<CreateQuestEventRequest["result"]>,
    expDelta: number,
    managerMoodAfter: ManagerState["mood"],
    options?: {
      failureReason?: string | null;
      previousQuestTitle?: string | null;
      managerLine?: string | null;
      managerBefore?: ManagerState;
      managerAfter?: ManagerState;
      soundEnabled?: boolean;
      statEvaluation?: QuestAcceptancePreviewState["preview"]["statEvaluation"];
      statEvaluationSource?: "llm" | "rule_fallback" | "quest_acceptance_preview";
      questAcceptancePreviewReason?: string;
      actualDurationMinutes?: number;
      plannedEstimatedMinutes?: number;
      plannedTargetAmount?: number;
    },
  ) => CreateQuestEventRequest;
}

export function useQuestFlow({
  quest,
  questStatus,
  profile,
  manager,
  selectedFailureReason,
  setQuest,
  setQuestStatus,
  setManager,
  setPreviousQuestTitle,
  setWorkflowWindows,
  resetOpenWindows,
  openWindow,
  addExp,
  getManagerPersona,
  recordOutcomeStreak,
  saveQuestEvent,
  recommendQuest,
  acceptancePreview,
  acceptedPreview,
  setAcceptancePreview,
  setAcceptedPreview,
  onAcceptNeedsPreview,
  onQuestAccepted,
  onQuestStopped,
  createQuestEventRequest,
}: UseQuestFlowInput) {
  function openTodayQuest() {
    if (questStatus === "success") {
      setQuestStatus("draft");
      setPreviousQuestTitle("");
      setAcceptancePreview(null);
      setAcceptedPreview(null);
      setManager((current) => ({ ...current, mood: "waiting", line: getPersonaLine("quest_recommended", getManagerPersona(current, profile)) }));
      setWorkflowWindows(["quest", "manager"]);
      recommendQuest?.();
      return;
    }

    const workflowWindows = getQuestWorkflowWindows(questStatus);
    if (workflowWindows) {
      setWorkflowWindows(workflowWindows);
      return;
    }

    openWindow("quest");
  }

  function updateQuest(patch: Partial<Quest>) {
    setQuest((current) => applyQuestPatch(current, patch));
  }

  function acceptQuest() {
    const currentPreview = acceptancePreview;
    if (!currentPreview || !isQuestAcceptancePreviewCurrent(quest, currentPreview)) {
      setAcceptancePreview(null);
      onAcceptNeedsPreview?.();
      return;
    }

    const acceptedQuest = applyQuestAcceptancePreviewToQuest(quest, currentPreview.preview);
    setQuest(acceptedQuest);
    setAcceptedPreview({
      snapshotKey: createQuestDraftSnapshotKey(acceptedQuest),
      preview: currentPreview.preview,
    });
    setQuestStatus("active");
    onQuestAccepted?.();
    setWorkflowWindows(["runner", "manager"]);
    setManager((current) => ({
      ...current,
      mood: "focused",
      line: currentPreview.preview.managerLine || getPersonaLine("quest_started", getManagerPersona(current, profile)),
      behaviorStyle: currentPreview.preview.behaviorIntent?.behaviorStyle ?? current.behaviorStyle,
      behaviorIntent: currentPreview.preview.behaviorIntent ?? current.behaviorIntent,
    }));
  }

  function completeQuest() {
    onQuestStopped?.();
    const result = getQuestCompletionResult(questStatus);
    recordOutcomeStreak("success");
    const eventLine = getPersonaLine("quest_completed", getManagerPersona(manager, profile));
    const nextManager = addExp(manager, quest.rewardExp, eventLine);
    const currentAcceptedPreview = acceptedPreview;
    const preview = currentAcceptedPreview && isQuestAcceptancePreviewCurrent(quest, currentAcceptedPreview) ? currentAcceptedPreview.preview : null;
    setManager((current) => addExp(current, quest.rewardExp, getPersonaLine("quest_completed", getManagerPersona(current, profile))));
    saveQuestEvent(createQuestEventRequest(quest, result, quest.rewardExp, "happy", {
      managerLine: eventLine,
      managerBefore: manager,
      managerAfter: nextManager,
      soundEnabled: manager.soundEnabled,
      statEvaluation: preview?.statEvaluation,
      statEvaluationSource: preview ? "quest_acceptance_preview" : undefined,
      questAcceptancePreviewReason: preview?.reason,
    }));
    setQuestStatus("success");
    setAcceptedPreview(null);
    setWorkflowWindows(["manager"]);
  }

  function startFailureFlow() {
    onQuestStopped?.();
    setQuestStatus("failed");
    setManager((current) => ({ ...current, mood: "recovering", line: getPersonaLine("quest_failed", getManagerPersona(current, profile)) }));
    setWorkflowWindows(["failure", "manager"]);
  }

  function createRecovery() {
    recordOutcomeStreak("failed");
    setPreviousQuestTitle(quest.title);
    saveQuestEvent(createQuestEventRequest(quest, "failed", 0, "recovering", { failureReason: selectedFailureReason, managerLine: getPersonaLine("quest_failed", getManagerPersona(manager, profile)), managerBefore: manager, managerAfter: manager, soundEnabled: manager.soundEnabled }));
    setQuest(createRecoveryQuest(quest));
    setQuestStatus("recovery");
    setAcceptancePreview(null);
    setAcceptedPreview(null);
    setWorkflowWindows(["recovery", "manager"]);
    setManager((current) => ({ ...current, mood: "recovering", line: getPersonaLine("recovery_created", getManagerPersona(current, profile)) }));
  }

  function editRecovery() {
    resetOpenWindows(["quest"]);
  }

  return {
    openTodayQuest,
    updateQuest,
    acceptQuest,
    completeQuest,
    startFailureFlow,
    createRecovery,
    editRecovery,
  };
}
