import {
  DEFAULT_INTERNAL_STATE_PROFILE,
  INTERNAL_STATE_DIMENSIONS,
  normalizeInternalState
} from "./internalStateProfile.js";

export function decayInternalState({
  state,
  elapsedMs = 0,
  profile = DEFAULT_INTERNAL_STATE_PROFILE
} = {}) {
  const normalizedState = normalizeInternalState(state, profile);
  const safeElapsedMs =
    Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;

  return INTERNAL_STATE_DIMENSIONS.reduce((decayedState, dimension) => {
    const definition = profile.dimensions[dimension];
    const currentValue = normalizedState[dimension];

    if (safeElapsedMs === 0) {
      decayedState[dimension] = currentValue;
      return decayedState;
    }

    const halfLifeMs = Number(definition.halfLifeMs);
    const remainingRatio =
      Number.isFinite(halfLifeMs) && halfLifeMs > 0
        ? Math.pow(0.5, safeElapsedMs / halfLifeMs)
        : 0;

    decayedState[dimension] =
      definition.baseline +
      (currentValue - definition.baseline) * remainingRatio;
    return decayedState;
  }, {});
}
