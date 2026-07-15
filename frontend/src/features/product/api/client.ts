import type {
  AnonymousSession,
  FinalResult,
  JobAccepted,
  JobStreamHandlers,
  ProductCondition,
  ProductDraft,
  ProductJob,
  ProductProblem,
  ProductRoom,
  RoomCreated,
  RoomStreamHandlers,
  StreamMeta,
  VoteMutationResult,
  VoteValue,
} from "./types";

const mockMode = process.env.NEXT_PUBLIC_PRODUCT_API_MODE === "mock" ||
  (process.env.NEXT_PUBLIC_PRODUCT_API_MODE == null && process.env.NODE_ENV !== "production");
const API_ROOT = mockMode ? "/mock-api/v1" : "/api/v1";
const CSRF_STORAGE_KEY = "placepick.csrf.v1";

let csrfToken: string | null = null;
let sessionPromise: Promise<AnonymousSession> | null = null;

export class ProductApiError extends Error {
  constructor(readonly problem: ProductProblem) {
    super(problem.detail);
    this.name = "ProductApiError";
  }
}

export class ProductContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductContractError";
  }
}

const COLD_START_LIMIT_MS = 90_000;
const COLD_START_RETRY_MS = 2_000;

/**
 * Render Free의 bounded cold start에만 사용하는 조회 재시도다.
 * 계약 오류나 4xx는 즉시 반환하며 mutation에는 적용하지 않는다.
 */
export async function withColdStartRetry<T>(
  operation: () => Promise<T>,
  onRetry: () => void = () => undefined,
  shouldContinue: () => boolean = () => true,
): Promise<T> {
  const startedAt = Date.now();
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!shouldContinue() || !isColdStartRetryable(error) ||
          Date.now() - startedAt >= COLD_START_LIMIT_MS) {
        throw error;
      }
      onRetry();
      await new Promise((resolve) => setTimeout(resolve, COLD_START_RETRY_MS));
    }
  }
}

export function isColdStartRetryable(error: unknown): boolean {
  if (error instanceof ProductApiError) {
    return [502, 503, 504].includes(error.problem.status);
  }
  return error instanceof TypeError;
}

export class ProductApi {
  private readonly fetcher: typeof fetch;

  constructor(fetcher?: typeof fetch) {
    this.fetcher = fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  async ensureSession(): Promise<AnonymousSession> {
    if (csrfToken == null && typeof window !== "undefined") {
      csrfToken = window.sessionStorage.getItem(CSRF_STORAGE_KEY);
    }
    if (csrfToken != null) {
      return { csrfToken, expiresAt: "" };
    }
    if (sessionPromise == null) {
      sessionPromise = this.request("/anonymous-sessions", "POST", undefined, 201)
        .then(parseSession)
        .then((session) => {
          csrfToken = session.csrfToken;
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(CSRF_STORAGE_KEY, session.csrfToken);
          }
          return session;
        })
        .finally(() => {
          sessionPromise = null;
        });
    }
    return sessionPromise;
  }

  async createDraft(requestText: string): Promise<ProductDraft> {
    await this.ensureSession();
    return parseDraft(await this.request(
      "/recommendation-drafts",
      "POST",
      { requestText },
      201,
      { csrf: true, idempotency: true },
    ));
  }

  async getDraft(draftId: string): Promise<ProductDraft> {
    await this.ensureSession();
    return parseDraft(await this.request(
      `/recommendation-drafts/${encodeURIComponent(draftId)}`,
      "GET",
      undefined,
      200,
    ));
  }

  async confirmDraft(draftId: string, condition: ProductCondition): Promise<ProductDraft> {
    await this.ensureSession();
    return parseDraft(await this.request(
      `/recommendation-drafts/${encodeURIComponent(draftId)}`,
      "PUT",
      { condition },
      200,
      { csrf: true },
    ));
  }

  async startRecommendation(draftId: string): Promise<JobAccepted> {
    await this.ensureSession();
    const response = await this.requestWithResponse(
      "/recommendations",
      "POST",
      { draftId },
      202,
      { csrf: true, idempotency: true },
    );
    const body = asRecord(await response.json());
    const jobId = requiredString(body.jobId, "jobId");
    if (body.status !== "ACCEPTED") {
      throw new ProductContractError("추천 생성은 ACCEPTED 상태여야 합니다.");
    }
    const location = response.headers.get("location");
    const expected = `/api/v1/recommendations/${encodeURIComponent(jobId)}`;
    const mockExpected = `/mock-api/v1/recommendations/${encodeURIComponent(jobId)}`;
    if (location !== expected && location !== mockExpected) {
      throw new ProductContractError("202 응답의 Location이 생성된 jobId와 일치하지 않습니다.");
    }
    return { jobId, status: "ACCEPTED", location };
  }

