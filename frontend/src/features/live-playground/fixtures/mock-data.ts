import type {
  DraftSnapshot,
  RecommendationCondition,
  RecommendationPlace,
  RecommendationResult,
  RunSnapshot,
  WorkflowTraceEvent,
} from "../api/types";

const FIXED_TIME = "2026-07-16T02:00:00.000Z";

export const mockCondition: RecommendationCondition = {
  locationQuery: "서울",
  placeType: "CAFE",
  placeTypeDetail: null,
  partySize: 2,
  budgetPerPersonMin: null,
  budgetPerPersonMax: 20_000,
  preferences: [{ value: "조용한", priority: 10 }],
  exclusions: ["흡연"],
};

export const mockDraft: DraftSnapshot = {
  draftId: "draft-mock-0001",
  status: "EXTRACTED",
  condition: mockCondition,
  warnings: ["BUDGET_EVIDENCE_UNAVAILABLE"],
  createdAt: FIXED_TIME,
  expiresAt: "2026-07-16T02:30:00.000Z",
};

const place = (
  rank: number,
  suffix: string,
  name: string,
  category: string,
  roadAddress: string,
  preference: number,
  blogEvidence: number,
): RecommendationPlace => ({
  placeId: `00000000-0000-4000-8000-00000000000${suffix}`,
  rank,
  name,
  category,
  address: roadAddress.replace("도로", "지번"),
  roadAddress,
  sourceUrl: `https://example.com/mock-place-${suffix}`,
  score: 55 + preference + blogEvidence,
  scoreBreakdown: {
    location: 30,
    placeType: 25,
    budget: 0,
    preference,
    blogEvidence,
  },
  reasonStatements: [
    {
      text: "검증된 장소 정보에 따라 이 후보를 제안합니다.",
      evidenceIds: [`local:00000000-0000-4000-8000-00000000000${suffix}`],
    },
    {
      text: "연결된 블로그 근거를 함께 확인할 수 있습니다.",
      evidenceIds: [`blog:${suffix}:1`],
    },
  ],
  cautions: ["가격 정보는 검색 근거에서 확인되지 않았습니다."],
  evidenceLevel: "LOCAL_AND_BLOG",
  evidence: [
    {
      evidenceId: `local:00000000-0000-4000-8000-00000000000${suffix}`,
      type: "LOCAL",
      title: "장소 검색 근거",
      summary: "장소 유형과 주소를 포함한 Local 근거",
      sourceUrl: `https://example.com/mock-place-${suffix}`,
    },
    {
      evidenceId: `blog:${suffix}:1`,
      type: "BLOG",
      title: "후보명과 연결된 블로그 근거",
      summary: "후보명과 연결된 합성 Blog 요약",
      sourceUrl: `https://example.com/mock-blog-${suffix}`,
    },
  ],
});

export const mockResult: RecommendationResult = {
  places: [
    place(1, "1", "모의 고요서재", "카페, 디저트", "서울특별시 종로구 도로 11", 15, 10),
    place(2, "2", "모의 초록창가", "카페", "서울특별시 마포구 도로 22", 12, 10),
    place(3, "3", "모의 느린오후", "카페, 베이커리", "서울특별시 성동구 도로 33", 10, 7),
  ],
  degraded: false,
  reasonFallback: false,
  relaxed: false,
  warnings: ["BUDGET_EVIDENCE_UNAVAILABLE"],
  placeSearchCalls: 1,
  blogSearchCalls: 4,
  reasonGenerationCalls: 1,
};

const trace = (
  sequence: number,
  stage: WorkflowTraceEvent["stage"],
  title: string,
  description: string,
  metrics: WorkflowTraceEvent["metrics"] = {},
  candidates: WorkflowTraceEvent["candidates"] = [],
): WorkflowTraceEvent => ({
  eventId: `trace-${String(sequence).padStart(2, "0")}`,
  sequence,
  stage,
  status: "COMPLETED",
  title,
  description,
  occurredAt: FIXED_TIME,
  metrics,
  candidates,
});

