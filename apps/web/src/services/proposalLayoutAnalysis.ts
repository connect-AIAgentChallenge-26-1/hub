import type { ShotFrame } from "../types/photoSpot";

type VisionAnalysisResponse = {
  status: "ok";
  image_size: { width: number; height: number };
  personFrames: Array<Record<string, unknown>>;
  personOutlines: Array<Record<string, unknown>>;
  personPoses: Array<Record<string, unknown>>;
};

const visionApiBaseUrl = import.meta.env.VITE_VISION_API_BASE_URL ?? "/vision";

export async function analyzeProposalLayout(file: File, frameType: "solo" | "couple"): Promise<NonNullable<ShotFrame["poseGuide"]>> {
  const payload = new FormData();
  payload.append("file", file);
  payload.append("mode", frameType);

  const response = await fetch(`${visionApiBaseUrl}/api/analyze`, { method: "POST", body: payload });
  const result = await response.json().catch(() => null) as VisionAnalysisResponse | { detail?: string } | null;
  if (!response.ok) throw new Error((result as { detail?: string } | null)?.detail ?? "레이아웃 분석을 완료하지 못했어요.");

  const analysis = result as VisionAnalysisResponse;
  return {
    personFrames: analysis.personFrames,
    personOutlines: analysis.personOutlines,
    personPoses: analysis.personPoses,
    imageSize: { width: analysis.image_size.width, height: analysis.image_size.height },
    orientation: analysis.image_size.width >= analysis.image_size.height ? "landscape" : "portrait",
  };
}
