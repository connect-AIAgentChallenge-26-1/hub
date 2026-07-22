import { describe, expect, it, vi } from "vitest";
import { ProductApi } from "../api/client";
import type { ProductCondition, ProductDraftCondition } from "../api/types";
import {
  buildProductTelemetryRequest,
  durationBucket,
  explorationRound,
  viewportClass,
  type ProductTelemetryEvent,
} from "../telemetry/contract";
import {
  changedConditionFields,
  emitProductTelemetry,
  reportClientError,
} from "../telemetry/reporter";
import { valueBucket } from "../telemetry/web-vitals-reporter";

const EVENT_ID = "b2f31d8a-0fe7-4d22-9e55-a6b808ae4b4b";
const OCCURRED_AT = "2026-07-22T01:02:03.000Z";

describe("safe product telemetry contract", () => {
  it("Web Vital을 저카디널리티 bucket과 viewport enum으로만 직렬화한다", () => {
    const request = buildProductTelemetryRequest({
      name: "webVital",
      context: {
        metricName: "LCP",
        metricRating: "good",
        metricValueBucket: "fast",
        viewportClass: "mobile",
      },
    }, EVENT_ID, OCCURRED_AT);

    expect(request).toEqual({
      eventId: EVENT_ID,
      name: "webVital",
      occurredAt: OCCURRED_AT,
      context: {
        metricName: "LCP",
        metricRating: "good",
        metricValueBucket: "fast",
        viewportClass: "mobile",
      },
    });
    expect(JSON.stringify(request)).not.toMatch(/url|message|stack|requestText/i);
  });

  it("타입을 우회해도 URL·stack 같은 필드나 자유 값을 runtime에서 거부한다", () => {
    const unsafe = {
      name: "clientError",
      context: {
        surface: "result",
        errorCategory: "network",
        recoverable: "true",
        viewportClass: "desktop",
        url: "https://secret.example/path?token=raw",
      },
    } as unknown as ProductTelemetryEvent;
    expect(() => buildProductTelemetryRequest(unsafe, EVENT_ID, OCCURRED_AT))
      .toThrow("허용되지 않은 제품 텔레메트리 context");

    const freeText = {
      name: "conditionFieldChanged",
      context: { fieldName: "사용자가 입력한 지역", viewportClass: "desktop" },
    } as unknown as ProductTelemetryEvent;
    expect(() => buildProductTelemetryRequest(freeText, EVENT_ID, OCCURRED_AT))
      .toThrow("허용되지 않은 제품 텔레메트리 context");
  });

  it("viewport·cold start·탐색·Web Vital 경계를 안정적인 enum으로 축약한다", () => {
    expect([viewportClass(360), viewportClass(800), viewportClass(1_440)])
      .toEqual(["mobile", "tablet", "desktop"]);
    expect([durationBucket(9_999), durationBucket(10_000), durationBucket(30_000)])
      .toEqual(["under10s", "10to30s", "30to90s"]);
    expect([explorationRound(0), explorationRound(1)]).toEqual(["initial", "alternative"]);
    expect([
      valueBucket("LCP", 2_500),
      valueBucket("INP", 350),
      valueBucket("CLS", 0.3),
      valueBucket("TTFB", 800),
    ]).toEqual(["fast", "moderate", "slow", "fast"]);
  });
});

describe("product telemetry reporter", () => {
  it("세션과 CSRF를 사용해 202 event를 전송하고 사용자 흐름에는 body를 노출하지 않는다", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ csrfToken: "csrf-safe", expiresAt: OCCURRED_AT }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const api = new ProductApi(fetcher);

    await expect(emitProductTelemetry(api, {
      name: "sseRecovered",
      context: {
        streamType: "recommendation",
        recoveryMode: "snapshot",
        viewportClass: "desktop",
      },
    })).resolves.toBe(true);

    const [url, init] = fetcher.mock.calls[1]!;
    expect(url).toBe("/mock-api/v1/events");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("csrf-safe");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      name: "sseRecovered",
      context: {
        streamType: "recommendation",
        recoveryMode: "snapshot",
        viewportClass: "desktop",
      },
    });
  });

  it("수집 endpoint 실패는 서비스 기능으로 전파하지 않는다", async () => {
    const api = new ProductApi(vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline")));
    await expect(emitProductTelemetry(api, {
      name: "alternativeRecommendationRequested",
      context: { explorationRound: "initial", viewportClass: "desktop" },
    })).resolves.toBe(false);
  });

  it("client error의 message·stack 대신 닫힌 분류만 전송한다", async () => {
    const recordProductEvent = vi.fn().mockResolvedValue(undefined);
    const api = { recordProductEvent } as unknown as ProductApi;
    const error = new TypeError("https://secret.example?token=do-not-send");
    error.stack = "private stack";

    reportClientError(api, "result", error);
    await vi.waitFor(() => expect(recordProductEvent).toHaveBeenCalledOnce());

    const request = recordProductEvent.mock.calls[0]![0];
    expect(request.context).toEqual({
      surface: "result",
      errorCategory: "network",
      recoverable: "true",
      viewportClass: "desktop",
    });
    expect(JSON.stringify(request)).not.toMatch(/secret|token|private stack/i);
  });

  it("Draft 원문 값 대신 실제로 변경된 필드 종류만 계산한다", () => {
    const draft = conditionFixture();
    const confirmed: ProductCondition = {
      ...draft,
      locationQuery: "성수동",
      placeType: "CAFE",
      preferences: [{ value: "조용한", priority: 9 }],
      exclusions: ["흡연"],
    };

    expect(changedConditionFields(draft, confirmed))
      .toEqual(["locationQuery", "preferences", "exclusions"]);
  });
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function conditionFixture(): ProductDraftCondition {
  return {
    locationQuery: "성수",
    placeType: "CAFE",
    placeTypeDetail: null,
    partySize: 2,
    budgetPerPersonMin: null,
    budgetPerPersonMax: null,
    preferences: [{ value: "조용한", priority: 5 }],
    exclusions: [],
  };
}
