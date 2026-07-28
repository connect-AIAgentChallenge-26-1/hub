import { describe, expect, it } from "vitest";
import {
  createAgentInteractionRequest,
  createRuntimeTelemetryObservation
} from "../../../test/fixtures/agentInteractionFixtures.js";
import {
  AgentInteractionValidationError,
  validateCreateAgentInteraction
} from "./agentInteractionValidation.js";

function getValidationDetails(request) {
  try {
    validateCreateAgentInteraction(request);
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(AgentInteractionValidationError);
    return error.details;
  }
}

describe("validateCreateAgentInteraction", () => {
  it("accepts a limited sensory observation with separate uncertainty", () => {
    const result = validateCreateAgentInteraction(
      createAgentInteractionRequest()
    );

    expect(result).toMatchObject({
      message: { text: "이전과 같은 작업을 계속해줘." },
      sensoryObservations: [
        {
          type: "runtime_telemetry",
          source: "system_monitor",
          confidence: 0.72,
          uncertainty: 0.28
        }
      ]
    });
  });

  it("rejects client-controlled state, response, and raw media fields", () => {
    const details = getValidationDetails(
      createAgentInteractionRequest({
        stateOverride: { predictionError: 1 },
        aiResponse: "클라이언트 응답",
        video: "raw-video"
      })
    );

    expect(details.map((detail) => detail.field)).toEqual(
      expect.arrayContaining(["stateOverride", "aiResponse", "video"])
    );
  });

  it("rejects semantic categories as face movement features", () => {
    const details = getValidationDetails(
      createAgentInteractionRequest({
        sensoryObservations: [
          createRuntimeTelemetryObservation({
            features: [{ name: "expressionCategory", value: 0.9 }]
          })
        ]
      })
    );

    expect(details).toContainEqual(
      expect.objectContaining({
        field: "sensoryObservations[0].features[0].name"
      })
    );
  });

  it("rejects missing uncertainty and out-of-range confidence", () => {
    const details = getValidationDetails(
      createAgentInteractionRequest({
        sensoryObservations: [
          createRuntimeTelemetryObservation({
            confidence: 1.2,
            uncertainty: undefined
          })
        ]
      })
    );

    expect(details.map((detail) => detail.field)).toEqual(
      expect.arrayContaining([
        "sensoryObservations[0].confidence",
        "sensoryObservations[0].uncertainty"
      ])
    );
  });

  it("rejects duplicate features and observation-level raw data", () => {
    const details = getValidationDetails(
      createAgentInteractionRequest({
        sensoryObservations: [
          createRuntimeTelemetryObservation({
            landmarks: [{ x: 0.2, y: 0.4 }],
            features: [
              { name: "cpuLoad", value: 0.4 },
              { name: "cpuLoad", value: 0.6 }
            ]
          })
        ]
      })
    );

    expect(details.map((detail) => detail.field)).toEqual(
      expect.arrayContaining([
        "sensoryObservations[0].landmarks",
        "sensoryObservations[0].features[1].name"
      ])
    );
  });
});
