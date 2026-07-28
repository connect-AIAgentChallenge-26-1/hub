import { describe, expect, it } from "vitest";
import { createInitialInternalState } from "./createInitialInternalState.js";
import { decayInternalState } from "./decayInternalState.js";
import {
  DEFAULT_ACTION_SELECTION_PROFILE,
  DEFAULT_INTERNAL_STATE_PROFILE,
  INTERNAL_STATE_DIMENSIONS
} from "./internalStateProfile.js";
import { selectAgentAction } from "./selectAgentAction.js";
import { updateInternalState } from "./updateInternalState.js";

describe("internal-state engine", () => {
  it("creates independent values without a sum constraint", () => {
    const first = createInitialInternalState();
    const second = createInitialInternalState();

    expect(Object.keys(first)).toEqual(INTERNAL_STATE_DIMENSIONS);
    expect(first).toEqual({
      predictionError: 0.2,
      resourcePressure: 0.15,
      goalConflict: 0.15,
      continuityIntegrity: 0.8,
      interactionSynchrony: 0.5,
      explorationDrive: 0.5
    });
    expect(Object.values(first).reduce((sum, value) => sum + value, 0))
      .not.toBe(1);
    expect(first).not.toBe(second);
  });

  it("decays toward each baseline without immediately resetting", () => {
    const elapsedMs =
      DEFAULT_INTERNAL_STATE_PROFILE.dimensions.predictionError.halfLifeMs;
    const decayed = decayInternalState({
      state: {
        ...createInitialInternalState(),
        predictionError: 0.9,
        continuityIntegrity: 0.2
      },
      elapsedMs
    });

    expect(decayed.predictionError).toBeCloseTo(0.55);
    expect(decayed.predictionError).not.toBe(0.2);
    expect(decayed.continuityIntegrity).toBeGreaterThan(0.2);
    expect(decayed.continuityIntegrity).toBeLessThan(0.8);
  });

  it("updates dimensions independently and records change causes", () => {
    const result = updateInternalState({
      state: createInitialInternalState(),
      factors: {
        observationMismatch: 0.8,
        workload: 0.5,
        goalCompetition: 0.4,
        continuityBreak: 0.25,
        synchronyEvidence: 0.5,
        novelty: 0.7
      }
    });

    expect(result.nextState.predictionError).toBeGreaterThan(
      result.previousState.predictionError
    );
    expect(result.nextState.resourcePressure).toBeGreaterThan(
      result.previousState.resourcePressure
    );
    expect(result.nextState.continuityIntegrity).toBeLessThan(
      result.previousState.continuityIntegrity
    );
    expect(result.causes).toContainEqual({
      dimension: "predictionError",
      factor: "observationMismatch",
      direction: "increase",
      magnitude: 0.28
    });
    Object.values(result.nextState).forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    });
  });

  it("uses safe defaults for invalid state and factor values", () => {
    const result = updateInternalState({
      state: {
        predictionError: Number.NaN,
        resourcePressure: 4,
        goalConflict: -3
      },
      factors: {
        observationMismatch: Number.POSITIVE_INFINITY,
        workload: -1
      }
    });

    expect(result.previousState.predictionError).toBe(0.2);
    expect(result.previousState.resourcePressure).toBe(1);
    expect(result.previousState.goalConflict).toBe(0);
    expect(result.delta.predictionError).toBe(0);
    expect(result.delta.resourcePressure).toBe(0);
  });

  it("keeps previous state relevant for the same new factors", () => {
    const factors = { observationMismatch: 0.2 };
    const lower = updateInternalState({
      state: {
        ...createInitialInternalState(),
        predictionError: 0.2
      },
      factors
    });
    const higher = updateInternalState({
      state: {
        ...createInitialInternalState(),
        predictionError: 0.75
      },
      factors
    });

    expect(lower.nextState.predictionError).not.toBe(
      higher.nextState.predictionError
    );
  });

  it.each([
    [
      "request_clarification",
      { predictionError: 0.95 }
    ],
    [
      "verify_context",
      { continuityIntegrity: 0.05 }
    ],
    [
      "ask_priority",
      { goalConflict: 0.95 }
    ],
    [
      "explore_topic",
      { explorationDrive: 0.95, resourcePressure: 0.05 }
    ],
    [
      "reduce_scope",
      { resourcePressure: 0.95 }
    ]
  ])("selects %s when its state factors dominate", (expected, overrides) => {
    const result = selectAgentAction({
      state: {
        ...createInitialInternalState(),
        ...overrides
      }
    });

    expect(result.selectedAction.actionType).toBe(expected);
    expect(result.candidates[0].actionType).toBe(expected);
  });

  it("uses a deterministic action order to break score ties", () => {
    const tiedActions = Object.fromEntries(
      Object.keys(DEFAULT_ACTION_SELECTION_PROFILE.actions).map(
        (actionType) => [
          actionType,
          { baseScore: 0.5, factors: [] }
        ]
      )
    );
    const result = selectAgentAction({
      state: createInitialInternalState(),
      actionProfile: {
        version: "test",
        actions: tiedActions
      }
    });

    expect(result.selectedAction.actionType).toBe("continue_task");
  });
});
