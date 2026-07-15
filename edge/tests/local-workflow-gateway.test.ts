import { describe, expect, it } from "vitest";
import {
  CONDITION_FIXTURE_HASH,
  CONDITION_FIXTURE_TEXT,
  BLOG_REASON_TEXT,
  LOCAL_REASON_TEXT,
  REASON_FIXTURE_HASH,
  SYNTHETIC_REASON_PLACES,
  validateConditionContent,
  validateReasonContent
} from "../src/local-workflow-gateway/contract";
import { SYNTHETIC_SAFETY_IDENTIFIER } from "../src/local-workflow-gateway/elice-probe-client";
import {
  handleLocalWorkflowGatewayRequest,
  type LocalWorkflowGatewayEnv
} from "../src/local-workflow-gateway/worker";
import { APPROVED_SHA, jsonResponse, naverPayload } from "./fixtures";

const LOCAL_TOKEN = "l".repeat(43);

describe("Local Split Live workflow gateway", () => {
  it("고정 합성 Elice 2회와 Naver 2회만 순서대로 호출하고 safe summary를 반환한다", async () => {
    const calls: Array<{
      body: string | null;
      headers: Headers;
      method: string | undefined;
      pathname: string;
      redirect: string | undefined;
      search: string;
    }> = [];
    const waits: number[] = [];
    const response = await handleLocalWorkflowGatewayRequest(
      request(),
      environment(),
      {
        fetchImplementation: async (input, init) => {
          const url = new URL(String(input));
          const headers = new Headers(init?.headers);
          if (url.hostname === "mlapi.run") {
            const body = JSON.parse(String(init?.body)) as {
              response_format?: { json_schema?: { name?: string } };
            };
            const schemaName = body.response_format?.json_schema?.name ?? null;
            calls.push({
              body: String(init?.body),
              headers,
              method: init?.method,
              pathname: url.pathname,
              redirect: init?.redirect,
              search: url.search
            });
            const content = schemaName === "placepick_condition_extraction_v1"
              ? validConditionContent()
              : validReasonContent();
            return chatResponse(content);
          }
          const endpoint = url.pathname.endsWith("local") ? "local" : "blog";
          calls.push({
            body: init?.body === undefined ? null : String(init.body),
            headers,
            method: init?.method,
            pathname: url.pathname,
            redirect: init?.redirect,
            search: url.search
          });
          return jsonResponse(naverPayload(endpoint));
        },
        nowMilliseconds: () => 100,
        sleep: async (milliseconds) => {
          waits.push(milliseconds);
        }
      }
    );

    expect(response.status).toBe(200);
    expect(calls.map((call) => call.pathname)).toEqual([
      "/11111111-1111-4111-8111-111111111111/v1/chat/completions",
      "/search/v1/local",
      "/search/v1/blog",
      "/11111111-1111-4111-8111-111111111111/v1/chat/completions"
    ]);
    expect(waits).toEqual([1000, 1000, 1000]);
    expect(calls.map((call) => call.method)).toEqual(["POST", "GET", "GET", "POST"]);
    expect(calls.map((call) => call.redirect)).toEqual(["error", "error", "error", "error"]);
    expect(calls[0]?.search).toBe("");
    expect(new URLSearchParams(calls[1]?.search)).toEqual(
      new URLSearchParams({ query: "서울 카페", display: "5" })
    );
    expect(new URLSearchParams(calls[2]?.search)).toEqual(
      new URLSearchParams({ query: "서울 카페", display: "3" })
    );
    expect(calls[3]?.search).toBe("");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer proxy-token-fixture");
    expect(calls[0]?.headers.has("x-ncp-apigw-api-key")).toBe(false);
    expect(calls[1]?.headers.get("x-ncp-apigw-api-key")).toBe("naver-key-fixture");
    expect(calls[1]?.headers.has("authorization")).toBe(false);
    expect(calls[2]?.headers.get("x-ncp-apigw-api-key")).toBe("naver-key-fixture");
    expect(calls[2]?.headers.has("authorization")).toBe(false);
    expect(calls[3]?.headers.get("authorization")).toBe("Bearer proxy-token-fixture");
    expect(calls[3]?.headers.has("x-ncp-apigw-api-key")).toBe(false);
    expect([...calls[0]!.headers.keys()].sort()).toEqual([
      "accept",
      "authorization",
      "content-type"
    ]);
    expect([...calls[1]!.headers.keys()].sort()).toEqual([
      "accept",
      "x-ncp-apigw-api-key",
      "x-ncp-apigw-api-key-id"
    ]);
    expect([...calls[2]!.headers.keys()].sort()).toEqual([
      "accept",
      "x-ncp-apigw-api-key",
      "x-ncp-apigw-api-key-id"
    ]);
    expect([...calls[3]!.headers.keys()].sort()).toEqual([
      "accept",
      "authorization",
      "content-type"
    ]);
    expect(calls[1]?.body).toBeNull();
    expect(calls[2]?.body).toBeNull();

    const conditionRequest = JSON.parse(calls[0]!.body!) as Record<string, unknown>;
    expect(conditionRequest).toMatchObject({
      max_completion_tokens: 600,
      model: "openai/gpt-4.1-mini",
      safety_identifier: SYNTHETIC_SAFETY_IDENTIFIER,
      store: false,
      stream: false,
      temperature: 0
    });
    expect(conditionRequest).not.toHaveProperty("tools");
    const conditionMessages = conditionRequest.messages as Array<Record<string, unknown>>;
    expect(conditionMessages[1]).toEqual({ role: "user", content: CONDITION_FIXTURE_TEXT });
    const conditionFormat = conditionRequest.response_format as {
      json_schema: { name: string; schema: Record<string, unknown>; strict: boolean };
      type: string;
    };
    expect(conditionFormat.type).toBe("json_schema");
    expect(conditionFormat.json_schema.name).toBe("placepick_condition_extraction_v1");
    expect(conditionFormat.json_schema.strict).toBe(true);
    expect(conditionFormat.json_schema.schema).toMatchObject({
      additionalProperties: false,
      required: ["schemaVersion", "condition", "warnings"]
    });
    expect(Object.keys(
      conditionFormat.json_schema.schema.properties as Record<string, unknown>
    ).sort()).toEqual(["condition", "schemaVersion", "warnings"]);

    const reasonRequest = JSON.parse(calls[3]!.body!) as Record<string, unknown>;
    expect(reasonRequest).toMatchObject({
      max_completion_tokens: 800,
      model: "openai/gpt-4.1-mini",
      safety_identifier: SYNTHETIC_SAFETY_IDENTIFIER,
      store: false,
      stream: false,
      temperature: 0
    });
    const reasonFormat = reasonRequest.response_format as {
      json_schema: { name: string; schema: Record<string, unknown>; strict: boolean };
    };
    expect(reasonFormat.json_schema.name).toBe("placepick_reason_statements_v1");
    expect(reasonFormat.json_schema.strict).toBe(true);
    const reasonSchema = reasonFormat.json_schema.schema;
    expect(reasonSchema).toMatchObject({
      additionalProperties: false,
      required: ["schemaVersion", "places"]
    });
    const reasonPlaceSchema = (
      (reasonSchema.properties as Record<string, unknown>).places as {
        items: { properties: Record<string, unknown> };
      }
    ).items;
    expect(reasonPlaceSchema.properties.placeId).toEqual({
      type: "string",
      enum: SYNTHETIC_REASON_PLACES.map((place) => place.placeId)
    });
    const statements = reasonPlaceSchema.properties.statements as {
      items: { properties: Record<string, unknown> };
    };
    expect(statements.items.properties.text).toEqual({
      type: "string",
      enum: [LOCAL_REASON_TEXT, BLOG_REASON_TEXT]
    });
    expect(statements.items.properties.evidenceIds).toMatchObject({
      minItems: 1,
      maxItems: 1
    });
    expect(statements.items.properties.evidenceIds).not.toHaveProperty("uniqueItems");
    const reasonBody = calls[3]!.body!;
    expect(reasonBody).toContain("합성 카페");
    expect(reasonBody).not.toContain("검증 장소");
    expect(reasonBody).not.toContain("검증 글");
    expect(reasonBody).not.toContain("example.invalid");

    const summary = await response.json() as Record<string, unknown>;
    expect(summary).toMatchObject({
      approvedSha: APPROVED_SHA,
      callCount: 4,
      linked: false,
      mode: "split",
      status: "passed"
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("서울 카페");
    expect(serialized).not.toContain("합성 카페");
    expect(serialized).not.toContain("proxy-token-fixture");
    expect(serialized).not.toContain("naver-key-fixture");
  });

  it.each([
    ["GET", "/v1/probes/workflow-split"],
    ["POST", "/v1/probes/workflow-split?url=https://example.invalid"],
    ["POST", "/v1/probes/workflow-linked"],
    ["POST", "/chat/completions"]
  ])("임의 method·route·query를 거부한다: %s %s", async (method, path) => {
    const response = await handleLocalWorkflowGatewayRequest(
      new Request(`http://127.0.0.1${path}`, {
        method,
        headers: { authorization: `Bearer ${LOCAL_TOKEN}` }
      }),
      environment()
    );
    expect(response.status).toBe(404);
  });

  it("루프백이 아닌 origin을 outbound 전에 거부한다", async () => {
    let called = false;
    const response = await handleLocalWorkflowGatewayRequest(
      request({}, LOCAL_TOKEN, "https://example.invalid/v1/probes/workflow-split"),
      environment(),
      { fetchImplementation: async () => { called = true; return jsonResponse({}); } }
    );
    expect(response.status).toBe(404);
    expect(called).toBe(false);
  });

  it("고정 fixture hash가 아니면 outbound 전에 거부한다", async () => {
    let called = false;
    const response = await handleLocalWorkflowGatewayRequest(
      request({ reasonFixtureHash: "0".repeat(64) }),
      environment(),
      {
        fetchImplementation: async () => {
          called = true;
          return jsonResponse({});
        }
      }
    );
    expect(response.status).toBe(403);
    expect(called).toBe(false);
  });

  it.each([
    ["unknown field", JSON.stringify({
      approvedSha: APPROVED_SHA,
      conditionFixtureHash: CONDITION_FIXTURE_HASH,
      reasonFixtureHash: REASON_FIXTURE_HASH,
      url: "https://example.invalid"
    })],
    ["different order", JSON.stringify({
      reasonFixtureHash: REASON_FIXTURE_HASH,
      conditionFixtureHash: CONDITION_FIXTURE_HASH,
      approvedSha: APPROVED_SHA
    })],
    ["duplicate field", `{"approvedSha":"${APPROVED_SHA}","approvedSha":"${APPROVED_SHA}","conditionFixtureHash":"${CONDITION_FIXTURE_HASH}","reasonFixtureHash":"${REASON_FIXTURE_HASH}"}`]
  ])("고정되지 않은 body를 outbound 전에 거부한다: %s", async (_name, body) => {
    let called = false;
    const response = await handleLocalWorkflowGatewayRequest(
      request({}, LOCAL_TOKEN, undefined, body),
      environment(),
      { fetchImplementation: async () => { called = true; return jsonResponse({}); } }
    );
    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });

  it.each([
    ["x-provider-url", "https://example.invalid"],
    ["x-ncp-apigw-api-key", "must-not-pass"],
    ["cookie", "session=must-not-pass"]
  ])("허용 목록 밖 header를 outbound 전에 거부한다: %s", async (name, value) => {
    let called = false;
    const candidate = request();
    candidate.headers.set(name, value);
    const response = await handleLocalWorkflowGatewayRequest(
      candidate,
      environment(),
      { fetchImplementation: async () => { called = true; return jsonResponse({}); } }
    );
    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });

  it("잘못된 local token과 live mode를 outbound 전에 거부한다", async () => {
    let called = false;
    const badToken = await handleLocalWorkflowGatewayRequest(
      request({}, "wrong-token"),
      environment(),
      { fetchImplementation: async () => { called = true; return jsonResponse({}); } }
    );
    const badMode = await handleLocalWorkflowGatewayRequest(
      request(),
      { ...environment(), PLACEPICK_EXTERNAL_MODE: "mock" },
      { fetchImplementation: async () => { called = true; return jsonResponse({}); } }
    );
    expect(badToken.status).toBe(401);
    expect(badMode.status).toBe(503);
    expect(called).toBe(false);
  });

  it("한 stage의 schema 실패도 원문 없이 전체 probe 실패로 요약한다", async () => {
    let eliceCalls = 0;
    const response = await handleLocalWorkflowGatewayRequest(
      request(),
      environment(),
      {
        fetchImplementation: async (input) => {
          const url = new URL(String(input));
          if (url.hostname === "mlapi.run") {
            eliceCalls += 1;
            return chatResponse(eliceCalls === 1 ? { secretBody: "must-not-leak" } : validReasonContent());
          }
          return jsonResponse(naverPayload(url.pathname.endsWith("local") ? "local" : "blog"));
        },
        sleep: async () => undefined
      }
    );
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).toContain("PROVIDER_SCHEMA_REJECTED");
    expect(text).not.toContain("must-not-leak");
    expect(text).not.toContain("서울 카페");
  });

  it("조건 출력의 flat 구조와 fixture 의미에 맞지 않는 warning을 거부한다", () => {
    expect(validateConditionContent({
      schemaVersion: "placepick.condition-extraction.v1",
      locationQuery: "서울",
      placeType: "CAFE",
      partySize: 2,
      budgetPerPersonMax: 20_000,
      preferences: [],
      exclusions: ["흡연"],
      warnings: []
    })).toBe(false);
    expect(validateConditionContent({
      ...validConditionContent(),
      warnings: ["BUDGET_NOT_PROVIDED"]
    })).toBe(false);
    expect(validateConditionContent({
      ...validConditionContent(),
      warnings: ["PREFERENCE_PRIORITY_MISSING"]
    })).toBe(false);
  });

  it("이유 출력의 추가 field·교차 evidence·자유 사실·type 불일치를 거부한다", () => {
    expect(validateReasonContent({ ...validReasonContent(), extra: true })).toBe(false);
    const crossEvidence = validReasonContent();
    const places = crossEvidence.places as Array<{
      statements: Array<{ evidenceIds: string[]; text: string }>;
    }>;
    places[0]!.statements[0]!.evidenceIds = ["e3"];
    expect(validateReasonContent(crossEvidence)).toBe(false);

    const invented = validReasonContent();
    const inventedPlaces = invented.places as Array<{
      statements: Array<{ evidenceIds: string[]; text: string }>;
    }>;
    inventedPlaces[0]!.statements[0]!.text = "합성 카페 알파에는 루프탑이 있습니다.";
    expect(validateReasonContent(invented)).toBe(false);

    const mismatched = validReasonContent();
    const mismatchedPlaces = mismatched.places as Array<{
      statements: Array<{ evidenceIds: string[]; text: string }>;
    }>;
    mismatchedPlaces[0]!.statements[0]!.text = BLOG_REASON_TEXT;
    expect(validateReasonContent(mismatched)).toBe(false);

    const multiple = validReasonContent();
    const multiplePlaces = multiple.places as Array<{
      statements: Array<{ evidenceIds: string[]; text: string }>;
    }>;
    multiplePlaces[0]!.statements[0]!.evidenceIds = ["e1", "e2"];
    expect(validateReasonContent(multiple)).toBe(false);
  });
});

function request(
  overrides: Partial<Record<"approvedSha" | "conditionFixtureHash" | "reasonFixtureHash", string>> = {},
  token = LOCAL_TOKEN,
  url = "http://127.0.0.1/v1/probes/workflow-split",
  rawBody?: string
): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: rawBody ?? JSON.stringify({
      approvedSha: APPROVED_SHA,
      conditionFixtureHash: CONDITION_FIXTURE_HASH,
      reasonFixtureHash: REASON_FIXTURE_HASH,
      ...overrides
    })
  });
}