  async getRecommendation(jobId: string): Promise<ProductJob> {
    await this.ensureSession();
    return parseJob(await this.request(
      `/recommendations/${encodeURIComponent(jobId)}`,
      "GET",
      undefined,
      200,
    ));
  }

  async createRoom(jobId: string, expiresInHours = 72): Promise<RoomCreated> {
    await this.ensureSession();
    return parseRoomCreated(await this.request(
      `/recommendations/${encodeURIComponent(jobId)}/rooms`,
      "POST",
      { expiresInHours },
      201,
      { csrf: true, idempotency: true },
    ));
  }

  async getRoom(shareToken: string): Promise<ProductRoom> {
    await this.ensureSession();
    return parseRoom(await this.request(
      `/rooms/${encodeURIComponent(shareToken)}`,
      "GET",
      undefined,
      200,
    ));
  }

  async putVote(
    shareToken: string,
    placeId: string,
    value: VoteValue,
  ): Promise<VoteMutationResult> {
    await this.ensureSession();
    return parseVoteResult(await this.request(
      `/rooms/${encodeURIComponent(shareToken)}/votes/${encodeURIComponent(placeId)}`,
      "PUT",
      { value },
      200,
      { csrf: true },
    ));
  }

  async deleteVote(shareToken: string, placeId: string): Promise<void> {
    await this.ensureSession();
    await this.request(
      `/rooms/${encodeURIComponent(shareToken)}/votes/${encodeURIComponent(placeId)}`,
      "DELETE",
      undefined,
      204,
      { csrf: true },
      true,
    );
  }

  async finalizeRoom(shareToken: string, placeId: string): Promise<FinalResult> {
    await this.ensureSession();
    return parseFinalResult(await this.request(
      `/rooms/${encodeURIComponent(shareToken)}/final-result`,
      "PUT",
      { placeId },
      200,
      { csrf: true, idempotency: true },
    ));
  }

  async getFinalResult(shareToken: string): Promise<FinalResult> {
    await this.ensureSession();
    return parseFinalResult(await this.request(
      `/rooms/${encodeURIComponent(shareToken)}/result`,
      "GET",
      undefined,
      200,
    ));
  }

  subscribeRecommendation(jobId: string, handlers: JobStreamHandlers): () => void {
    return subscribe(
      `${API_ROOT}/recommendations/${encodeURIComponent(jobId)}/events`,
      {
        snapshot: (payload) => handlers.onSnapshot(parseJob(payload.snapshot), payload.meta),
        progress: (payload) => handlers.onProgress(parseJob(payload.snapshot), payload.meta),
        completed: (payload) => handlers.onCompleted(parseJob(payload.snapshot), payload.meta),
        failed: (payload) => handlers.onFailed(parseJob(payload.snapshot), payload.meta),
        heartbeat: (payload) => handlers.onHeartbeat(payload.meta),
      },
      handlers.onConnectionError,
    );
  }

  subscribeRoom(shareToken: string, handlers: RoomStreamHandlers): () => void {
    return subscribe(
      `${API_ROOT}/rooms/${encodeURIComponent(shareToken)}/events`,
      {
        snapshot: (payload) => handlers.onSnapshot(parseRoom(payload.snapshot), payload.meta),
        voteUpdated: (payload) => handlers.onChanged(parseRoom(payload.snapshot), payload.meta),
        voteRemoved: (payload) => handlers.onChanged(parseRoom(payload.snapshot), payload.meta),
        finalized: (payload) => handlers.onFinalized(parseRoom(payload.snapshot), payload.meta),
        heartbeat: (payload) => handlers.onHeartbeat(payload.meta),
      },
      handlers.onConnectionError,
    );
  }

