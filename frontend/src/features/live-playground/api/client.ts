import {
  PLACE_TYPES,
  type CreateDraftRequest,
  type DraftSnapshot,
  type PlaygroundApi,
  type ProblemDetails,
  type RecommendationCondition,
  type RecommendationEvidence,
  type RecommendationPlace,
  type RecommendationResult,
  type RunAccepted,
  type RunFailure,
  type RunSnapshot,
  type RunStatus,
  type RunStreamListener,
  type ScoreBreakdown,
  type TraceCandidate,
  type TraceStage,
  type TraceStatus,
  type UpdateDraftRequest,
  type WorkflowTraceEvent,
} from "./types";

const API_ROOT = "/__dev/api";
const SSE_EVENT_NAME = "workflow-trace";

const RUN_STATUSES = new Set<RunStatus>([
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

const TRACE_STAGES = new Set<TraceStage>([
  "USER_REQUEST_ACCEPTED",
  "CONDITION_EXTRACTED",
  "USER_CONDITION_CONFIRMED",
  "RECOMMENDATION_WORKFLOW_STARTED",
  "SEARCH_QUERY_PLANNED",
  "NAVER_LOCAL_COMPLETED",
  "CANDIDATES_NORMALIZED",
  "PRELIMINARY_RANKING_COMPLETED",
  "NAVER_BLOG_COMPLETED",
  "NAVER_BLOG_FAILED",
  "FINAL_RANKING_COMPLETED",
  "ELICE_REASON_REQUESTED",
  "ELICE_REASON_COMPLETED",
  "RECOMMENDATION_WORKFLOW_COMPLETED",
  "RECOMMENDATION_WORKFLOW_FAILED",
  "RECOMMENDATION_WORKFLOW_CANCELLED",
]);

export class PlaygroundApiError extends Error {
  constructor(
    readonly problem: ProblemDetails,
    options?: ErrorOptions,
  ) {
    super(problem.detail || problem.title, options);
    this.name = "PlaygroundApiError";
  }
}

export class PlaygroundContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaygroundContractError";
  }
}

export class HttpPlaygroundApi implements PlaygroundApi {
  private readonly fetcher: typeof fetch;

