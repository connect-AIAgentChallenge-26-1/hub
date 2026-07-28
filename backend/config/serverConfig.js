const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

export const SERVER_DEFAULTS = Object.freeze({
  port: 3000,
  allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
  rateLimitWindowMs: 15 * 60 * 1000,
  rateLimitMaximum: 100,
  jsonBodyLimit: "100kb",
  agentInteractionsEnabled: false
});

function readPositiveInteger(value, fallback) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return fallback;

  const number = Number.parseInt(value, 10);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function readBodyLimit(value) {
  if (typeof value !== "string") return SERVER_DEFAULTS.jsonBodyLimit;

  const normalized = value.trim().toLowerCase();
  return /^\d+(?:b|kb|mb)$/.test(normalized)
    ? normalized
    : SERVER_DEFAULTS.jsonBodyLimit;
}

function readAllowedOrigins(value) {
  const configuredOrigins =
    typeof value === "string"
      ? value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)
          .map((origin) => {
            try {
              const url = new URL(origin);
              return url.protocol === "http:" || url.protocol === "https:"
                ? url.origin
                : null;
            } catch {
              return null;
            }
          })
          .filter(Boolean)
      : [];

  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins])];
}

function readBoolean(value, fallback) {
  if (typeof value !== "string") return fallback;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
}

export function createServerConfig(environment = {}) {
  return {
    port: readPositiveInteger(
      environment.PORT ?? environment.SERVER_PORT,
      SERVER_DEFAULTS.port
    ),
    allowedOrigins: readAllowedOrigins(environment.CLIENT_URL),
    rateLimitWindowMs: readPositiveInteger(
      environment.API_RATE_LIMIT_WINDOW_MS,
      SERVER_DEFAULTS.rateLimitWindowMs
    ),
    rateLimitMaximum: readPositiveInteger(
      environment.API_RATE_LIMIT_MAX,
      SERVER_DEFAULTS.rateLimitMaximum
    ),
    jsonBodyLimit: readBodyLimit(environment.JSON_BODY_LIMIT),
    agentInteractionsEnabled: readBoolean(
      environment.AGENT_INTERACTIONS_ENABLED,
      SERVER_DEFAULTS.agentInteractionsEnabled
    )
  };
}
