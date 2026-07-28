const DEFAULT_API_BASE_URL = "http://127.0.0.1:3000";
const configuredApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;

export class AgentInteractionApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = "AgentInteractionApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function requestJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);
  let payload;

  try {
    payload = await response.json();
  } catch {
    throw new AgentInteractionApiError(
      "The API returned an invalid JSON response.",
      {
        status: response.status,
        code: "INVALID_API_RESPONSE"
      }
    );
  }

  if (!response.ok || payload.success !== true) {
    throw new AgentInteractionApiError(
      payload.error?.message || "The agent interaction request failed.",
      {
        status: response.status,
        code: payload.error?.code || "API_REQUEST_FAILED",
        details: payload.error?.details
      }
    );
  }

  const interaction = payload.data?.interaction;

  if (
    !interaction ||
    typeof interaction.response?.actionType !== "string" ||
    typeof interaction.response?.text !== "string"
  ) {
    throw new AgentInteractionApiError(
      "The API response does not include a valid interaction.",
      {
        status: 502,
        code: "INVALID_API_RESPONSE"
      }
    );
  }

  return {
    interaction,
    replayed: Boolean(payload.meta?.replayed)
  };
}

export function createAgentInteractionApi({
  baseUrl = configuredApiBaseUrl,
  fetchImpl = (...args) => globalThis.fetch(...args)
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function.");
  }

  const normalizedBaseUrl = String(baseUrl || DEFAULT_API_BASE_URL).replace(
    /\/+$/,
    ""
  );
  const endpoint = `${normalizedBaseUrl}/api/agent-interactions`;

  return {
    createInteraction(payload, { signal } = {}) {
      return requestJson(fetchImpl, endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal
      });
    }
  };
}

const defaultApi = createAgentInteractionApi();

export const createInteraction = (...args) =>
  defaultApi.createInteraction(...args);
