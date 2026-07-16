import { NextRequest, NextResponse } from "next/server";
import type {
  FinalResult,
  ProductCondition,
  ProductDraft,
  ProductJob,
  ProductPlace,
  ProductRoom,
  VoteValue,
} from "../api/types";

const SESSION_COOKIE = "PLACEPICK_SESSION";
const ORGANIZER_COOKIE = "PLACEPICK_ORGANIZER";
const encoder = new TextEncoder();

interface MockSession {
  id: string;
  csrf: string;
  expiresAt: string;
}

interface DraftState extends ProductDraft {
  owner: string;
}

interface JobState extends ProductJob {
  owner: string;
  sequence: number;
  listeners: Set<(event: string, job: JobState) => void>;
}

interface RoomState {
  roomId: string;
  shareToken: string;
  status: "OPEN" | "FINALIZED";
  places: ProductPlace[];
  votes: Map<string, VoteValue>;
  organizerSession: string;
  finalizedPlaceId: string | null;
  finalizedAt: string | null;
  expiresAt: string;
  sequence: number;
  listeners: Set<(event: string) => void>;
}

interface MockStore {
  sessions: Map<string, MockSession>;
  drafts: Map<string, DraftState>;
  jobs: Map<string, JobState>;
  rooms: Map<string, RoomState>;
}

declare global {
  var __placepickProductMockStore: MockStore | undefined;
}

const store = globalThis.__placepickProductMockStore ?? {
  sessions: new Map(),
  drafts: new Map(),
  jobs: new Map(),
  rooms: new Map(),
};
globalThis.__placepickProductMockStore = store;

