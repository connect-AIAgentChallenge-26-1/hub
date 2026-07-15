import { SHA_PATTERN, UUID_V4_PATTERN } from "../shared/constants";
import { SecurityBoundaryError } from "../shared/errors";
import { isPlainObject } from "../shared/http";

export const LINKED_START_PATH = "/v1/probes/workflow-linked/start";
export const LINKED_COMPLETE_PATH = "/v1/probes/workflow-linked/complete";
// SHA-256: placepick.workflow.linked.scope.v2|reasonText=LOCAL_OR_BLOG_EXACT|evidenceIds=1|typeMatch=true
export const LINKED_SCOPE_HASH =
  "73b6d630cb24b9222e05b289822b11a64c2f23ad04acb09b5fe01accafe3b2d0";
export const LINKED_MODEL = "openai/gpt-4.1-mini";

export type LinkedPlaceType = "RESTAURANT" | "CAFE" | "BAR" | "OTHER";

export interface LinkedScenario {
  id: string;
  version: 1;
  fixtureHash: string;
  syntheticInput: string;
  safetyIdentifier: string;
  initialQuery: string;
  relaxedQuery?: string;
  locationQuery: string;
  confirmedCondition: {
    locationQuery: string;
    placeType: LinkedPlaceType;
    placeTypeDetail: string | null;
    preferences: Array<{ value: string; priority: number }>;
    exclusions: string[];
  };
}

export const LINKED_SCENARIOS = {
  "seoul-cafe-complete-v1": {
    id: "seoul-cafe-complete-v1",
    version: 1,
    fixtureHash: "44be4ffb2ac0b034f6c10d7d9d9c66ed7850bed4ce493e87296f211dd44636fd",
    syntheticInput:
      "서울에서 2명이 1인당 20000원 이하로 조용한 카페를 찾습니다. 흡연 장소는 제외합니다.",
    safetyIdentifier: "synthetic-linked-workflow-session-0001",
    initialQuery: "서울 카페 조용한",
    relaxedQuery: "서울 카페",
    locationQuery: "서울",
    confirmedCondition: {
      locationQuery: "서울",
      placeType: "CAFE",
      placeTypeDetail: null,
      preferences: [{ value: "조용한", priority: 10 }],
      exclusions: ["흡연"]
    }
  },
  "seoul-restaurant-nullable-v1": {
    id: "seoul-restaurant-nullable-v1",
    version: 1,
    fixtureHash: "ba1d572734bd18c3f7c7e429c7c8cea70ed584318140bc16ca12fc2744f7f47e",
    syntheticInput: "서울 음식점을 찾습니다.",
    safetyIdentifier: "synthetic-linked-workflow-session-0002",
    initialQuery: "서울 음식점",
    locationQuery: "서울",
    confirmedCondition: {
      locationQuery: "서울",
      placeType: "RESTAURANT",
      placeTypeDetail: null,
      preferences: [],
      exclusions: []
    }
  },
  "seoul-cafe-dessert-v1": {
    id: "seoul-cafe-dessert-v1",
    version: 1,
    fixtureHash: "742c38751f9a0cbbcb5fa61ddbfef1ea80c0644f40fc51974c4f0eabf2462465",
    syntheticInput: "서울 디저트 카페를 찾습니다. 흡연 장소는 제외합니다.",
    safetyIdentifier: "synthetic-linked-workflow-session-0003",
    initialQuery: "서울 카페 디저트",
    relaxedQuery: "서울 카페",
    locationQuery: "서울",
    confirmedCondition: {
      locationQuery: "서울",
      placeType: "CAFE",
      placeTypeDetail: null,
      preferences: [{ value: "디저트", priority: 10 }],
      exclusions: ["흡연"]
    }
  }
} as const satisfies Record<string, LinkedScenario>;

export type LinkedScenarioId = keyof typeof LINKED_SCENARIOS;
export const DEFAULT_LINKED_SCENARIO_ID: LinkedScenarioId = "seoul-cafe-complete-v1";
export const DEFAULT_LINKED_SCENARIO = LINKED_SCENARIOS[DEFAULT_LINKED_SCENARIO_ID];

