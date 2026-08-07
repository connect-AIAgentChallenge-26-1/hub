import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AnimationEvent, CSSProperties, FormEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import { CanvasSpriteAnimator } from "./components/CanvasSpriteAnimator";
import { useCallback } from "react";
import { createInitialManagerState, defaultManagerCandidatePetId, managerCandidates } from "./data/managerCandidates";
import {
  getDesktopIconAsset,
  getPetAnimationAsset,
  hasPetAnimationAsset,
  getLumiAnimationAsset,
  getRenderablePetStage,
  getUnlockedPetStages,
  projectionModeAssets,
  interactionObjectAssets,
  resolvePixelTvWatchingAnimationAsset,
  soundAssets,
  defaultLumiPetId,
  lumiMoodToSpriteState,
  resolveDesktopPetSpriteState,
  resolvePetStageFromLevel,
  resolveSupportedPetAnimationState,
  type DesktopIconId,
  type InteractionObjectAsset,
  type PetAnimationState,
  type LumiSpriteState,
  type PetId,
  type PetStageId,
} from "./data/assetManifest";
import { prependQuestLog, questLogMarks, questLogResultLabels } from "./data/questLogs";
import type { QuestLog } from "./data/questLogs";
import {
  resolveWindowPetLayerZIndex,
  resolveWindowPetPlacementForSlot,
  resolveWindowPetPosition,
  runtimeWindowPetSlots,
  windowPetRuntimeBaseSpriteSize,
} from "./data/windowPetPlacements";
import {
  defaultOpenWindowIds,
  desktopShortcutWindowIds,
  initialWindowPositions,
  initialWindowSizes,
  windowRegistry,
  type WindowId,
  type WindowPosition,
  type WindowSize,
} from "./data/windowRegistry";
import { createQuestEventViaApi, fetchDailyCapacityBonusDatesViaApi } from "./layers/storage/questLogApi";
import type { CreateQuestEventRequest, ManagerContext, QuestEventType } from "./layers/storage/questLogApi";
import {
  managerLlmPromptVersion,
  requestManagerGoalPlanViaApi,
  requestManagerNextQuestViaApi,
  requestManagerPlanRebalanceViaApi,
  requestManagerQuestAcceptancePreviewViaApi,
  requestManagerStatEvaluationViaApi,
  type ManagerLlmOutputKind,
  type ManagerLlmRequest,
  type ManagerGoalPlan,
  type ManagerLlmQuestSpec,
} from "./layers/storage/managerLlmApi";
import { createQuestLogRepository } from "./layers/storage/questLogRepository";
import { usePixelTvMode } from "./hooks/usePixelTvMode";
import { questLogSyncMessages, useQuestLogSync, type QuestLogSyncState } from "./hooks/useQuestLogSync";
import { useWindowManager, type WindowChromeProps, type WindowRect } from "./hooks/useWindowManager";
import { useWindowPetPlacementProfile } from "./hooks/useWindowPetPlacementDrafts";
import { useOutsidePetRuntime } from "./hooks/useOutsidePetRuntime";
import { useQuestFlow } from "./hooks/useQuestFlow";
import { getRestartServiceTarget } from "./domain/appLifecyclePolicy";
import type { ManagerState, ManagerTone, QuestOutcomeStreak, UserProfile } from "./domain/appState";
import { getDailyCapacityBonusExp, splitDailyMinutes, summarizeDailyCapacity, toDailyMinutes, toLocalDate, type DailyCapacityContext } from "./domain/dailyCapacityPolicy";
import { resolveManagerWindowInteraction, shouldShowManagerWindowInteraction, type ManagerWindowInteractionState } from "./domain/managerRuntimePriority";
import { resolveBlinkFocusEffect, type BlinkEntryReason, type BlinkFocusMode } from "./domain/blinkFocusPolicy";
import { getClimbPosition, type InteractionObject, type ResizeAxis } from "./domain/interactionObjects";
import { applyManagerSpriteSelection } from "./domain/managerSpriteSelection";
import { resolveManagerBehavior } from "./domain/managerBehaviorAdapter";
import { normalizeManagerBehaviorIntent, type ManagerBehaviorIntent } from "./domain/managerBehaviorIntent";
import { getPersonaLine, resolveManagerPersona, type ManagerPersona } from "./domain/managerPersonaPolicy";
import { applyManagerExpGain, getManagerExpProgressPercent, managerExpPerLevel } from "./domain/managerProgression";
import type { BehaviorContext, PetBehaviorMood, PetBehaviorRecentEvent, PetBehaviorStyle } from "./domain/petBehaviorStateMachine";
import {
  outsidePetFieldRect,
  outsidePetInitialState,
  outsidePetSpriteSize,
  resolveAvailableOutsidePetRoamAnimations,
  resolveRenderedOutsidePet,
  resolveOutsidePetLayerZIndex,
  shouldMirrorOutsidePet,
  shouldUseImmediateOutsidePetPosition,
  type InteractionSpritePosition,
  type OutsidePetSide,
  type OutsidePetState,
} from "./domain/outsidePetRuntime";
import {
  canPixelizeSource,
  createPixelTvPhotoFileName,
  createPixelTvPhotoCapturePlan,
  createPixelizerPlanForStream,
  getPixelizerCoverSize,
  resolvePixelTvStreamSettings,
  transformPixelTvSamplePixels,
  type PixelizerPlan,
  type PixelTvPhotoCaptureRect,
} from "./domain/pixelizer";
import {
  acquireQuestPlanningLock,
  calculateQuestReward,
  createQuestDraftSnapshotKey,
  getQuestWindowView,
  releaseQuestPlanningLock,
  type QuestAcceptancePreviewState,
  type QuestStatus,
} from "./domain/questFlowPolicy";
import { type Difficulty, type Quest, type QuestType } from "./domain/questLogic";
import { getRecoveryRewardCandidates } from "./domain/rewardProgression";
import { resolveSoundAssetId, type SoundEvent } from "./domain/soundPolicy";
import { applyManagerStatDeltas, createInitialManagerStats, createRuleFallbackStatEvaluation, type StatDelta, type StatKey } from "./domain/statGrowth";
import { formatKoreanClockTime, formatRemainingUntilEndOfDay } from "./domain/timeFormatting";
import "./styles.css";

type AppScreen = "manager-select" | "wizard" | "manager-created" | "desktop";
type OutsidePetPhase = "inside" | "blink" | "peek_from_edge" | "walk_in" | "free_roam" | "returning";
type ManagerRuntimeLocation = "manager_window" | "window_edge" | "outside" | "transition";

interface BlinkFocusState {
  id: number;
  mode: BlinkFocusMode;
  reducedMotion: "fade" | "full";
}

interface QuestRewardPreviewUiState {
  status: "idle" | "loading" | "ready" | "error" | "stale";
  message: string;
}

interface DesktopContextMenuState {
  x: number;
  y: number;
}

interface ManagerRuntimeState {
  location: ManagerRuntimeLocation;
  mood: ManagerState["mood"];
  stage: PetStageId;
  animation: PetAnimationState | LumiSpriteState;
  windowInteraction: ManagerWindowInteractionState;
  outside: OutsidePetState;
  petAwayFromManagerWindow: boolean;
  showOutsidePet: boolean;
}

interface ManagerRuntimeStateInput {
  manager: ManagerState;
  displayStage: PetStageId;
  outsidePet: OutsidePetState;
  showPixelTvWatching: boolean;
  showQuestHangingPet: boolean;
  showRecoveryHidingPet: boolean;
  supportsQuestHangingPet: boolean;
  supportsRecoveryHidingPet: boolean;
  showOutsidePet: boolean;
}

interface StartMenuProps {
  questStatus: QuestStatus;
  onOpenWindow: (id: WindowId) => void;
  onRestart: () => void;
  onOpenManagerSelect: () => void;
}

interface DesktopContextMenuProps {
  x: number;
  y: number;
  onOpenProperties: () => void;
}

interface PixelTvPropertiesWindowProps {
  connected: boolean;
  onToggle: () => void;
}

interface PixelTvSourceSize {
  width: number;
  height: number;
}

type PixelTvCameraState = "idle" | "requesting" | "live" | "error";

interface PixelTvWindowProps {
  manager: ManagerState;
  stage: PetStageId;
}

interface BlinkFocusOverlayProps {
  effect: BlinkFocusState | null;
  onDone: () => void;
}

interface ManagerSelectWindowProps {
  selectedPetId: PetId;
  onSelect: (petId: PetId) => void;
  onContinue: () => void;
}

