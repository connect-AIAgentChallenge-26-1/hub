/**
 * guide.json is the shared contract between the registration tool, storage,
 * camera overlay, and composition comparison. All coordinates are normalized
 * to the 0..1 image space so the guide can be reused at any resolution.
 */
export const GUIDE_VERSION = 5;
export const BACKGROUND_GUIDE_KIND = "background_guide";
export const POSE_GUIDE_KIND = "pose_guide";

export const POSE_KEYPOINT_NAMES = Object.freeze([
  "nose",
  "left_shoulder", "right_shoulder",
  "left_elbow", "right_elbow",
  "left_wrist", "right_wrist",
  "left_hip", "right_hip",
  "left_knee", "right_knee",
  "left_ankle", "right_ankle",
]);

export const POSE_SEGMENTS = Object.freeze([
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"], ["left_hip", "right_hip"],
  ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
]);

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function isFiniteCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizePoint(point) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(isFiniteCoordinate)) return null;
  return [clamp(point[0]), clamp(point[1])];
}

export function normalizePose(pose, index = 0) {
  const keypoints = Object.fromEntries(
    Object.entries(pose?.keypoints ?? {})
      .filter(([name]) => POSE_KEYPOINT_NAMES.includes(name))
      .map(([name, point]) => [name, normalizePoint(point)])
      .filter(([, point]) => point),
  );
  const missingKeypoints = [...new Set((pose?.missingKeypoints ?? []).filter((name) => POSE_KEYPOINT_NAMES.includes(name)))];

  return {
    label: pose?.label ?? (index === 0 ? "Subject" : "Right person"),
    keypoints,
    missingKeypoints,
  };
}

function normalizeFrame(frame, index) {
  const width = clamp(Number(frame?.width) || 0, 0.08, 0.9);
  const height = clamp(Number(frame?.height) || 0, 0.15, 0.92);
  return {
    ...frame,
    x: clamp(Number(frame?.x) || 0, 0, 1 - width),
    y: clamp(Number(frame?.y) || 0, 0, 1 - height),
    width,
    height,
    label: frame?.label ?? (index === 0 ? "Subject" : "Right person"),
  };
}

export function createPersonFrame(landmarks, index) {
  const visible = landmarks.filter((point) => (
    (point.visibility ?? 1) >= 0.45 && isFiniteCoordinate(point.x) && isFiniteCoordinate(point.y)
  ));
  if (visible.length < 4) return null;

  const xs = visible.map((point) => point.x);
  const ys = visible.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const paddingX = Math.max(0.05, (maxX - minX) * 0.24);
  const paddingY = Math.max(0.05, (maxY - minY) * 0.16);
  const x = clamp(minX - paddingX);
  const y = clamp(minY - paddingY);
  const right = clamp(maxX + paddingX);
  const bottom = clamp(maxY + paddingY);

  return normalizeFrame({
    x,
    y,
    width: Math.max(0.12, right - x),
    height: Math.max(0.2, bottom - y),
    label: index === 0 ? "Left person" : "Right person",
  }, index);
}

export function selectFrames(landmarkSets, mode) {
  const frames = landmarkSets
    .map((landmarks, index) => createPersonFrame(landmarks, index))
    .filter(Boolean)
    .sort((a, b) => b.width * b.height - a.width * a.height);

  const selected = mode === "solo" ? frames.slice(0, 1) : frames.slice(0, 2);
  return selected
    .sort((a, b) => a.x - b.x)
    .map((frame, index) => ({
      ...frame,
      label: mode === "solo" ? "Subject" : index === 0 ? "Left person" : "Right person",
    }));
}

export function scaleFrames(frames, scalePercent) {
  const ratio = scalePercent / 100;
  return frames.map((frame, index) => {
    const normalized = normalizeFrame(frame, index);
    const width = clamp(normalized.width * ratio, 0.08, 0.9);
    const height = clamp(normalized.height * ratio, 0.15, 0.92);
    return {
      ...normalized,
      width,
      height,
      x: clamp(normalized.x + (normalized.width - width) / 2, 0, 1 - width),
      y: clamp(normalized.y + (normalized.height - height) / 2, 0, 1 - height),
    };
  });
}