// 기존 보안 테스트의 기본 fixture alias다. 실행 코드는 활성 session의 scenario를 사용한다.
export const LINKED_FIXTURE_HASH = DEFAULT_LINKED_SCENARIO.fixtureHash;
export const LINKED_SYNTHETIC_INPUT = DEFAULT_LINKED_SCENARIO.syntheticInput;
export const LINKED_SAFETY_IDENTIFIER = DEFAULT_LINKED_SCENARIO.safetyIdentifier;
export const LINKED_INITIAL_QUERY = DEFAULT_LINKED_SCENARIO.initialQuery;
export const LINKED_RELAXED_QUERY = DEFAULT_LINKED_SCENARIO.relaxedQuery;

export function requireLinkedScenario(value: unknown): LinkedScenario {
  if (typeof value !== "string" || !(value in LINKED_SCENARIOS)) {
    throw invalid("INVALID_LINKED_SCENARIO");
  }
  return LINKED_SCENARIOS[value as LinkedScenarioId];
}

export interface LinkedStartRequest {
  approvedSha: string;
  scenarioId: LinkedScenarioId;
  fixtureVersion: 1;
  fixtureHash: string;
  scopeHash: string;
  scenario: LinkedScenario;
}

export interface LinkedCompleteRequest {
  approvedSha: string;
  scenarioId: LinkedScenarioId;
  resultCount: number;
  placeSearchCalls: number;
  blogSearchCalls: number;
  degraded: boolean;
  reasonFallback: boolean;
}

export function parseLinkedStart(value: unknown): LinkedStartRequest {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "approvedSha",
    "scenarioId",
    "fixtureVersion",
    "fixtureHash",
    "scopeHash"
  ])) {
    throw invalid("INVALID_LINKED_START_REQUEST");
  }
  const scenario = requireLinkedScenario(value.scenarioId);
  if (
    typeof value.approvedSha !== "string" ||
    !SHA_PATTERN.test(value.approvedSha) ||
    value.fixtureVersion !== scenario.version ||
    value.fixtureHash !== scenario.fixtureHash ||
    value.scopeHash !== LINKED_SCOPE_HASH
  ) {
    throw new SecurityBoundaryError(
      403,
      "LINKED_WORKFLOW_NOT_ALLOWLISTED",
      "승인된 Linked Live fixture와 범위만 허용됩니다."
    );
  }
  return {
    approvedSha: value.approvedSha,
    scenarioId: scenario.id as LinkedScenarioId,
    fixtureVersion: scenario.version,
    fixtureHash: scenario.fixtureHash,
    scopeHash: LINKED_SCOPE_HASH,
    scenario
  };
}

export function parseLinkedComplete(value: unknown): LinkedCompleteRequest {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "approvedSha",
    "scenarioId",
    "resultCount",
    "placeSearchCalls",
    "blogSearchCalls",
    "degraded",
    "reasonFallback"
  ])) {
    throw invalid("INVALID_LINKED_COMPLETE_REQUEST");
  }
  if (
    typeof value.approvedSha !== "string" ||
    !SHA_PATTERN.test(value.approvedSha) ||
    !(typeof value.scenarioId === "string" && value.scenarioId in LINKED_SCENARIOS) ||
    !integerBetween(value.resultCount, 0, 3) ||
    !integerBetween(value.placeSearchCalls, 1, 2) ||
    !integerBetween(value.blogSearchCalls, 0, 5) ||
    typeof value.degraded !== "boolean" ||
    typeof value.reasonFallback !== "boolean"
  ) {
    throw invalid("INVALID_LINKED_COMPLETE_REQUEST");
  }
  return {
    approvedSha: value.approvedSha,
    scenarioId: value.scenarioId as LinkedScenarioId,
    resultCount: value.resultCount,
    placeSearchCalls: value.placeSearchCalls,
    blogSearchCalls: value.blogSearchCalls,
    degraded: value.degraded,
    reasonFallback: value.reasonFallback
  };
}

export function requireUuidV4(value: unknown, code: string): string {
  if (typeof value !== "string" || !UUID_V4_PATTERN.test(value)) {
    throw invalid(code);
  }
  return value;
}

export function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index]);
}

function integerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum;
}

function invalid(code: string): SecurityBoundaryError {
  return new SecurityBoundaryError(
    400,
    code,
    "Linked Live 요청이 고정 계약과 일치하지 않습니다."
  );
}
