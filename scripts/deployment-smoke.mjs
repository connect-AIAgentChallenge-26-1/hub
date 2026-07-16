#!/usr/bin/env node

import { randomUUID } from "node:crypto";

const API_REQUEST_TIMEOUT_MS = 30_000;
const COLD_START_WINDOW_MS = 90_000;
const RETRYABLE_PROXY_STATUSES = new Set([502, 503, 504]);

let origin;

async function main() {
  try {
    const rawOrigin = process.env.PLACEPICK_PUBLIC_ORIGIN;
    if (!rawOrigin) fail("configuration", "PLACEPICK_PUBLIC_ORIGIN is required");

    origin = approvedOrigin(rawOrigin);
    const organizer = new CookieJar();
    const participant = new CookieJar();

  const organizerSession = await createSession(organizer);
  safeLog("anonymous-session", "passed");

  const draft = await jsonRequest(organizer, "/api/v1/recommendation-drafts", {
    method: "POST",
    csrf: organizerSession.csrfToken,
    idempotency: true,
    body: {
      requestText: "서울에서 두 명이 조용하게 대화할 수 있는 디저트 카페를 찾습니다.",
    },
    expectedStatus: 201,
  });
  requireUuid(draft.draftId, "draftId");
  requireObject(draft.extractedCondition, "extractedCondition");
  safeLog("condition-extraction", "passed");

  const confirmed = await jsonRequest(
    organizer,
    `/api/v1/recommendation-drafts/${encodeURIComponent(draft.draftId)}`,
    {
      method: "PUT",
      csrf: organizerSession.csrfToken,
      body: {
        condition: {
          locationQuery: "서울",
          placeType: "CAFE",
          placeTypeDetail: null,
          partySize: 2,
          budgetPerPersonMin: null,
          budgetPerPersonMax: null,
          preferences: [{ value: "디저트", priority: 10 }],
          exclusions: [],
        },
      },
      expectedStatus: 200,
    },
  );
  if (confirmed.status !== "CONFIRMED") {
    fail("draft-confirmation", "draft status is not CONFIRMED");
  }
  safeLog("draft-confirmation", "passed");

  const acceptedResponse = await rawRequest(organizer, "/api/v1/recommendations", {
    method: "POST",
    csrf: organizerSession.csrfToken,
    idempotency: true,
    body: { draftId: draft.draftId },
    expectedStatus: 202,
  });
  const accepted = await safeJson(acceptedResponse, "job-acceptance");
  requireUuid(accepted.jobId, "jobId");
  if (accepted.status !== "ACCEPTED") fail("job-acceptance", "status is not ACCEPTED");
  const location = acceptedResponse.headers.get("location");
  if (location !== `/api/v1/recommendations/${accepted.jobId}`) {
    fail("job-acceptance", "Location does not identify the accepted job");
  }
  safeLog("job-acceptance", "passed");

  await observeJob(organizer, accepted.jobId);
  const job = await jsonRequest(
    organizer,
    `/api/v1/recommendations/${encodeURIComponent(accepted.jobId)}`,
    { expectedStatus: 200 },
  );
  if (job.status !== "COMPLETED" || !Array.isArray(job.places) || job.places.length !== 3) {
    fail("recommendation-result", "job did not complete with exactly three places");
  }
  for (const place of job.places) {
    requireUuid(place.placeId, "placeId");
    if (!Array.isArray(place.reasonStatements) || place.reasonStatements.length < 1) {
      fail("recommendation-result", "a place has no verified recommendation reason");
    }
  }
  safeLog("recommendation-result", "passed");

  const room = await jsonRequest(
    organizer,
    `/api/v1/recommendations/${encodeURIComponent(accepted.jobId)}/rooms`,
    {
      method: "POST",
      csrf: organizerSession.csrfToken,
      idempotency: true,
      body: { expiresInHours: 72 },
      expectedStatus: 201,
    },
  );
  requireOpaque(room.shareToken, "shareToken");
  safeLog("room-creation", "passed");

  const participantSession = await createSession(participant);
  const selectedPlaceId = job.places[0].placeId;
  await observeRoom(organizer, room.shareToken, async () => {
    const like = await jsonRequest(
      participant,
      `/api/v1/rooms/${encodeURIComponent(room.shareToken)}/votes/${selectedPlaceId}`,
      {
        method: "PUT",
        csrf: participantSession.csrfToken,
        body: { value: "LIKE" },
        expectedStatus: 200,
      },
    );
    if (like.myVote !== "LIKE") fail("room-vote", "LIKE was not persisted");
    const dislike = await jsonRequest(
      participant,
      `/api/v1/rooms/${encodeURIComponent(room.shareToken)}/votes/${selectedPlaceId}`,
      {
        method: "PUT",
        csrf: participantSession.csrfToken,
        body: { value: "DISLIKE" },
        expectedStatus: 200,
      },
    );
    if (dislike.myVote !== "DISLIKE") fail("room-vote", "DISLIKE replacement was not persisted");
    await rawRequest(
      participant,
      `/api/v1/rooms/${encodeURIComponent(room.shareToken)}/votes/${selectedPlaceId}`,
      {
        method: "DELETE",
        csrf: participantSession.csrfToken,
        expectedStatus: 204,
      },
    );
    const restored = await jsonRequest(
      participant,
      `/api/v1/rooms/${encodeURIComponent(room.shareToken)}/votes/${selectedPlaceId}`,
      {
        method: "PUT",
        csrf: participantSession.csrfToken,
        body: { value: "LIKE" },
        expectedStatus: 200,
      },
    );
    if (restored.myVote !== "LIKE") fail("room-vote", "LIKE was not restored after deletion");
    await jsonRequest(
      organizer,
      `/api/v1/rooms/${encodeURIComponent(room.shareToken)}/final-result`,
      {
        method: "PUT",
        csrf: organizerSession.csrfToken,
        idempotency: true,
        body: { placeId: selectedPlaceId },
        expectedStatus: 200,
      },
    );
  });
  safeLog("room-vote-and-finalization", "passed");

  const result = await jsonRequest(
    participant,
    `/api/v1/rooms/${encodeURIComponent(room.shareToken)}/result`,
    { expectedStatus: 200 },
  );
  if (result?.place?.placeId !== selectedPlaceId || typeof result.finalizedAt !== "string") {
    fail("final-result", "the shared final result does not match the organizer decision");
  }
  safeLog("final-result", "passed");
  console.log("DEPLOYMENT_SMOKE status=passed userFlow=complete providerDataLogged=false");
  } catch (error) {
    if (error instanceof SmokeFailure) {
      console.error(`DEPLOYMENT_SMOKE status=failed stage=${error.stage} reason=${error.reason}`);
    } else {
      console.error("DEPLOYMENT_SMOKE status=failed stage=unexpected reason=unclassified");
    }
    process.exitCode = 1;
  }
}

