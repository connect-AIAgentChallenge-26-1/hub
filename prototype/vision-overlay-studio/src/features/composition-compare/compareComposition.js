export class CompositionComparisonError extends Error {}

export async function compareComposition({ referenceFile, guideFile, capturedFile, comparisonMode = "fast" }) {
  if (!guideFile || !capturedFile) {
    throw new CompositionComparisonError("guide.json과 촬영 사진을 모두 선택하세요.");
  }
  if (comparisonMode === "accurate" && !referenceFile) {
    throw new CompositionComparisonError("정확 모드에서는 예시 사진도 선택하세요.");
  }

  const body = new FormData();
  body.append("guide_file", guideFile);
  body.append("captured_file", capturedFile);
  body.append("comparison_mode", comparisonMode);
  if (referenceFile) body.append("reference_file", referenceFile);

  let response;
  try {
    response = await fetch("/api/compare", { method: "POST", body });
  } catch {
    throw new CompositionComparisonError("비교 서버에 연결하지 못했습니다. 통합 실행 스크립트로 서버를 시작하세요.");
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new CompositionComparisonError(result.detail || "구도 비교를 완료하지 못했습니다.");
  }
  return result;
}
