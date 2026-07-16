import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProductApi,
  ProductApiError,
  ProductContractError,
  __productTesting,
  withColdStartRetry,
} from "../api/client";

const now = "2026-07-16T02:00:00Z";

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("ProductApi", () => {
  beforeEach(() => __productTesting.resetSession());

  it("익명 세션 cookie 요청 뒤 CSRF와 Idempotency-Key로 Draft를 생성한다", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ csrfToken: "csrf-test", expiresAt: now }, 201))
      .mockResolvedValueOnce(json(draftFixture(), 201));
    const api = new ProductApi(fetcher);

    const draft = await api.createDraft("서울 카페");

    expect(draft.status).toBe("EXTRACTED");
    expect(fetcher).toHaveBeenNthCalledWith(1, "/mock-api/v1/anonymous-sessions", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
    }));
    const second = fetcher.mock.calls[1]?.[1];
    expect(new Headers(second?.headers).get("X-CSRF-Token")).toBe("csrf-test");
    expect(new Headers(second?.headers).get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("추천 생성은 정확히 202와 jobId가 일치하는 Location만 허용한다", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ csrfToken: "csrf-test", expiresAt: now }, 201))
      .mockResolvedValueOnce(json(
        { jobId: "00000000-0000-4000-8000-000000000001", status: "ACCEPTED" },
        202,
        { Location: "/mock-api/v1/recommendations/00000000-0000-4000-8000-000000000001" },
      ));
    const result = await new ProductApi(fetcher).startRecommendation("draft-1");
    expect(result.status).toBe("ACCEPTED");
    expect(result.location).toContain(result.jobId);
  });

  it("200 추천 생성 응답을 성공으로 약화하지 않는다", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ csrfToken: "csrf-test", expiresAt: now }, 201))
      .mockResolvedValueOnce(json({ jobId: "job-1", status: "ACCEPTED" }, 200));
    await expect(new ProductApi(fetcher).startRecommendation("draft-1"))
      .rejects.toBeInstanceOf(ProductContractError);
  });

  it("다른 추천은 CSRF·멱등 key와 정확한 202 Location으로 생성한다", async () => {
    const nextJobId = "00000000-0000-4000-8000-000000000099";
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ csrfToken: "csrf-test", expiresAt: now }, 201))
      .mockResolvedValueOnce(json(
        { jobId: nextJobId, status: "ACCEPTED" },
        202,
        { Location: `/mock-api/v1/recommendations/${nextJobId}` },
      ));

    const result = await new ProductApi(fetcher).startAlternative("job-original");

    expect(result.jobId).toBe(nextJobId);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/mock-api/v1/recommendations/job-original/alternatives",
      expect.objectContaining({ method: "POST" }),
    );
    const headers = new Headers(fetcher.mock.calls[1]?.[1]?.headers);
    expect(headers.get("X-CSRF-Token")).toBe("csrf-test");
    expect(headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("다른 추천의 세션 복구 재시도에서도 최초 멱등 key를 유지한다", async () => {
    const nextJobId = "00000000-0000-4000-8000-000000000098";
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ csrfToken: "csrf-old", expiresAt: now }, 201))
      .mockResolvedValueOnce(json({
        title: "Session required",
        status: 401,
        detail: "세션이 필요합니다.",
        errorCode: "SESSION_REQUIRED",
      }, 401, { "content-type": "application/problem+json" }))
      .mockResolvedValueOnce(json({ csrfToken: "csrf-new", expiresAt: now }, 201))
      .mockResolvedValueOnce(json(
        { jobId: nextJobId, status: "ACCEPTED" },
        202,
        { Location: `/mock-api/v1/recommendations/${nextJobId}` },
      ));

    await expect(new ProductApi(fetcher).startAlternative("job-original")).resolves
      .toMatchObject({ jobId: nextJobId });

    const first = new Headers(fetcher.mock.calls[1]?.[1]?.headers);
    const retried = new Headers(fetcher.mock.calls[3]?.[1]?.headers);
    expect(retried.get("Idempotency-Key")).toBe(first.get("Idempotency-Key"));
    expect(retried.get("X-CSRF-Token")).toBe("csrf-new");
  });

  it("application/problem+json의 안전한 errorCode와 detail을 보존한다", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ csrfToken: "csrf-test", expiresAt: now }, 201))
      .mockResolvedValueOnce(json({
        title: "Invalid condition",
        status: 422,
        detail: "위치가 필요합니다.",
        errorCode: "UNPROCESSABLE_CONDITION",
      }, 422, { "content-type": "application/problem+json" }));
    const promise = new ProductApi(fetcher).createDraft("알아서 추천해줘");
    await expect(promise).rejects.toMatchObject({
      problem: { status: 422, errorCode: "UNPROCESSABLE_CONDITION" },
    });
  });

  it("cookie가 사라진 첫 SESSION_REQUIRED에서 세션을 한 번만 재발급하고 같은 멱등 key로 재시도한다", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ csrfToken: "csrf-old", expiresAt: now }, 201))
      .mockResolvedValueOnce(json({
        title: "Session required",
        status: 401,
        detail: "세션이 필요합니다.",
        errorCode: "SESSION_REQUIRED",
      }, 401, { "content-type": "application/problem+json" }))
      .mockResolvedValueOnce(json({ csrfToken: "csrf-new", expiresAt: now }, 201))
      .mockResolvedValueOnce(json(draftFixture(), 201));

    await expect(new ProductApi(fetcher).createDraft("서울 카페")).resolves
      .toMatchObject({ status: "EXTRACTED" });

    expect(fetcher).toHaveBeenCalledTimes(4);
    const firstMutationHeaders = new Headers(fetcher.mock.calls[1]?.[1]?.headers);
    const retriedMutationHeaders = new Headers(fetcher.mock.calls[3]?.[1]?.headers);
    expect(retriedMutationHeaders.get("X-CSRF-Token")).toBe("csrf-new");
    expect(retriedMutationHeaders.get("Idempotency-Key"))
      .toBe(firstMutationHeaders.get("Idempotency-Key"));
  });

  it("다른 탭이 세션을 갱신해 CSRF가 바뀌면 한 번 재동기화하고 같은 멱등 key로 재시도한다", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ csrfToken: "csrf-tab-a", expiresAt: now }, 201))
      .mockResolvedValueOnce(json({
        title: "CSRF invalid",
        status: 403,
        detail: "CSRF 토큰이 유효하지 않습니다.",
        errorCode: "CSRF_INVALID",
      }, 403, { "content-type": "application/problem+json" }))
      .mockResolvedValueOnce(json({ csrfToken: "csrf-tab-b", expiresAt: now }, 201))
      .mockResolvedValueOnce(json(draftFixture(), 201));

    await expect(new ProductApi(fetcher).createDraft("서울 카페")).resolves
      .toMatchObject({ status: "EXTRACTED" });

    expect(fetcher).toHaveBeenCalledTimes(4);
    const firstMutationHeaders = new Headers(fetcher.mock.calls[1]?.[1]?.headers);
    const retriedMutationHeaders = new Headers(fetcher.mock.calls[3]?.[1]?.headers);
    expect(retriedMutationHeaders.get("X-CSRF-Token")).toBe("csrf-tab-b");
    expect(retriedMutationHeaders.get("Idempotency-Key"))
      .toBe(firstMutationHeaders.get("Idempotency-Key"));
  });

  it("재발급 뒤 두 번째 SESSION_REQUIRED는 다시 재시도하지 않는다", async () => {
    const sessionRequired = () => json({
      title: "Session required",
      status: 401,
      detail: "세션이 필요합니다.",
      errorCode: "SESSION_REQUIRED",
    }, 401, { "content-type": "application/problem+json" });
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ csrfToken: "csrf-old", expiresAt: now }, 201))
      .mockResolvedValueOnce(sessionRequired())
      .mockResolvedValueOnce(json({ csrfToken: "csrf-new", expiresAt: now }, 201))
      .mockResolvedValueOnce(sessionRequired());

    await expect(new ProductApi(fetcher).createDraft("서울 카페"))
      .rejects.toMatchObject({ problem: { errorCode: "SESSION_REQUIRED" } });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("CSRF 재동기화 뒤 두 번째 CSRF_INVALID는 반복 재시도하지 않는다", async () => {
    const csrfInvalid = () => json({
      title: "CSRF invalid",
      status: 403,
      detail: "CSRF 토큰이 유효하지 않습니다.",
      errorCode: "CSRF_INVALID",
    }, 403, { "content-type": "application/problem+json" });
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ csrfToken: "csrf-tab-a", expiresAt: now }, 201))
      .mockResolvedValueOnce(csrfInvalid())
      .mockResolvedValueOnce(json({ csrfToken: "csrf-tab-b", expiresAt: now }, 201))
      .mockResolvedValueOnce(csrfInvalid());

    await expect(new ProductApi(fetcher).createDraft("서울 카페"))
      .rejects.toMatchObject({ problem: { errorCode: "CSRF_INVALID" } });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("부분 결과 1~2개와 nullable 원문 링크를 파싱한다", () => {
    const job = jobFixture(2);
    job.partial = true;
    job.places[0]!.sourceUrl = null;

    const parsed = __productTesting.parseJob(job);

    expect(parsed).toMatchObject({ partial: true, resultCount: 2, explorationRound: 1 });
    expect(parsed.places[0]?.sourceUrl).toBeNull();
  });

  it("0개 완료 결과·결과 수 불일치·잘못된 점수와 이유 출처를 거부한다", () => {
    const empty = jobFixture(0);
    expect(() => __productTesting.parseJob(empty)).toThrow("부분 결과 계약");

    const mismatch = jobFixture(2);
    mismatch.partial = true;
    mismatch.resultCount = 1;
    expect(() => __productTesting.parseJob(mismatch)).toThrow("resultCount");

    const invalidScore = jobFixture(1);
    invalidScore.partial = true;
    invalidScore.places[0]!.scoreBreakdown.total = 99;
    expect(() => __productTesting.parseJob(invalidScore)).toThrow("합계");

    const invalidReason = jobFixture(1);
    invalidReason.partial = true;
    invalidReason.places[0]!.reasonSource = "UNSAFE";
    expect(() => __productTesting.parseJob(invalidReason)).toThrow("reasonSource");
  });
});