export const mockTrace: WorkflowTraceEvent[] = [
  trace(
    1,
    "USER_REQUEST_ACCEPTED",
    "사용자 요청을 접수했습니다",
    "입력 문장을 조건 추출 단계로 전달했습니다.",
    { inputCharacters: 46 },
  ),
  trace(
    2,
    "CONDITION_EXTRACTED",
    "Elice가 조건 초안을 추출했습니다",
    "위치·장소 유형·선호·제외 조건을 구조화하고 누락 값은 추정하지 않았습니다.",
    { schemaValid: true, warningCount: 1, preferenceCount: 1 },
  ),
  trace(
    3,
    "USER_CONDITION_CONFIRMED",
    "사용자가 조건을 확인했습니다",
    "추출 결과를 자동 확정하지 않고 편집된 정본 조건을 추천에 적용했습니다.",
    { preferenceCount: 1 },
  ),
  trace(
    4,
    "RECOMMENDATION_WORKFLOW_STARTED",
    "추천 Core 실행을 시작했습니다",
    "확정 조건만 사용해 장소 검색·근거 수집·점수화 순서로 진행합니다.",
  ),
  trace(
    5,
    "SEARCH_QUERY_PLANNED",
    "검색 계획을 만들었습니다",
    "필수 위치와 유형을 유지하고 우선순위가 높은 선호를 검색 토큰에 포함했습니다.",
    { query: "서울 카페 조용한", queryLength: 10, preferenceTokens: 1, relaxed: false },
  ),
  trace(
    6,
    "NAVER_LOCAL_COMPLETED",
    "Naver Local 후보를 수신했습니다",
    "Naver Local 계약과 같은 형태의 Mock 응답에서 후보를 가져왔습니다.",
    { received: 5, providerTotal: 5, displayLimit: 5, relaxed: false },
  ),
  trace(
    7,
    "CANDIDATES_NORMALIZED",
    "후보를 정규화하고 필터링했습니다",
    "HTML·공백·URL을 정리하고 위치·유형·제외 조건과 중복을 검사했습니다.",
    { eligible: 4, relaxed: false },
    [
      { label: "후보 A", category: "카페", status: "KEPT", explanation: "필수 조건 일치" },
      { label: "후보 B", category: "카페", status: "KEPT", explanation: "필수 조건 일치" },
      { label: "후보 C", category: "카페", status: "FILTERED", explanation: "제외 조건 감지" },
    ],
  ),
  trace(
    8,
    "PRELIMINARY_RANKING_COMPLETED",
    "Blog 검색 대상을 예비 점수로 제한했습니다",
    "외부 근거 호출 전에 결정론적 예비 점수로 최대 다섯 후보를 선택했습니다.",
    { candidatePool: 4 },
  ),
  trace(
    9,
    "NAVER_BLOG_COMPLETED",
    "후보별 Blog 근거를 확인했습니다",
    "후보 이름이 포함된 고유 근거만 소유 후보에 연결했습니다.",
    { received: 3, providerTotal: 3, displayLimit: 3 },
  ),
  trace(
    10,
    "FINAL_RANKING_COMPLETED",
    "서버가 결정론적 Top 3를 확정했습니다",
    "점수, 필수 조건 일치율, 근거 수와 안정적 후보 키 순으로 정렬했습니다.",
    { resultCount: 3, degraded: false },
  ),
  trace(
    11,
    "ELICE_REASON_REQUESTED",
    "Elice에 근거 기반 이유 생성을 요청했습니다",
    "Top 3와 허용된 근거만 전달하고 점수와 순위는 전달하지 않았습니다.",
    { placeCount: 3, evidenceCount: 6 },
  ),
  trace(
    12,
    "ELICE_REASON_COMPLETED",
    "Elice 이유와 근거 관계를 검증했습니다",
    "모든 문장이 같은 후보의 허용된 evidence ID 하나를 인용하는지 확인했습니다.",
    { placeCount: 3, fallback: false, errorCode: "NONE" },
  ),
  trace(
    13,
    "RECOMMENDATION_WORKFLOW_COMPLETED",
    "추천 결과를 완성했습니다",
    "저하나 이유 대체 없이 검증된 세 후보를 반환했습니다.",
    {
      resultCount: 3,
      localCalls: 1,
      blogCalls: 4,
      reasonCalls: 1,
      relaxed: false,
      degraded: false,
      reasonFallback: false,
    },
  ),
];

export const mockRun: RunSnapshot = {
  runId: "run-mock-0001",
  draftId: mockDraft.draftId,
  status: "COMPLETED",
  stage: "RECOMMENDATION_WORKFLOW_COMPLETED",
  trace: mockTrace,
  result: mockResult,
  error: null,
  createdAt: FIXED_TIME,
  updatedAt: FIXED_TIME,
  expiresAt: "2026-07-16T02:30:00.000Z",
};
