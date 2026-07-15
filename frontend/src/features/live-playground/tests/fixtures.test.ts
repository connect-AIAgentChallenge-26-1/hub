import { describe, expect, it } from "vitest";
import { mockResult, mockTrace } from "../fixtures/mock-data";

describe("Live Playground mock fixture", () => {
  it("결정론적 Top 3와 0~80 점수 계약을 만족한다", () => {
    expect(mockResult.places).toHaveLength(3);
    expect(mockResult.places.map((place) => place.rank)).toEqual([1, 2, 3]);
    expect(mockResult.places.every((place) => place.score >= 0 && place.score <= 80)).toBe(true);
    expect(mockResult.places.map((place) => place.score)).toEqual(
      [...mockResult.places].map((place) => place.score).sort((a, b) => b - a),
    );
  });

  it("모든 이유 문장이 같은 후보에 제공된 evidence ID만 인용한다", () => {
    for (const place of mockResult.places) {
      const allowed = new Set(place.evidence.map((evidence) => evidence.evidenceId));
      expect(place.reasonStatements.flatMap((reason) => reason.evidenceIds)
        .every((evidenceId) => allowed.has(evidenceId))).toBe(true);
    }
  });

  it("사용자가 확인해야 할 전체 trace 단계를 순서대로 제공한다", () => {
    expect(mockTrace.map((event) => event.sequence)).toEqual(
      Array.from({ length: 13 }, (_, index) => index + 1),
    );
    expect(mockTrace.at(-1)?.stage).toBe("RECOMMENDATION_WORKFLOW_COMPLETED");
  });
});