describe("withColdStartRetry", () => {
  it("503 cold start만 제한적으로 재시도하고 성공 결과를 반환한다", async () => {
    vi.useFakeTimers();
    try {
      const operation = vi.fn()
        .mockRejectedValueOnce(new ProductApiError({
          title: "Unavailable",
          status: 503,
          detail: "starting",
        }))
        .mockResolvedValue("ready");
      const onRetry = vi.fn();

      const result = withColdStartRetry(operation, onRetry);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(2_000);

      await expect(result).resolves.toBe("ready");
      expect(operation).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("404 계약 오류는 cold start로 오인하지 않고 즉시 반환한다", async () => {
    const operation = vi.fn().mockRejectedValue(new ProductApiError({
      title: "Not found",
      status: 404,
      detail: "missing",
    }));
    const onRetry = vi.fn();

    await expect(withColdStartRetry(operation, onRetry)).rejects.toMatchObject({
      problem: { status: 404 },
    });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });
});

function draftFixture() {
  return {
    draftId: "00000000-0000-4000-8000-000000000002",
    status: "EXTRACTED",
    extractedCondition: {
      locationQuery: "서울",
      placeType: "CAFE",
      placeTypeDetail: null,
      partySize: null,
      budgetPerPersonMin: null,
      budgetPerPersonMax: null,
      preferences: [],
      exclusions: [],
    },
    warnings: ["PARTY_SIZE_NOT_PROVIDED"],
    expiresAt: now,
  };
}

function jobFixture(count: number): any {
  const places = Array.from({ length: count }, (_, index) => {
    const locationConfidence = 15;
    const searchRelevance = 30 - index;
    const preferenceEvidence = 25 - index;
    const evidenceQuality = 20 - index;
    const total = locationConfidence + searchRelevance + preferenceEvidence + evidenceQuality;
    return {
      placeId: `00000000-0000-4000-8000-00000000000${index + 1}`,
      name: `후보 ${index + 1}`,
      category: "카페",
      roadAddress: "서울 성동구 도로 1",
      address: "서울 성동구 지번 1",
      sourceUrl: `https://example.com/${index + 1}`,
      score: total,
      scoreBreakdown: {
        locationConfidence,
        searchRelevance,
        preferenceEvidence,
        evidenceQuality,
        total,
      },
      reasonSource: "GENERATED",
      reasonStatements: [{ text: "검증된 이유", evidenceIds: [`local:${index + 1}`] }],
      cautions: [],
      shareText: "공유 문구",
      evidenceLevel: "LOCAL_AND_BLOG",
      warnings: [],
    };
  });
  return {
    jobId: "00000000-0000-4000-8000-000000000010",
    status: "COMPLETED",
    stage: "FINISHED",
    progress: 100,
    degraded: false,
    partial: count > 0 && count < 3,
    resultCount: count,
    explorationRound: 1,
    warnings: count < 3 ? ["PARTIAL_RECOMMENDATION"] : [],
    condition: draftFixture().extractedCondition,
    places,
    failure: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: now,
  };
}