export async function handleProductMock(
  request: NextRequest,
  method: string,
  path: string[],
): Promise<Response> {
  if (!isProductMockApiEnabled()) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    if (method === "POST" && path.length === 1 && path[0] === "anonymous-sessions") {
      return createSession(request);
    }
    const session = requireSession(request);

    if (method === "POST" && match(path, "recommendation-drafts")) {
      requireMutation(request, session, true);
      const body = await jsonBody(request);
      const requestText = requireText(body.requestText, "requestText", 1_000);
      const draft = createDraftState(session.id, requestText);
      store.drafts.set(draft.draftId, draft);
      return NextResponse.json(publicDraft(draft), { status: 201 });
    }

    if (path[0] === "recommendation-drafts" && path.length === 2) {
      const draft = ownedDraft(path[1]!, session.id);
      if (method === "GET") return NextResponse.json(publicDraft(draft));
      if (method === "PUT") {
        requireMutation(request, session, false);
        const body = await jsonBody(request);
        draft.extractedCondition = validateCondition(body.condition);
        draft.status = "CONFIRMED";
        return NextResponse.json(publicDraft(draft));
      }
    }

    if (method === "POST" && match(path, "recommendations")) {
      requireMutation(request, session, true);
      const body = await jsonBody(request);
      const draft = ownedDraft(requireText(body.draftId, "draftId", 100), session.id);
      if (draft.status !== "CONFIRMED") {
        throw apiFailure(409, "DRAFT_NOT_CONFIRMED", "추천 전에 조건을 확정해 주세요.");
      }
      draft.status = "CONSUMED";
      const job = createJobState(session.id, draft.extractedCondition);
      store.jobs.set(job.jobId, job);
      scheduleJob(job);
      return NextResponse.json(
        { jobId: job.jobId, status: "ACCEPTED" },
        {
          status: 202,
          headers: { Location: `/mock-api/v1/recommendations/${job.jobId}` },
        },
      );
    }

    if (path[0] === "recommendations" && path.length >= 2) {
      const job = ownedJob(path[1]!, session.id);
      if (method === "GET" && path.length === 2) return NextResponse.json(publicJob(job));
      if (method === "GET" && path[2] === "events") return jobStream(job);
      if (method === "POST" && path[2] === "rooms") {
        requireMutation(request, session, true);
        if (job.status !== "COMPLETED") {
          throw apiFailure(409, "INVALID_STATE", "완료된 추천만 공유할 수 있습니다.");
        }
        const body = await jsonBody(request);
        const hours = body.expiresInHours == null ? 72 : requireInteger(body.expiresInHours, "expiresInHours");
        if (hours < 1 || hours > 168) throw apiFailure(400, "INVALID_REQUEST", "공유 기간을 확인해 주세요.");
        const room = createRoomState(session.id, job.places, hours);
        store.rooms.set(room.shareToken, room);
        const response = NextResponse.json(
          {
            shareToken: room.shareToken,
            shareUrl: `/rooms/${room.shareToken}`,
            expiresAt: room.expiresAt,
          },
          { status: 201 },
        );
        response.cookies.set(ORGANIZER_COOKIE, room.roomId, cookieOptions(room.expiresAt));
        return response;
      }
    }

    if (path[0] === "rooms" && path.length >= 2) {
      const room = requireRoom(path[1]!);
      const organizer = request.cookies.get(ORGANIZER_COOKIE)?.value === room.roomId;
      if (method === "GET" && path.length === 2) {
        return NextResponse.json(publicRoom(room, session.id, organizer));
      }
      if (method === "GET" && path[2] === "events") {
        return roomStream(room, session.id, organizer);
      }
      if (path[2] === "votes" && path[3]) {
        requireMutation(request, session, false);
        requireOpenRoom(room);
        const placeId = requireRoomPlace(room, path[3]!);
        const voteKey = `${session.id}:${placeId}`;
        if (method === "PUT") {
          const body = await jsonBody(request);
          if (body.value !== "LIKE" && body.value !== "DISLIKE") {
            throw apiFailure(400, "INVALID_REQUEST", "투표 값은 LIKE 또는 DISLIKE여야 합니다.");
          }
          room.votes.set(voteKey, body.value);
          emitRoom(room, "voteUpdated");
          return NextResponse.json({
            placeId,
            myVote: body.value,
            aggregate: aggregate(room),
            updatedAt: new Date().toISOString(),
          });
        }
        if (method === "DELETE") {
          room.votes.delete(voteKey);
          emitRoom(room, "voteRemoved");
          return new Response(null, { status: 204 });
        }
      }
      if (method === "PUT" && path[2] === "final-result") {
        requireMutation(request, session, true);
        if (!organizer) throw apiFailure(403, "ORGANIZER_REQUIRED", "주최자만 최종 장소를 확정할 수 있습니다.");
        const body = await jsonBody(request);
        const placeId = requireRoomPlace(room, requireText(body.placeId, "placeId", 100));
        if (room.finalizedPlaceId != null && room.finalizedPlaceId !== placeId) {
          throw apiFailure(409, "FINAL_RESULT_CONFLICT", "이미 다른 장소가 확정됐습니다.");
        }
        if (room.finalizedPlaceId == null) {
          room.finalizedPlaceId = placeId;
          room.finalizedAt = new Date().toISOString();
          room.status = "FINALIZED";
          emitRoom(room, "finalized");
        }
        return NextResponse.json(finalResult(room));
      }
      if (method === "GET" && path[2] === "result") {
        if (room.finalizedPlaceId == null) {
          throw apiFailure(409, "RESULT_NOT_FINALIZED", "아직 최종 장소가 확정되지 않았습니다.");
        }
        return NextResponse.json(finalResult(room));
      }
    }

    if (method === "POST" && match(path, "events")) {
      requireMutation(request, session, false);
      return new Response(null, { status: 202 });
    }

    throw apiFailure(404, "RESOURCE_NOT_FOUND", "요청한 리소스를 찾을 수 없습니다.");
  } catch (error) {
    return problemResponse(error, request.nextUrl.pathname);
  }
}

