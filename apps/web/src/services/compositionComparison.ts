import type { ShotFrame } from "../types/photoSpot";

export type ComparisonMode = "fast" | "accurate";

export type CompositionComparison = {
  status: "ok" | "limited";
  compositionScore: number | null;
  scoringMode: "yolo_pose_only" | "yolo_pose_and_background" | "unavailable";
  feedback: string[];
  person: {
    status: string;
    score: number | null;
    method: string;
    people: Array<{
      label: string;
      score: number;
      positionError?: number;
      scaleError?: number;
      poseError?: number;
    }>;
  };
  background: {
    status: string;
    score: number | null;
  };
};

const visionApiBaseUrl = import.meta.env.VITE_VISION_API_BASE_URL ?? "/vision";

function dataUrlToFile(dataUrl: string, name: string) {
  const [metadata, encoded] = dataUrl.split(",");
  const mimeType = metadata?.match(/data:(.*?);base64/)?.[1] ?? "image/png";
  const bytes = Uint8Array.from(atob(encoded ?? ""), (character) => character.charCodeAt(0));
  return new File([bytes], name, { type: mimeType });
}

function createGuideFile(frame: ShotFrame) {
  const guide = {
    version: "1.0",
    personFrames: frame.poseGuide?.personFrames ?? [],
    personPoses: frame.poseGuide?.personPoses ?? [],
    personOutlines: frame.poseGuide?.personOutlines ?? [],
    backgroundLines: frame.backgroundGuide?.backgroundLines ?? [],
  };
  return new File([JSON.stringify(guide)], `${frame.id}-layout.json`, { type: "application/json" });
}

async function loadReferenceFile(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("기준 사진을 불러오지 못했어요.");
  const blob = await response.blob();
  return new File([blob], "reference.jpg", { type: blob.type || "image/jpeg" });
}

export async function compareCapturedComposition({
  image,
  frame,
  mode,
}: {
  image: string;
  frame: ShotFrame;
  mode: ComparisonMode;
}): Promise<CompositionComparison> {
  const formData = new FormData();
  formData.append("guide_file", createGuideFile(frame));
  formData.append("captured_file", dataUrlToFile(image, "captured.png"));
  formData.append("comparison_mode", mode);

  if (mode === "accurate") {
    if (!frame.referenceImageUrl) throw new Error("정확 비교에 필요한 기준 사진이 없어요.");
    formData.append("reference_file", await loadReferenceFile(frame.referenceImageUrl));
  }

  const response = await fetch(`${visionApiBaseUrl}/api/compare`, {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => null) as { detail?: string } | CompositionComparison | null;
  if (!response.ok) throw new Error((payload as { detail?: string } | null)?.detail ?? "구도 비교를 완료하지 못했어요.");
  return payload as CompositionComparison;
}