interface ProfileSetupWizardProps {
  draft: UserProfile;
  needsClarify: boolean;
  clarificationQuestion?: string;
  clarificationOptions?: string[];
  isPlanning: boolean;
  onChange: (profile: UserProfile) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

interface QuestWindowProps {
  quest: Quest;
  questSpec: ManagerLlmQuestSpec | null;
  isPlanning: boolean;
  status: QuestStatus;
  rewardPreviewState: QuestRewardPreviewUiState;
  rewardPreview: QuestAcceptancePreviewState | null;
  onQuestChange: (patch: Partial<Quest>) => void;
  onPreviewReward: () => void;
  onAccept: () => void;
  onOpenRunner: () => void;
  onRecommendNext: () => void;
}

interface QuestRunnerWindowProps {
  quest: Quest;
  onComplete: () => void;
  onFail: () => void;
}

interface FailureWindowProps {
  selectedFailureReason: string;
  onReasonChange: (reason: string) => void;
  onCreateRecovery: () => void;
}

interface RecoveryWindowProps {
  quest: Quest;
  onEdit: () => void;
  onAccept: () => void;
}

interface ManagerWindowProps {
  manager: ManagerState;
  petAway?: boolean;
}

interface SettingsWindowProps {
  manager: ManagerState;
  onSelectStage: (stage: PetStageId) => void;
  onToggleSound: () => void;
}

interface ProfileWindowProps {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
}

interface JournalWindowProps {
  logs: QuestLog[];
  sync: QuestLogSyncState;
}

interface XpWindowProps {
  id?: WindowId;
  title: string;
  titlebarIcon?: string;
  className: string;
  children: ReactNode;
  position?: WindowPosition;
  size?: WindowSize;
  resizeAxis?: ResizeAxis;
  zIndex?: number;
  isActive?: boolean;
  onFocus?: () => void;
  onMove?: (position: WindowPosition) => void;
  onResize?: (size: WindowSize) => void;
  onMeasure?: (rect: WindowRect) => void;
  onMinimize?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
}

interface WindowIconMarkProps {
  id?: WindowId;
  fallback?: string;
  className: string;
}

interface DesktopIconProps {
  label: string;
  type: WindowId;
  onClick: () => void;
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
  assetId?: DesktopIconId;
  overrideIdleSrc?: string;
  overrideHoverSrc?: string;
  disabled?: boolean;
}

interface OutsidePetLayerProps {
  pet: OutsidePetState;
  petId: PetId;
  stage: PetStageId;
  objectZIndexes: Partial<Record<string, number>>;
}

interface WindowPetInteractionProps {
  state: Extract<LumiSpriteState, "hanging" | "hiding" | "focused">;
  petId: PetId;
  stage: PetStageId;
  placement: "below-quest" | "beside-recovery";
  position: WindowPosition;
  measuredRect?: WindowRect;
  zIndex: number;
}

interface PixelTvWatchingPetProps {
  petId: PetId;
  stage: PetStageId;
  position: WindowPosition;
  measuredRect?: WindowRect;
  zIndex: number;
}

interface DesktopPetProps {
  mood: ManagerState["mood"];
  petId: PetId;
  stage: PetStageId;
  large?: boolean;
}

const profileKey = "manager-xp.profile.v1";
const managerKey = "manager-xp.manager.v1";
const lifecycleResetAtKey = "manager-xp.lifecycle-reset-at.v1";
const managerPlanKey = "manager-xp.goal-plan.v3";
const managerPlanIdKey = "manager-xp.goal-plan-id.v3";
const dailyCapacityBonusDatesKey = "manager-xp.daily-capacity-bonus-dates.v1";
const questLogRepository = createQuestLogRepository();

const categoryLabels: Record<UserProfile["category"], string> = {
  study: "공부",
  exercise: "운동",
  hobby: "취미",
  career: "커리어",
  habit: "생활 습관",
};

const difficultyLabels: Record<Difficulty, string> = {
  easy: "쉬움",
  normal: "보통",
  hard: "어려움",
};

const questTypeLabels: Record<QuestType, string> = {
  time: "시간형",
  quantity: "수량형",
  action: "행동형",
};

const statLabels: Record<StatKey, string> = {
  diligence: "성실성",
  persistence: "끈기",
  creativity: "창의성",
  knowledge: "지식",
  strength: "힘",
  agility: "민첩함",
  stamina: "체력",
  charm: "매력",
};

const rewardCandidateLabels: Record<string, string> = {
  character_animation: "동작",
  desktop_theme: "테마",
  sound: "사운드",
  memory_fragment: "기억 조각",
  gentle_recovery_tone: "복구 톤",
};

const stageLabels: Record<PetStageId, string> = {
  "stage-1": "Stage 1",
  "stage-2": "Stage 2",
  "stage-3": "Stage 3",
  "stage-4": "Stage 4",
};

const toneLines: Record<ManagerTone, string> = {
  calm: "기다리고 있었어. 오늘 할 분량은 네가 정해도 돼.",
  friendly: "좋아, 오늘은 우리 페이스로 하나만 해보자.",
  firm: "좋아. 지금 가능한 작은 걸 정하고 끝까지 가보자.",
};

const managerStatusLabels: Record<ManagerState["mood"], string> = {
  waiting: "기다리는 중",
  focused: "진행 중",
  happy: "함께 성장했어",
  recovering: "리밸런싱",
};

const managerStatusIcons: Record<ManagerState["mood"], string> = {
  waiting: "..",
  focused: "▶",
  happy: "★",
  recovering: "\u21BB",
};

const failureReasons = ["시간이 부족했다", "목표가 너무 컸다", "집중이 안 됐다", "컨디션이 좋지 않았다", "까먹었다"];


const defaultProfile: UserProfile = {
  name: "",
  nickname: "",
  goal: "정보처리기사 자격증 취득",
  category: "study",
  goalPeriod: "6주",
  targetDate: "",
  dailyMinutes: 30,
  questSize: "balanced",
  managerTone: "calm",
  focusAnswer: "",
};

const defaultManager: ManagerState = {
  ...createInitialManagerState(),
};

const interactionObjectDesktopWindowIds = desktopShortcutWindowIds.filter(
  (id): id is "ladderObject" | "platformObject" => id === "ladderObject" || id === "platformObject",
);

const interactionObjectDesktopIconSrc: Record<(typeof interactionObjectDesktopWindowIds)[number], string> = {
  ladderObject: "/assets/interaction-objects/ladder/ladder.png",
  platformObject: "/assets/interaction-objects/platform/base.png",
};

const outsidePetRoamFallbackAnimations: PetAnimationState[] = ["idle", "walk", "run", "happy", "focused", "jump", "climbing"];

function readStorage<T>(key: string, fallback: T): T {
  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function normalizeManager(manager: ManagerState): ManagerState {
  const unlockedStages = manager.unlockedStages?.length ? manager.unlockedStages : getUnlockedPetStages(manager.level);
  const selectedStage = manager.selectedStage && unlockedStages.includes(manager.selectedStage) ? manager.selectedStage : null;
  return {
    ...manager,
    petId: manager.petId ?? defaultLumiPetId,
    stats: { ...createInitialManagerStats(), ...manager.stats },
    behaviorStyle: normalizeBehaviorStyle(manager.behaviorStyle),
    behaviorIntent: manager.behaviorIntent ? normalizeManagerBehaviorIntent(manager.behaviorIntent) : undefined,
    unlockedStages,
    selectedStage,
    soundEnabled: manager.soundEnabled === true,
  };
}

function normalizeBehaviorStyle(value: unknown): PetBehaviorStyle {
  if (value === "adventurous" || value === "shy" || value === "balanced") return value;
  return "balanced";
}

function getManagerPersona(manager: ManagerState, profile: UserProfile): ManagerPersona {
  return resolveManagerPersona({
    petId: manager.petId,
    tone: profile.managerTone,
    questStyle: profile.questSize,
  });
}

function createRuleFallbackManagerIntent(
  manager: ManagerState,
  tone: ManagerTone,
  streak: QuestOutcomeStreak,
): ManagerBehaviorIntent {
  const behaviorStyle = normalizeBehaviorStyle(manager.behaviorStyle);
  const persona = resolveManagerPersona({ petId: manager.petId, tone, questStyle: "balanced" });
  const line = manager.line || getPersonaLine("context_idle", persona);

  if (streak.result === "success" && streak.count >= 2) {
    return {
      behaviorStyle,
      tone,
      line,
      suggestedBehaviorBias: [
        { state: "jump_to_platform", weightDelta: 2, reason: "success_streak" },
        { state: "approach_ladder", weightDelta: 1, reason: "success_streak" },
      ],
    };
  }

  if (streak.result === "failed") {
    return {
      behaviorStyle: behaviorStyle === "adventurous" ? "balanced" : behaviorStyle,
      tone,
      line,
      suggestedBehaviorBias: [
        { state: "hide_behind_window", weightDelta: 2, reason: "recent_failure" },
        { state: "rest", weightDelta: 1, reason: "recent_failure" },
      ],
    };
  }

  return {
    behaviorStyle,
    tone,
    line,
    suggestedBehaviorBias: [],
  };
}

function createEmptyQuest(): Quest {
  return { title: "다음 퀘스트 준비 중", type: "action", amount: 1, unit: "회", difficulty: "easy", deadline: "오늘 23:59", rewardExp: 0 };
}

function toQuestSpec(quest: Quest, activePlan?: ManagerGoalPlan | null): ManagerLlmQuestSpec {
  const planned = activePlan?.currentQuest.displayTitle === quest.title ? activePlan.currentQuest : activePlan?.currentQuest;
  if (planned) {
    return {
      ...planned,
      displayTitle: quest.title,
      instruction: planned.instruction,
      estimatedMinutes: quest.type === "time" ? quest.amount : planned.estimatedMinutes,
      tracking: {
        mode: quest.type === "time" ? "timer" : quest.type === "quantity" ? "counter" : "check",
        targetAmount: quest.amount,
        targetUnit: quest.unit,
      },
    };
  }

  return {
    id: "daily-current",
    displayTitle: quest.title,
    instruction: quest.title,
    purpose: activePlan?.goalBrief.normalizedGoal ?? "현재 목표를 향한 다음 행동",
    completionCriteria: [`${quest.amount}${quest.unit} 완료`],
    estimatedMinutes: quest.type === "time" ? quest.amount : 15,
    environmentConstraints: [],
    prerequisites: [],
    linkedMilestoneId: activePlan?.milestones[0]?.id ?? "milestone-1",
    linkedWeeklyPlanId: activePlan?.weeklyPlans[0]?.id ?? "week-1",
    status: "planned",
    tracking: {
      mode: quest.type === "time" ? "timer" : quest.type === "quantity" ? "counter" : "check",
      targetAmount: quest.amount,
      targetUnit: quest.unit,
    },
  };
}

function toQuestFromSpec(spec: ManagerLlmQuestSpec): Quest {
  const type: QuestType = spec.tracking.mode === "timer" ? "time" : spec.tracking.mode === "counter" ? "quantity" : "action";
  const amount = spec.tracking.targetAmount ?? (type === "time" ? spec.estimatedMinutes : 1);
  const unit = spec.tracking.targetUnit ?? (type === "time" ? "분" : type === "quantity" ? "개" : "회");
  return {
    title: spec.displayTitle,
    type,
    amount,
    unit,
    difficulty: "easy",
    deadline: "오늘 23:59",
    rewardExp: 0,
  };
}

function createClientFallbackQuestSpec(plan: ManagerGoalPlan): ManagerLlmQuestSpec {
  const previous = plan.currentQuest;
  const weeklyFocus = plan.weeklyPlans.find((item) => item.status === "active") ?? plan.weeklyPlans[0];
  return {
    ...previous,
    id: `fallback-${Date.now()}`,
    displayTitle: "직전 단계 이어서 진행하기",
    instruction: previous.instruction,
    purpose: weeklyFocus?.statement ?? previous.purpose,
    completionCriteria: previous.completionCriteria.slice(0, 1),
    estimatedMinutes: Math.min(15, previous.estimatedMinutes),
    adaptationReason: "LLM 연결 실패로 직전 수행 맥락을 유지한 최소 퀘스트",
    status: "planned",
    tracking: { ...previous.tracking, targetAmount: previous.tracking.mode === "timer" ? Math.min(15, previous.estimatedMinutes) : previous.tracking.targetAmount },
  };
}

function addExp(manager: ManagerState, exp: number, line: string): ManagerState {
  return applyManagerExpGain(manager, exp, line);
}

function getManagerDisplayStage(manager: ManagerState): PetStageId {
  return manager.selectedStage ?? resolvePetStageFromLevel(manager.level);
}

function getNewlyUnlockedStages(previousStages: PetStageId[], nextStages: PetStageId[]) {
  return nextStages.filter((stage) => !previousStages.includes(stage));
}

function toDeadlineAt(deadline: string) {
  const match = deadline.match(/오늘\s+(\d{2}):(\d{2})/);
  if (!match) return null;

  const date = new Date();
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date.toISOString();
}

function createQuestEventRequest(
  quest: Quest,
  result: NonNullable<CreateQuestEventRequest["result"]>,
  expDelta: number,
  managerMoodAfter: ManagerState["mood"],
  options: {
    failureReason?: string | null;
    previousQuestTitle?: string | null;
    managerLine?: string | null;
    managerBefore?: ManagerState;
    managerAfter?: ManagerState;
    soundEnabled?: boolean;
    statEvaluation?: ReturnType<typeof createRuleFallbackStatEvaluation>;
    statEvaluationSource?: "llm" | "rule_fallback" | "quest_acceptance_preview";
    statEvaluationFallbackReason?: string;
    questAcceptancePreviewReason?: string;
    actualDurationMinutes?: number;
    plannedEstimatedMinutes?: number;
    plannedTargetAmount?: number;
    acceptedEstimatedMinutes?: number;
    dailyBaselineMinutes?: number;
    localDate?: string;
    completionCriteria?: string[];
  } = {},
): CreateQuestEventRequest {
  const eventType = getQuestEventType(result);
  const growthQuestType = result === "recovery" ? "recovery" : quest.type;
  const growthEventType = result === "recovery" ? "recovery_completed" : result === "failed" ? "quest_failed" : "quest_completed";
  const statEvaluation = options.statEvaluation ?? createRuleFallbackStatEvaluation({ questType: growthQuestType, eventType: growthEventType, difficulty: quest.difficulty });
  const statDeltas = statEvaluation.statDeltas;
  const rewardCandidates = getRewardCandidates(result);
  const recoveryRewardCandidates = getRecoveryRewardCandidates(growthEventType);
  const unlockedStagesAfter = options.managerAfter?.unlockedStages ?? options.managerBefore?.unlockedStages ?? [];
  const stageUnlocked = options.managerBefore && options.managerAfter ? getNewlyUnlockedStages(options.managerBefore.unlockedStages, options.managerAfter.unlockedStages) : [];
  const soundEvent = getSoundEventForResult(result, options.managerAfter);
  const soundAssetId = soundEvent ? getRuntimeSoundAssetId(soundEvent, options.soundEnabled === true) : null;

  return {
    type: eventType,
    quest: {
      title: quest.title,
      type: quest.type,
      amount: quest.amount,
      unit: quest.unit,
      difficulty: quest.difficulty,
      deadlineAt: toDeadlineAt(quest.deadline),
    },
    result,
    expDelta,
    failureReason: options.failureReason ?? null,
    previousQuestTitle: options.previousQuestTitle ?? null,
    managerMoodAfter,
    managerLine: options.managerLine ?? null,
    clientCreatedAt: new Date().toISOString(),
    metadata: {
      questType: quest.type,
      difficulty: quest.difficulty,
      statDeltas,
      statBudget: statEvaluation.statBudget,
      primaryStats: statEvaluation.primaryStats,
      statEvaluationReason: statEvaluation.reason,
      statEvaluationSource: options.statEvaluationSource ?? "rule_fallback",
      statEvaluationFallbackReason: options.statEvaluationFallbackReason,
      llmPromptVersion: options.statEvaluationSource === "llm" ? managerLlmPromptVersion : undefined,
      questAcceptancePreviewReason: options.questAcceptancePreviewReason,
      actualDurationMinutes: options.actualDurationMinutes,
      plannedEstimatedMinutes: options.plannedEstimatedMinutes,
      plannedTargetAmount: options.plannedTargetAmount,
      acceptedEstimatedMinutes: options.acceptedEstimatedMinutes,
      dailyBaselineMinutes: options.dailyBaselineMinutes,
      localDate: options.localDate,
      completionCriteria: options.completionCriteria,
      rewardCandidates: [...new Set([...rewardCandidates, ...recoveryRewardCandidates])],
      unlockedStagesAfter,
      stageUnlocked,
      soundEvent,
      soundAssetId,
      futureContextTargets: ["personalized_manager", "web_day_flow", "reward_system"],
    },
  };
}

function getQuestEventType(result: NonNullable<CreateQuestEventRequest["result"]>): CreateQuestEventRequest["type"] {
  if (result === "failed") return "quest_failed";
  if (result === "recovery") return "recovery_completed";
  return "quest_completed";
}

function getRewardCandidates(result: NonNullable<CreateQuestEventRequest["result"]>) {
  if (result === "failed") return ["gentle_recovery_tone"];
  if (result === "recovery") return ["memory_fragment", "character_animation"];
  return ["character_animation", "desktop_theme", "sound"];
}

function getSoundEventForResult(result: NonNullable<CreateQuestEventRequest["result"]>, manager?: ManagerState): SoundEvent {
  if (manager && manager.exp === 0 && manager.level > 1) return "level_up";
  if (result === "recovery") return "recovery";
  return result === "success" ? "complete" : "cyber_purr";
}

function getRuntimeSoundAssetId(event: SoundEvent, soundEnabled: boolean) {
  const assetId = resolveSoundAssetId(soundAssets, event, soundEnabled);
  if (!assetId) return null;
  const asset = soundAssets.find((candidate) => candidate.id === assetId);
  if (!asset || asset.src.includes("placeholder")) return null;
  return asset.id;
}

function getQuestLogStatDeltas(log: QuestLog): StatDelta[] {
  const value = log.metadata?.statDeltas;
  return normalizeStatDeltas(value);
}

function getQuestEventRequestStatDeltas(request: CreateQuestEventRequest): StatDelta[] {
  return normalizeStatDeltas(request.metadata?.statDeltas);
}

function normalizeStatDeltas(value: unknown): StatDelta[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const stat = item.stat;
    const amount = item.amount;
    if (!isStatKey(stat) || typeof amount !== "number") return [];
    return [{ stat, amount }];
  });
}