export function isProductMockApiEnabled(
  nodeEnvironment = process.env.NODE_ENV,
): boolean {
  return nodeEnvironment === "development" || nodeEnvironment === "test";
}

function createSession(request: NextRequest): NextResponse {
  const existingId = request.cookies.get(SESSION_COOKIE)?.value;
  const existing = existingId == null ? null : store.sessions.get(existingId);
  const session = existing ?? {
    id: crypto.randomUUID(),
    csrf: crypto.randomUUID(),
    expiresAt: futureIso(24),
  };
  session.expiresAt = futureIso(24);
  store.sessions.set(session.id, session);
  const response = NextResponse.json(
    { csrfToken: session.csrf, expiresAt: session.expiresAt },
    { status: 201 },
  );
  response.cookies.set(SESSION_COOKIE, session.id, cookieOptions(session.expiresAt));
  return response;
}

function createDraftState(owner: string, requestText: string): DraftState {
  const lower = requestText.toLowerCase();
  const placeType = lower.includes("음식") || lower.includes("식당")
    ? "RESTAURANT"
    : lower.includes("술") || lower.includes("바 ")
      ? "BAR"
      : "CAFE";
  const partyMatch = requestText.match(/(\d+)\s*명/);
  const budgetMatch = requestText.match(/(\d+)\s*만\s*원/);
  const preferences = ["조용", "디저트", "대화", "분위기"]
    .filter((keyword) => requestText.includes(keyword))
    .map((value) => ({ value, priority: null }));
  const exclusions = ["흡연", "시끄러운", "웨이팅"]
    .filter((keyword) => requestText.includes(keyword));
  return {
    owner,
    draftId: crypto.randomUUID(),
    status: "EXTRACTED",
    extractedCondition: {
      locationQuery: requestText.includes("성수") ? "서울 성수" : requestText.includes("강남") ? "서울 강남" : "서울",
      placeType,
      placeTypeDetail: null,
      partySize: partyMatch ? Number(partyMatch[1]) : null,
      budgetPerPersonMin: null,
      budgetPerPersonMax: budgetMatch ? Number(budgetMatch[1]) * 10_000 : null,
      preferences,
      exclusions,
    },
    warnings: [
      ...(partyMatch ? [] : ["PARTY_SIZE_NOT_PROVIDED"]),
      ...(budgetMatch ? [] : ["BUDGET_NOT_PROVIDED"]),
    ],
    expiresAt: futureIso(0.5),
  };
}

function createJobState(owner: string, condition: ProductCondition): JobState {
  const now = new Date().toISOString();
  return {
    owner,
    sequence: 0,
    listeners: new Set(),
    jobId: crypto.randomUUID(),
    status: "ACCEPTED",
    stage: "QUEUED",
    progress: 0,
    degraded: false,
    warnings: ["BUDGET_EVIDENCE_UNAVAILABLE"],
    condition,
    places: [],
    failure: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: futureIso(1),
  };
}

function scheduleJob(job: JobState): void {
  const steps: Array<[ProductJob["stage"], number]> = [
    ["LOCAL_SEARCH", 20],
    ["BLOG_SEARCH", 45],
    ["SCORING", 65],
    ["REASON_GENERATION", 82],
    ["PERSISTING", 95],
  ];
  steps.forEach(([stage, progress], index) => {
    setTimeout(() => {
      job.status = "PROCESSING";
      job.stage = stage;
      job.progress = progress;
      job.updatedAt = new Date().toISOString();
      emitJob(job, "progress");
    }, 280 * (index + 1));
  });
  setTimeout(() => {
    job.status = "COMPLETED";
    job.stage = "FINISHED";
    job.progress = 100;
    job.places = productPlaces();
    job.updatedAt = new Date().toISOString();
    emitJob(job, "completed");
  }, 280 * (steps.length + 1));
}

