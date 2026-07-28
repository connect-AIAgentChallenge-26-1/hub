import {
  AGENT_ACTION_TYPES
} from "../../../shared/contracts/agentInteractionContract.js";

export { AGENT_ACTION_TYPES };

export const INTERNAL_STATE_DIMENSIONS = Object.freeze([
  "predictionError",
  "resourcePressure",
  "goalConflict",
  "continuityIntegrity",
  "interactionSynchrony",
  "explorationDrive"
]);

function freezeEntries(entries) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(entries).map(([key, value]) => [
        key,
        Object.freeze({ ...value })
      ])
    )
  );
}

export const DEFAULT_INTERNAL_STATE_PROFILE = Object.freeze({
  version: "v0",
  dimensions: freezeEntries({
    predictionError: {
      minimum: 0,
      maximum: 1,
      baseline: 0.2,
      halfLifeMs: 10 * 60 * 1000
    },
    resourcePressure: {
      minimum: 0,
      maximum: 1,
      baseline: 0.15,
      halfLifeMs: 2 * 60 * 1000
    },
    goalConflict: {
      minimum: 0,
      maximum: 1,
      baseline: 0.15,
      halfLifeMs: 15 * 60 * 1000
    },
    continuityIntegrity: {
      minimum: 0,
      maximum: 1,
      baseline: 0.8,
      halfLifeMs: 60 * 60 * 1000
    },
    interactionSynchrony: {
      minimum: 0,
      maximum: 1,
      baseline: 0.5,
      halfLifeMs: 20 * 60 * 1000
    },
    explorationDrive: {
      minimum: 0,
      maximum: 1,
      baseline: 0.5,
      halfLifeMs: 30 * 60 * 1000
    }
  }),
  factorWeights: freezeEntries({
    predictionError: {
      observationMismatch: 0.35,
      memoryMismatch: 0.25,
      uncertainty: 0.1
    },
    resourcePressure: {
      workload: 0.4
    },
    goalConflict: {
      goalCompetition: 0.45
    },
    continuityIntegrity: {
      continuityEvidence: 0.2,
      continuityBreak: -0.4
    },
    interactionSynchrony: {
      synchronyEvidence: 0.25,
      interactionDisruption: -0.3
    },
    explorationDrive: {
      novelty: 0.3,
      uncertainty: 0.12,
      repetition: -0.25
    }
  })
});

export const DEFAULT_ACTION_SELECTION_PROFILE = Object.freeze({
  version: "v0",
  actions: Object.freeze({
    continue_task: Object.freeze({
      baseScore: 0.2,
      factors: Object.freeze([
        { dimension: "continuityIntegrity", weight: 0.25 },
        { dimension: "interactionSynchrony", weight: 0.3 },
        { dimension: "predictionError", weight: -0.25 },
        { dimension: "resourcePressure", weight: -0.2 }
      ])
    }),
    request_clarification: Object.freeze({
      baseScore: 0.05,
      factors: Object.freeze([
        { dimension: "predictionError", weight: 0.65 },
        { dimension: "goalConflict", weight: 0.15 }
      ])
    }),
    verify_context: Object.freeze({
      baseScore: 0.05,
      factors: Object.freeze([
        {
          dimension: "continuityIntegrity",
          weight: 0.65,
          invert: true
        },
        { dimension: "predictionError", weight: 0.2 }
      ])
    }),
    ask_priority: Object.freeze({
      baseScore: 0.05,
      factors: Object.freeze([
        { dimension: "goalConflict", weight: 0.75 }
      ])
    }),
    explore_topic: Object.freeze({
      baseScore: 0.05,
      factors: Object.freeze([
        { dimension: "explorationDrive", weight: 0.7 },
        { dimension: "resourcePressure", weight: -0.25 }
      ])
    }),
    reduce_scope: Object.freeze({
      baseScore: 0.05,
      factors: Object.freeze([
        { dimension: "resourcePressure", weight: 0.7 },
        { dimension: "goalConflict", weight: 0.15 }
      ])
    }),
    pause_or_recover: Object.freeze({
      baseScore: 0.02,
      factors: Object.freeze([
        { dimension: "resourcePressure", weight: 0.5 },
        {
          dimension: "continuityIntegrity",
          weight: 0.25,
          invert: true
        }
      ])
    }),
    acknowledge_observation: Object.freeze({
      baseScore: 0.08,
      factors: Object.freeze([
        {
          dimension: "interactionSynchrony",
          weight: 0.25,
          invert: true
        },
        { dimension: "predictionError", weight: 0.15 }
      ])
    })
  })
});

export function clampInternalStateValue(value, definition) {
  const number = Number(value);
  const fallback = definition.baseline;

  if (!Number.isFinite(number)) return fallback;
  return Math.min(definition.maximum, Math.max(definition.minimum, number));
}

export function normalizeInternalState(
  state = {},
  profile = DEFAULT_INTERNAL_STATE_PROFILE
) {
  return INTERNAL_STATE_DIMENSIONS.reduce((normalized, dimension) => {
    const definition = profile.dimensions[dimension];
    normalized[dimension] = clampInternalStateValue(
      state?.[dimension],
      definition
    );
    return normalized;
  }, {});
}