export function createGuide({
  personFrames,
  personOutlines = [],
  personPoses = [],
  horizonY = 0.62,
  backgroundLines = [],
  analysisMeta = {},
}) {
  return {
    version: GUIDE_VERSION,
    backgroundLines: backgroundLines.slice(0, 5),
    horizonY: clamp(horizonY),
    personFrames: personFrames.map(normalizeFrame),
    personOutlines,
    personPoses: personPoses.map(normalizePose),
    poseSegments: POSE_SEGMENTS,
    analysisMeta,
  };
}

function normalizeGuideId(value, fallback) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

/** A reusable place guide. One scene can be referenced by many pose guides. */
export function createBackgroundGuide({ id, horizonY = 0.62, backgroundLines = [], sourceImage = null }) {
  return {
    kind: BACKGROUND_GUIDE_KIND,
    version: GUIDE_VERSION,
    id: normalizeGuideId(id, "untitled-scene"),
    sourceImage,
    horizonY: clamp(horizonY),
    backgroundLines: backgroundLines.slice(0, 5),
  };
}

/** A photo-specific person layout. It intentionally stores no background lines. */
export function createPoseGuide({ id, backgroundGuideId, personFrames, personOutlines = [], personPoses = [], analysisMeta = {} }) {
  return {
    kind: POSE_GUIDE_KIND,
    version: GUIDE_VERSION,
    id: normalizeGuideId(id, "untitled-pose"),
    backgroundGuideId: normalizeGuideId(backgroundGuideId, "untitled-scene"),
    personFrames: personFrames.map(normalizeFrame),
    personOutlines,
    personPoses: personPoses.map(normalizePose),
    poseSegments: POSE_SEGMENTS,
    analysisMeta,
  };
}

/** Rebuilds the runtime contract used by Canvas rendering and the comparison API. */
export function composeGuide(backgroundGuide, poseGuide) {
  if (backgroundGuide?.kind !== BACKGROUND_GUIDE_KIND || poseGuide?.kind !== POSE_GUIDE_KIND) {
    throw new Error("background_guide와 pose_guide가 필요합니다.");
  }
  if (backgroundGuide.id !== poseGuide.backgroundGuideId) {
    throw new Error("pose_guide가 선택한 background_guide를 참조하지 않습니다.");
  }
  return createGuide({
    horizonY: backgroundGuide.horizonY,
    backgroundLines: backgroundGuide.backgroundLines,
    personFrames: poseGuide.personFrames,
    personOutlines: poseGuide.personOutlines,
    personPoses: poseGuide.personPoses,
    analysisMeta: {
      ...poseGuide.analysisMeta,
      backgroundGuideId: backgroundGuide.id,
    },
  });
}

export function scaleOutlines(outlines, frames, scalePercent) {
  const ratio = scalePercent / 100;
  return outlines.map((outline, index) => {
    const frame = frames[index];
    if (!frame) return outline;
    const centerX = frame.x + frame.width / 2;
    const centerY = frame.y + frame.height / 2;
    return {
      ...outline,
      contours: outline.contours.map((contour) => contour.map(([x, y]) => [
        clamp(centerX + (x - centerX) * ratio),
        clamp(centerY + (y - centerY) * ratio),
      ])),
    };
  });
}

export function scalePoses(poses, frames, scalePercent) {
  const ratio = scalePercent / 100;
  return poses.map((rawPose, index) => {
    const frame = frames[index];
    const pose = normalizePose(rawPose, index);
    if (!frame) return pose;
    const centerX = frame.x + frame.width / 2;
    const centerY = frame.y + frame.height / 2;
    return {
      ...pose,
      keypoints: Object.fromEntries(Object.entries(pose.keypoints).map(([name, [x, y]]) => [
        name,
        [
          clamp(centerX + (x - centerX) * ratio),
          clamp(centerY + (y - centerY) * ratio),
        ],
      ])),
    };
  });
}

export function withAdjustments(guide, { frameScale, horizonPercent }) {
  const sourceFrames = guide.personFrames ?? [];
  return {
    ...guide,
    horizonY: clamp(horizonPercent / 100),
    personFrames: scaleFrames(sourceFrames, frameScale),
    personOutlines: scaleOutlines(guide.personOutlines ?? [], sourceFrames, frameScale),
    personPoses: scalePoses(guide.personPoses ?? [], sourceFrames, frameScale),
  };
}