function productPlaces(): ProductPlace[] {
  return [
    productPlace("고요한 서재", "카페, 디저트", "서울 성동구 성수이로 11", 80, 15, 10),
    productPlace("초록 창가", "카페", "서울 성동구 연무장길 22", 77, 12, 10),
    productPlace("느린 오후", "카페, 베이커리", "서울 성동구 아차산로 33", 72, 10, 7),
  ];
}

function productPlace(
  name: string,
  category: string,
  roadAddress: string,
  score: number,
  preference: number,
  blogEvidence: number,
): ProductPlace {
  const placeId = crypto.randomUUID();
  return {
    placeId,
    name,
    category,
    roadAddress,
    address: roadAddress,
    sourceUrl: `https://example.com/places/${placeId}`,
    score,
    scoreBreakdown: { location: 30, placeType: 25, budget: 0, preference, blogEvidence },
    reasonStatements: [
      { text: "요청한 지역과 장소 유형에 맞고 연결된 검색 근거가 있습니다.", evidenceIds: [`local:${placeId}`] },
      { text: "선호 조건과 관련된 Blog 근거가 후보명에 연결되어 있습니다.", evidenceIds: [`blog:${placeId}`] },
    ],
    cautions: ["가격과 실시간 영업 여부는 방문 전에 원문에서 확인해 주세요."],
    shareText: `${name} 후보를 함께 확인해 보세요.`,
    evidenceLevel: "LOCAL_AND_BLOG",
    warnings: ["BUDGET_EVIDENCE_UNAVAILABLE"],
  };
}

function createRoomState(owner: string, places: ProductPlace[], hours: number): RoomState {
  return {
    roomId: crypto.randomUUID(),
    shareToken: `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`,
    status: "OPEN",
    places,
    votes: new Map(),
    organizerSession: owner,
    finalizedPlaceId: null,
    finalizedAt: null,
    expiresAt: futureIso(hours),
    sequence: 0,
    listeners: new Set(),
  };
}

function jobStream(job: JobState): Response {
  let listener: ((event: string, value: JobState) => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, value: JobState) => {
        const eventId = String(++value.sequence);
        controller.enqueue(sse(event, eventId, value.jobId, publicJob(value)));
        if (event === "completed" || event === "failed") {
          if (listener) value.listeners.delete(listener);
          if (heartbeat) clearInterval(heartbeat);
          controller.close();
        }
      };
      if (job.status === "COMPLETED") {
        send("completed", job);
        return;
      }
      if (job.status === "FAILED") {
        send("failed", job);
        return;
      }
      send("snapshot", job);
      listener = send;
      job.listeners.add(listener);
      heartbeat = setInterval(() => {
        const eventId = String(++job.sequence);
        controller.enqueue(sse("heartbeat", eventId, job.jobId));
      }, 15_000);
    },
    cancel() {
      if (listener) job.listeners.delete(listener);
      if (heartbeat) clearInterval(heartbeat);
    },
  });
  return streamResponse(stream);
}

function roomStream(room: RoomState, sessionId: string, organizer: boolean): Response {
  let listener: ((event: string) => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string) => {
        const eventId = String(++room.sequence);
        controller.enqueue(sse(event, eventId, room.roomId, publicRoom(room, sessionId, organizer)));
        if (event === "finalized") {
          if (listener) room.listeners.delete(listener);
          if (heartbeat) clearInterval(heartbeat);
          controller.close();
        }
      };
      if (room.status === "FINALIZED") {
        send("finalized");
        return;
      }
      send("snapshot");
      listener = send;
      room.listeners.add(listener);
      heartbeat = setInterval(() => {
        const eventId = String(++room.sequence);
        controller.enqueue(sse("heartbeat", eventId, room.roomId));
      }, 15_000);
    },
    cancel() {
      if (listener) room.listeners.delete(listener);
      if (heartbeat) clearInterval(heartbeat);
    },
  });
  return streamResponse(stream);
}