async function createSession(jar) {
  const body = await jsonRequest(jar, "/api/v1/anonymous-sessions", {
    method: "POST",
    expectedStatus: 201,
    coldStartRetry: true,
  });
  requireOpaque(body.csrfToken, "csrfToken");
  if (typeof body.expiresAt !== "string") fail("anonymous-session", "expiresAt is missing");
  return body;
}

async function observeJob(jar, jobId) {
  let firstStateEvent = true;
  let previousProgress = -1;
  let terminal = false;
  await consumeSse(
    jar,
    `/api/v1/recommendations/${encodeURIComponent(jobId)}/events`,
    300_000,
    async ({ event, data }) => {
      if (event === "heartbeat") return false;
      if (firstStateEvent && event !== "snapshot") {
        fail("recommendation-sse", "the first state event is not snapshot");
      }
      firstStateEvent = false;
      requireStreamEnvelope(data, jobId, "recommendation-sse");
      const snapshot = requireObject(data.snapshot, "job snapshot");
      if (!Number.isInteger(snapshot.progress) || snapshot.progress < previousProgress) {
        fail("recommendation-sse", "progress regressed or is invalid");
      }
      previousProgress = snapshot.progress;
      if (snapshot.status === "FAILED" || event === "failed") {
        fail("recommendation-sse", "recommendation reached a failed terminal state");
      }
      terminal = snapshot.status === "COMPLETED" || event === "completed";
      return terminal;
    },
  );
  if (!terminal) fail("recommendation-sse", "stream closed before a terminal snapshot");
  safeLog("recommendation-sse", "passed");
}