  private async request(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    body: unknown,
    expectedStatus: number,
    security: { csrf?: boolean; idempotency?: boolean } = {},
    allowEmpty = false,
  ): Promise<unknown> {
    const response = await this.requestWithResponse(path, method, body, expectedStatus, security);
    if (allowEmpty && response.status === 204) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new ProductContractError("성공 응답이 application/json이 아닙니다.");
    }
    return response.json() as Promise<unknown>;
  }

  private async requestWithResponse(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    body: unknown,
    expectedStatus: number,
    security: { csrf?: boolean; idempotency?: boolean } = {},
    allowSessionRetry = true,
    preservedIdempotencyKey?: string,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: "application/json, application/problem+json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (security.csrf) {
      if (csrfToken == null) throw new ProductContractError("CSRF token이 준비되지 않았습니다.");
      headers["X-CSRF-Token"] = csrfToken;
    }
    const idempotencyKey = preservedIdempotencyKey ??
      (security.idempotency ? crypto.randomUUID() : undefined);
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

    const response = await this.fetcher(`${API_ROOT}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) {
      const problem = await readProblem(response);
      if (allowSessionRetry && path !== "/anonymous-sessions" &&
          isRecoverableSessionFailure(problem)) {
        clearSessionState();
        await this.ensureSession();
        return this.requestWithResponse(
          path,
          method,
          body,
          expectedStatus,
          security,
          false,
          idempotencyKey,
        );
      }
      throw new ProductApiError(problem);
    }
    if (response.status !== expectedStatus) {
      throw new ProductContractError(
        `HTTP status가 계약과 다릅니다. expected=${expectedStatus} actual=${response.status}`,
      );
    }
    return response;
  }
}

function isRecoverableSessionFailure(problem: ProductProblem): boolean {
  return (problem.status === 401 && problem.errorCode === "SESSION_REQUIRED") ||
    (problem.status === 403 && problem.errorCode === "CSRF_INVALID");
}

interface ParsedStreamPayload {
  snapshot?: unknown;
  meta: StreamMeta;
}

function subscribe(
  url: string,
  handlers: Record<string, (payload: ParsedStreamPayload) => void>,
  onConnectionError: () => void,
): () => void {
  if (typeof EventSource === "undefined") {
    throw new ProductContractError("이 브라우저는 SSE를 지원하지 않습니다.");
  }
  const source = new EventSource(url, { withCredentials: true });
  let terminal = false;
  const listeners = Object.entries(handlers).map(([name, handler]) => {
    const listener = (event: MessageEvent<string>) => {
      try {
        const payload = parseStreamPayload(JSON.parse(event.data) as unknown, event.lastEventId);
        handler(payload);
        if (["completed", "failed", "finalized"].includes(name)) {
          terminal = true;
          source.close();
        }
      } catch {
        terminal = true;
        source.close();
        onConnectionError();
      }
    };
    source.addEventListener(name, listener);
    return [name, listener] as const;
  });
  source.onerror = () => {
    if (!terminal) onConnectionError();
  };
  return () => {
    terminal = true;
    listeners.forEach(([name, listener]) => source.removeEventListener(name, listener));
    source.close();
  };
}

function parseStreamPayload(source: unknown, lastEventId: string): ParsedStreamPayload {
  const value = asRecord(source);
  const eventId = optionalString(value.eventId) ?? lastEventId;
  return {
    snapshot: value.snapshot,
    meta: {
      eventId: requiredString(eventId, "eventId"),
      occurredAt: requiredString(value.occurredAt, "occurredAt"),
      aggregateId: requiredString(value.aggregateId, "aggregateId"),
    },
  };
}

function parseSession(source: unknown): AnonymousSession {
  const value = asRecord(source);
  return {
    csrfToken: requiredString(value.csrfToken, "csrfToken"),
    expiresAt: requiredString(value.expiresAt, "expiresAt"),
  };
}

function parseDraft(source: unknown): ProductDraft {
  const value = asRecord(source);
  if (!["EXTRACTED", "CONFIRMED", "CONSUMED"].includes(String(value.status))) {
    throw new ProductContractError("draft status가 계약과 다릅니다.");
  }
  return {
    draftId: requiredString(value.draftId, "draftId"),
    status: value.status as ProductDraft["status"],
    extractedCondition: parseCondition(value.extractedCondition),
    warnings: stringArray(value.warnings, "warnings"),
    expiresAt: requiredString(value.expiresAt, "expiresAt"),
  };
}

function parseCondition(source: unknown): ProductCondition {
  const value = asRecord(source);
  return {
    locationQuery: requiredString(value.locationQuery, "locationQuery"),
    placeType: requiredString(value.placeType, "placeType") as ProductCondition["placeType"],
    placeTypeDetail: nullableString(value.placeTypeDetail, "placeTypeDetail"),
    partySize: nullableInteger(value.partySize, "partySize"),
    budgetPerPersonMin: nullableInteger(value.budgetPerPersonMin, "budgetPerPersonMin"),
    budgetPerPersonMax: nullableInteger(value.budgetPerPersonMax, "budgetPerPersonMax"),
    preferences: array(value.preferences, "preferences").map((item) => {
      const preference = asRecord(item);
      return {
        value: requiredString(preference.value, "preference.value"),
        priority: nullableInteger(preference.priority, "preference.priority"),
      };
    }),
    exclusions: stringArray(value.exclusions, "exclusions"),
  };
}

function parseJob(source: unknown): ProductJob {
  const value = asRecord(source);
  const places = value.places == null ? [] : array(value.places, "places").map(parsePlace);
  return {
    jobId: requiredString(value.jobId, "jobId"),
    status: requiredString(value.status, "status") as ProductJob["status"],
    stage: requiredString(value.stage, "stage") as ProductJob["stage"],
    progress: requiredInteger(value.progress, "progress"),
    degraded: requiredBoolean(value.degraded, "degraded"),
    warnings: stringArray(value.warnings, "warnings"),
    condition: parseCondition(value.condition),
    places,
    failure: value.failure == null ? null : parseJobFailure(value.failure),
    createdAt: requiredString(value.createdAt, "createdAt"),
    updatedAt: requiredString(value.updatedAt, "updatedAt"),
    expiresAt: requiredString(value.expiresAt, "expiresAt"),
  };
}

function parsePlace(source: unknown) {
  const value = asRecord(source);
  const score = asRecord(value.scoreBreakdown);
  return {
    placeId: requiredString(value.placeId, "placeId"),
    name: requiredString(value.name, "name"),
    category: requiredString(value.category, "category"),
    roadAddress: stringValue(value.roadAddress, "roadAddress"),
    address: stringValue(value.address, "address"),
    sourceUrl: requiredString(value.sourceUrl, "sourceUrl"),
    score: requiredInteger(value.score, "score"),
    scoreBreakdown: {
      location: requiredInteger(score.location, "score.location"),
      placeType: requiredInteger(score.placeType, "score.placeType"),
      budget: requiredInteger(score.budget, "score.budget"),
      preference: requiredInteger(score.preference, "score.preference"),
      blogEvidence: requiredInteger(score.blogEvidence, "score.blogEvidence"),
    },
    reasonStatements: array(value.reasonStatements, "reasonStatements").map((item) => {
      const reason = asRecord(item);
      return {
        text: requiredString(reason.text, "reason.text"),
        evidenceIds: stringArray(reason.evidenceIds, "reason.evidenceIds"),
      };
    }),
    cautions: stringArray(value.cautions, "cautions"),
    shareText: requiredString(value.shareText, "shareText"),
    evidenceLevel: requiredString(value.evidenceLevel, "evidenceLevel") as "LOCAL_AND_BLOG" | "LOCAL_ONLY",
    warnings: stringArray(value.warnings, "warnings"),
  };
}

function parseRoomCreated(source: unknown): RoomCreated {
  const value = asRecord(source);
  return {
    shareToken: requiredString(value.shareToken, "shareToken"),
    shareUrl: requiredString(value.shareUrl, "shareUrl"),
    expiresAt: requiredString(value.expiresAt, "expiresAt"),
  };
}

function parseRoom(source: unknown): ProductRoom {
  const value = asRecord(source);
  const rawVotes = asRecord(value.myVotes);
  const myVotes: ProductRoom["myVotes"] = {};
  Object.entries(rawVotes).forEach(([placeId, vote]) => {
    if (vote === "LIKE" || vote === "DISLIKE") myVotes[placeId] = vote;
  });
  return {
    roomId: requiredString(value.roomId, "roomId"),
    shareToken: requiredString(value.shareToken, "shareToken"),
    status: requiredString(value.status, "status") as ProductRoom["status"],
    places: array(value.places, "places").map(parsePlace),
    aggregate: array(value.aggregate, "aggregate").map((item) => {
      const aggregate = asRecord(item);
      return {
        placeId: requiredString(aggregate.placeId, "aggregate.placeId"),
        likeCount: requiredInteger(aggregate.likeCount, "aggregate.likeCount"),
        dislikeCount: requiredInteger(aggregate.dislikeCount, "aggregate.dislikeCount"),
      };
    }),
    myVotes,
    canFinalize: requiredBoolean(value.canFinalize, "canFinalize"),
    finalizedPlaceId: nullableString(value.finalizedPlaceId, "finalizedPlaceId"),
    expiresAt: requiredString(value.expiresAt, "expiresAt"),
  };
}

function parseVoteResult(source: unknown): VoteMutationResult {
  const value = asRecord(source);
  return {
    placeId: requiredString(value.placeId, "placeId"),
    myVote: requiredString(value.myVote, "myVote") as VoteValue,
    aggregate: array(value.aggregate, "aggregate").map((item) => {
      const aggregate = asRecord(item);
      return {
        placeId: requiredString(aggregate.placeId, "aggregate.placeId"),
        likeCount: requiredInteger(aggregate.likeCount, "aggregate.likeCount"),
        dislikeCount: requiredInteger(aggregate.dislikeCount, "aggregate.dislikeCount"),
      };
    }),
    updatedAt: requiredString(value.updatedAt, "updatedAt"),
  };
}

function parseFinalResult(source: unknown): FinalResult {
  const value = asRecord(source);
  return {
    place: parsePlace(value.place),
    finalizedAt: requiredString(value.finalizedAt, "finalizedAt"),
  };
}

function parseJobFailure(source: unknown) {
  const value = asRecord(source);
  return {
    errorCode: requiredString(value.errorCode, "failure.errorCode"),
    message: requiredString(value.message, "failure.message"),
  };
}

async function readProblem(response: Response): Promise<ProductProblem> {
  try {
    const value = asRecord(await response.json());
    return {
      title: optionalString(value.title) ?? "요청 실패",
      status: response.status,
      detail: optionalString(value.detail) ?? "표시 가능한 오류 정보가 없습니다.",
      errorCode: optionalString(value.errorCode),
      traceId: optionalString(value.traceId),
    };
  } catch {
    return { title: "요청 실패", status: response.status, detail: "오류 응답을 해석할 수 없습니다." };
  }
}

function asRecord(source: unknown): Record<string, unknown> {
  if (source == null || typeof source !== "object" || Array.isArray(source)) {
    throw new ProductContractError("JSON 객체가 필요합니다.");
  }
  return source as Record<string, unknown>;
}

function array(source: unknown, field: string): unknown[] {
  if (!Array.isArray(source)) throw new ProductContractError(`${field} 배열이 필요합니다.`);
  return source;
}

function stringArray(source: unknown, field: string): string[] {
  return array(source, field).map((item) => requiredString(item, field));
}

function stringValue(source: unknown, field: string): string {
  if (typeof source !== "string") throw new ProductContractError(`${field} 문자열이 필요합니다.`);
  return source;
}

function requiredString(source: unknown, field: string): string {
  const value = stringValue(source, field);
  if (!value.trim()) throw new ProductContractError(`${field} 값이 필요합니다.`);
  return value;
}

function optionalString(source: unknown): string | undefined {
  return typeof source === "string" && source.trim() ? source : undefined;
}

function nullableString(source: unknown, field: string): string | null {
  if (source == null) return null;
  return stringValue(source, field);
}

function requiredInteger(source: unknown, field: string): number {
  if (typeof source !== "number" || !Number.isSafeInteger(source) || source < 0) {
    throw new ProductContractError(`${field} 0 이상의 정수가 필요합니다.`);
  }
  return source;
}

function nullableInteger(source: unknown, field: string): number | null {
  return source == null ? null : requiredInteger(source, field);
}

function requiredBoolean(source: unknown, field: string): boolean {
  if (typeof source !== "boolean") throw new ProductContractError(`${field} boolean이 필요합니다.`);
  return source;
}

function clearSessionState(): void {
  csrfToken = null;
  sessionPromise = null;
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(CSRF_STORAGE_KEY);
  }
}

export const __productTesting = {
  resetSession() {
    clearSessionState();
  },
  parseJob,
  parseRoom,
};
