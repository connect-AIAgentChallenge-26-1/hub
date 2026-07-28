import { describe, expect, it } from "vitest";
import { deriveInteractionFactors } from "./deriveInteractionFactors.js";

function createObservation(type, source, features, overrides = {}) {
  return {
    type,
    source,
    schemaVersion: "v1",
    observedAt: "2026-07-28T00:00:00.000Z",
    confidence: 1,
    uncertainty: 0.1,
    features,
    ...overrides
  };
}

describe("deriveInteractionFactors", () => {
  it("maps runtime telemetry to processing workload", () => {
    const factors = deriveInteractionFactors({
      messageText: "",
      sensoryObservations: [
        createObservation(
          "runtime_telemetry",
          "system_monitor",
          [
            { name: "cpuLoad", value: 0.8 },
            { name: "memoryPressure", value: 0.6 }
          ]
        )
      ]
    });

    expect(factors.workload).toBeCloseTo(0.315);
    expect(factors.observationMismatch).toBe(0);
  });

  it("maps task context to machine-state factors without text labels", () => {
    const factors = deriveInteractionFactors({
      messageText: "다음 작업",
      previousInteraction: { userMessage: "이전 작업" },
      sensoryObservations: [
        createObservation(
          "task_context",
          "client_observation",
          [
            { name: "ambiguity", value: 0.8 },
            { name: "novelty", value: 0.9 },
            { name: "goalCompetition", value: 0.7 },
            { name: "continuityBreak", value: 0.6 }
          ],
          { confidence: 0.5, uncertainty: 0.2 }
        )
      ]
    });

    expect(factors).toMatchObject({
      observationMismatch: 0.4,
      goalCompetition: 0.35,
      continuityBreak: 0.3,
      novelty: 0.45,
      interactionDisruption: 0.3
    });
    expect(factors.continuityEvidence).toBeCloseTo(0.14);
  });
});
