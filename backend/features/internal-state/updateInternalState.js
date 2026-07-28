import {
  clampInternalStateValue,
  DEFAULT_INTERNAL_STATE_PROFILE,
  INTERNAL_STATE_DIMENSIONS,
  normalizeInternalState
} from "./internalStateProfile.js";

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function normalizeFactorValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

export function updateInternalState({
  state,
  factors = {},
  profile = DEFAULT_INTERNAL_STATE_PROFILE
} = {}) {
  const previousState = normalizeInternalState(state, profile);
  const nextState = {};
  const delta = {};
  const causes = [];

  INTERNAL_STATE_DIMENSIONS.forEach((dimension) => {
    const weights = profile.factorWeights[dimension] || {};
    let requestedDelta = 0;

    Object.entries(weights).forEach(([factor, weight]) => {
      const factorValue = normalizeFactorValue(factors[factor]);
      const contribution = factorValue * Number(weight || 0);

      if (factorValue === 0 || contribution === 0) return;

      requestedDelta += contribution;
      causes.push({
        dimension,
        factor,
        direction: contribution > 0 ? "increase" : "decrease",
        magnitude: Math.abs(round(contribution))
      });
    });

    const definition = profile.dimensions[dimension];
    const nextValue = clampInternalStateValue(
      previousState[dimension] + requestedDelta,
      definition
    );
    nextState[dimension] = round(nextValue);
    delta[dimension] = round(nextValue - previousState[dimension]);
  });

  return {
    previousState,
    nextState,
    delta,
    causes
  };
}