async function observeRoom(jar, shareToken, mutate) {
  let firstStateEvent = true;
  let actionStarted = false;
  let sawVote = false;
  let sawFinalized = false;
  let actionPromise;
  let actionError;
  let roomAggregateId;
  await consumeSse(
    jar,
    `/api/v1/rooms/${encodeURIComponent(shareToken)}/events`,
    90_000,
    async ({ event, data }) => {
      if (event === "heartbeat") return false;
      if (firstStateEvent && event !== "snapshot") {
        fail("room-sse", "the first state event is not snapshot");
      }
      firstStateEvent = false;
      requireStreamEnvelope(data, roomAggregateId, "room-sse");
      roomAggregateId ??= data.aggregateId;
      requireObject(data.snapshot, "room snapshot");
      if (event === "voteUpdated") sawVote = true;
      if (event === "finalized") sawFinalized = true;
      return sawVote && sawFinalized;
    },
    async () => {
      if (actionStarted) return;
      actionStarted = true;
      actionPromise = mutate().catch((error) => {
        actionError = error;
      });
    },
  );
  await actionPromise;
  if (actionError) throw actionError;
  if (!sawVote || !sawFinalized) {
    fail("room-sse", "vote and finalization events were not both observed");
  }
}

async function consumeSse(jar, path, timeoutMs, onEvent, onConnected) {
  const deadline = Date.now() + timeoutMs;
  let lastEventId;
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const remaining = deadline - Date.now();
    const timeout = setTimeout(() => controller.abort(), remaining);
    try {
      const headers = {
        Accept: "text/event-stream",
        Cookie: jar.header(),
        Origin: origin,
      };
      if (lastEventId) headers["Last-Event-ID"] = lastEventId;
      const response = await fetch(new URL(path, origin), {
        headers,
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (RETRYABLE_PROXY_STATUSES.has(response.status)) {
        await boundedDelay(deadline, 1_000);
        continue;
      }
      if (response.status !== 200 || !response.headers.get("content-type")?.includes("text/event-stream")) {
        fail("sse-connect", `unexpected HTTP status ${response.status}`);
      }
      if (!response.body) fail("sse-connect", "response body is missing");
      await onConnected?.();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const parsed = parseSse(frame);
          if (!parsed) continue;
          if (parsed.id) {
            if (!/^\d+$/.test(parsed.id)) fail("sse-schema", "event id is not numeric");
            if (lastEventId && BigInt(parsed.id) < BigInt(lastEventId)) {
              fail("sse-schema", "event id regressed after reconnect");
            }
            lastEventId = parsed.id;
          }
          if (await onEvent(parsed)) {
            await reader.cancel();
            return;
          }
        }
        if (done) break;
      }
    } catch (error) {
      if (error instanceof SmokeFailure) throw error;
      if (error?.name === "AbortError" && Date.now() >= deadline) {
        fail("sse-timeout", "stream exceeded its bounded timeout");
      }
      await boundedDelay(deadline, 1_000);
    } finally {
      clearTimeout(timeout);
    }
    await boundedDelay(deadline, 500);
  }
  fail("sse-timeout", "stream exceeded its bounded timeout");
}

function parseSse(frame) {
  let event = "message";
  let id;
  const data = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("id:")) id = line.slice(3).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return null;
  try {
    return { event, id, data: JSON.parse(data.join("\n")) };
  } catch {
    fail("sse-schema", "event data is not valid JSON");
  }
}

async function jsonRequest(jar, path, options) {
  return safeJson(await rawRequest(jar, path, options), "api-response");
}

