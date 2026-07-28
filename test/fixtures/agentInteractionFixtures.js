export const FIXTURE_BROWSER_BINDING_ID =
  "44c96b3d-c657-4a41-876b-a26b53178f59";
export const FIXTURE_CLIENT_REQUEST_ID =
  "5d8afe40-bdb7-4d9d-9118-c7b43174cd0e";

export function createRuntimeTelemetryObservation(overrides = {}) {
  return {
    type: "runtime_telemetry",
    source: "system_monitor",
    schemaVersion: "v1",
    observedAt: "2026-07-28T00:00:00.000Z",
    confidence: 0.72,
    uncertainty: 0.28,
    features: [
      { name: "cpuLoad", value: 0.51 },
      { name: "memoryPressure", value: 0.43 }
    ],
    ...overrides
  };
}

export function createAgentInteractionRequest(overrides = {}) {
  return {
    browserBindingId: FIXTURE_BROWSER_BINDING_ID,
    clientRequestId: FIXTURE_CLIENT_REQUEST_ID,
    message: {
      text: "이전과 같은 작업을 계속해줘."
    },
    sensoryObservations: [createRuntimeTelemetryObservation()],
    ...overrides
  };
}
