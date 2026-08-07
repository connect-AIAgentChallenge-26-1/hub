import type { DesktopIconId } from "./assetManifest";

export type WindowId =
  | "quest"
  | "runner"
  | "failure"
  | "recovery"
  | "manager"
  | "profile"
  | "journal"
  | "trash"
  | "settings"
  | "pixelTv"
  | "pixelTvProperties"
  | "ladderObject"
  | "platformObject";

export interface WindowPosition {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export interface WindowSpec {
  label: string;
  titleIcon: string;
  initialPosition: WindowPosition;
  initialSize?: WindowSize;
  desktopIconAssetId?: DesktopIconId;
  windowIconAssetId?: DesktopIconId;
  legacyWindowIconAsset?: string;
  workflow?: boolean;
}

export const windowRegistry: Record<WindowId, WindowSpec> = {
  quest: {
    label: "오늘의 퀘스트",
    titleIcon: "Q",
    initialPosition: { x: 190, y: 118 },
    desktopIconAssetId: "quest",
    windowIconAssetId: "quest",
    workflow: true,
  },
  runner: {
    label: "QuestRunner.exe",
    titleIcon: ">",
    initialPosition: { x: 285, y: 156 },
    windowIconAssetId: "runner",
    workflow: true,
  },
  failure: {
    label: "실패 이유",
    titleIcon: "!",
    initialPosition: { x: 455, y: 180 },
    legacyWindowIconAsset: "/assets/icons/failure.svg",
    workflow: true,
  },
  recovery: {
    label: "복구 퀘스트",
    titleIcon: "+",
    initialPosition: { x: 455, y: 180 },
    windowIconAssetId: "recovery",
    workflow: true,
  },
  manager: {
    label: "Manager.exe",
    titleIcon: "◇",
    initialPosition: { x: 850, y: 132 },
    desktopIconAssetId: "manager",
    windowIconAssetId: "manager",
    workflow: true,
  },
  profile: {
    label: "내 프로필",
    titleIcon: "P",
    initialPosition: { x: 170, y: 104 },
    desktopIconAssetId: "profile",
    windowIconAssetId: "profile",
  },
  journal: {
    label: "기록 노트",
    titleIcon: "N",
    initialPosition: { x: 285, y: 392 },
    desktopIconAssetId: "journal",
    windowIconAssetId: "journal",
    workflow: true,
  },
  trash: {
    label: "휴지통",
    titleIcon: "T",
    initialPosition: { x: 895, y: 405 },
    desktopIconAssetId: "trash",
    windowIconAssetId: "trash",
  },
  settings: {
    label: "설정",
    titleIcon: "S",
    initialPosition: { x: 610, y: 142 },
    desktopIconAssetId: "theme-settings",
    windowIconAssetId: "theme-settings",
  },
  pixelTv: {
    label: "Pixel TV",
    titleIcon: "TV",
    initialPosition: { x: 40, y: 24 },
    initialSize: { width: 780, height: 780 },
    desktopIconAssetId: "pixel-tv",
    windowIconAssetId: "pixel-tv",
  },
  pixelTvProperties: {
    label: "Pixel TV 속성",
    titleIcon: "TV",
    initialPosition: { x: 360, y: 185 },
    desktopIconAssetId: "pixel-tv",
    windowIconAssetId: "pixel-tv",
  },
  ladderObject: {
    label: "사다리",
    titleIcon: "L",
    initialPosition: { x: 650, y: 294 },
    initialSize: { width: 104, height: 184 },
  },
  platformObject: {
    label: "평지",
    titleIcon: "_",
    initialPosition: { x: 735, y: 350 },
    initialSize: { width: 280, height: 440 },
  },
};

export const windowIds = Object.keys(windowRegistry) as WindowId[];
export const workflowWindowIds = windowIds.filter((id) => windowRegistry[id].workflow);
export const defaultOpenWindowIds = ["quest", "manager"] as const satisfies readonly WindowId[];
export const desktopShortcutWindowIds = [
  "quest",
  "manager",
  "profile",
  "journal",
  "pixelTv",
  "ladderObject",
  "platformObject",
  "trash",
] as const satisfies readonly WindowId[];

export const initialWindowPositions = Object.fromEntries(
  windowIds.map((id) => [id, windowRegistry[id].initialPosition]),
) as Record<WindowId, WindowPosition>;

export const initialWindowSizes = Object.fromEntries(
  windowIds.flatMap((id) => {
    const initialSize = windowRegistry[id].initialSize;
    return initialSize ? [[id, initialSize]] : [];
  }),
) as Partial<Record<WindowId, WindowSize>>;