function emitJob(job: JobState, event: string): void {
  [...job.listeners].forEach((listener) => listener(event, job));
}

function emitRoom(room: RoomState, event: string): void {
  [...room.listeners].forEach((listener) => listener(event));
}

function sse(event: string, id: string, aggregateId: string, snapshot?: unknown): Uint8Array {
  const data = JSON.stringify({
    eventId: id,
    occurredAt: new Date().toISOString(),
    aggregateId,
    ...(snapshot === undefined ? {} : { snapshot }),
  });
  return encoder.encode(`id: ${id}\nevent: ${event}\ndata: ${data}\n\n`);
}

function streamResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function publicDraft(draft: DraftState): ProductDraft {
  const { owner: _owner, ...view } = draft;
  return view;
}

function publicJob(job: JobState): ProductJob {
  const { owner: _owner, sequence: _sequence, listeners: _listeners, ...view } = job;
  return structuredClone(view);
}

function publicRoom(room: RoomState, sessionId: string, organizer: boolean): ProductRoom {
  const myVotes: Record<string, VoteValue> = {};
  room.places.forEach((place) => {
    const vote = room.votes.get(`${sessionId}:${place.placeId}`);
    if (vote) myVotes[place.placeId] = vote;
  });
  return {
    roomId: room.roomId,
    shareToken: room.shareToken,
    status: room.status,
    places: room.places,
    aggregate: aggregate(room),
    myVotes,
    canFinalize: organizer,
    finalizedPlaceId: room.finalizedPlaceId,
    expiresAt: room.expiresAt,
  };
}

function aggregate(room: RoomState) {
  return room.places.map((place) => {
    let likeCount = 0;
    let dislikeCount = 0;
    room.votes.forEach((vote, key) => {
      if (!key.endsWith(`:${place.placeId}`)) return;
      if (vote === "LIKE") likeCount += 1;
      else dislikeCount += 1;
    });
    return { placeId: place.placeId, likeCount, dislikeCount };
  });
}

function finalResult(room: RoomState): FinalResult {
  const place = room.places.find((value) => value.placeId === room.finalizedPlaceId);
  if (!place || !room.finalizedAt) throw apiFailure(409, "RESULT_NOT_FINALIZED", "최종 결과가 없습니다.");
  return { place, finalizedAt: room.finalizedAt };
}

function requireSession(request: NextRequest): MockSession {
  const id = request.cookies.get(SESSION_COOKIE)?.value;
  const session = id == null ? null : store.sessions.get(id);
  if (!session) throw apiFailure(401, "SESSION_REQUIRED", "익명 세션이 필요합니다.");
  return session;
}

function requireMutation(request: NextRequest, session: MockSession, idempotency: boolean): void {
  if (request.headers.get("x-csrf-token") !== session.csrf) {
    throw apiFailure(403, "CSRF_INVALID", "요청 검증 token이 올바르지 않습니다.");
  }
  if (idempotency && !request.headers.get("idempotency-key")) {
    throw apiFailure(400, "INVALID_REQUEST", "Idempotency-Key가 필요합니다.");
  }
}

function ownedDraft(id: string, owner: string): DraftState {
  const draft = store.drafts.get(id);
  if (!draft || draft.owner !== owner) throw apiFailure(404, "RESOURCE_NOT_FOUND", "Draft를 찾을 수 없습니다.");
  return draft;
}

function ownedJob(id: string, owner: string): JobState {
  const job = store.jobs.get(id);
  if (!job || job.owner !== owner) throw apiFailure(404, "RESOURCE_NOT_FOUND", "추천 작업을 찾을 수 없습니다.");
  return job;
}

function requireRoom(token: string): RoomState {
  const room = store.rooms.get(token);
  if (!room) throw apiFailure(404, "RESOURCE_NOT_FOUND", "공유방을 찾을 수 없습니다.");
  return room;
}