function getQuestLogRewardCandidates(log: QuestLog) {
  const value = log.metadata?.rewardCandidates;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function getQuestLogStageUnlocks(log: QuestLog) {
  const value = log.metadata?.stageUnlocked;
  if (!Array.isArray(value)) return [];
  return value.filter(isPetStageId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStatKey(value: unknown): value is StatKey {
  return typeof value === "string" && value in statLabels;
}

function isPetStageId(value: unknown): value is PetStageId {
  return typeof value === "string" && value in stageLabels;
}

function createManagerContextLine(context: ManagerContext, persona: ManagerPersona) {
  if (context.lastQuestResult === "failed") return getPersonaLine("context_failed", persona);
  if (context.lastQuestResult === "recovery") return getPersonaLine("context_recovery", persona);
  if (context.lastQuestResult === "success") return getPersonaLine("context_success", persona);
  return getPersonaLine("context_idle", persona);
}

function createManagerLlmRequest(
  outputKind: ManagerLlmOutputKind,
  input: {
    managerContext: ManagerContext;
    profile: UserProfile;
    manager: ManagerState;
    quest?: Quest;
    questStatus: QuestStatus;
    previousQuestTitle: string;
    selectedFailureReason: string;
    logs: QuestLog[];
    activePlan?: ManagerGoalPlan | null;
    activePlanId?: string | null;
    questSpec?: ManagerLlmQuestSpec | null;
    clarificationAnswer?: string;
    triggerEventId?: string;
  },
): ManagerLlmRequest {
  const persona = getManagerPersona(input.manager, input.profile);
  const dailyCapacity = getDailyCapacityContext(input.profile, input.logs, input.questStatus === "active" ? input.questSpec ?? null : null);
  return {
    promptVersion: managerLlmPromptVersion,
    outputKind,
    managerContext: input.managerContext,
    profile: {
      nickname: input.profile.nickname || "사용자",
      rawGoalText: input.profile.goal,
      dailyMinutes: input.profile.dailyMinutes,
      targetDate: input.profile.targetDate || null,
      managerTone: input.profile.managerTone,
      clarificationAnswer: input.clarificationAnswer || undefined,
    },
    persona: {
      petId: input.manager.petId,
      ...persona,
    },
    managerProgress: {
      level: input.manager.level,
      stats: input.manager.stats,
    },
    questState: {
      status: input.questStatus,
      ...(input.quest ? { currentQuest: input.quest } : {}),
      previousQuestTitle: input.previousQuestTitle || null,
      failureReason: input.questStatus === "failed" ? input.selectedFailureReason : null,
    },
    recentEvents: input.logs.slice(0, 12).map(toManagerLlmRecentEvent),
    dailyCapacity,
    activePlan: input.activePlan ?? undefined,
    activePlanId: input.activePlanId ?? undefined,
    questDraft: input.questSpec ?? undefined,
    triggerEventId: input.triggerEventId,
  };
}

function toManagerLlmRecentEvent(log: QuestLog) {
  return {
    type: getQuestLogEventType(log),
    title: log.title,
    result: log.result,
    difficulty: getQuestLogDifficulty(log),
    createdAt: log.createdAt,
    failureReason: log.reason ?? null,
    actualDurationMinutes: getPositiveMetadataNumber(log.metadata, "actualDurationMinutes"),
    plannedEstimatedMinutes: getPositiveMetadataNumber(log.metadata, "plannedEstimatedMinutes"),
    completionCriteria: getStringArrayMetadata(log.metadata, "completionCriteria"),
    evaluationReason: getStringMetadata(log.metadata, "questAcceptancePreviewReason"),
  };
}

function getDailyCapacityContext(profile: UserProfile, logs: QuestLog[], activeQuest: ManagerLlmQuestSpec | null): DailyCapacityContext {
  const localDate = toLocalDate(new Date());
  const bonusAwardedDates = readStorage<string[]>(dailyCapacityBonusDatesKey, []);
  return summarizeDailyCapacity({
    baselineMinutes: profile.dailyMinutes,
    localDate,
    records: bonusAwardedDates.includes(localDate)
      ? [...logs, { result: null, metadata: { localDate, rewardKind: "daily_capacity_completed" } }]
      : logs,
    reservedMinutes: activeQuest?.estimatedMinutes ?? 0,
  });
}

function getPositiveMetadataNumber(metadata: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function getStringMetadata(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getStringArrayMetadata(metadata: Record<string, unknown> | undefined, key: string): string[] {
  const value = metadata?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getPlanRebalanceTrigger(request: CreateQuestEventRequest, recentLogs: QuestLog[], plannedQuest: ManagerLlmQuestSpec | null, isWeeklyBoundary: boolean) {
  if (request.result === "failed") return "failure";
  if (request.result === "recovery") return "recovery_completed";

  const localDate = getStringMetadata(request.metadata, "localDate") ?? toLocalDate(new Date());
  const baselineMinutes = getPositiveMetadataNumber(request.metadata, "dailyBaselineMinutes") ?? 1;
  const previousCapacity = summarizeDailyCapacity({ baselineMinutes, localDate, records: recentLogs });
  const currentCapacity = summarizeDailyCapacity({
    baselineMinutes,
    localDate,
    records: [...recentLogs, { result: request.result ?? null, metadata: request.metadata }],
  });
  if (previousCapacity.successfulMinutes < baselineMinutes && currentCapacity.successfulMinutes >= baselineMinutes) return "daily_capacity_reached";

  const recentResults = [request.result, ...recentLogs.map((log) => log.result)].filter((result): result is "success" | "failed" | "recovery" => Boolean(result));
  const successStreak = recentResults.findIndex((result) => result !== "success");
  const normalizedSuccessStreak = successStreak === -1 ? recentResults.length : successStreak;
  if (normalizedSuccessStreak >= 3) return "success_streak";
  if (isWeeklyBoundary) return "weekly_boundary";

  const plannedAmount = plannedQuest?.tracking.targetAmount;
  if (plannedAmount && (request.quest.amount <= plannedAmount * 0.5 || request.quest.amount >= plannedAmount * 1.5)) return "amount_anomaly";

  const currentDuration = Number(request.metadata?.actualDurationMinutes);
  const currentEstimate = Number(request.metadata?.plannedEstimatedMinutes);
  const currentDurationIsAnomaly = currentDuration > 0 && currentEstimate > 0 && (currentDuration <= currentEstimate * 0.5 || currentDuration >= currentEstimate * 1.5);
  const previousDurationAnomalies = recentLogs.filter((log) => {
    const duration = Number(log.metadata?.actualDurationMinutes);
    const estimate = Number(log.metadata?.plannedEstimatedMinutes);
    return duration > 0 && estimate > 0 && (duration <= estimate * 0.5 || duration >= estimate * 1.5);
  }).length;
  if (currentDurationIsAnomaly && previousDurationAnomalies >= 1) return "duration_anomaly";
  return null;
}

function getPreviousDailyCapacitySignal(profile: UserProfile, logs: QuestLog[]): string {
  const today = toLocalDate(new Date());
  const previousDate = logs.map((log) => getStringMetadata(log.metadata, "localDate")).find((date) => Boolean(date && date !== today));
  if (!previousDate) return "none";
  const previous = summarizeDailyCapacity({ baselineMinutes: profile.dailyMinutes, localDate: previousDate, records: logs });
  return previous.usedMinutes > 0 && previous.usedMinutes < previous.baselineMinutes ? "daily_under_capacity" : previous.status;
}

function getCalendarWeekKey(now: Date) {
  const monday = new Date(now);
  const dayOffset = (now.getDay() + 6) % 7;
  monday.setDate(now.getDate() - dayOffset);
  return monday.toISOString().slice(0, 10);
}

function applyQuestResultToPlan(plan: ManagerGoalPlan, questSpec: ManagerLlmQuestSpec | null, result: CreateQuestEventRequest["result"]): ManagerGoalPlan {
  if (!questSpec) return plan;
  const status = result === "failed" ? "adjusted" : result === "success" || result === "recovery" ? "completed" : questSpec.status;
  return {
    ...plan,
    currentQuest: plan.currentQuest.id === questSpec.id ? { ...questSpec, status } : plan.currentQuest,
  };
}

function applyFinalizedQuestToPlan(plan: ManagerGoalPlan, finalizedQuest: ManagerLlmQuestSpec): ManagerGoalPlan {
  return {
    ...plan,
    currentQuest: plan.currentQuest.id === finalizedQuest.id ? finalizedQuest : plan.currentQuest,
  };
}

function getQuestLogEventType(log: QuestLog): QuestEventType {
  if (log.result === "failed") return "quest_failed";
  if (log.result === "recovery") return "recovery_completed";
  return "quest_completed";
}

function getQuestLogDifficulty(log: QuestLog): Difficulty {
  const value = log.metadata?.difficulty;
  if (value === "easy" || value === "normal" || value === "hard") return value;
  return "normal";
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (!("matchMedia" in window)) return undefined;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setReducedMotion(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return reducedMotion;
}


export default function App() {
  const storedProfile = useMemo(() => readStorage<UserProfile | null>(profileKey, null), []);
  const hydratedProfile = useMemo(() => storedProfile ? { ...defaultProfile, ...storedProfile, questSize: "balanced" as const } : null, [storedProfile]);
  const [screen, setScreen] = useState<AppScreen>(hydratedProfile ? "desktop" : "manager-select");
  const [profile, setProfile] = useState<UserProfile>(hydratedProfile ?? defaultProfile);
  const [wizardDraft, setWizardDraft] = useState<UserProfile>(hydratedProfile ?? defaultProfile);
  const [manager, setManager] = useState<ManagerState>(() => normalizeManager(readStorage(managerKey, defaultManager)));
  const [serverLogCutoffIso, setServerLogCutoffIso] = useState<string | null>(() => readStorage<string | null>(lifecycleResetAtKey, null));
  const [selectedPetId, setSelectedPetId] = useState<PetId>(() => normalizeManager(readStorage(managerKey, defaultManager)).petId);
  const [logs, setLogs] = useState<QuestLog[]>(() => questLogRepository.get());
  const [quest, setQuest] = useState<Quest>(() => {
    const storedPlan = readStorage<ManagerGoalPlan | null>(managerPlanKey, null);
    return storedPlan?.currentQuest ? toQuestFromSpec(storedPlan.currentQuest) : createEmptyQuest();
  });
  const [activePlan, setActivePlan] = useState<ManagerGoalPlan | null>(() => readStorage<ManagerGoalPlan | null>(managerPlanKey, null));
  const [activePlanId, setActivePlanId] = useState<string | null>(() => readStorage<string | null>(managerPlanIdKey, null));
  const [activeQuestSpec, setActiveQuestSpec] = useState<ManagerLlmQuestSpec | null>(() => readStorage<ManagerGoalPlan | null>(managerPlanKey, null)?.currentQuest ?? null);
  const [questStatus, setQuestStatus] = useState<QuestStatus>("draft");
  const {
    activeWindow,
    closeWindow,
    isWindowVisible,
    openWindow,
    openWindows,
    resetOpenWindows,
    resetWindowLayout,
    resetWindowPositions,
    setWorkflowWindows,
    windowChrome,
    windowPositions,
    windowSizes,
    windowRects,
  } = useWindowManager([...defaultOpenWindowIds], initialWindowPositions, initialWindowSizes);
  const [needsClarify, setNeedsClarify] = useState(false);
  const [goalClarification, setGoalClarification] = useState<{ question: string; options: string[] } | null>(null);
  const [isPlanningGoal, setIsPlanningGoal] = useState(false);
  const [isPlanningQuest, setIsPlanningQuest] = useState(false);
  const questPlanningLockRef = useRef(false);
  const [selectedFailureReason, setSelectedFailureReason] = useState(failureReasons[0]);
  const [previousQuestTitle, setPreviousQuestTitle] = useState("");
  const [rewardPreview, setRewardPreview] = useState<QuestAcceptancePreviewState | null>(null);
  const [acceptedRewardPreview, setAcceptedRewardPreview] = useState<QuestAcceptancePreviewState | null>(null);
  const [rewardPreviewState, setRewardPreviewState] = useState<QuestRewardPreviewUiState>({ status: "idle", message: "" });
  const [startOpen, setStartOpen] = useState(false);
  const [questOutcomeStreak, setQuestOutcomeStreak] = useState<QuestOutcomeStreak>({ result: null, count: 0 });
  const questStartedAtRef = useRef<number | null>(null);
  const questElapsedMinutesRef = useRef<number | null>(null);
  const acceptedDailyBaselineRef = useRef<number | null>(null);
  const lastWeeklyRebalanceKeyRef = useRef<string | null>(null);
  const lastRebalancedEventIdRef = useRef<string | null>(null);
  const [blinkFocus, setBlinkFocus] = useState<BlinkFocusState | null>(null);
  const { pixelTvConnected, resetPixelTvMode, togglePixelTvMode } = usePixelTvMode();
  const [pixelTvContextMenu, setPixelTvContextMenu] = useState<DesktopContextMenuState | null>(null);
  const [outsidePet, setOutsidePet] = useState<OutsidePetState>(outsidePetInitialState);
  const reducedMotion = usePrefersReducedMotion();
  const interactionObjects = useMemo(
    () => createInteractionObjectsFromWindows(windowPositions, windowSizes, openWindows),
    [openWindows, windowPositions, windowSizes],
  );
  const managerLlmStateRef = useRef({ profile, manager, quest, questStatus, previousQuestTitle, selectedFailureReason, logs, activePlan, activePlanId, activeQuestSpec });
  useEffect(() => {
    managerLlmStateRef.current = { profile, manager, quest, questStatus, previousQuestTitle, selectedFailureReason, logs, activePlan, activePlanId, activeQuestSpec };
  }, [activePlan, activePlanId, activeQuestSpec, logs, manager, previousQuestTitle, profile, quest, questStatus, selectedFailureReason]);
  const applyManagerContext = useCallback((context: ManagerContext) => {
    setManager((current) => ({ ...current, mood: context.currentMood, line: createManagerContextLine(context, getManagerPersona(current, profile)) }));
  }, [profile]);
  const loadManagerContext = useCallback((context: ManagerContext) => {
    applyManagerContext(context);
  }, [applyManagerContext]);
  const { logSync, setLogSync } = useQuestLogSync({
    enabled: screen === "desktop",
    ignoreLogsBefore: serverLogCutoffIso,
    onLogsLoaded: setLogs,
    onManagerContextLoaded: loadManagerContext,
  });
  useEffect(() => {
    if (screen !== "desktop") return;
    void fetchDailyCapacityBonusDatesViaApi()
      .then((dates) => writeStorage(dailyCapacityBonusDatesKey, [...new Set(dates)]))
      .catch(() => undefined);
  }, [screen]);

  useEffect(() => { if (screen === "desktop" || screen === "manager-created") writeStorage(profileKey, profile); }, [profile, screen]);
  useEffect(() => { writeStorage(managerKey, manager); }, [manager]);
  useEffect(() => { if (activePlan) writeStorage(managerPlanKey, activePlan); else window.localStorage.removeItem(managerPlanKey); }, [activePlan]);
  useEffect(() => { if (activePlanId) writeStorage(managerPlanIdKey, activePlanId); else window.localStorage.removeItem(managerPlanIdKey); }, [activePlanId]);
  useEffect(() => { questLogRepository.set(logs); }, [logs]);

  const managerDisplayStage = getManagerDisplayStage(manager);
  const getNextRoamAnimation = useCallback(
    (pet: OutsidePetState, objects: InteractionObject[]) => {
      const supportedFallbackAnimations = outsidePetRoamFallbackAnimations.filter((animation) => hasPetAnimationAsset(manager.petId, managerDisplayStage, animation));
      const availableAnimations = resolveAvailableOutsidePetRoamAnimations(objects, supportedFallbackAnimations, pet);
      const resolvedAnimation = resolveSupportedPetAnimationState(
        manager.petId,
        managerDisplayStage,
        getNextOutsidePetRoamAnimation(pet, objects, manager, profile.managerTone, questOutcomeStreak, reducedMotion),
      );
      if (availableAnimations.includes(resolvedAnimation)) return resolvedAnimation;
      return availableAnimations[pet.roamTicks % availableAnimations.length] ?? "idle";
    },
    [manager, managerDisplayStage, profile.managerTone, questOutcomeStreak, reducedMotion],
  );
  const isOutsidePetAnimationSupported = useCallback(
    (animation: PetAnimationState) => hasPetAnimationAsset(manager.petId, managerDisplayStage, animation),
    [manager.petId, managerDisplayStage],
  );
  useOutsidePetRuntime({
    outsidePet,
    setOutsidePet,
    interactionObjects,
    openWindows,
    getNextRoamAnimation,
    isAnimationSupported: isOutsidePetAnimationSupported,
  });

  const projectionModeAsset = projectionModeAssets.find((asset) => asset.mode === "single_plane_pepper");

  function triggerBlinkFocus(reason: BlinkEntryReason) {
    const effect = resolveBlinkFocusEffect(reason, reducedMotion);
    if (!effect) return;
    setBlinkFocus({ id: Date.now(), ...effect });
  }

  function enterDesktop() {
    triggerBlinkFocus("onboarding_completed");
    setScreen("desktop");
  }

  function continueWithSelectedManager() {
    if (profile.name.trim()) {
      setManager((current) => applyManagerSpriteSelection(current, selectedPetId));
      setStartOpen(false);
      setScreen("desktop");
      return;
    }

    const persona = resolveManagerPersona({ petId: selectedPetId, tone: defaultProfile.managerTone, questStyle: defaultProfile.questSize });
    const nextManager = normalizeManager(applyManagerSpriteSelection({ ...defaultManager, behaviorStyle: persona.behaviorStyle, line: getPersonaLine("setup", persona) }, selectedPetId));
    setManager(nextManager);
    setWizardDraft(defaultProfile);
    setNeedsClarify(false);
    setScreen("wizard");
  }

  function openManagerSelectMenu() {
    setStartOpen(false);
    setScreen("manager-select");
    setSelectedPetId(manager.petId);
  }

  function restartService() {
    const restartTarget = getRestartServiceTarget();
    const resetAt = new Date().toISOString();
    window.localStorage.removeItem(profileKey);
    window.localStorage.removeItem(managerKey);
    window.localStorage.removeItem(managerPlanKey);
    window.localStorage.removeItem(managerPlanIdKey);
    window.localStorage.removeItem(dailyCapacityBonusDatesKey);
    writeStorage(lifecycleResetAtKey, resetAt);
    questLogRepository.set([]);
    setServerLogCutoffIso(resetAt);
    setStartOpen(false);
    setScreen(restartTarget.screen);
    setProfile(defaultProfile);
    setWizardDraft(defaultProfile);
    setManager(createInitialManagerState());
    setSelectedPetId(defaultManagerCandidatePetId);
    setLogs([]);
    setQuest(createEmptyQuest());
    setActivePlan(null);
    setActivePlanId(null);
    setActiveQuestSpec(null);
    setQuestStatus("draft");
    setPreviousQuestTitle("");
    setRewardPreview(null);
    setAcceptedRewardPreview(null);
    setRewardPreviewState({ status: "idle", message: "" });
    setSelectedFailureReason(failureReasons[0]);
    setQuestOutcomeStreak({ result: null, count: 0 });
    questStartedAtRef.current = null;
    questElapsedMinutesRef.current = null;
    setOutsidePet(outsidePetInitialState);
    setBlinkFocus(null);
    setPixelTvContextMenu(null);
    setLogSync({ status: "idle", message: "" });
    resetPixelTvMode();
    resetOpenWindows(restartTarget.openWindows);
    resetWindowLayout();
  }

  function finishBlinkFocus() {
    setBlinkFocus(null);
    if (outsidePet.phase === "blink") {
      setOutsidePet((current) => ({
        ...current,
        phase: "peek_from_edge",
        animation: "hiding",
        position: {
          x: current.side === "left" ? -34 : window.innerWidth - 62,
          y: outsidePetFieldRect.y - 18,
        },
        direction: current.side === "left" ? 1 : -1,
      }));
      return;
    }

  }
  function openAppWindow(id: WindowId) {
    openWindow(id);
    if (id === "journal") {
      triggerBlinkFocus("journal_opened");
      triggerOutsidePetFromJournal();
    }
  }

  function closeAppWindow(id: WindowId) {
    if (id === "journal") triggerBlinkFocus("journal_closed");
    closeWindow(id);
  }

  function triggerOutsidePetFromJournal() {
    if (outsidePet.phase !== "inside") return;

    const side: OutsidePetSide = Date.now() % 2 === 0 ? "left" : "right";
    setOutsidePet({
      phase: "blink",
      side,
      position: {
        x: side === "left" ? -34 : window.innerWidth - 62,
        y: outsidePetFieldRect.y - 18,
      },
      direction: side === "left" ? 1 : -1,
      animation: "hiding",
      roamTicks: 0,
    });
  }
  function openPixelTvContextMenu(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setPixelTvContextMenu({ x: event.clientX, y: event.clientY });
  }
  function openPixelTvProperties() {
    setPixelTvContextMenu(null);
    openWindow("pixelTvProperties");
  }
  function launchProjectionMode() {
    if (!pixelTvConnected) {
      openAppWindow("pixelTv");
      return;
    }

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("projection", "pepper");
    window.location.href = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
  }
  function recordQuestLog(log: QuestLog) { setLogs((current) => prependQuestLog(current, log, 100)); }
  function recordOutcomeStreak(result: "success" | "failed") {
    setQuestOutcomeStreak((current) => ({
      result,
      count: current.result === result ? current.count + 1 : 1,
    }));
  }
  async function enrichQuestEventWithLlmStatEvaluation(request: CreateQuestEventRequest): Promise<CreateQuestEventRequest> {
    if (request.result === "failed") return request;
    if (request.metadata?.statEvaluationSource === "quest_acceptance_preview") return request;

    const snapshot = managerLlmStateRef.current;

    try {
      const output = await requestManagerStatEvaluationViaApi(createManagerLlmRequest("statEvaluation", {
        managerContext: {
          currentMood: request.managerMoodAfter ?? snapshot.manager.mood,
          recentEventCount: snapshot.logs.length,
          lastQuestResult: request.result ?? null,
          memorySummary: `recent events ${snapshot.logs.length}; previous day signal: ${getPreviousDailyCapacitySignal(snapshot.profile, snapshot.logs)}`,
          rewardHints: [],
        },
        profile: snapshot.profile,
        manager: snapshot.manager,
        quest: snapshot.quest,
        questStatus: snapshot.questStatus,
        previousQuestTitle: snapshot.previousQuestTitle,
        selectedFailureReason: snapshot.selectedFailureReason,
        logs: snapshot.logs,
      }));

      return {
        ...request,
        metadata: {
          ...request.metadata,
          statDeltas: output.statEvaluation.statDeltas,
          statBudget: output.statEvaluation.statBudget,
          primaryStats: output.statEvaluation.primaryStats,
          statEvaluationReason: output.statEvaluation.reason,
          statEvaluationSource: output.source,
          statEvaluationFallbackReason: output.fallbackReason,
          llmPromptVersion: output.source === "llm" ? output.promptVersion : undefined,
        },
      };
    } catch {
      return request;
    }
  }

  async function saveQuestEvent(request: CreateQuestEventRequest) {
    setLogSync({ status: "saving", message: questLogSyncMessages.saving });

    try {
      const enrichedRequest = await enrichQuestEventWithLlmStatEvaluation(request);
      const enrichedStatDeltas = getQuestEventRequestStatDeltas(enrichedRequest);
      if (enrichedStatDeltas.length > 0) {
        setManager((current) => ({ ...current, stats: applyManagerStatDeltas(current.stats, enrichedStatDeltas) }));
      }
      const savedEvent = await createQuestEventViaApi(enrichedRequest);
      if (savedEvent.log) recordQuestLog(savedEvent.log);
      await awardDailyCapacityBonusIfEligible(enrichedRequest, savedEvent.log ? [savedEvent.log, ...logs] : logs);
      setActivePlan((current) => current ? applyQuestResultToPlan(current, activeQuestSpec, request.result) : current);
      applyManagerContext(savedEvent.managerContext);
      setLogSync({ status: "success", message: questLogSyncMessages.saveSuccess });
      void rebalancePlanAfterEvent(enrichedRequest, savedEvent.event.id, savedEvent.log ? [savedEvent.log, ...logs] : logs);
    } catch {
      setLogSync({ status: "error", message: questLogSyncMessages.saveError });
      setManager((current) => ({ ...current, line: getPersonaLine("api_error", getManagerPersona(current, profile)) }));
    }
  }

  async function awardDailyCapacityBonusIfEligible(request: CreateQuestEventRequest, recentLogs: QuestLog[]) {
    if (request.result !== "success" && request.result !== "recovery") return;
    const localDate = getStringMetadata(request.metadata, "localDate") ?? toLocalDate(new Date());
    const baselineMinutes = getPositiveMetadataNumber(request.metadata, "dailyBaselineMinutes") ?? profile.dailyMinutes;
    const bonusDates = readStorage<string[]>(dailyCapacityBonusDatesKey, []);
    const context = summarizeDailyCapacity({
      baselineMinutes,
      localDate,
      records: bonusDates.includes(localDate)
        ? [...recentLogs, { result: null, metadata: { localDate, rewardKind: "daily_capacity_completed" } }]
        : recentLogs,
    });
    if (context.bonusAwarded || context.successfulMinutes < context.baselineMinutes) return;

    const bonusExp = getDailyCapacityBonusExp(context.baselineMinutes);
    try {
      await createQuestEventViaApi({
        type: "reward_unlocked",
        quest: request.quest,
        expDelta: bonusExp,
        managerMoodAfter: "happy",
        managerLine: "오늘 기준 시간을 완주했어. 보너스를 받았어.",
        clientCreatedAt: new Date().toISOString(),
        metadata: {
          rewardKind: "daily_capacity_completed",
          localDate,
          dailyBaselineMinutes: context.baselineMinutes,
          successfulMinutes: context.successfulMinutes,
          bonusExp,
        },
      });
      writeStorage(dailyCapacityBonusDatesKey, [...new Set([...bonusDates, localDate])]);
      setManager((current) => addExp(current, bonusExp, `오늘 기준 시간 완주 보너스 +${bonusExp} EXP`));
    } catch {
      // The quest completion stays valid; the database uniqueness rule remains authoritative.
    }
  }

  async function rebalancePlanAfterEvent(request: CreateQuestEventRequest, eventId: string, recentLogs: QuestLog[]) {
    const snapshot = managerLlmStateRef.current;
    if (!snapshot.activePlan || lastRebalancedEventIdRef.current === eventId) return;

    const eventPlan = applyQuestResultToPlan(snapshot.activePlan, snapshot.activeQuestSpec, request.result);
    const now = new Date();
    const weekKey = getCalendarWeekKey(now);
    const isWeeklyBoundary = now.getDay() === 1 && lastWeeklyRebalanceKeyRef.current !== weekKey;
    const plannedBaseline = snapshot.activeQuestSpec ?? snapshot.activePlan.currentQuest;
    const trigger = getPlanRebalanceTrigger(request, recentLogs.slice(1), plannedBaseline, isWeeklyBoundary);
    if (!trigger) return;
    lastRebalancedEventIdRef.current = eventId;
    if (isWeeklyBoundary) lastWeeklyRebalanceKeyRef.current = weekKey;

    try {
      const output = await requestManagerPlanRebalanceViaApi(createManagerLlmRequest("planRebalance", {
        managerContext: {
          currentMood: request.managerMoodAfter ?? snapshot.manager.mood,
          recentEventCount: recentLogs.length,
          lastQuestResult: request.result ?? null,
          memorySummary: `plan trigger: ${trigger}`,
          rewardHints: [],
        },
        profile: snapshot.profile,
        manager: snapshot.manager,
        quest: snapshot.quest,
        questStatus: request.result === "failed" ? "failed" : request.result === "recovery" ? "recovery" : "success",
        previousQuestTitle: snapshot.previousQuestTitle,
        selectedFailureReason: request.failureReason ?? snapshot.selectedFailureReason,
        logs: recentLogs,
        activePlan: eventPlan,
        activePlanId: snapshot.activePlanId,
        questSpec: snapshot.activeQuestSpec ?? toQuestSpec(snapshot.quest, snapshot.activePlan),
        triggerEventId: eventId,
      }));

      setActivePlan(output.planRebalance.rebalancedPlan);
      setActiveQuestSpec(output.planRebalance.nextQuest);
      if (request.result === "failed" || request.result === "recovery") {
        setQuest(toQuestFromSpec(output.planRebalance.nextQuest));
        setManager((current) => ({ ...current, line: output.planRebalance.nextQuest.recoveryReason.slice(0, 96) }));
      }
    } catch {
      // The local recovery and quest flow remain usable when rebalancing fails.
    }
  }

  const recommendQuestWithLlm = useCallback(async () => {
    if (!acquireQuestPlanningLock(questPlanningLockRef)) return;
    const snapshot = managerLlmStateRef.current;
    setIsPlanningQuest(true);
    setActiveQuestSpec(null);
    setQuest(createEmptyQuest());
    setRewardPreview(null);
    setAcceptedRewardPreview(null);
    setRewardPreviewState({ status: "idle", message: "" });

    if (!snapshot.activePlan) {
      try {
        const output = await requestManagerGoalPlanViaApi(createManagerLlmRequest("goalPlan", {
          managerContext: {
            currentMood: snapshot.manager.mood,
            recentEventCount: snapshot.logs.length,
            lastQuestResult: snapshot.logs[0]?.result ?? null,
            memorySummary: "v3 계획이 없어 사용자 요청으로 새 계획을 생성",
            rewardHints: [],
          },
          profile: snapshot.profile,
          manager: snapshot.manager,
          questStatus: "draft",
          previousQuestTitle: snapshot.previousQuestTitle,
          selectedFailureReason: snapshot.selectedFailureReason,
          logs: snapshot.logs,
        }), fetch, { throttleMs: 0 });
        setActivePlan(output.goalPlan);
        setActivePlanId(output.storedPlanId ?? null);
        setActiveQuestSpec(output.goalPlan.currentQuest);
        setQuest(toQuestFromSpec(output.goalPlan.currentQuest));
        setQuestStatus("draft");
      } catch {
        setManager((current) => ({ ...current, line: "계획을 불러오지 못했어. 잠시 후 다시 요청해줘." }));
      } finally {
        setIsPlanningQuest(false);
        releaseQuestPlanningLock(questPlanningLockRef);
      }
      return;
    }

    try {
      const output = await requestManagerNextQuestViaApi(createManagerLlmRequest("nextQuest", {
        managerContext: {
          currentMood: snapshot.manager.mood,
          recentEventCount: snapshot.logs.length,
          lastQuestResult: snapshot.logs[0]?.result ?? null,
          memorySummary: `recent events ${snapshot.logs.length}; previous day signal: ${getPreviousDailyCapacitySignal(snapshot.profile, snapshot.logs)}`,
          rewardHints: [],
        },
        profile: snapshot.profile,
        manager: snapshot.manager,
        quest: snapshot.quest,
        questStatus: snapshot.questStatus,
        previousQuestTitle: snapshot.previousQuestTitle,
        selectedFailureReason: snapshot.selectedFailureReason,
        logs: snapshot.logs,
        activePlan: snapshot.activePlan,
        activePlanId: snapshot.activePlanId,
        questSpec: snapshot.activeQuestSpec ?? toQuestSpec(snapshot.quest, snapshot.activePlan),
      }));
      setActivePlan(output.nextQuest.updatedPlan);
      setActiveQuestSpec(output.nextQuest.nextQuest);
      setQuest(toQuestFromSpec(output.nextQuest.nextQuest));
      setQuestStatus("draft");
      setRewardPreview(null);
      setAcceptedRewardPreview(null);
      setRewardPreviewState({ status: "idle", message: "" });
      setManager((current) => ({
        ...current,
        line: output.nextQuest.managerLine,
        behaviorStyle: output.nextQuest.behaviorIntent.behaviorStyle,
        behaviorIntent: output.nextQuest.behaviorIntent,
      }));
    } catch {
      const fallback = createClientFallbackQuestSpec(snapshot.activePlan);
      setActiveQuestSpec(fallback);
      setActivePlan({ ...snapshot.activePlan, currentQuest: fallback });
      setQuest(toQuestFromSpec(fallback));
      setQuestStatus("draft");
      setManager((current) => ({ ...current, line: "연결이 불안정해서 직전 흐름을 짧게 이어갈게." }));
    } finally {
      setIsPlanningQuest(false);
      releaseQuestPlanningLock(questPlanningLockRef);
    }
  }, []);

  const previewQuestAcceptanceReward = useCallback(async () => {
    const snapshot = managerLlmStateRef.current;
    const snapshotKey = createQuestDraftSnapshotKey(snapshot.quest);
    setRewardPreviewState({ status: "loading", message: "◇ 계산 중" });
    setRewardPreview(null);

    try {
      const output = await requestManagerQuestAcceptancePreviewViaApi(createManagerLlmRequest("questAcceptancePreview", {
        managerContext: {
          currentMood: snapshot.manager.mood,
          recentEventCount: snapshot.logs.length,
          lastQuestResult: snapshot.logs[0]?.result ?? null,
          memorySummary: `recent events ${snapshot.logs.length}`,
          rewardHints: [],
        },
        profile: snapshot.profile,
        manager: snapshot.manager,
        quest: snapshot.quest,
        questStatus: snapshot.questStatus,
        previousQuestTitle: snapshot.previousQuestTitle,
        selectedFailureReason: snapshot.selectedFailureReason,
        logs: snapshot.logs,
        activePlan: snapshot.activePlan,
        activePlanId: snapshot.activePlanId,
        questSpec: toQuestSpec(snapshot.quest, snapshot.activePlan),
      }));
      setActiveQuestSpec(output.questAcceptancePreview.finalizedQuest);
      setActivePlan((current) => current ? applyFinalizedQuestToPlan(current, output.questAcceptancePreview.finalizedQuest) : current);
      setRewardPreview({ snapshotKey, preview: output.questAcceptancePreview });
      setRewardPreviewState({ status: "ready", message: "" });
    } catch {
      const fallbackSpec = toQuestSpec(snapshot.quest, snapshot.activePlan);
      const fallbackPersona = getManagerPersona(snapshot.manager, snapshot.profile);
      const fallbackBehaviorIntent = snapshot.manager.behaviorIntent ?? {
        behaviorStyle: fallbackPersona.behaviorStyle,
        tone: fallbackPersona.tone,
        line: snapshot.manager.line,
        suggestedBehaviorBias: [],
      };
      const fallbackStatEvaluation = createRuleFallbackStatEvaluation({
        questType: snapshot.questStatus === "recovery" ? "recovery" : snapshot.quest.type,
        eventType: snapshot.questStatus === "recovery" ? "recovery_completed" : "quest_completed",
        difficulty: snapshot.quest.difficulty,
      });
      setRewardPreview({
        snapshotKey,
        preview: {
          finalizedQuest: fallbackSpec,
          difficulty: snapshot.quest.difficulty,
          rewardExp: calculateQuestReward(snapshot.quest.difficulty, snapshot.quest.amount, snapshot.quest.type),
          statEvaluation: fallbackStatEvaluation,
          reason: "client rule fallback reward preview",
          managerLine: fallbackBehaviorIntent.line,
          behaviorIntent: fallbackBehaviorIntent,
        },
      });
      setActiveQuestSpec(fallbackSpec);
      setActivePlan((current) => current ? applyFinalizedQuestToPlan(current, fallbackSpec) : current);
      setRewardPreviewState({ status: "ready", message: "⚠ 임시 계산" });
    }
  }, []);

  const {
    openTodayQuest,
    updateQuest,
    acceptQuest,
    completeQuest,
    startFailureFlow,
    createRecovery,
    editRecovery,
  } = useQuestFlow({
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
    saveQuestEvent: (request) => void saveQuestEvent(request),
    recommendQuest: () => void recommendQuestWithLlm(),
    acceptancePreview: rewardPreview,
    acceptedPreview: acceptedRewardPreview,
    setAcceptancePreview: setRewardPreview,
    setAcceptedPreview: setAcceptedRewardPreview,
    onAcceptNeedsPreview: () => setRewardPreviewState({ status: "stale", message: "↻ 재계산 필요" }),
    onQuestAccepted: () => {
      questStartedAtRef.current = Date.now();
      questElapsedMinutesRef.current = null;
      acceptedDailyBaselineRef.current = profile.dailyMinutes;
    },
    onQuestStopped: () => {
      if (questStartedAtRef.current !== null) {
        questElapsedMinutesRef.current = Math.max(1, Math.round((Date.now() - questStartedAtRef.current) / 60_000));
      }
    },
    createQuestEventRequest: (acceptedQuest, result, expDelta, mood, options) => {
      const actualDurationMinutes = questElapsedMinutesRef.current ?? (questStartedAtRef.current === null ? undefined : Math.max(1, Math.round((Date.now() - questStartedAtRef.current) / 60_000)));
      const plannedBaseline = activeQuestSpec ?? activePlan?.currentQuest ?? null;
      if (result !== "failed" || questStatus !== "active") questStartedAtRef.current = null;
      questElapsedMinutesRef.current = null;
      return createQuestEventRequest(acceptedQuest, result, expDelta, mood, {
        ...options,
        actualDurationMinutes,
        plannedEstimatedMinutes: plannedBaseline?.estimatedMinutes,
        plannedTargetAmount: plannedBaseline?.tracking.targetAmount,
        acceptedEstimatedMinutes: plannedBaseline?.estimatedMinutes ?? (acceptedQuest.type === "time" ? acceptedQuest.amount : undefined),
        dailyBaselineMinutes: acceptedDailyBaselineRef.current ?? profile.dailyMinutes,
        localDate: toLocalDate(new Date()),
        completionCriteria: plannedBaseline?.completionCriteria ?? [],
      });
    },
  });

  async function submitWizard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const savedProfile: UserProfile = { ...wizardDraft, name: wizardDraft.name.trim() || "사용자", nickname: wizardDraft.nickname.trim() || "루카스", goal: wizardDraft.goal.trim() || defaultProfile.goal };
    const selectedPet = managerCandidates.find((pet) => pet.petId === selectedPetId);
    const selectedPersona = resolveManagerPersona({ petId: selectedPetId, tone: savedProfile.managerTone, questStyle: savedProfile.questSize });
    const nextManager = normalizeManager(applyManagerSpriteSelection({ ...defaultManager, name: selectedPet?.name ?? defaultManager.name, behaviorStyle: selectedPersona.behaviorStyle, line: getPersonaLine("quest_recommended", selectedPersona) }, selectedPetId));
    let plannedQuest = createEmptyQuest();

    setIsPlanningGoal(true);
    try {
      const output = await requestManagerGoalPlanViaApi(createManagerLlmRequest("goalPlan", {
        managerContext: {
          currentMood: "waiting",
          recentEventCount: 0,
          lastQuestResult: null,
          memorySummary: "새 목표를 시작하는 중",
          rewardHints: [],
        },
        profile: savedProfile,
        manager: nextManager,
        questStatus: "draft",
        previousQuestTitle: "",
        selectedFailureReason: "",
        logs: [],
        activePlan: null,
        activePlanId: null,
        clarificationAnswer: savedProfile.focusAnswer,
      }));

      const clarification = output.goalPlan.goalBrief.clarificationQuestion;
      if (clarification && !savedProfile.focusAnswer) {
        setWizardDraft(savedProfile);
        setGoalClarification(clarification);
        setNeedsClarify(true);
        return;
      }

      setActivePlan(output.goalPlan);
      setActivePlanId(output.storedPlanId ?? null);
      const nextSpec = output.goalPlan.currentQuest;
      setActiveQuestSpec(nextSpec);
      if (nextSpec) plannedQuest = toQuestFromSpec(nextSpec);
    } catch {
      setActivePlan(null);
      setActivePlanId(null);
      setActiveQuestSpec(null);
    } finally {
      setIsPlanningGoal(false);
    }

    setProfile(savedProfile);
    setQuest(plannedQuest);
    setQuestStatus("draft");
    setRewardPreview(null);
    setAcceptedRewardPreview(null);
    setRewardPreviewState({ status: "idle", message: "" });
    setManager(nextManager);
    setLogs([]);
    resetOpenWindows([...defaultOpenWindowIds]);
    resetWindowPositions();
    setNeedsClarify(false);
    setGoalClarification(null);
    setScreen("manager-created");
  }

  function saveProfile(nextProfile: UserProfile) {
    setProfile(nextProfile);
    setWizardDraft(nextProfile);
    void rebalancePlanForProfileChange(nextProfile);
  }

  async function rebalancePlanForProfileChange(nextProfile: UserProfile) {
    const snapshot = managerLlmStateRef.current;
    if (!snapshot.activePlan) return;
    try {
      const output = await requestManagerPlanRebalanceViaApi(createManagerLlmRequest("planRebalance", {
        managerContext: {
          currentMood: snapshot.manager.mood,
          recentEventCount: snapshot.logs.length,
          lastQuestResult: snapshot.logs[0]?.result ?? null,
          memorySummary: "profile_changed: 이후 숨은 계획만 새 프로필 기준으로 재검토",
          rewardHints: [],
        },
        profile: nextProfile,
        manager: snapshot.manager,
        quest: snapshot.quest,
        questStatus: snapshot.questStatus,
        previousQuestTitle: snapshot.previousQuestTitle,
        selectedFailureReason: snapshot.selectedFailureReason,
        logs: snapshot.logs,
        activePlan: snapshot.activePlan,
        activePlanId: snapshot.activePlanId,
        questSpec: snapshot.activeQuestSpec,
        triggerEventId: `profile-${Date.now()}`,
      }), fetch, { throttleMs: 0 });
      setActivePlan(output.planRebalance.rebalancedPlan);
    } catch {
      // Profile saving is local-first; the next on-demand request carries the new profile again.
    }
  }

  function selectManagerStage(stage: PetStageId) {
    setManager((current) => {
      if (!current.unlockedStages.includes(stage)) return current;
      return { ...current, selectedStage: stage };
    });
  }

  function toggleManagerSound() {
    setManager((current) => ({ ...current, soundEnabled: !current.soundEnabled }));
  }

  const visibleWindowKey = openWindows.join("|");
  const managerWindowInteractionRolls = useMemo(
    () => ({
      quest: (Date.now() % 1000) / 1000,
      recovery: ((Date.now() + 379) % 1000) / 1000,
    }),
    [questOutcomeStreak.count, questOutcomeStreak.result, questStatus, visibleWindowKey],
  );
  const showRecoveryHidingPet = shouldShowManagerWindowInteraction({
    visible: questStatus === "recovery" && isWindowVisible("recovery"),
    randomValue: managerWindowInteractionRolls.recovery,
    streakMatches: questOutcomeStreak.result === "failed",
    streakCount: questOutcomeStreak.count,
  });
  const showQuestHangingPet = shouldShowManagerWindowInteraction({
    visible: questStatus === "draft" && isWindowVisible("quest"),
    randomValue: managerWindowInteractionRolls.quest,
    streakMatches: questOutcomeStreak.result === "success",
    streakCount: questOutcomeStreak.count,
  });
  const showPixelTvWatching = isWindowVisible("pixelTv");
  const supportsQuestHangingPet = hasPetAnimationAsset(manager.petId, managerDisplayStage, "hanging");
  const supportsRecoveryHidingPet = hasPetAnimationAsset(manager.petId, managerDisplayStage, "hiding");
  const showOutsidePet = outsidePet.phase !== "inside" && outsidePet.phase !== "blink";
  const renderedOutsidePet = useMemo(
    () => resolveRenderedOutsidePet(outsidePet, interactionObjects),
    [outsidePet, interactionObjects],
  );
  const managerRuntimeState = createManagerRuntimeState({
    manager,
    displayStage: managerDisplayStage,
    outsidePet: renderedOutsidePet,
    showPixelTvWatching,
    showQuestHangingPet,
    showRecoveryHidingPet,
    supportsQuestHangingPet,
    supportsRecoveryHidingPet,
    showOutsidePet,
  });
  const questWindowChrome = windowChrome("quest");
  const recoveryWindowChrome = windowChrome("recovery");
  const pixelTvWindowChrome = windowChrome("pixelTv");
  const ladderWindowChrome = windowChrome("ladderObject");
  const platformWindowChrome = windowChrome("platformObject");
  const outsidePetObjectZIndexes = {
    "ladder-1": ladderWindowChrome.zIndex,
    "platform-1": platformWindowChrome.zIndex,
  };

  if (screen === "manager-select") return <main className="xp-boot-screen"><ManagerSelectWindow selectedPetId={selectedPetId} onSelect={setSelectedPetId} onContinue={continueWithSelectedManager} /></main>;
  if (screen === "wizard") return <main className="xp-boot-screen"><ProfileSetupWizard draft={wizardDraft} needsClarify={needsClarify} clarificationQuestion={goalClarification?.question} clarificationOptions={goalClarification?.options} isPlanning={isPlanningGoal} onChange={setWizardDraft} onSubmit={submitWizard} /></main>;
  if (screen === "manager-created") return <main className="xp-boot-screen"><XpWindow className="created-window" title="Manager Created" titlebarIcon="◇" onClose={undefined}><p className="created-lead">매니저가 깨어났어요.</p><div className="created-card"><DesktopPet mood="happy" petId={manager.petId} stage={managerDisplayStage} large /><div><strong>◇ {manager.name} ◇</strong><span>전자 생물형 페이스메이커</span><small>목표를 오늘의 퀘스트로 나누고 실패하면 다음 분량을 다시 맞춰요.</small></div></div><div className="window-actions"><button className="xp-button primary" type="button" onClick={enterDesktop}>데스크톱으로 이동</button></div></XpWindow></main>;

  return (
    <main className="xp-desktop" aria-label="Manager.exe desktop" onClick={() => setPixelTvContextMenu(null)}>
      <nav className="desktop-icons" aria-label="바탕화면 아이콘">
        <DesktopIcon label="오늘의 퀘스트" type="quest" onClick={openTodayQuest} />
        <DesktopIcon label="매니저" type="manager" onClick={() => openAppWindow("manager")} />
        <DesktopIcon label="내 프로필" type="profile" onClick={() => openAppWindow("profile")} />
        <DesktopIcon label="기록 노트" type="journal" onClick={() => openAppWindow("journal")} />
        <DesktopIcon
          label={pixelTvConnected ? "Projection TV" : "Pixel TV"}
          type="pixelTv"
          assetId="pixel-tv"
          overrideIdleSrc={pixelTvConnected ? projectionModeAsset?.connectedIconSrc : undefined}
          overrideHoverSrc={pixelTvConnected ? projectionModeAsset?.connectedIconHoverSrc : undefined}
          onClick={launchProjectionMode}
          onContextMenu={openPixelTvContextMenu}
        />
        {interactionObjectDesktopWindowIds.map((windowId) => (
          <DesktopIcon
            key={windowId}
            label={windowRegistry[windowId].label}
            type={windowId}
            overrideIdleSrc={interactionObjectDesktopIconSrc[windowId]}
            overrideHoverSrc={interactionObjectDesktopIconSrc[windowId]}
            onClick={() => openAppWindow(windowId)}
          />
        ))}
        <DesktopIcon label="휴지통" type="trash" onClick={() => openAppWindow("trash")} />
      </nav>

      {pixelTvContextMenu && (
        <DesktopContextMenu x={pixelTvContextMenu.x} y={pixelTvContextMenu.y} onOpenProperties={openPixelTvProperties} />
      )}

      {managerRuntimeState.showOutsidePet && (
        <OutsidePetLayer
          pet={managerRuntimeState.outside}
          petId={manager.petId}
          stage={managerRuntimeState.stage}
          objectZIndexes={outsidePetObjectZIndexes}
        />
      )}

      {isWindowVisible("quest") && <XpWindow className="quest-window" title={questStatus === "recovery" ? "복구 퀘스트" : "오늘의 퀘스트"} {...questWindowChrome}><QuestWindow quest={quest} questSpec={activeQuestSpec} isPlanning={isPlanningQuest} status={questStatus} rewardPreviewState={rewardPreviewState} rewardPreview={rewardPreview} onQuestChange={updateQuest} onPreviewReward={() => void previewQuestAcceptanceReward()} onAccept={acceptQuest} onOpenRunner={() => openWindow("runner")} onRecommendNext={activeQuestSpec ? openTodayQuest : () => void recommendQuestWithLlm()} /></XpWindow>}
      {managerRuntimeState.windowInteraction === "quest_hanging" && <WindowPetInteraction state="hanging" petId={manager.petId} stage={managerRuntimeState.stage} placement="below-quest" position={windowPositions.quest} measuredRect={windowRects.quest} zIndex={questWindowChrome.zIndex} />}
      {managerRuntimeState.windowInteraction === "pixel_tv_watching" && <PixelTvWatchingPet petId={manager.petId} stage={managerRuntimeState.stage} position={windowPositions.pixelTv} measuredRect={windowRects.pixelTv} zIndex={pixelTvWindowChrome.zIndex} />}
      {isWindowVisible("runner") && <XpWindow className="runner-window" title="QuestRunner.exe" {...windowChrome("runner")}><QuestRunnerWindow quest={quest} onComplete={completeQuest} onFail={startFailureFlow} /></XpWindow>}
      {isWindowVisible("failure") && <XpWindow className="failure-window" title="퀘스트가 소멸했어" {...windowChrome("failure")}><FailureWindow selectedFailureReason={selectedFailureReason} onReasonChange={setSelectedFailureReason} onCreateRecovery={createRecovery} /></XpWindow>}
      {isWindowVisible("recovery") && <XpWindow className="recovery-window" title="복구 퀘스트" {...recoveryWindowChrome}><RecoveryWindow quest={quest} onEdit={editRecovery} onAccept={acceptQuest} /></XpWindow>}
      {managerRuntimeState.windowInteraction === "recovery_hiding" && <WindowPetInteraction state="hiding" petId={manager.petId} stage={managerRuntimeState.stage} placement="beside-recovery" position={windowPositions.recovery} measuredRect={windowRects.recovery} zIndex={recoveryWindowChrome.zIndex} />}
      {isWindowVisible("manager") && <XpWindow className="manager-window" title="매니저" {...windowChrome("manager")}><ManagerWindow manager={manager} petAway={managerRuntimeState.petAwayFromManagerWindow} /></XpWindow>}
      {isWindowVisible("profile") && <XpWindow className="profile-window" title="내 프로필" {...windowChrome("profile")}><ProfileWindow profile={profile} onSave={saveProfile} /></XpWindow>}
      {isWindowVisible("journal") && <XpWindow className="journal-window" title="기록 노트" {...windowChrome("journal")} onClose={() => closeAppWindow("journal")}><JournalWindow logs={logs} sync={logSync} /></XpWindow>}
      {isWindowVisible("trash") && <XpWindow className="trash-window" title="휴지통" {...windowChrome("trash")}><div className="empty-trash">비어 있음</div></XpWindow>}
      {isWindowVisible("settings") && <XpWindow className="settings-window" title="설정" {...windowChrome("settings")}><SettingsWindow manager={manager} onSelectStage={selectManagerStage} onToggleSound={toggleManagerSound} /></XpWindow>}
      {isWindowVisible("pixelTv") && (
        <PixelTvObjectWindow chrome={pixelTvWindowChrome}>
          <PixelTvWindow manager={manager} stage={managerRuntimeState.stage} />
        </PixelTvObjectWindow>
      )}
      {isWindowVisible("pixelTvProperties") && (
        <XpWindow className="pixel-tv-properties-window" title="Pixel TV 속성" {...windowChrome("pixelTvProperties")}>
          <PixelTvPropertiesWindow connected={pixelTvConnected} onToggle={togglePixelTvMode} />
        </XpWindow>
      )}
      {isWindowVisible("ladderObject") && (
        <XpWindow className="interaction-object-window ladder-object-window" title="" resizeAxis="vertical" {...ladderWindowChrome}>
          <LadderObjectWindow />
        </XpWindow>
      )}
      {isWindowVisible("platformObject") && (
        <XpWindow className="interaction-object-window platform-object-window" title="평지" resizeAxis="horizontal" {...platformWindowChrome}>
          <PlatformObjectWindow />
        </XpWindow>
      )}

      <BlinkFocusOverlay effect={blinkFocus} onDone={finishBlinkFocus} />
      <footer className="taskbar">
        <button className="start-button" type="button" onClick={() => setStartOpen((value) => !value)}><span className="start-mark" />시작</button>
        {startOpen && <StartMenu questStatus={questStatus} onOpenWindow={openAppWindow} onRestart={restartService} onOpenManagerSelect={openManagerSelectMenu} />}
        <div className="taskbar-items">
          {openWindows.map((windowId) => (
            <button className={activeWindow === windowId ? "active" : ""} key={windowId} type="button" onClick={() => openWindow(windowId)}>
              <WindowIconMark id={windowId} className="taskbar-icon" />
              <span className="taskbar-label">{windowRegistry[windowId].label}</span>
            </button>
          ))}
        </div>
        <div className="system-tray"><span>Lv.{manager.level}</span><SystemTrayClock /></div>
      </footer>
    </main>
  );
}

function StartMenu({ questStatus, onOpenWindow, onRestart, onOpenManagerSelect }: StartMenuProps) {
  return (
    <div className="start-menu">
      <strong>Manager.exe</strong>
      {questStatus === "active" && (
        <button type="button" onClick={() => onOpenWindow("runner")}>
          <WindowIconMark id="runner" className="menu-icon" />
          <span>QuestRunner.exe</span>
        </button>
      )}
      <button type="button" onClick={() => onOpenWindow("settings")}>
        <WindowIconMark id="settings" className="menu-icon" />
        <span>설정</span>
      </button>
      <button type="button" onClick={onRestart}>
        <span className="menu-icon text-icon" aria-hidden="true">RS</span>
        <span>다시 시작</span>
      </button>
      <button type="button" onClick={onOpenManagerSelect}>
        <span className="menu-icon" aria-hidden="true">
          <img src={getDesktopIconAsset("pet-swap").idleSrc} alt="" />
        </span>
        <span>매니저 바꾸기</span>
      </button>
    </div>
  );
}

function ManagerSelectWindow({ selectedPetId, onSelect, onContinue }: ManagerSelectWindowProps) {
  return (
    <XpWindow className="manager-select-window" title="Manager.exe 선택" titlebarIcon="◇" onClose={undefined}>
      <section className="manager-select-panel">
        <p className="wizard-lead">함께 지낼 전자 매니저를 선택해 주세요</p>
        <div className="manager-select-grid">
          {managerCandidates.map((pet) => {
            const selected = selectedPetId === pet.petId;
            return (
              <button
                className={`manager-select-card ${selected ? "selected" : ""}`}
                key={pet.petId}
                type="button"
                onClick={() => onSelect(pet.petId)}
              >
                <DesktopPet mood={selected ? "happy" : "waiting"} petId={pet.petId} stage="stage-2" />
                <strong>{pet.title}</strong>
                <span>{pet.description}</span>
              </button>
            );
          })}
        </div>
        <div className="window-actions">
          <button className="xp-button primary" type="button" onClick={onContinue}>선택 완료</button>
        </div>
      </section>
    </XpWindow>
  );
}

function DesktopContextMenu({ x, y, onOpenProperties }: DesktopContextMenuProps) {
  const style = { "--menu-x": `${x}px`, "--menu-y": `${y}px` } as CSSProperties & Record<"--menu-x" | "--menu-y", string>;
  return (
    <div className="desktop-context-menu" style={style} role="menu" onClick={(event) => event.stopPropagation()}>
      <button type="button" role="menuitem" onClick={onOpenProperties}>속성</button>
    </div>
  );
}

const pixelTvPreviewFrame = { width: 354, height: 249 };

function PixelTvObjectWindow({ chrome, children }: { chrome: WindowChromeProps; children: ReactNode }) {
  const objectRef = useRef<HTMLElement | null>(null);
  const [dragOffset, setDragOffset] = useState<WindowPosition | null>(null);
  const objectStyle = {
    left: `${chrome.position.x}px`,
    top: `${chrome.position.y}px`,
    width: chrome.size ? `${chrome.size.width}px` : undefined,
    height: chrome.size ? `${chrome.size.height}px` : undefined,
    zIndex: chrome.zIndex,
  } as CSSProperties;

  useLayoutEffect(() => {
    const element = objectRef.current;
    if (!element) return undefined;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      chrome.onMeasure({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    };

    measure();
    window.addEventListener("resize", measure);

    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", measure);
    }

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [chrome.position.x, chrome.position.y, chrome.size?.height, chrome.size?.width]);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    const rect = objectRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDragOffset({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    chrome.onFocus();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragWindow(event: PointerEvent<HTMLDivElement>) {
    if (!dragOffset) return;

    const maxX = Math.max(0, window.innerWidth - 180);
    const maxY = Math.max(0, window.innerHeight - 78);
    chrome.onMove({
      x: Math.min(Math.max(event.clientX - dragOffset.x, 0), maxX),
      y: Math.min(Math.max(event.clientY - dragOffset.y, 0), maxY),
    });
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragOffset) return;

    setDragOffset(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <section
      ref={objectRef}
      className={`pixel-tv-object-window ${chrome.isActive ? "active" : ""}`}
      style={objectStyle}
      onPointerDown={chrome.onFocus}
    >
      {children}
      <div
        className="pixel-tv-frame-drag-layer"
        aria-label="Pixel TV 이동"
        role="button"
        tabIndex={0}
        onPointerDown={startDrag}
        onPointerMove={dragWindow}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      />
      <button className="pixel-tv-exit-button" type="button" aria-label="Pixel TV 닫기" onClick={chrome.onClose}>
        <span>닫기</span>
      </button>
    </section>
  );
}

function PixelTvWindow({ manager, stage }: PixelTvWindowProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [sourceSize, setSourceSize] = useState<PixelTvSourceSize | null>(null);
  const [cameraState, setCameraState] = useState<PixelTvCameraState>("idle");

  useEffect(() => {
    void startCamera();

    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || cameraState !== "live") return undefined;

    let lastDrawAt = 0;

    const drawFrame = (timestamp: number) => {
      if (canPixelizeSource(video.videoWidth, video.videoHeight)) {
        const streamSettings = resolvePixelTvStreamSettings(video.videoWidth, video.videoHeight);
        const frameInterval = 1000 / streamSettings.targetFps;
        if (timestamp - lastDrawAt >= frameInterval) {
          const plan = createPixelizerPlanForStream(video.videoWidth, video.videoHeight, streamSettings);
          setSourceSize((current) => current?.width === plan.sourceWidth && current.height === plan.sourceHeight ? current : { width: plan.sourceWidth, height: plan.sourceHeight });
          renderPixelizedSource(video, canvas, plan);
          lastDrawAt = timestamp;
        }
      }

      frameRef.current = window.requestAnimationFrame(drawFrame);
    };

    frameRef.current = window.requestAnimationFrame(drawFrame);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [cameraState]);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("error");
      return;
    }

    setCameraState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState("live");
    } catch {
      setCameraState("error");
    }
  }

  async function capturePhoto() {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;

    try {
      const animation = getLumiAnimationAsset("happy", manager.petId, stage);
      const captureCanvas = await createPixelTvPhotoCapture(canvas, animation.src, manager.name);
      downloadPixelTvPhoto(captureCanvas, createPixelTvPhotoFileName(new Date()));
    } catch {
      downloadPixelTvPhoto(canvas, createPixelTvPhotoFileName(new Date()));
    }
  }

  const signalLabel = cameraState === "live" ? "CAM LIVE" : cameraState === "requesting" ? "REQUESTING" : cameraState === "error" ? "CAM BLOCKED" : "NO SIGNAL";

  return (
    <section className="pixel-tv-panel">
      <video ref={videoRef} className="pixel-tv-video-source" playsInline muted />
      <div className="pixel-tv-screen">
        <canvas ref={canvasRef} className="pixel-tv-canvas" aria-label="픽셀화 미리보기" />
        {cameraState !== "live" && <span>{signalLabel}</span>}
      </div>
      <button className="pixel-tv-capture-button" type="button" onClick={() => { void capturePhoto(); }} disabled={!sourceSize} aria-label="사진 저장">
        <span>사진</span>
      </button>
    </section>
  );
}

function renderPixelizedSource(source: CanvasImageSource, canvas: HTMLCanvasElement, plan: PixelizerPlan) {
  const previewSize = getPixelizerCoverSize(plan, pixelTvPreviewFrame);
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = plan.sampleWidth;
  sampleCanvas.height = plan.sampleHeight;
  const sampleContext = sampleCanvas.getContext("2d");
  const previewContext = canvas.getContext("2d");
  if (!sampleContext || !previewContext) return;

  canvas.width = previewSize.width;
  canvas.height = previewSize.height;
  sampleContext.imageSmoothingEnabled = false;
  sampleContext.clearRect(0, 0, plan.sampleWidth, plan.sampleHeight);
  sampleContext.drawImage(source, 0, 0, plan.sampleWidth, plan.sampleHeight);
  const sampleImage = sampleContext.getImageData(0, 0, plan.sampleWidth, plan.sampleHeight);
  sampleImage.data.set(transformPixelTvSamplePixels(sampleImage.data, plan.sampleWidth, plan.sampleHeight));
  sampleContext.putImageData(sampleImage, 0, 0);
  previewContext.imageSmoothingEnabled = plan.smoothing;
  previewContext.clearRect(0, 0, previewSize.width, previewSize.height);
  previewContext.drawImage(sampleCanvas, 0, 0, previewSize.width, previewSize.height);
}

async function createPixelTvPhotoCapture(tvCanvas: HTMLCanvasElement, managerSpriteSrc: string, managerName: string) {
  const plan = createPixelTvPhotoCapturePlan();
  const captureCanvas = document.createElement("canvas");
  captureCanvas.width = plan.width;
  captureCanvas.height = plan.height;
  const context = captureCanvas.getContext("2d");
  if (!context) return captureCanvas;

  context.imageSmoothingEnabled = plan.smoothing;
  drawPixelTvPhotoBackdrop(context, plan.width, plan.height);
  drawPixelTvFrame(context, plan.tvFrame);
  drawPixelTvScreen(context, tvCanvas, plan.tvScreen);
  await drawManagerCaptureSprite(context, managerSpriteSrc, plan.managerSprite);
  drawPixelTvPhotoCaption(context, plan.caption, managerName);

  return captureCanvas;
}

function downloadPixelTvPhoto(canvas: HTMLCanvasElement, fileName: string) {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function drawPixelTvPhotoBackdrop(context: CanvasRenderingContext2D, width: number, height: number) {
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#5eb7f3");
  sky.addColorStop(0.58, "#bdeaff");
  sky.addColorStop(0.59, "#78b957");
  sky.addColorStop(1, "#3b8f3f");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(255, 255, 255, 0.82)";
  context.fillRect(58, 42, 58, 14);
  context.fillRect(78, 30, 42, 18);
  context.fillRect(116, 44, 70, 12);
}

function drawPixelTvFrame(context: CanvasRenderingContext2D, rect: PixelTvPhotoCaptureRect) {
  context.fillStyle = "#5b4b3d";
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  context.fillStyle = "#d8c8a4";
  context.fillRect(rect.x + 8, rect.y + 8, rect.width - 16, rect.height - 16);
  context.fillStyle = "#2b2722";
  context.fillRect(rect.x + 22, rect.y + 22, rect.width - 48, rect.height - 50);
  context.fillStyle = "#5a4634";
  context.fillRect(rect.x + rect.width - 54, rect.y + rect.height - 36, 34, 12);
  context.fillRect(rect.x + 48, rect.y + rect.height - 16, 36, 10);
  context.fillRect(rect.x + rect.width - 94, rect.y + rect.height - 16, 36, 10);
}

function drawPixelTvScreen(context: CanvasRenderingContext2D, tvCanvas: HTMLCanvasElement, rect: PixelTvPhotoCaptureRect) {
  context.fillStyle = "#101414";
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  context.drawImage(tvCanvas, rect.x, rect.y, rect.width, rect.height);
  context.fillStyle = "rgba(255, 255, 255, 0.08)";
  for (let y = rect.y; y < rect.y + rect.height; y += 6) {
    context.fillRect(rect.x, y, rect.width, 2);
  }
}

async function drawManagerCaptureSprite(context: CanvasRenderingContext2D, spriteSrc: string, rect: PixelTvPhotoCaptureRect) {
  const sprite = await loadCanvasImage(spriteSrc);
  context.fillStyle = "rgba(255, 253, 246, 0.86)";
  context.fillRect(rect.x + 18, rect.y + 28, rect.width - 28, rect.height - 34);
  context.shadowColor = "rgba(83, 188, 255, 0.55)";
  context.shadowBlur = 16;
  context.drawImage(sprite, 0, 0, 64, 64, rect.x, rect.y, rect.width, rect.height);
  context.shadowBlur = 0;
}

function drawPixelTvPhotoCaption(context: CanvasRenderingContext2D, rect: PixelTvPhotoCaptureRect, managerName: string) {
  context.fillStyle = "#fffdf6";
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  context.strokeStyle = "#8f897c";
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.fillStyle = "#1f1f1f";
  context.font = "700 14px Tahoma, sans-serif";
  context.fillText(`${managerName} + Pixel TV`, rect.x + 10, rect.y + 17);
}

function loadCanvasImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image: ${src}`));
    image.src = src;
  });
}

function PixelTvPropertiesWindow({ connected, onToggle }: PixelTvPropertiesWindowProps) {
  return (
    <section className="pixel-tv-properties-panel">
      <div className="property-summary">
        <WindowIconMark id="pixelTvProperties" className="property-icon" />
        <div>
          <strong>Pixel TV</strong>
          <span>{connected ? "Projection 앱 연결됨" : "기본 TV 아이콘"}</span>
        </div>
      </div>
      <div className="property-field">
        <span>연결 상태</span>
        <strong>{connected ? "Projection mode" : "Pixel TV"}</strong>
      </div>
      <div className="window-actions">
        <button className="xp-button primary" type="button" onClick={onToggle}>{connected ? "원래대로" : "변환"}</button>
      </div>
    </section>
  );
}

function BlinkFocusOverlay({ effect, onDone }: BlinkFocusOverlayProps) {
  if (!effect) return null;

  function handleAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.currentTarget === event.target) onDone();
  }

  return (
    <div
      key={effect.id}
      className={`blink-focus-overlay ${effect.mode} ${effect.reducedMotion}`}
      aria-hidden="true"
      onAnimationEnd={handleAnimationEnd}
    >
      <span className="blink-lid top" />
      <span className="blink-lid bottom" />
      <span className="blink-focus-glow" />
    </div>
  );
}

function ProfileSetupWizard({ draft, needsClarify, clarificationQuestion, clarificationOptions = [], isPlanning, onChange, onSubmit }: ProfileSetupWizardProps) {
  return <XpWindow className="setup-window" title="Manager.exe 설치 마법사" onClose={undefined}><form className="setup-form" onSubmit={onSubmit}><p className="wizard-lead">전자 생물 매니저를 깨울 준비를 할게요</p><div className="wizard-grid"><label htmlFor="profile-name">이름</label><input id="profile-name" value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} placeholder="김동민" /><label htmlFor="profile-nickname">닉네임</label><input id="profile-nickname" value={draft.nickname} onChange={(event) => onChange({ ...draft, nickname: event.target.value })} placeholder="루카스" /><label htmlFor="profile-goal">함께 키울 목표</label><textarea id="profile-goal" value={draft.goal} onChange={(event) => onChange({ ...draft, goal: event.target.value, focusAnswer: "" })} placeholder="예: 수능 수학 1등급. 확통이 약하고 오답이 쌓이면 쉽게 지쳐요." /><span>하루 가능 시간</span><DailyTimeInputs idPrefix="setup-daily" totalMinutes={draft.dailyMinutes} onChange={(dailyMinutes) => onChange({ ...draft, dailyMinutes })} /><label htmlFor="target-date">목표 기한</label><input id="target-date" type="date" value={draft.targetDate} onChange={(event) => onChange({ ...draft, targetDate: event.target.value })} /><span>매니저 말투</span><div className="segmented-control">{(["calm", "friendly", "firm"] as ManagerTone[]).map((tone) => <button className={draft.managerTone === tone ? "selected" : ""} key={tone} type="button" onClick={() => onChange({ ...draft, managerTone: tone })}>{tone === "calm" ? "차분함" : tone === "friendly" ? "친구 같음" : "단호함"}</button>)}</div></div>{needsClarify && clarificationQuestion && <div className="clarify-box"><strong>목표를 조금 더 구체화해볼게</strong><span>{clarificationQuestion}</span><div className="clarify-options">{clarificationOptions.map((answer) => <label key={answer}><input type="radio" name="focus" checked={draft.focusAnswer === answer} onChange={() => onChange({ ...draft, focusAnswer: answer })} />{answer}</label>)}</div></div>}<div className="window-actions"><button className="xp-button" type="button" disabled>이전</button><button className="xp-button primary" type="submit" disabled={draft.dailyMinutes < 1 || isPlanning || (needsClarify && !draft.focusAnswer)}>{isPlanning ? "계획 만드는 중" : needsClarify ? "답변하고 시작" : "매니저 깨우기"}</button></div></form></XpWindow>;
}

function DailyTimeInputs({ idPrefix, totalMinutes, onChange }: { idPrefix: string; totalMinutes: number; onChange: (minutes: number) => void }) {
  const value = splitDailyMinutes(totalMinutes);
  return <div className="form-pair daily-time-inputs"><label htmlFor={`${idPrefix}-hours`}><input className="xp-input" id={`${idPrefix}-hours`} type="number" min={0} max={23} step={1} value={value.hours} onChange={(event) => onChange(toDailyMinutes({ hours: Number(event.target.value), minutes: value.minutes }))} /> 시간</label><label htmlFor={`${idPrefix}-minutes`}><input className="xp-input" id={`${idPrefix}-minutes`} type="number" min={0} max={59} step={1} value={value.minutes} onChange={(event) => onChange(toDailyMinutes({ hours: value.hours, minutes: Math.min(59, Number(event.target.value)) }))} /> 분</label></div>;
}

function QuestWindow({ quest, questSpec, isPlanning, status, rewardPreviewState, rewardPreview, onQuestChange, onPreviewReward, onAccept, onOpenRunner, onRecommendNext }: QuestWindowProps) {
  const view = getQuestWindowView({ status, hasQuestSpec: Boolean(questSpec), isPlanning });
  if (view === "planning") return <section className="quest-program-loading" role="status" aria-label="다음 퀘스트 준비 중"><div className="quest-loading-emoji" aria-hidden="true">⌛</div></section>;
  if (view === "active") return <section className="quest-program-link"><div className="program-icon" aria-hidden="true">EXE</div><h2>퀘스트가 실행 중이야</h2><p>완료, 실패, 복구 흐름은 QuestRunner.exe 창에서 처리해.</p><strong>{quest.title}</strong><div className="window-actions"><button className="xp-button primary" type="button" onClick={onOpenRunner}>실행창 앞으로</button></div></section>;
  if (view === "success") return <section className="quest-program-link"><div className="program-icon" aria-hidden="true">OK</div><h2>오늘의 퀘스트를 완료했어</h2><p>기록은 저장됐고, 다음 오늘의 퀘스트를 추천할 수 있어.</p><strong>{quest.title}</strong><div className="window-actions"><button className="xp-button primary" type="button" onClick={onRecommendNext}>새 퀘스트 추천</button></div></section>;
  if (view === "failed") return <section className="quest-program-link"><div className="program-icon" aria-hidden="true">!</div><h2>복구가 필요한 퀘스트야</h2><p>실패 이유를 기록하고 더 작은 복구 퀘스트로 이어갈 수 있어.</p><strong>{quest.title}</strong></section>;
  if (view === "empty") return <section className="quest-program-link"><div className="program-icon" aria-hidden="true">...</div><h2>새 계획이 필요해</h2><p>목표와 오늘의 기록을 바탕으로 지금 할 퀘스트 하나를 불러올게.</p><div className="window-actions"><button className="xp-button primary" type="button" onClick={onRecommendNext}>계획에서 퀘스트 불러오기</button></div></section>;
  const preview = rewardPreview?.preview;
  const canAccept = rewardPreviewState.status === "ready" && Boolean(preview);

  return (
    <section className="quest-draft">
      {status !== "recovery" && <div className="quest-summary"><span>오늘 수행할 퀘스트 초안</span></div>}
      {questSpec && <div className="quest-spec-details"><p>{questSpec.instruction}</p><dl><div><dt>완료 기준</dt><dd>{questSpec.completionCriteria.join(" · ")}</dd></div><div><dt>예상 시간</dt><dd>{questSpec.estimatedMinutes}분</dd></div>{questSpec.expectedOutput && <div><dt>결과물</dt><dd>{questSpec.expectedOutput}</dd></div>}<div><dt>추적</dt><dd>{questSpec.tracking.targetAmount ?? 1}{questSpec.tracking.targetUnit ?? (questSpec.tracking.mode === "timer" ? "분" : "회")}</dd></div></dl></div>}
      <form className="quest-form">
        <label htmlFor="quest-title">제목</label>
        <input className="xp-input" id="quest-title" value={quest.title} onChange={(event) => onQuestChange({ title: event.target.value })} />
        <label htmlFor="quest-type">유형</label>
        <select className="xp-select" id="quest-type" value={quest.type} onChange={(event) => onQuestChange({ type: event.target.value as QuestType })}>
          <option value="time">시간형</option>
          <option value="quantity">수량형</option>
          <option value="action">행동형</option>
        </select>
        <label htmlFor="quest-amount">분량</label>
        <div className="form-pair">
          <input className="xp-input" id="quest-amount" type="number" min={1} value={quest.amount} onChange={(event) => onQuestChange({ amount: Number(event.target.value) })} />
          <select className="xp-select" aria-label="분량 단위" value={quest.unit} onChange={(event) => onQuestChange({ unit: event.target.value })}>
            <option>분</option>
            <option>개</option>
            <option>회</option>
            <option>페이지</option>
          </select>
        </div>
        <label htmlFor="quest-deadline">제한 시간</label>
        <select className="xp-select" id="quest-deadline" value={quest.deadline} onChange={(event) => onQuestChange({ deadline: event.target.value })}>
          <option>오늘 23:59</option>
          <option>오늘 18:00</option>
          <option>오늘 21:00</option>
        </select>
      </form>
      {preview && rewardPreviewState.status === "ready" && (
        <div className="quest-reward-preview" aria-label="예상 보상">
          <strong>{difficultyLabels[preview.difficulty]} · EXP {preview.rewardExp}</strong>
          <div>
            {preview.statEvaluation.statDeltas.map((delta) => (
              <span className="log-chip stat" key={`${delta.stat}-${delta.amount}`}>{statLabels[delta.stat]} +{delta.amount}</span>
            ))}
          </div>
        </div>
      )}
      {rewardPreviewState.message && <p className={`quest-preview-message ${rewardPreviewState.status}`}>{rewardPreviewState.message}</p>}
      <div className="quest-footer">
        <span className="reward">{canAccept ? "계산 완료" : "수락 전 보상을 계산해줘"}</span>
        <button className="xp-button primary" type="button" disabled={rewardPreviewState.status === "loading"} onClick={canAccept ? onAccept : onPreviewReward}>
          {canAccept ? "수락" : rewardPreviewState.status === "loading" ? "계산 중" : "예상 보상 계산"}
        </button>
      </div>
    </section>
  );
}

function QuestRunnerWindow({ quest, onComplete, onFail }: QuestRunnerWindowProps) {
  const [now, setNow] = useState(() => new Date());
  const remainingTime = formatRemainingUntilEndOfDay(now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="runner-program">
      <div className="runner-menubar">
        <span>File</span>
        <span>Quest</span>
        <span>Help</span>
      </div>
      <div className="runner-banner">
        <span className="run-badge">[RUN]</span>
        <span>{quest.title}</span>
      </div>
      <dl className="runner-grid">
        <div>
          <dt>남은 시간</dt>
          <dd>{remainingTime}</dd>
        </div>
        <div>
          <dt>종료 조건</dt>
          <dd>{quest.amount}{quest.unit} 달성</dd>
        </div>
        <div>
          <dt>보상</dt>
          <dd className="reward">EXP {quest.rewardExp}</dd>
        </div>
      </dl>
      <div className="progress-pixels" aria-label="QuestRunner progress">
        {Array.from({ length: 12 }, (_, index) => <span key={index} />)}
      </div>
      <div className="window-actions">
        <button className="xp-button primary" type="button" onClick={onComplete}>완료했어</button>
        <button className="xp-button" type="button" onClick={onFail}>실패 처리</button>
      </div>
    </section>
  );
}

function SystemTrayClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <span>{formatKoreanClockTime(now)}</span>;
}

function FailureWindow({ selectedFailureReason, onReasonChange, onCreateRecovery }: FailureWindowProps) {
  return (
    <section className="failure-panel">
      <div className="failure-list">
        {failureReasons.map((reason, index) => {
          const inputId = `failure-reason-${index}`;
          return (
            <span className="choice-field" key={reason}>
              <input
                id={inputId}
                type="radio"
                name="failureReason"
                checked={selectedFailureReason === reason}
                onChange={() => onReasonChange(reason)}
              />
              <label htmlFor={inputId}>{reason}</label>
            </span>
          );
        })}
      </div>
      <div className="window-actions">
        <button className="xp-button primary" type="button" onClick={onCreateRecovery}>복구 퀘스트 받기</button>
      </div>
    </section>
  );
}

function RecoveryWindow({ quest, onEdit, onAccept }: RecoveryWindowProps) {
  return (
    <section className="recovery-panel">
      <p className="recovery-title">{quest.title}</p>
      <dl className="runner-grid">
        <div>
          <dt>유형</dt>
          <dd>{questTypeLabels[quest.type]}</dd>
        </div>
        <div>
          <dt>분량</dt>
          <dd>{quest.amount}{quest.unit}</dd>
        </div>
        <div>
          <dt>보상</dt>
          <dd className="reward">EXP {quest.rewardExp}</dd>
        </div>
      </dl>
      <div className="window-actions">
        <button className="xp-button" type="button" onClick={onEdit}>수정</button>
        <button className="xp-button primary" type="button" onClick={onAccept}>수락하기</button>
      </div>
    </section>
  );
}

function ManagerWindow({ manager, petAway }: ManagerWindowProps) {
  const displayStage = getManagerDisplayStage(manager);
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <section className="manager-panel">
      <div className="manager-stage">
        <strong className="manager-name">◇ {manager.name} ◇</strong>
        <div className={`manager-visual ${petAway ? "pet-away" : ""}`}>
          <div className="reaction-bubble" aria-hidden="true" />
          {!petAway && <DesktopPet mood={manager.mood} petId={manager.petId} stage={displayStage} large />}
        </div>
        <div className="manager-progress">
          <span className="level">Lv.{manager.level}</span>
          <div
            className="exp-bar"
            role="progressbar"
            aria-label="루미 경험치"
            aria-valuemin={0}
            aria-valuemax={managerExpPerLevel}
            aria-valuenow={manager.exp}
          >
            <i style={{ width: `${getManagerExpProgressPercent(manager.exp)}%` }} />
          </div>
          <span className="exp-value">{manager.exp} / {managerExpPerLevel} EXP</span>
        </div>
        <div className="manager-status">
          <span className={`status-pixel ${manager.mood}`}>{managerStatusIcons[manager.mood]}</span>
          <span>{managerStatusLabels[manager.mood]}</span>
        </div>
      </div>
      <p className="dialogue-panel">{manager.line}</p>
      <button
        className="manager-status-toggle xp-button"
        type="button"
        aria-label="능력치 보기"
        title="능력치 보기"
        aria-expanded={detailsOpen}
        onClick={() => setDetailsOpen((open) => !open)}
      >
        {detailsOpen ? "♡" : "✦"}
      </button>
      {detailsOpen && (
        <dl className="manager-detail-panel">
          {(Object.keys(statLabels) as StatKey[]).map((stat) => (
            <div key={stat}>
              <dt>{statLabels[stat]}</dt>
              <dd>{manager.stats[stat]}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function SettingsWindow({ manager, onSelectStage, onToggleSound }: SettingsWindowProps) {
  const displayStage = getManagerDisplayStage(manager);
  return (
    <section className="settings-panel">
      <div className="settings-group">
        <strong>외형</strong>
        <span>해금된 모습 중 하나를 선택할 수 있어.</span>
        <div className="stage-switcher" aria-label="해금 외형 선택">
          {manager.unlockedStages.map((stage) => (
            <button className={displayStage === stage ? "selected" : ""} key={stage} type="button" onClick={() => onSelectStage(stage)}>
              {stageLabels[stage]}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-group">
        <strong>사운드</strong>
        <span>효과음과 매니저 소리를 켜거나 끌 수 있어.</span>
        <button className={`sound-toggle ${manager.soundEnabled ? "enabled" : ""}`} type="button" onClick={onToggleSound}>
          {manager.soundEnabled ? "사운드 켜짐" : "사운드 꺼짐"}
        </button>
      </div>
    </section>
  );
}

function ProfileWindow({ profile, onSave }: ProfileWindowProps) {
  const [draft, setDraft] = useState(profile);
  return <form className="profile-edit" onSubmit={(event) => { event.preventDefault(); onSave(draft); }}><div className="profile-form"><label htmlFor="profile-edit-name">이름</label><input className="xp-input" id="profile-edit-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /><label htmlFor="profile-edit-nickname">닉네임</label><input className="xp-input" id="profile-edit-nickname" value={draft.nickname} onChange={(event) => setDraft({ ...draft, nickname: event.target.value })} /><label htmlFor="profile-edit-goal">주요 목표</label><textarea className="xp-textarea" id="profile-edit-goal" value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} /><span>가능 시간</span><DailyTimeInputs idPrefix="profile-daily" totalMinutes={draft.dailyMinutes} onChange={(dailyMinutes) => setDraft({ ...draft, dailyMinutes })} /><label htmlFor="profile-edit-target-date">목표 기한</label><input className="xp-input" id="profile-edit-target-date" type="date" value={draft.targetDate} onChange={(event) => setDraft({ ...draft, targetDate: event.target.value })} /></div><div className="window-actions"><button className="xp-button primary" type="submit" disabled={draft.dailyMinutes < 1}>저장</button></div></form>;
}

function JournalWindow({ logs, sync }: JournalWindowProps) {
  return (
    <section className="journal-panel">
      {sync.message && <p className={`sync-notice ${sync.status}`}>{sync.message}</p>}
      {logs.length === 0 ? (
        <div className="journal-empty">
          <strong>아직 기록이 없어.</strong>
          <p>퀘스트를 완료하거나 복구하면 이곳에 기록돼.</p>
        </div>
      ) : (
        <div className="notes-list">
          {logs.map((log) => {
            const statDeltas = getQuestLogStatDeltas(log);
            const rewards = getQuestLogRewardCandidates(log);
            const stageUnlocks = getQuestLogStageUnlocks(log);
            return (
              <div className="note-row" key={log.id}>
                <span className={`log-mark ${log.result}`}>{questLogMarks[log.result]}</span>
                <span>
                  {log.title} <small>{log.reason ?? questLogResultLabels[log.result]}</small>
                  {(statDeltas.length > 0 || rewards.length > 0 || stageUnlocks.length > 0) && (
                    <span className="log-chips">
                      {statDeltas.map((delta) => (
                        <span className="log-chip stat" key={`${log.id}-${delta.stat}`}>
                          {statLabels[delta.stat]} +{delta.amount}
                        </span>
                      ))}
                      {stageUnlocks.map((stage) => (
                        <span className="log-chip reward" key={`${log.id}-${stage}`}>
                          {stageLabels[stage]} 해금
                        </span>
                      ))}
                      {rewards.map((reward) => (
                        <span className="log-chip reward" key={`${log.id}-${reward}`}>
                          {rewardCandidateLabels[reward] ?? reward}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <strong>EXP +{log.exp}</strong>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function XpWindow({ id, title, titlebarIcon, className, children, position, size, resizeAxis = "none", zIndex, isActive, onFocus, onMove, onResize, onMeasure, onMinimize, onClose }: XpWindowProps) {
  const windowRef = useRef<HTMLElement | null>(null);
  const [dragOffset, setDragOffset] = useState<WindowPosition | null>(null);
  const [resizeStart, setResizeStart] = useState<{ pointerX: number; pointerY: number; size: WindowSize } | null>(null);
  const windowStyle = position
    ? ({
        "--window-x": `${position.x}px`,
        "--window-y": `${position.y}px`,
        left: `${position.x}px`,
        top: `${position.y}px`,
        right: "auto",
        width: size ? `${size.width}px` : undefined,
        height: size ? `${size.height}px` : undefined,
        zIndex,
      } as CSSProperties & Record<"--window-x" | "--window-y", string>)
    : undefined;
  const icon = titlebarIcon ?? (id ? windowRegistry[id].titleIcon : "M");

  useLayoutEffect(() => {
    if (!onMeasure) return undefined;

    const windowElement = windowRef.current;
    if (!windowElement) return undefined;

    const measure = () => {
      const rect = windowElement.getBoundingClientRect();
      onMeasure({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    };

    measure();
    window.addEventListener("resize", measure);

    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", measure);
    }

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(windowElement);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [position?.x, position?.y, size?.height, size?.width]);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!id || !position || !onMove) return;
    if ((event.target as HTMLElement).closest("button")) return;

    const windowElement = event.currentTarget.closest(".xp-window");
    if (!windowElement) return;

    const rect = windowElement.getBoundingClientRect();
    setDragOffset({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    onFocus?.();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragWindow(event: PointerEvent<HTMLDivElement>) {
    if (!dragOffset || !onMove) return;

    const maxX = Math.max(0, window.innerWidth - 180);
    const maxY = Math.max(0, window.innerHeight - 78);
    onMove({
      x: Math.min(Math.max(event.clientX - dragOffset.x, 0), maxX),
      y: Math.min(Math.max(event.clientY - dragOffset.y, 0), maxY),
    });
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragOffset) return;

    setDragOffset(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function startResize(event: PointerEvent<HTMLButtonElement>) {
    if (!size || resizeAxis === "none" || !onResize) return;

    setResizeStart({ pointerX: event.clientX, pointerY: event.clientY, size });
    onFocus?.();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function resizeWindow(event: PointerEvent<HTMLButtonElement>) {
    if (!resizeStart || resizeAxis === "none" || !onResize) return;

    const nextWidth = resizeAxis === "horizontal"
      ? Math.max(112, Math.min(360, resizeStart.size.width + event.clientX - resizeStart.pointerX))
      : resizeStart.size.width;
    const nextHeight = resizeAxis === "vertical"
      ? Math.max(112, Math.min(300, resizeStart.size.height + event.clientY - resizeStart.pointerY))
      : resizeStart.size.height;
    onResize({ width: nextWidth, height: nextHeight });
  }

  function stopResize(event: PointerEvent<HTMLButtonElement>) {
    if (!resizeStart) return;

    setResizeStart(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <section
      ref={windowRef}
      className={`xp-window ${position ? "positioned" : ""} ${isActive ? "active" : ""} ${className}`}
      onPointerDown={onFocus}
      style={windowStyle}
    >
      <div
        className="xp-titlebar"
        onPointerDown={startDrag}
        onPointerMove={dragWindow}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <WindowIconMark id={id} fallback={icon} className="titlebar-icon" />
        <span className="titlebar-name">{title}</span>
        <div className="window-buttons">
          <button type="button" aria-label="minimize" onClick={onMinimize} disabled={!onMinimize} />
          <button type="button" aria-label="maximize" disabled />
          <button type="button" aria-label="close" onClick={onClose} disabled={!onClose} />
        </div>
      </div>
      <div className="xp-window-body">{children}</div>
      {resizeAxis !== "none" && (
        <button
          className={`xp-window-resize-handle ${resizeAxis}`}
          type="button"
          aria-label={resizeAxis === "vertical" ? "창 높이 조절" : "창 너비 조절"}
          onPointerDown={startResize}
          onPointerMove={resizeWindow}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
        />
      )}
    </section>
  );
}

function WindowIconMark({ id, fallback, className }: WindowIconMarkProps) {
  const manifestId = id ? windowRegistry[id].windowIconAssetId : undefined;
  const asset = manifestId ? getDesktopIconAsset(manifestId).idleSrc : id ? windowRegistry[id].legacyWindowIconAsset : undefined;
  return (
    <span className={className} aria-hidden="true">
      {asset ? <img src={asset} alt="" /> : fallback ?? (id ? windowRegistry[id].titleIcon : "M")}
    </span>
  );
}

function DesktopIcon({
  label,
  type,
  onClick,
  onContextMenu,
  assetId,
  overrideIdleSrc,
  overrideHoverSrc,
  disabled = false,
}: DesktopIconProps) {
  const [iconState, setIconState] = useState<"idle" | "hover" | "active">("idle");
  const manifestId = assetId ?? windowRegistry[type].desktopIconAssetId;
  const asset = manifestId ? getDesktopIconAsset(manifestId) : undefined;
  const idleSrc = overrideIdleSrc ?? asset?.idleSrc;
  const hoverSrc = overrideHoverSrc ?? asset?.hoverSrc;
  const activeSrc = overrideHoverSrc ?? asset?.activeSrc;
  const iconSrc = disabled ? asset?.disabledSrc : iconState === "active" ? activeSrc : iconState === "hover" ? hoverSrc : idleSrc;
  return (
    <button
      className={`desktop-icon ${type} ${iconState}`}
      type="button"
      onBlur={() => setIconState("idle")}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerCancel={() => setIconState("idle")}
      onPointerDown={() => setIconState("active")}
      onPointerEnter={() => setIconState("hover")}
      onPointerLeave={() => setIconState("idle")}
      onPointerUp={() => setIconState("hover")}
      disabled={disabled}
    >
      <span className="desktop-icon-graphic" aria-hidden="true">
        {iconSrc ? <img src={iconSrc} alt="" /> : <b className="desktop-icon-fallback">{windowRegistry[type].titleIcon}</b>}
      </span>
      <strong>{label}</strong>
    </button>
  );
}

function LadderObjectWindow() {
  const asset = getInteractionObjectAsset("ladder");

  return (
    <section className="object-window-content ladder-object-content" aria-label="사다리 오브젝트">
      <div className="ladder-tile-stack" aria-hidden="true">
        <img className="ladder-tile-cap" src={asset.tiles?.top ?? asset.src} alt="" draggable={false} />
        <span className="ladder-tile-repeat" style={{ backgroundImage: `url(${asset.tiles?.middleRepeat ?? asset.src})` }} />
        <img className="ladder-tile-cap" src={asset.tiles?.bottom ?? asset.src} alt="" draggable={false} />
      </div>
    </section>
  );
}

function PlatformObjectWindow() {
  const asset = getInteractionObjectAsset("platform");

  return (
    <section className="object-window-content platform-object-content" aria-label="평지 오브젝트">
      <div className="platform-base-viewport" aria-hidden="true">
        <img className="platform-base-image" src={asset.src} alt="" draggable={false} />
      </div>
    </section>
  );
}

function OutsidePetLayer({ pet, petId, stage, objectZIndexes }: OutsidePetLayerProps) {
  const renderableStage = getRenderablePetStage(petId, stage);
  const animation = getInteractionPrototypeAnimation(petId, renderableStage, pet.animation);
  const immediatePosition = shouldUseImmediateOutsidePetPosition(pet);
  const petStyle = {
    left: `${pet.position.x}px`,
    top: `${pet.position.y}px`,
    zIndex: resolveOutsidePetLayerZIndex(pet, objectZIndexes),
  } as CSSProperties;

  return (
    <div
      className={`outside-pet-layer ${pet.phase} ${pet.animation} ${pet.behavior ?? "no-behavior"} ${immediatePosition ? "attached" : ""}`}
      data-pet-stage={renderableStage}
      style={petStyle}
      aria-hidden="true"
    >
      <CanvasSpriteAnimator
        animation={animation}
        ariaLabel={`${pet.animation} 핑크 매니저`}
        forceMotion={pet.phase !== "peek_from_edge"}
        mirrorX={shouldMirrorOutsidePet(pet)}
      />
    </div>
  );
}

function WindowPetInteraction({ state, petId, stage, placement, position, measuredRect, zIndex }: WindowPetInteractionProps) {
  const animation = getLumiAnimationAsset(state, petId, stage);
  const renderableStage = getRenderablePetStage(petId, stage);
  const placementProfile = useWindowPetPlacementProfile(petId, stage);
  const runtimeSlot = runtimeWindowPetSlots[placement];
  const selectedPlacement = resolveWindowPetPlacementForSlot(placementProfile, runtimeSlot);
  const targetPosition = measuredRect ? { x: measuredRect.x, y: measuredRect.y } : position;
  const targetSize = measuredRect ? { width: measuredRect.width, height: measuredRect.height } : runtimeSlot.windowSize;
  const resolvedPosition = resolveWindowPetPosition({
    placement: selectedPlacement,
    windowPosition: targetPosition,
    windowSize: targetSize,
    frameWidth: animation.frameWidth,
    anchor: animation.anchor,
    baseSpriteSize: windowPetRuntimeBaseSpriteSize,
  });
  const interactionStyle = {
    left: `${resolvedPosition.left}px`,
    top: `${resolvedPosition.top}px`,
    width: `${resolvedPosition.size}px`,
    height: `${resolvedPosition.size}px`,
    zIndex: resolveWindowPetLayerZIndex(zIndex, resolvedPosition.layer),
  } as CSSProperties;

  return (
    <div className={`window-pet-interaction ${placement} ${state} ${resolvedPosition.layer}`} data-pet-stage={renderableStage} style={interactionStyle} aria-hidden="true">
      <CanvasSpriteAnimator animation={animation} ariaLabel={`${state} 핑크 매니저`} mirrorX={selectedPlacement.mirrorX} />
    </div>
  );
}

function PixelTvWatchingPet({ petId, stage, position, measuredRect, zIndex }: PixelTvWatchingPetProps) {
  const startedAtRef = useRef(Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 1_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const watchingAnimation = resolvePixelTvWatchingAnimationAsset(petId, stage, elapsedMs);
  const animation = watchingAnimation.animation;
  const renderableStage = getRenderablePetStage(petId, stage);
  const targetPosition = measuredRect ? { x: measuredRect.x, y: measuredRect.y } : position;
  const targetSize = measuredRect
    ? { width: measuredRect.width, height: measuredRect.height }
    : initialWindowSizes.pixelTv ?? { width: 372, height: 332 };
  const watchingStyle = {
    left: `${targetPosition.x + targetSize.width + 12}px`,
    top: `${targetPosition.y + targetSize.height / 2 - 48}px`,
    width: "96px",
    height: "96px",
    zIndex: zIndex + 1,
  } as CSSProperties;

  return (
    <div className="window-pet-interaction pixel-tv-watching front" data-pet-stage={renderableStage} style={watchingStyle} aria-hidden="true">
      {watchingAnimation.hasWatchingReaction && (
        <div className="pixel-tv-reaction-balloon">
          <div className="pixel-tv-reaction-heart" />
        </div>
      )}
      <CanvasSpriteAnimator animation={animation} ariaLabel="Pixel TV를 보는 전자 매니저" />
    </div>
  );
}

function getInteractionPrototypeAnimation(petId: PetId, stage: PetStageId, state: PetAnimationState) {
  if (hasPetAnimationAsset(petId, stage, state)) return getPetAnimationAsset(petId, stage, state);
  if (hasPetAnimationAsset(petId, stage, "idle")) return getPetAnimationAsset(petId, stage, "idle");
  return getPetAnimationAsset(defaultLumiPetId, "stage-2", state);
}

function getInteractionObjectAsset(type: InteractionObjectAsset["type"]): InteractionObjectAsset {
  return interactionObjectAssets.find((asset) => asset.type === type) ?? interactionObjectAssets[0];
}

function createManagerRuntimeState(input: ManagerRuntimeStateInput): ManagerRuntimeState {
  const windowInteraction = resolveManagerWindowInteraction({
    showPixelTvWatching: input.showPixelTvWatching,
    showQuestHangingPet: input.showQuestHangingPet,
    showRecoveryHidingPet: input.showRecoveryHidingPet,
    supportsQuestHangingPet: input.supportsQuestHangingPet,
    supportsRecoveryHidingPet: input.supportsRecoveryHidingPet,
  });
  if (windowInteraction === "pixel_tv_watching") {
    return {
      location: "window_edge",
      mood: input.manager.mood,
      stage: input.displayStage,
      animation: "focused",
      windowInteraction,
      outside: input.outsidePet,
      petAwayFromManagerWindow: true,
      showOutsidePet: false,
    };
  }

  if (input.showOutsidePet) {
    return {
      location: "outside",
      mood: input.manager.mood,
      stage: input.displayStage,
      animation: input.outsidePet.animation,
      windowInteraction: "none",
      outside: input.outsidePet,
      petAwayFromManagerWindow: true,
      showOutsidePet: true,
    };
  }

  if (input.outsidePet.phase === "blink") {
    return {
      location: "transition",
      mood: input.manager.mood,
      stage: input.displayStage,
      animation: "hiding",
      windowInteraction: "none",
      outside: input.outsidePet,
      petAwayFromManagerWindow: true,
      showOutsidePet: false,
    };
  }

  if (windowInteraction === "quest_hanging") {
    return {
      location: "window_edge",
      mood: input.manager.mood,
      stage: input.displayStage,
      animation: "hanging",
      windowInteraction,
      outside: input.outsidePet,
      petAwayFromManagerWindow: true,
      showOutsidePet: false,
    };
  }

  if (windowInteraction === "recovery_hiding") {
    return {
      location: "window_edge",
      mood: input.manager.mood,
      stage: input.displayStage,
      animation: "hiding",
      windowInteraction,
      outside: input.outsidePet,
      petAwayFromManagerWindow: true,
      showOutsidePet: false,
    };
  }

  return {
    location: "manager_window",
    mood: input.manager.mood,
    stage: input.displayStage,
    animation: lumiMoodToSpriteState[input.manager.mood],
    windowInteraction: "none",
    outside: input.outsidePet,
    petAwayFromManagerWindow: false,
    showOutsidePet: false,
  };
}

function createInteractionObjectsFromWindows(
  positions: Record<WindowId, WindowPosition>,
  sizes: Partial<Record<WindowId, WindowSize>>,
  openWindows: WindowId[],
): InteractionObject[] {
  const ladderPosition = positions.ladderObject;
  const ladderSize = sizes.ladderObject ?? initialWindowSizes.ladderObject ?? { width: 86, height: 184 };
  const platformPosition = positions.platformObject;
  const platformSize = sizes.platformObject ?? initialWindowSizes.platformObject ?? { width: 280, height: 440 };

  const objects: InteractionObject[] = [];

  if (openWindows.includes("ladderObject")) {
    objects.push({
      id: "ladder-1",
      type: "ladder",
      resizeAxis: "vertical",
      rect: {
        x: ladderPosition.x + ladderSize.width / 2 - 18,
        y: ladderPosition.y + 32,
        width: 36,
        height: Math.max(72, ladderSize.height - 46),
      },
    });
  }

  if (openWindows.includes("platformObject")) {
    objects.push({
      id: "platform-1",
      type: "platform",
      resizeAxis: "horizontal",
      rect: {
        x: platformPosition.x + 12,
        y: platformPosition.y + Math.max(96, Math.round(platformSize.width * 0.62)),
        width: Math.max(96, platformSize.width - 24),
        height: 18,
      },
    });
  }

  objects.push({
    id: "escape-edge-1",
    type: "window_escape_edge",
    resizeAxis: "none",
    rect: { x: window.innerWidth - 18, y: outsidePetFieldRect.y - 48, width: 10, height: 150 },
  });

  return objects;
}

function getNextOutsidePetRoamAnimation(
  pet: OutsidePetState,
  objects: InteractionObject[],
  manager: ManagerState,
  tone: ManagerTone,
  streak: QuestOutcomeStreak,
  reducedMotion: boolean,
): PetAnimationState {
  const petRect = { x: pet.position.x, y: pet.position.y, width: outsidePetSpriteSize, height: outsidePetSpriteSize };
  const context: BehaviorContext = {
    pet: petRect,
    objects,
    mood: getBehaviorMoodFromManagerMood(manager.mood),
    recentEvent: getRecentBehaviorEvent(streak),
    reducedMotion,
  };
  const resolvedBehavior = resolveManagerBehavior({
    rawIntent: manager.behaviorIntent ?? createRuleFallbackManagerIntent(manager, tone, streak),
    context,
    randomValue: (Date.now() / 1000) % 1,
    fallbackIntent: createRuleFallbackManagerIntent(manager, tone, streak),
  });
  const mappedAnimation = resolvedBehavior.animation;

  if (mappedAnimation === "hanging" || mappedAnimation === "hiding") return "idle";
  return mappedAnimation;
}

function getBehaviorMoodFromManagerMood(mood: ManagerState["mood"]): PetBehaviorMood {
  return mood;
}

function getRecentBehaviorEvent(streak: QuestOutcomeStreak): PetBehaviorRecentEvent {
  if (streak.result === "success") return "quest_completed";
  if (streak.result === "failed") return "quest_failed";
  return null;
}

function DesktopPet({ mood, petId, stage, large = false }: DesktopPetProps) {
  const [hovered, setHovered] = useState(false);
  const spriteState = resolveDesktopPetSpriteState(mood, hovered);
  const animation = getLumiAnimationAsset(spriteState, petId, stage);
  const renderableStage = getRenderablePetStage(petId, stage);

  return (
    <span
      className={`desktop-pet-sprite ${mood} ${spriteState} ${large ? "large" : ""}`}
      data-pet-stage={renderableStage}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <CanvasSpriteAnimator animation={animation} ariaLabel="핑크 매니저" />
    </span>
  );
}
