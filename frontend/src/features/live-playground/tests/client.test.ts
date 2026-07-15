import { describe, expect, it, vi } from "vitest";
import { HttpPlaygroundApi, PlaygroundContractError, __testing } from "../api/client";
import { mockDraft, mockResult } from "../fixtures/mock-data";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HttpPlaygroundApi", () => {
  it("dev API 경로와 no-store·same-origin 계약으로 Draft를 생성한다", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(mockDraft, 201));
    const api = new HttpPlaygroundApi(fetcher);

    const result = await api.createDraft({ requestText: "서울 카페" });

    expect(result.draftId).toBe(mockDraft.draftId);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      "/__dev/api/drafts",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        body: JSON.stringify({ requestText: "서울 카페" }),
      }),
    );
  });

  it("202 RunView를 실제 /runs/{runId}/events SSE 경로와 연결한다", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        runId: "run-1",
        draftId: "draft-1",
        status: "QUEUED",
        trace: [],
        result: null,
        failure: null,
        createdAt: "2026-07-16T02:00:00Z",
        updatedAt: "2026-07-16T02:00:00Z",
        expiresAt: "2026-07-16T02:30:00Z",
      }, 202),
    );
    const api = new HttpPlaygroundApi(fetcher);

    const result = await api.startRun("draft-1");

    expect(result.eventsUrl).toBe("/__dev/api/runs/run-1/events");
    expect(result.location).toBe("/__dev/api/runs/run-1");
    expect(result.snapshot.status).toBe("QUEUED");
  });

  it("cross-origin SSE URL을 거부한다", () => {
    expect(() => __testing.safeEventUrl("https://evil.example/events", "run-1"))
      .toThrow(PlaygroundContractError);
  });

  it("알 수 없는 장소 유형을 계약 오류로 거부한다", () => {
    expect(() => __testing.parseDraft({
      ...mockDraft,
      condition: { ...mockDraft.condition, placeType: "MUSEUM" },
    })).toThrow("condition.placeType");
  });

  it("백엔드 workflow-trace의 id·stage·data를 표시 모델로 검증해 변환한다", () => {
    const result = __testing.parseTrace({
      id: 4,
      stage: "SEARCH_QUERY_PLANNED",
      status: "completed",
      occurredAt: "2026-07-16T02:00:01Z",
      data: {
        query: "서울 카페 조용한",
        relaxed: false,
        includedPreferences: [{ value: "조용한", priority: 10, originalIndex: 0 }],
      },
    });

    expect(result.eventId).toBe("4");
    expect(result.stage).toBe("SEARCH_QUERY_PLANNED");
    expect(result.status).toBe("COMPLETED");
    expect(result.metrics).toMatchObject({ query: "서울 카페 조용한", relaxed: false });
  });

  it("중첩된 백엔드 ResultView를 순위·점수·Local/Blog 근거가 있는 Top 3로 변환한다", () => {
    const raw = backendResultFixture();

    const result = __testing.parseResult(raw);

    expect(result.places).toHaveLength(3);
    expect(result.places[0]?.rank).toBe(1);
    expect(result.places[0]?.score).toBe(80);
    expect(result.places[0]?.evidence.map((value) => value.type)).toEqual(["LOCAL", "BLOG"]);
    expect(result).toMatchObject({
      placeSearchCalls: 1,
      blogSearchCalls: 4,
      reasonGenerationCalls: 1,
    });
  });

  it("다른 후보에 속한 evidence ID를 이유가 인용하면 결과 계약을 거부한다", () => {
    const raw = backendResultFixture();
    const first = ((raw.places as Array<Record<string, unknown>>)[0]!);
    first.reasons = [{ text: "잘못 연결된 문장", evidenceIds: ["unknown-evidence"] }];

    expect(() => __testing.parseResult(raw)).toThrow("evidence ID");
  });
});

function backendResultFixture(): Record<string, unknown> {
  return {
    degraded: mockResult.degraded,
    warnings: mockResult.warnings,
    reasonFallback: mockResult.reasonFallback,
    relaxed: mockResult.relaxed,
    placeSearchCalls: mockResult.placeSearchCalls,
    blogSearchCalls: mockResult.blogSearchCalls,
    reasonGenerationCalls: mockResult.reasonGenerationCalls,
    places: mockResult.places.map((place) => ({
      rankedPlace: {
        placeId: place.placeId,
        candidate: {
          name: place.name,
          category: place.category,
          description: "합성 장소 설명",
          address: place.address,
          roadAddress: place.roadAddress,
          sourceUrl: place.sourceUrl,
        },
        evidence: place.evidence.filter((value) => value.type === "BLOG").map((value) => ({
          evidenceId: value.evidenceId,
          title: value.title,
          summary: value.summary,
          sourceUrl: value.sourceUrl,
        })),
        score: { ...place.scoreBreakdown, total: place.score },
      },
      reasons: place.reasonStatements,
      cautions: place.cautions,
      shareText: "합성 공유 문구",
      evidenceLevel: place.evidenceLevel,
    })),
  };
}