async function rawRequest(jar, path, options) {
  const headers = { Accept: "application/json, application/problem+json" };
  headers.Origin = origin;
  const cookie = jar.header();
  if (cookie) headers.Cookie = cookie;
  if (options.csrf) headers["X-CSRF-Token"] = options.csrf;
  if (options.idempotency) headers["Idempotency-Key"] = randomUUID();
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const deadline = Date.now() + (options.coldStartRetry
    ? COLD_START_WINDOW_MS
    : API_REQUEST_TIMEOUT_MS);
  let response;
  while (Date.now() < deadline) {
    const attemptTimeout = Math.min(API_REQUEST_TIMEOUT_MS, deadline - Date.now());
    try {
      response = await fetch(new URL(path, origin), {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(attemptTimeout),
      });
    } catch (error) {
      if (!options.coldStartRetry || Date.now() >= deadline) {
        fail("api-request", "request transport failed within its bounded timeout");
      }
      await boundedDelay(deadline, 2_000);
      continue;
    }
    if (options.coldStartRetry && RETRYABLE_PROXY_STATUSES.has(response.status)) {
      await response.body?.cancel();
      await boundedDelay(deadline, 2_000);
      continue;
    }
    break;
  }
  if (!response) fail("api-request", "cold start exceeded 90 seconds");
  jar.capture(response.headers);
  if (response.status !== options.expectedStatus) {
    let errorCode = "UNAVAILABLE";
    try {
      const problem = await response.json();
      if (typeof problem?.errorCode === "string" && /^[A-Z0-9_]{1,64}$/.test(problem.errorCode)) {
        errorCode = problem.errorCode;
      }
    } catch {
      // The provider/application body is intentionally not reported.
    }
    fail("api-request", `unexpected HTTP status ${response.status} errorCode=${errorCode}`);
  }
  return response;
}

async function boundedDelay(deadline, preferredMs) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, Math.min(preferredMs, remaining)));
}

async function safeJson(response, stage) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) fail(stage, "response is not JSON");
  try {
    return await response.json();
  } catch {
    fail(stage, "response JSON is malformed");
  }
}

function requireStreamEnvelope(data, aggregateId, stage) {
  requireObject(data, "stream envelope");
  if (typeof data.eventId !== "string" || !/^\d+$/.test(data.eventId)) {
    fail(stage, "eventId is not a numeric stream cursor");
  }
  if (typeof data.occurredAt !== "string" || typeof data.aggregateId !== "string") {
    fail(stage, "stream metadata is missing");
  }
  if (aggregateId && data.aggregateId !== aggregateId) fail(stage, "aggregateId changed");
}

function approvedOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("configuration", "public origin is not a URL");
  }
  const loopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  const localVerification = process.env.PLACEPICK_SMOKE_ALLOW_LOOPBACK === "true" && !process.env.CI;
  const protocolAllowed = parsed.protocol === "https:" ||
    (localVerification && loopback && parsed.protocol === "http:");
  if (!protocolAllowed || parsed.username || parsed.password || parsed.search || parsed.hash) {
    fail("configuration", "public origin must be credential-free HTTPS");
  }
  parsed.pathname = "/";
  return parsed.origin;
}

function requireObject(value, field) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    fail("schema", `${field} is not an object`);
  }
  return value;
}

function requireUuid(value, field) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    fail("schema", `${field} is not UUID v4`);
  }
}

function requireOpaque(value, field) {
  if (typeof value !== "string" || value.length < 32 || /\s/.test(value)) {
    fail("schema", `${field} is not an opaque value`);
  }
}

function safeLog(stage, status) {
  console.log(`DEPLOYMENT_SMOKE stage=${stage} status=${status}`);
}

function fail(stage, reason) {
  throw new SmokeFailure(stage, reason);
}

class SmokeFailure extends Error {
  constructor(stage, reason) {
    super(reason);
    this.stage = String(stage).replace(/[^a-zA-Z0-9/_-]/g, "_");
    this.reason = String(reason).replace(/[^a-zA-Z0-9 =/_-]/g, "_").slice(0, 160);
  }
}

class CookieJar {
  #values = new Map();

  capture(headers) {
    const values = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie")].filter(Boolean);
    for (const source of values) {
      const pair = source.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator > 0) this.#values.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  header() {
    return [...this.#values].map(([key, value]) => `${key}=${value}`).join("; ");
  }
}

await main();
