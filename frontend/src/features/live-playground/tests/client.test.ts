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

  it("dev Problem Details의 폐쇄형 condition 진단 코드를 보존한다", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      title: "조건 추출 실패",
      status: 502,
      detail: "조건을 추출하지 못했습니다.",
      errorCode: "CONDITION_PROVIDER_INVALID_RESPONSE",
      diagnosticCode: "CONDITION_BUDGET_ORDER_INVALID",
    }, 502));
    const api = new HttpPlaygroundApi(fetcher);

    await expect(api.createDraft({ requestText: "합성 요청" })).rejects.toMatchObject({
      problem: { diagnosticCode: "CONDITION_BUDGET_ORDER_INVALID" },
    });
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

  it("후보 정규화 trace의 안전한 funnel 사유를 표시 모델로 보존한다", () => {
    const result = __testing.parseTrace({
      id: 7,
      stage: "CANDIDATES_NORMALIZED",
      status: "completed",
      occurredAt: "2026-07-16T02:00:02Z",
      data: {
        relaxed: false,
        count: 2,
        receivedCount: 5,
        eligibleCount: 2,
        rejectedCount: 3,
        rejectionCounts: {
          MISSING_IDENTITY: 1,
          LOCATION: 1,
          TYPE: 0,
          EXCLUSION: 0,
          DUPLICATE: 1,
        },
        candidates: [
          {
            name: "후보 A",
            category: "카페",
            description: "",
            address: "서울",
            roadAddress: "서울",
            sourceUrl: "https://example.com/a",
          },
          {
            name: "후보 B",
            category: "카페",
            description: "",
            address: "서울",
            roadAddress: "서울",
            sourceUrl: "https://example.com/b",
          },
        ],
      },
    });

    expect(result.metrics).toMatchObject({
      received: 5,
      eligible: 2,
      filtered: 3,
      missingIdentity: 1,
      locationFiltered: 1,
      duplicates: 1,
    });
  });

  it("이유 검증 실패의 폐쇄형 진단 코드를 원문 없이 표시한다", () => {
    const result = __testing.parseTrace({
      id: 12,
      stage: "ELICE_REASON_VALIDATION_FAILED",
      status: "completed",
      occurredAt: "2026-07-16T02:00:03Z",
      data: { diagnosticCode: "UNKNOWN_EVIDENCE" },
    });

    expect(result.metrics).toEqual({ diagnosticCode: "UNKNOWN_EVIDENCE" });
    expect(result.description).not.toContain("prompt");
  });

  it("이유 Provider fallback의 진단 코드와 실패 단계를 표시한다", () => {
    const result = __testing.parseTrace({
      id: 13,
      stage: "ELICE_REASON_COMPLETED",
      status: "completed",
      occurredAt: "2026-07-16T02:00:04Z",
      data: {
        fallbackUsed: true,
        errorCode: "PROVIDER_INVALID_RESPONSE",
        diagnosticCode: "REASON_CONTENT_EVIDENCE_OWNERSHIP",
        failureStage: "CHAT_CONTENT_SCHEMA",
      },
    });

    expect(result.metrics).toMatchObject({
      fallback: true,
      diagnosticCode: "REASON_CONTENT_EVIDENCE_OWNERSHIP",
      failureStage: "CHAT_CONTENT_SCHEMA",
    });
  });

  it("구 후보 trace는 호환하고 미등록 진단 문자열은 UNKNOWN으로 축소한다", () => {
    const oldFunnel = __testing.parseTrace({
      id: 7,
      stage: "CANDIDATES_NORMALIZED",
      status: "completed",
      occurredAt: "2026-07-16T02:00:02Z",
      data: {
        relaxed: false,
        count: 0,
        candidates: [],
      },
    });
    const unknownDiagnostic = __testing.parseTrace({
      id: 12,
      stage: "ELICE_REASON_VALIDATION_FAILED",
      status: "completed",
      occurredAt: "2026-07-16T02:00:03Z",
      data: { diagnosticCode: "raw provider response must not pass" },
    });

    expect(oldFunnel.metrics).toMatchObject({ received: 0, eligible: 0, filtered: 0 });
    expect(unknownDiagnostic.metrics).toEqual({ diagnosticCode: "UNKNOWN" });
  });

  it("중첩된 백엔드 ResultView를 0~100 순위·Local/Blog 근거가 있는 추천으로 변환한다", () => {
    const raw = backendResultFixture();

    const result = __testing.parseResult(raw);

    expect(result.places).toHaveLength(3);
    expect(result.places[0]?.rank).toBe(1);
    expect(result.places[0]?.score).toBe(100);
    expect(result.places[0]?.evidence.map((value) => value.type)).toEqual(["LOCAL", "BLOG"]);
    expect(result).toMatchObject({
      placeSearchCalls: 1,
      blogSearchCalls: 4,
      reasonGenerationCalls: 1,
    });
  });

  it("후보 두 곳의 부분 결과와 nullable 원문 링크를 허용한다", () => {
    const raw = backendResultFixture();
    raw.places = (raw.places as unknown[]).slice(0, 2);
    raw.resultCount = 2;
    raw.partial = true;
    const first = (raw.places as Array<Record<string, unknown>>)[0]!;
    const ranked = first.rankedPlace as Record<string, unknown>;
    (ranked.candidate as Record<string, unknown>).sourceUrl = null;

    const result = __testing.parseResult(raw);

    expect(result).toMatchObject({ partial: true, resultCount: 2 });
    expect(result.places[0]?.sourceUrl).toBeNull();
  });

  it("0개 결과와 결과 수·partial 불일치를 거부한다", () => {
    const empty = backendResultFixture();
    empty.places = [];
    empty.resultCount = 0;
    empty.partial = true;
    expect(() => __testing.parseResult(empty)).toThrow("1~3개");

    const mismatch = backendResultFixture();
    mismatch.resultCount = 2;
    expect(() => __testing.parseResult(mismatch)).toThrow("부분 결과 수");
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
    partial: mockResult.partial,
    resultCount: mockResult.resultCount,
    explorationRound: mockResult.explorationRound,
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
      reasonSource: place.reasonSource,
      cautions: place.cautions,
      shareText: "합성 공유 문구",
      evidenceLevel: place.evidenceLevel,
    })),
  };
}
