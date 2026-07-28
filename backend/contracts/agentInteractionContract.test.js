import { describe, expect, it } from "vitest";
import {
  AGENT_ACTION_TYPES,
  AGENT_INTERACTION_FIELDS,
  AGENT_INTERACTION_FORBIDDEN_FIELDS,
  AGENT_INTERACTION_LIMITS
} from "../../shared/contracts/agentInteractionContract.js";
import {
  SENSORY_FEATURE_NAMES,
  SENSORY_OBSERVATION_FIELDS,
  SENSORY_OBSERVATION_LIMITS,
  SENSORY_OBSERVATION_SOURCES,
  SENSORY_OBSERVATION_TYPES
} from "../../shared/contracts/sensoryObservationContract.js";
import {
  INTERNAL_STATE_DIMENSIONS
} from "../features/internal-state/internalStateProfile.js";

describe("agent interaction contract", () => {
  it("keeps privileged output fields out of the client request contract", () => {
    expect(AGENT_INTERACTION_FIELDS).toEqual([
      "browserBindingId",
      "clientRequestId",
      "message",
      "sensoryObservations"
    ]);
    expect(AGENT_INTERACTION_FORBIDDEN_FIELDS).toEqual(
      expect.arrayContaining([
        "internalState",
        "stateOverride",
        "selectedAction",
        "decisionTrace",
        "aiResponse",
        "image",
        "video",
        "audio",
        "landmarks",
        "blendshapes"
      ])
    );
  });

  it("defines independent machine-state dimensions", () => {
    expect(INTERNAL_STATE_DIMENSIONS).toEqual([
      "predictionError",
      "resourcePressure",
      "goalConflict",
      "continuityIntegrity",
      "interactionSynchrony",
      "explorationDrive"
    ]);

  });

  it("separates confidence and uncertainty in sensory observations", () => {
    expect(SENSORY_OBSERVATION_FIELDS).toEqual(
      expect.arrayContaining(["confidence", "uncertainty"])
    );
    expect(SENSORY_OBSERVATION_TYPES).toEqual([
      "runtime_telemetry",
      "task_context"
    ]);
    expect(SENSORY_OBSERVATION_SOURCES.runtime_telemetry).toEqual([
      "system_monitor"
    ]);
  });

  it("allows only limited observable features", () => {
    expect(SENSORY_FEATURE_NAMES.runtime_telemetry).toContain("cpuLoad");
    expect(SENSORY_FEATURE_NAMES.task_context).toEqual([
      "ambiguity",
      "novelty",
      "goalCompetition",
      "continuityBreak"
    ]);
    expect(SENSORY_FEATURE_NAMES.runtime_telemetry)
      .not.toContain("expressionCategory");
    expect(SENSORY_OBSERVATION_LIMITS.featureCount).toBeLessThanOrEqual(8);
    expect(AGENT_INTERACTION_LIMITS.sensoryObservationCount)
      .toBeLessThanOrEqual(6);
  });
});
