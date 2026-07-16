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
