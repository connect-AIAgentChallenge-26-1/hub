import {
  AGENT_ACTION_TYPES,
  DEFAULT_ACTION_SELECTION_PROFILE,
  DEFAULT_INTERNAL_STATE_PROFILE,
  normalizeInternalState
} from "./internalStateProfile.js";

function clampScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function selectAgentAction({
  state,
  stateProfile = DEFAULT_INTERNAL_STATE_PROFILE,
  actionProfile = DEFAULT_ACTION_SELECTION_PROFILE
} = {}) {
  const normalizedState = normalizeInternalState(state, stateProfile);
  const candidates = AGENT_ACTION_TYPES.map((actionType, order) => {
    const definition = actionProfile.actions[actionType] || {
      baseScore: 0,
      factors: []
    };
    const contributions = [];
    let score = Number(definition.baseScore) || 0;

    definition.factors.forEach(({ dimension, weight, invert = false }) => {
      const stateValue = normalizedState[dimension] ?? 0;
      const inputValue = invert ? 1 - stateValue : stateValue;
      const contribution = inputValue * weight;
      score += contribution;
      contributions.push({
        dimension,
        inputValue: round(inputValue),
        weight,
        contribution: round(contribution)
      });
    });

    return {
      actionType,
      score: round(clampScore(score)),
      contributions,
      order
    };
  }).sort(
    (left, right) =>
      right.score - left.score || left.order - right.order
  );

  return {
    selectedAction: {
      actionType: candidates[0].actionType,
      score: candidates[0].score,
      contributions: candidates[0].contributions
    },
    candidates: candidates.map(({ order, ...candidate }) => candidate)
  };
}
