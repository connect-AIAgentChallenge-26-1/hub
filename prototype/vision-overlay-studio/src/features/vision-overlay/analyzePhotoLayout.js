import { createGuide } from "../../lib/guide";

export class LayoutAnalysisError extends Error {}

const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
async function analyzeWithServer({ file, mode, onProgress }) {
  if (!file) throw new LayoutAnalysisError("분석할 원본 사진을 다시 선택하세요.");
  onProgress(1, "로컬 YOLO/SAM2 서버에 연결하고 있습니다.");
  await nextPaint();
  onProgress(2, "YOLO로 인물을 찾고 SAM2로 정밀 윤곽을 생성하고 있습니다.");

  const body = new FormData();
  body.append("file", file);
  body.append("mode", mode);
  let response;
  try {
    response = await fetch("/api/analyze", { method: "POST", body });
  } catch {
    throw new LayoutAnalysisError("로컬 YOLO/SAM2 서버에 연결하지 못했습니다. 통합 실행 스크립트로 서버를 시작하세요.");
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new LayoutAnalysisError(result.detail || "YOLO/SAM2 분석에 실패했습니다.");
  }
  return { ...result, engine: "YOLO + SAM2" };
}

/**
 * UI와 분리된 사진 분석 진입점입니다.
 * 이후 포토스팟 상세나 카메라 화면에서도 이 함수만 호출하면 됩니다.
 */
export async function analyzePhotoLayout({ file, mode, onProgress = () => {} }) {
  const result = await analyzeWithServer({ file, mode, onProgress });

  await nextPaint();
  onProgress(3, "배경의 수평선과 대표 윤곽을 찾고 있습니다.");
  const scene = { horizonY: 0.62, backgroundLines: [] };
  const warning = "";

  await nextPaint();
  onProgress(4, "촬영 가이드와 다운로드 파일을 만들고 있습니다.");
  const guide = createGuide({
    personFrames: result.personFrames,
    personOutlines: result.personOutlines,
    personPoses: result.personPoses,
    ...scene,
    analysisMeta: {
      engine: result.engine,
      models: result.models ?? {},
      timingsMs: result.timings_ms ?? {},
      warnings: result.warnings ?? [],
    },
  });

  const warnings = [warning, ...(result.warnings ?? [])].filter(Boolean);
  return { guide, warning: warnings.join(" "), timings: result.timings_ms, engine: result.engine };
}
