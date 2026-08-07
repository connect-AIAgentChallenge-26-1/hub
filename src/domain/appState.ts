import type { PetId, PetStageId } from "../data/assetManifest";
import type { ManagerBehaviorIntent } from "./managerBehaviorIntent";
import type { PetBehaviorStyle } from "./petBehaviorStateMachine";
import type { ManagerStats } from "./statGrowth";

export type ManagerTone = "calm" | "friendly" | "firm";
export type QuestSize = "tiny" | "balanced" | "challenge";

export interface UserProfile {
  name: string;
  nickname: string;
  goal: string;
  category: "study" | "exercise" | "hobby" | "career" | "habit";
  goalPeriod: string;
  targetDate: string;
  dailyMinutes: number;
  questSize: QuestSize;
  managerTone: ManagerTone;
  focusAnswer: string;
}

export interface ManagerState {
  name: string;
  petId: PetId;
  level: number;
  exp: number;
  stats: ManagerStats;
  mood: "waiting" | "focused" | "happy" | "recovering";
  line: string;
  behaviorStyle: PetBehaviorStyle;
  behaviorIntent?: ManagerBehaviorIntent;
  unlockedStages: PetStageId[];
  selectedStage: PetStageId | null;
  soundEnabled: boolean;
}

export interface QuestOutcomeStreak {
  result: "success" | "failed" | null;
  count: number;
}