function environment(): LocalWorkflowGatewayEnv {
  return {
    CHAT_PROXY_URL: "https://mlapi.run/11111111-1111-4111-8111-111111111111/v1",
    LOCAL_WORKFLOW_TOKEN: LOCAL_TOKEN,
    NAVER_API_HUB_KEY: "naver-key-fixture",
    NAVER_API_HUB_KEY_ID: "naver-key-id-fixture",
    OPENAI_MODEL: "openai/gpt-4.1-mini",
    PLACEPICK_EXTERNAL_MODE: "live-contract",
    PROXY_TOKEN: "proxy-token-fixture"
  };
}

function chatResponse(content: unknown): Response {
  const promptTokens = 10;
  const completionTokens = 8;
  return jsonResponse({
    id: "chatcmpl-synthetic",
    object: "chat.completion",
    created: 1,
    model: "gpt-4.1-mini-2025-04-14",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: JSON.stringify(content),
          refusal: null
        }
      }
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens
    }
  });
}

function validConditionContent(): Record<string, unknown> {
  return {
    schemaVersion: "placepick.condition-extraction.v1",
    condition: {
      locationQuery: "서울",
      placeType: "CAFE",
      placeTypeDetail: null,
      partySize: 2,
      budgetPerPersonMin: null,
      budgetPerPersonMax: 20_000,
      preferences: [{ value: "조용한", priority: null }],
      exclusions: ["흡연"]
    },
    warnings: []
  };
}

function validReasonContent(): Record<string, unknown> {
  return {
    schemaVersion: "placepick.reason-statements.v1",
    places: SYNTHETIC_REASON_PLACES.map((place) => ({
      placeId: place.placeId,
      statements: [
        {
          text: LOCAL_REASON_TEXT,
          evidenceIds: [place.facts[0].evidenceId]
        }
      ]
    }))
  };
}
