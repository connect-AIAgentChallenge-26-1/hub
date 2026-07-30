import { ApiError } from "@google/genai";

export type AiErrorCode = "AI_QUOTA_EXCEEDED" | "AI_REQUEST_FAILED";

// Every Gemini call site (chat, analysis report, code/refactor Agent) throws
// this instead of the raw SDK error, so routes/clients only ever have to
// handle one stable shape rather than parsing Google's error JSON themselves.
export class AiRequestError extends Error {
  code: AiErrorCode;
  status: number;
  retryAfter: string | null;

  constructor(code: AiErrorCode, message: string, status: number, retryAfter: string | null) {
    super(message);
    this.name = "AiRequestError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

// The @google/genai SDK throws ApiError with `message` set to
// JSON.stringify(<Google error body>) — e.g.
// {"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"@type":"...RetryInfo","retryDelay":"37s"}]}}
function extractRetryDelay(rawMessage: string): string | null {
  try {
    const parsed = JSON.parse(rawMessage) as {
      error?: { details?: Array<{ retryDelay?: string }> };
    };
    const detail = parsed.error?.details?.find((d) => typeof d.retryDelay === "string");
    return detail?.retryDelay ?? null;
  } catch {
    return null;
  }
}

export function isQuotaExceededError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 429;
}

// Converts any error from a Gemini call into the one shape the rest of the
// app relies on — 429/RESOURCE_EXHAUSTED becomes AI_QUOTA_EXCEEDED with a
// human message, everything else (network errors, auth failures, malformed
// responses) becomes a generic AI_REQUEST_FAILED. Callers must not retry
// on AI_QUOTA_EXCEEDED — an exhausted daily quota won't recover within the
// same request, and retrying only burns quota further once it resets.
export function toAiRequestError(err: unknown): AiRequestError {
  if (isQuotaExceededError(err)) {
    const retryAfter = extractRetryDelay((err as ApiError).message);
    return new AiRequestError(
      "AI_QUOTA_EXCEEDED",
      "일일 AI 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.",
      429,
      retryAfter
    );
  }

  return new AiRequestError("AI_REQUEST_FAILED", "AI 응답 생성에 실패했습니다.", 502, null);
}

// Shared shape for route catch blocks: AiRequestError surfaces its code/
// retryAfter alongside the message, anything else (validation errors, etc.)
// falls back to a plain error string exactly as before.
export function toErrorResponseBody(
  err: unknown
): { error: string; code?: AiErrorCode; retryAfter?: string | null } {
  if (err instanceof AiRequestError) {
    return { error: err.message, code: err.code, retryAfter: err.retryAfter };
  }
  return { error: err instanceof Error ? err.message : String(err) };
}