function requireRoomPlace(room: RoomState, placeId: string): string {
  if (!room.places.some((place) => place.placeId === placeId)) {
    throw apiFailure(400, "INVALID_REQUEST", "공유방 후보가 아닙니다.");
  }
  return placeId;
}

function requireOpenRoom(room: RoomState): void {
  if (room.status !== "OPEN") throw apiFailure(409, "INVALID_STATE", "확정된 방에서는 투표를 변경할 수 없습니다.");
}

function validateCondition(source: unknown): ProductCondition {
  if (source == null || typeof source !== "object" || Array.isArray(source)) {
    throw apiFailure(400, "INVALID_CONDITION", "확정 조건이 필요합니다.");
  }
  const value = source as Record<string, unknown>;
  const locationQuery = requireText(value.locationQuery, "locationQuery", 100);
  if (!["RESTAURANT", "CAFE", "BAR", "OTHER"].includes(String(value.placeType))) {
    throw apiFailure(400, "INVALID_CONDITION", "장소 유형을 확인해 주세요.");
  }
  const preferences = Array.isArray(value.preferences) ? value.preferences.map((item) => {
    const preference = item as Record<string, unknown>;
    const priority = requireInteger(preference.priority, "priority");
    if (priority < 1 || priority > 10) throw apiFailure(400, "INVALID_CONDITION", "선호 우선순위는 1~10입니다.");
    return { value: requireText(preference.value, "preference.value", 50), priority };
  }) : [];
  return {
    locationQuery,
    placeType: value.placeType as ProductCondition["placeType"],
    placeTypeDetail: typeof value.placeTypeDetail === "string" ? value.placeTypeDetail : null,
    partySize: nullableNumber(value.partySize),
    budgetPerPersonMin: nullableNumber(value.budgetPerPersonMin),
    budgetPerPersonMax: nullableNumber(value.budgetPerPersonMax),
    preferences,
    exclusions: Array.isArray(value.exclusions) ? value.exclusions.map((item) => requireText(item, "exclusion", 50)) : [],
  };
}

function nullableNumber(value: unknown): number | null {
  return value == null ? null : requireInteger(value, "number");
}

async function jsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const value = await request.json() as unknown;
    if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw apiFailure(400, "INVALID_REQUEST", "JSON 요청 본문을 확인해 주세요.");
  }
}

function match(path: string[], value: string): boolean {
  return path.length === 1 && path[0] === value;
}

function requireText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || [...value].length > maximum) {
    throw apiFailure(400, "INVALID_REQUEST", `${field} 값을 확인해 주세요.`);
  }
  return value.trim();
}

function requireInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw apiFailure(400, "INVALID_REQUEST", `${field} 정수 값을 확인해 주세요.`);
  }
  return value;
}

function futureIso(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1_000).toISOString();
}

function cookieOptions(expiresAt: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  };
}

interface ApiFailure extends Error {
  status: number;
  errorCode: string;
}

function apiFailure(status: number, errorCode: string, message: string): ApiFailure {
  return Object.assign(new Error(message), { status, errorCode });
}

function problemResponse(error: unknown, instance: string): NextResponse {
  const failure = isApiFailure(error)
    ? error
    : apiFailure(500, "INTERNAL_ERROR", "Mock 제품 흐름을 처리하지 못했습니다.");
  return NextResponse.json(
    {
      type: `urn:placepick:error:${failure.errorCode.toLowerCase()}`,
      title: "PlacePick API error",
      status: failure.status,
      detail: failure.message,
      instance,
      errorCode: failure.errorCode,
      traceId: crypto.randomUUID(),
    },
    { status: failure.status, headers: { "Content-Type": "application/problem+json" } },
  );
}

function isApiFailure(error: unknown): error is ApiFailure {
  return error instanceof Error &&
    typeof (error as Partial<ApiFailure>).status === "number" &&
    typeof (error as Partial<ApiFailure>).errorCode === "string";
}