  constructor(fetcher?: typeof fetch) {
    this.fetcher = fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  async createDraft(request: CreateDraftRequest): Promise<DraftSnapshot> {
    return parseDraft(await this.request("/drafts", "POST", request, false, 201));
  }

  async updateDraft(draftId: string, request: UpdateDraftRequest): Promise<DraftSnapshot> {
    return parseDraft(
      await this.request(
        `/drafts/${encodeURIComponent(draftId)}`,
        "PUT",
        request,
        false,
        200,
      ),
    );
  }

  async startRun(draftId: string): Promise<RunAccepted> {
    const snapshot = parseRun(
      await this.request("/runs", "POST", { draftId }, false, 202),
    );
    return {
      runId: snapshot.runId,
      status: snapshot.status,
      location: `${API_ROOT}/runs/${encodeURIComponent(snapshot.runId)}`,
      eventsUrl: `${API_ROOT}/runs/${encodeURIComponent(snapshot.runId)}/events`,
      snapshot,
    };
  }

  async getRun(runId: string): Promise<RunSnapshot> {
    return parseRun(
      await this.request(`/runs/${encodeURIComponent(runId)}`, "GET", undefined, false, 200),
    );
  }

  async cancelRun(runId: string): Promise<void> {
    await this.request(
      `/runs/${encodeURIComponent(runId)}`,
      "DELETE",
      undefined,
      true,
      204,
    );
  }

  subscribeToRun(
    runId: string,
    eventsUrl: string,
    listener: RunStreamListener,
  ): () => void {
    if (typeof EventSource === "undefined") {
      throw new PlaygroundContractError("이 환경에서는 진행 이벤트를 연결할 수 없습니다.");
    }

    const sourceUrl = safeEventUrl(eventsUrl, runId);
    const source = new EventSource(sourceUrl, { withCredentials: true });
    let terminal = false;

    const finishFromSnapshot = async () => {
      try {
        const snapshot = await this.getRun(runId);
        if (snapshot.status === "COMPLETED") {
          listener.onCompleted(snapshot);
          return;
        }
        listener.onFailed(
          snapshot.error ?? contractFailure("종료된 실행의 실패 정보를 확인할 수 없습니다."),
        );
      } catch (error) {
        listener.onFailed(contractFailure(errorMessage(error)));
      }
    };

    const handleTrace = (event: MessageEvent<string>) => {
      try {
        const trace = parseTrace(JSON.parse(event.data) as unknown);
        listener.onTrace(trace);
        if (isTerminalStage(trace.stage)) {
          terminal = true;
          source.close();
          void finishFromSnapshot();
        }
      } catch (error) {
        terminal = true;
        source.close();
        listener.onFailed(contractFailure(errorMessage(error)));
      }
    };

    source.addEventListener(SSE_EVENT_NAME, handleTrace);
    source.onerror = () => {
      if (!terminal) listener.onConnectionError();
    };

    return () => {
      terminal = true;
      source.removeEventListener(SSE_EVENT_NAME, handleTrace);
      source.close();
    };
  }

  private async request(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    body?: unknown,
    allowEmpty = false,
    expectedStatus?: number,
  ): Promise<unknown> {
    const response = await this.fetcher(`${API_ROOT}${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json, application/problem+json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      redirect: "error",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      throw new PlaygroundApiError(await readProblem(response));
    }
    if (expectedStatus != null && response.status !== expectedStatus) {
      throw new PlaygroundContractError(
        `API 상태 코드가 계약과 다릅니다. expected=${expectedStatus} actual=${response.status}`,
      );
    }
    if (allowEmpty && response.status === 204) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new PlaygroundContractError("API가 JSON 응답을 반환하지 않았습니다.");
    }
    return response.json() as Promise<unknown>;
  }
}

function safeEventUrl(candidate: string, runId: string): string {
  const fallback = `${API_ROOT}/runs/${encodeURIComponent(runId)}/events`;
  if (!candidate) return fallback;
  const base = typeof window === "undefined" ? "http://127.0.0.1" : window.location.origin;
  const parsed = new URL(candidate, base);
  const expectedPath = `${API_ROOT}/runs/${encodeURIComponent(runId)}/events`;
  if (parsed.origin !== base || parsed.pathname !== expectedPath || parsed.search || parsed.hash) {
    throw new PlaygroundContractError(
      "진행 이벤트 URL은 현재 run의 same-origin dev API여야 합니다.",
    );
  }
  return parsed.pathname;
}

async function readProblem(response: Response): Promise<ProblemDetails> {
  try {
    const value = asRecord(await response.json());
    return {
      title: optionalNonBlankString(value.title) ?? "요청을 처리하지 못했습니다.",
      status: response.status,
      detail: optionalNonBlankString(value.detail) ?? "안전한 오류 정보가 없습니다.",
      errorCode: optionalNonBlankString(value.errorCode),
      traceId: optionalNonBlankString(value.traceId),
    };
  } catch {
    return {
      title: "요청을 처리하지 못했습니다.",
      status: response.status,
      detail: "응답에 표시 가능한 오류 정보가 없습니다.",
    };
  }
}

function parseDraft(source: unknown): DraftSnapshot {
  const value = asRecord(source);
  const status = requiredNonBlankString(value.status, "status");
  if (status !== "EXTRACTED" && status !== "CONFIRMED") {
    throw new PlaygroundContractError("draft status가 계약과 다릅니다.");
  }
  return {
    draftId: requiredNonBlankString(value.draftId, "draftId"),
    status,
    condition: parseCondition(value.condition),
    warnings: stringArray(value.warnings, "warnings"),
    createdAt: requiredNonBlankString(value.createdAt, "createdAt"),
    expiresAt: requiredNonBlankString(value.expiresAt, "expiresAt"),
  };
}

function parseCondition(source: unknown): RecommendationCondition {
  const value = asRecord(source);
  const rawPlaceType = requiredNonBlankString(value.placeType, "condition.placeType");
  if (!PLACE_TYPES.some((item) => item === rawPlaceType)) {
    throw new PlaygroundContractError("condition.placeType 값이 계약과 다릅니다.");
  }
  const placeType = rawPlaceType as RecommendationCondition["placeType"];
  const preferences = array(value.preferences, "condition.preferences").map((item) => {
    const preference = asRecord(item);
    return {
      value: requiredNonBlankString(preference.value, "preference.value"),
      priority: nullableInteger(preference.priority, "preference.priority"),
    };
  });
  return {
    locationQuery: requiredNonBlankString(value.locationQuery, "condition.locationQuery"),
    placeType,
    placeTypeDetail: nullableString(value.placeTypeDetail, "condition.placeTypeDetail"),
    partySize: nullableInteger(value.partySize, "condition.partySize"),
    budgetPerPersonMin: nullableInteger(
      value.budgetPerPersonMin,
      "condition.budgetPerPersonMin",
    ),
    budgetPerPersonMax: nullableInteger(
      value.budgetPerPersonMax,
      "condition.budgetPerPersonMax",
    ),
    preferences,
    exclusions: stringArray(value.exclusions, "condition.exclusions"),
  };
}

function parseRun(source: unknown): RunSnapshot {
  const value = asRecord(source);
  const status = requiredNonBlankString(value.status, "status") as RunStatus;
  if (!RUN_STATUSES.has(status)) {
    throw new PlaygroundContractError("run status가 계약과 다릅니다.");
  }
  const trace = array(value.trace, "trace").map(parseTrace);
  const result = value.result == null ? null : parseResult(value.result);
  const error = value.failure == null ? null : parseFailure(value.failure);
  if (status === "COMPLETED" && result == null) {
    throw new PlaygroundContractError("완료된 run에는 result가 필요합니다.");
  }
  if (status === "FAILED" && error == null) {
    throw new PlaygroundContractError("실패한 run에는 failure가 필요합니다.");
  }
  return {
    runId: requiredNonBlankString(value.runId, "runId"),
    draftId: requiredNonBlankString(value.draftId, "draftId"),
    status,
    stage: trace.at(-1)?.stage ?? "USER_REQUEST_ACCEPTED",
    trace,
    result,
    error,
    createdAt: requiredNonBlankString(value.createdAt, "createdAt"),
    updatedAt: requiredNonBlankString(value.updatedAt, "updatedAt"),
    expiresAt: requiredNonBlankString(value.expiresAt, "expiresAt"),
  };
}

function parseTrace(source: unknown): WorkflowTraceEvent {
  const value = asRecord(source);
  const stage = requiredNonBlankString(value.stage, "stage") as TraceStage;
  if (!TRACE_STAGES.has(stage)) {
    throw new PlaygroundContractError(`알 수 없는 workflow trace stage입니다: ${stage}`);
  }
  const status = parseTraceStatus(value.status);
  const sequence = requiredInteger(value.id, "id");
  const data = value.data == null ? {} : asRecord(value.data);
  const presentation = tracePresentation(stage, data);
  return {
    eventId: String(sequence),
    sequence,
    stage,
    status,
    occurredAt: requiredNonBlankString(value.occurredAt, "occurredAt"),
    ...presentation,
  };
}

function tracePresentation(
  stage: TraceStage,
  data: Record<string, unknown>,
): Pick<WorkflowTraceEvent, "title" | "description" | "metrics" | "candidates"> {
  switch (stage) {
    case "USER_REQUEST_ACCEPTED": {
      const requestText = requiredNonBlankString(data.requestText, "data.requestText");
      return traceView(
        "사용자 요청을 접수했습니다",
        "입력 문장을 조건 추출 단계로 전달했습니다.",
        { inputCharacters: [...requestText].length },
      );
    }
    case "CONDITION_EXTRACTED": {
      const condition = parseCondition(data.condition);
      const warnings = stringArray(data.warnings, "data.warnings");
      return traceView(
        "Elice가 조건 초안을 추출했습니다",
        "위치·장소 유형·선호·제외 조건을 구조화하고 누락 값은 추정하지 않았습니다.",
        {
          schemaValid: true,
          warningCount: warnings.length,
          preferenceCount: condition.preferences.length,
        },
      );
    }
    case "USER_CONDITION_CONFIRMED": {
      const condition = parseCondition(data.condition);
      return traceView(
        "사용자가 조건을 확인했습니다",
        "추출 결과를 자동 확정하지 않고 화면에서 확인한 조건을 추천 정본으로 적용했습니다.",
        { preferenceCount: condition.preferences.length },
      );
    }
    case "RECOMMENDATION_WORKFLOW_STARTED":
      return traceView(
        "추천 Core 실행을 시작했습니다",
        "확정 조건만 사용해 장소 검색·근거 수집·점수화 순서로 진행합니다.",
      );
    case "SEARCH_QUERY_PLANNED": {
      const query = requiredNonBlankString(data.query, "data.query");
      const preferences = array(data.includedPreferences, "data.includedPreferences");
      const relaxed = requiredBoolean(data.relaxed, "data.relaxed");
      return traceView(
        relaxed ? "선호 하나를 완화해 검색어를 다시 만들었습니다" : "검색 계획을 만들었습니다",
        "위치와 장소 유형은 유지하고 완전한 선호 토큰만 검색어에 포함했습니다.",
        { query, queryLength: [...query].length, preferenceTokens: preferences.length, relaxed },
      );
    }
    case "NAVER_LOCAL_COMPLETED": {
      const items = array(data.items, "data.items").map(parseSearchItemCandidate);
      return traceView(
        "Naver Local 후보를 수신했습니다",
        "검색 응답을 아직 채택하지 않은 원시 후보로 표시하며 다음 단계에서 정규화·필터링합니다.",
        {
          received: items.length,
          providerTotal: requiredInteger(data.total, "data.total"),
          displayLimit: requiredInteger(data.limit, "data.limit"),
          relaxed: requiredBoolean(data.relaxed, "data.relaxed"),
        },
        items,
      );
    }
    case "CANDIDATES_NORMALIZED": {
      const candidates = array(data.candidates, "data.candidates").map((item) =>
        candidateTrace(parseCandidate(item), "KEPT", "정규화·필수 조건·중복 검사 통과"),
      );
      return traceView(
        "후보를 정규화하고 필터링했습니다",
        "HTML과 공백을 정리하고 위치·유형·제외 조건 및 중복 규칙을 통과한 후보만 유지했습니다.",
        {
          eligible: requiredInteger(data.count, "data.count"),
          relaxed: requiredBoolean(data.relaxed, "data.relaxed"),
        },
        candidates,
      );
    }
    case "PRELIMINARY_RANKING_COMPLETED": {
      const candidates = array(data.candidates, "data.candidates").map((item) => {
        const scored = asRecord(item);
        const score = parseScore(scored.score);
        return candidateTrace(
          parseCandidate(scored.candidate),
          "RANKED",
          `예비 점수 ${score.total}/80 · 근거 ${requiredInteger(scored.evidenceCount, "evidenceCount")}개`,
        );
      });
      return traceView(
        "Blog 검색 대상을 예비 점수로 제한했습니다",
        "외부 근거 호출 전에 결정론적 예비 점수로 최대 다섯 후보를 선택했습니다.",
        { candidatePool: requiredInteger(data.count, "data.count") },
        candidates,
      );
    }
    case "NAVER_BLOG_COMPLETED": {
      const candidate = parseCandidate(data.candidate);
      const itemCount = array(data.items, "data.items").length;
      return traceView(
        `${candidate.name}의 Blog 근거를 확인했습니다`,
        "후보명과 연결되는 고유 Blog 근거만 이후 점수와 설명 검증에 사용합니다.",
        {
          received: itemCount,
          providerTotal: requiredInteger(data.total, "data.total"),
          displayLimit: requiredInteger(data.limit, "data.limit"),
        },
        [candidateTrace(candidate, "KEPT", `Blog 응답 ${itemCount}개 수신`)],
      );
    }
    case "NAVER_BLOG_FAILED": {
      const candidate = parseCandidate(data.candidate);
      return traceView(
        "Blog 근거 호출이 안전하게 중단됐습니다",
        "부분 Blog 근거를 폐기하고 장소 검색 근거만 사용하는 저하 경로로 전환했습니다.",
        { failureCode: requiredNonBlankString(data.failureCode, "data.failureCode") },
        [candidateTrace(candidate, "FILTERED", "Blog 근거를 결과 점수에서 제외")],
      );
    }
    case "FINAL_RANKING_COMPLETED": {
      const places = array(data.places, "data.places").map((item, index) => {
        const ranked = asRecord(item);
        const score = parseScore(ranked.score);
        return candidateTrace(
          parseCandidate(ranked.candidate),
          "RANKED",
          `${index + 1}위 · 최종 점수 ${score.total}/80`,
        );
      });
      return traceView(
        "서버가 결정론적 Top 3를 확정했습니다",
        "LLM 호출 전에 점수·필수 조건·근거 수·안정적 후보 키 순으로 순위를 고정했습니다.",
        {
          resultCount: places.length,
          degraded: requiredBoolean(data.degraded, "data.degraded"),
        },
        places,
      );
    }
    case "ELICE_REASON_REQUESTED": {
      const request = asRecord(data.request);
      const places = array(request.places, "data.request.places");
      const evidenceCount = places.reduce<number>((total, item) => {
        const place = asRecord(item);
        return total + array(place.evidence, "reasonPlace.evidence").length;
      }, 0);
      return traceView(
        "Elice에 근거 기반 이유 생성을 요청했습니다",
        "확정된 Top 3와 후보별 허용 근거만 전달하고 점수·순위는 전달하지 않았습니다.",
        { placeCount: places.length, evidenceCount },
      );
    }
    case "ELICE_REASON_COMPLETED": {
      const places = data.places == null ? [] : array(data.places, "data.places");
      const fallback = requiredBoolean(data.fallbackUsed, "data.fallbackUsed");
      return traceView(
        fallback ? "서버 템플릿 이유로 안전하게 대체했습니다" : "Elice 이유와 근거 관계를 검증했습니다",
        fallback
          ? "Provider 결과를 일부 섞지 않고 Top 3 전체를 검증된 서버 문장으로 교체했습니다."
          : "모든 place ID와 evidence ID가 같은 후보의 입력 근거에 속하는지 확인했습니다.",
        {
          placeCount: places.length,
          fallback,
          errorCode: requiredNonBlankString(data.errorCode, "data.errorCode"),
        },
      );
    }
    case "RECOMMENDATION_WORKFLOW_COMPLETED": {
      const result = parseResult(data.result);
      return traceView(
        "추천 결과를 완성했습니다",
        "검증된 세 후보와 점수·이유·주의사항을 최종 결과로 고정했습니다.",
        {
          resultCount: result.places.length,
          localCalls: result.placeSearchCalls,
          blogCalls: result.blogSearchCalls,
          reasonCalls: result.reasonGenerationCalls,
          relaxed: result.relaxed,
          degraded: result.degraded,
          reasonFallback: result.reasonFallback,
        },
      );
    }
    case "RECOMMENDATION_WORKFLOW_FAILED": {
      const failure = parseFailure(data.failure);
      return traceView(
        "추천 워크플로를 안전하게 중단했습니다",
        failure.detail,
        { errorCode: failure.errorCode },
      );
    }
    case "RECOMMENDATION_WORKFLOW_CANCELLED":
      return traceView(
        "사용자가 추천 실행을 취소했습니다",
        "진행 중인 로컬 실행을 정리하고 새 입력을 받을 준비를 했습니다.",
      );
  }
}

function traceView(
  title: string,
  description: string,
  metrics: WorkflowTraceEvent["metrics"] = {},
  candidates: TraceCandidate[] = [],
) {
  return { title, description, metrics, candidates };
}

function parseResult(source: unknown): RecommendationResult {
  const value = asRecord(source);
  const places = array(value.places, "result.places").map(parseResultPlace);
  if (places.length !== 3) {
    throw new PlaygroundContractError("완료 결과에는 정확히 Top 3가 필요합니다.");
  }
  if (new Set(places.map((place) => place.placeId)).size !== places.length) {
    throw new PlaygroundContractError("Top 3 placeId는 서로 달라야 합니다.");
  }
  for (const place of places) {
    const evidenceIds = new Set(place.evidence.map((evidence) => evidence.evidenceId));
    if (place.reasonStatements.some((reason) =>
      reason.evidenceIds.some((evidenceId) => !evidenceIds.has(evidenceId)))) {
      throw new PlaygroundContractError("추천 이유가 후보에 없는 evidence ID를 인용했습니다.");
    }
  }
  return {
    places,
    degraded: requiredBoolean(value.degraded, "result.degraded"),
    warnings: stringArray(value.warnings, "result.warnings"),
    reasonFallback: requiredBoolean(value.reasonFallback, "result.reasonFallback"),
    relaxed: requiredBoolean(value.relaxed, "result.relaxed"),
    placeSearchCalls: requiredInteger(value.placeSearchCalls, "result.placeSearchCalls"),
    blogSearchCalls: requiredInteger(value.blogSearchCalls, "result.blogSearchCalls"),
    reasonGenerationCalls: requiredInteger(
      value.reasonGenerationCalls,
      "result.reasonGenerationCalls",
    ),
  };
}

function parseResultPlace(source: unknown, index: number): RecommendationPlace {
  const value = asRecord(source);
  const ranked = asRecord(value.rankedPlace);
  const candidate = parseCandidate(ranked.candidate);
  const placeId = requiredNonBlankString(ranked.placeId, "rankedPlace.placeId");
  const score = parseScore(ranked.score);
  const blogEvidence = array(ranked.evidence, "rankedPlace.evidence").map(parseEvidence);
  const localEvidence: RecommendationEvidence = {
    evidenceId: `local:${placeId}`,
    type: "LOCAL",
    title: candidate.name,
    summary: [candidate.category, candidate.description, candidate.roadAddress, candidate.address]
      .filter(Boolean)
      .join(" "),
    sourceUrl: candidate.sourceUrl,
  };
  const evidenceLevel = requiredNonBlankString(value.evidenceLevel, "evidenceLevel");
  if (evidenceLevel !== "LOCAL_AND_BLOG" && evidenceLevel !== "LOCAL_ONLY") {
    throw new PlaygroundContractError("evidenceLevel 값이 계약과 다릅니다.");
  }
  return {
    placeId,
    rank: index + 1,
    name: candidate.name,
    category: candidate.category,
    address: candidate.address,
    roadAddress: candidate.roadAddress,
    sourceUrl: candidate.sourceUrl,
    score: score.total,
    scoreBreakdown: score,
    reasonStatements: array(value.reasons, "reasons").map((item) => {
      const reason = asRecord(item);
      return {
        text: requiredNonBlankString(reason.text, "reason.text"),
        evidenceIds: stringArray(reason.evidenceIds, "reason.evidenceIds"),
      };
    }),
    cautions: stringArray(value.cautions, "cautions"),
    evidenceLevel,
    evidence: [localEvidence, ...blogEvidence],
  };
}

function parseScore(source: unknown): ScoreBreakdown & { total: number } {
  const value = asRecord(source);
  const score = {
    location: requiredInteger(value.location, "score.location"),
    placeType: requiredInteger(value.placeType, "score.placeType"),
    budget: requiredInteger(value.budget, "score.budget"),
    preference: requiredInteger(value.preference, "score.preference"),
    blogEvidence: requiredInteger(value.blogEvidence, "score.blogEvidence"),
    total: requiredInteger(value.total, "score.total"),
  };
  if (score.total > 80 || score.total !==
      score.location + score.placeType + score.budget + score.preference + score.blogEvidence) {
    throw new PlaygroundContractError("score 합계 또는 0~80 범위가 계약과 다릅니다.");
  }
  return score;
}

function parseEvidence(source: unknown): RecommendationEvidence {
  const value = asRecord(source);
  return {
    evidenceId: requiredNonBlankString(value.evidenceId, "evidence.evidenceId"),
    type: "BLOG",
    title: requiredString(value.title, "evidence.title"),
    summary: requiredString(value.summary, "evidence.summary"),
    sourceUrl: parseHttpUrl(value.sourceUrl, "evidence.sourceUrl"),
  };
}

interface CandidateValue {
  name: string;
  category: string;
  description: string;
  address: string;
  roadAddress: string;
  sourceUrl: string;
}

function parseCandidate(source: unknown): CandidateValue {
  const value = asRecord(source);
  return {
    name: requiredNonBlankString(value.name, "candidate.name"),
    category: requiredString(value.category, "candidate.category"),
    description: requiredString(value.description, "candidate.description"),
    address: requiredString(value.address, "candidate.address"),
    roadAddress: requiredString(value.roadAddress, "candidate.roadAddress"),
    sourceUrl: parseHttpUrl(value.sourceUrl, "candidate.sourceUrl"),
  };
}

function parseSearchItemCandidate(source: unknown): TraceCandidate {
  const value = asRecord(source);
  const name = requiredNonBlankString(value.name, "placeSearchItem.name");
  const category = requiredString(value.category, "placeSearchItem.category");
  return {
    label: name,
    category,
    status: "KEPT",
    explanation: "Naver Local 원시 응답 · 다음 단계에서 검증",
  };
}

function candidateTrace(
  candidate: CandidateValue,
  status: TraceCandidate["status"],
  explanation: string,
): TraceCandidate {
  return { label: candidate.name, category: candidate.category, status, explanation };
}

function parseFailure(source: unknown): RunFailure {
  const value = asRecord(source);
  return {
    errorCode: requiredNonBlankString(value.errorCode, "errorCode"),
    title: optionalNonBlankString(value.title) ?? "추천 워크플로 실행 실패",
    detail:
      optionalNonBlankString(value.message) ??
      optionalNonBlankString(value.detail) ??
      "표시 가능한 실패 원인이 없습니다.",
    traceId: optionalNonBlankString(value.traceId),
  };
}

function parseTraceStatus(source: unknown): TraceStatus {
  const status = requiredNonBlankString(source, "status").toUpperCase() as TraceStatus;
  if (!["PENDING", "RUNNING", "COMPLETED", "SKIPPED", "FAILED", "CANCELLED"].includes(status)) {
    throw new PlaygroundContractError("trace status가 계약과 다릅니다.");
  }
  return status;
}

function isTerminalStage(stage: TraceStage): boolean {
  return [
    "RECOMMENDATION_WORKFLOW_COMPLETED",
    "RECOMMENDATION_WORKFLOW_FAILED",
    "RECOMMENDATION_WORKFLOW_CANCELLED",
  ].includes(stage);
}

function contractFailure(detail: string): RunFailure {
  return { errorCode: "INVALID_EVENT_CONTRACT", title: "진행 정보 검증 실패", detail };
}

function asRecord(source: unknown): Record<string, unknown> {
  if (source == null || typeof source !== "object" || Array.isArray(source)) {
    throw new PlaygroundContractError("API 응답 객체가 필요합니다.");
  }
  return source as Record<string, unknown>;
}

function array(source: unknown, field: string): unknown[] {
  if (!Array.isArray(source)) throw new PlaygroundContractError(`${field} 배열이 필요합니다.`);
  return source;
}

function stringArray(source: unknown, field: string): string[] {
  return array(source, field).map((item) => requiredNonBlankString(item, field));
}

function requiredString(source: unknown, field: string): string {
  if (typeof source !== "string") {
    throw new PlaygroundContractError(`${field} 문자열이 필요합니다.`);
  }
  return source;
}

function requiredNonBlankString(source: unknown, field: string): string {
  const value = requiredString(source, field);
  if (value.trim() === "") {
    throw new PlaygroundContractError(`${field} 문자열이 필요합니다.`);
  }
  return value;
}

function optionalNonBlankString(source: unknown): string | undefined {
  return typeof source === "string" && source.trim() !== "" ? source : undefined;
}

function nullableString(source: unknown, field: string): string | null {
  if (source == null) return null;
  return requiredString(source, field);
}

function requiredInteger(source: unknown, field: string): number {
  if (typeof source !== "number" || !Number.isSafeInteger(source) || source < 0) {
    throw new PlaygroundContractError(`${field} 0 이상의 정수가 필요합니다.`);
  }
  return source;
}

function nullableInteger(source: unknown, field: string): number | null {
  if (source == null) return null;
  return requiredInteger(source, field);
}

function requiredBoolean(source: unknown, field: string): boolean {
  if (typeof source !== "boolean") {
    throw new PlaygroundContractError(`${field} boolean이 필요합니다.`);
  }
  return source;
}

function parseHttpUrl(source: unknown, field: string): string {
  const value = requiredNonBlankString(source, field);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new PlaygroundContractError(`${field} HTTP(S) URL이 필요합니다.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PlaygroundContractError(`${field} HTTP(S) URL이 필요합니다.`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "진행 이벤트 계약을 확인할 수 없습니다.";
}

export const __testing = {
  safeEventUrl,
  parseDraft,
  parseRun,
  parseTrace,
  parseResult,
};
