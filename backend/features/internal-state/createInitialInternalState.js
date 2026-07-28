import {
  DEFAULT_INTERNAL_STATE_PROFILE,
  INTERNAL_STATE_DIMENSIONS
} from "./internalStateProfile.js";

export function createInitialInternalState(
  profile = DEFAULT_INTERNAL_STATE_PROFILE
) {
  return INTERNAL_STATE_DIMENSIONS.reduce((state, dimension) => {
    state[dimension] = profile.dimensions[dimension].baseline;
    return state;
  }, {});
}
