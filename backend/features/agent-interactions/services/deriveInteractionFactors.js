import {
  AGENT_INTERACTION_LIMITS
} from "../../../../shared/contracts/agentInteractionContract.js";

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value) {
  return Math.min(1, Math.max(0, value));
}

function round(value) {
  return Math.round(clamp(value) * 1_000_000) / 1_000_000;
}

function normalizeMessage(text) {
  return String(text || "").trim().toLocaleLowerCase();
}

function findFeature(sensoryObservations, type, name) {
  const observation = sensoryObservations.find(
    (candidate) => candidate.type === type
  );
  const feature = observation?.features?.find(
    (candidate) => candidate.name === name
  );

  if (!feature) return null;
  return {
    value: clamp(feature.value),
    confidence: clamp(observation.confidence)
  };
}

function readWeightedFeature(sensoryObservations, type, name) {
  const feature = findFeature(sensoryObservations, type, name);
  return feature ? feature.value * feature.confidence : null;
}

export function deriveInteractionFactors({
  messageText,
  sensoryObservations = [],
  previousInteraction = null
} = {}) {
  const uncertainty = average(
    sensoryObservations.map((observation) => observation.uncertainty)
  );
  const confidence = average(
    sensoryObservations.map((observation) => observation.confidence)
  );
  const normalizedMessage = normalizeMessage(messageText);
  const previousMessage = normalizeMessage(previousInteraction?.userMessage);
  const isRepetition =
    Boolean(normalizedMessage) && normalizedMessage === previousMessage;
  const runtimeLoad = average(
    [
      "cpuLoad",
      "memoryPressure",
      "queuePressure",
      "networkLatency"
    ]
      .map((name) =>
        readWeightedFeature(
          sensoryObservations,
          "runtime_telemetry",
          name
        )
      )
      .filter((value) => value !== null)
  );
  const ambiguity =
    readWeightedFeature(
      sensoryObservations,
      "task_context",
      "ambiguity"
    ) ?? 0;
  const observedNovelty = readWeightedFeature(
    sensoryObservations,
    "task_context",
    "novelty"
  );
  const goalCompetition =
    readWeightedFeature(
      sensoryObservations,
      "task_context",
      "goalCompetition"
    ) ?? 0;
  const continuityBreak =
    readWeightedFeature(
      sensoryObservations,
      "task_context",
      "continuityBreak"
    ) ?? 0;
  const messageWorkload =
    normalizedMessage.length /
    AGENT_INTERACTION_LIMITS.messageTextLength;
  const workload = messageWorkload * 0.55 + runtimeLoad * 0.45;
  const defaultNovelty = isRepetition ? 0 : previousInteraction ? 0.5 : 0.6;

  return {
    observationMismatch: round(ambiguity),
    memoryMismatch: 0,
    uncertainty: round(uncertainty),
    workload: round(workload),
    goalCompetition: round(goalCompetition),
    continuityEvidence: previousInteraction
      ? round(0.2 * (1 - continuityBreak))
      : 0,
    continuityBreak: round(continuityBreak),
    synchronyEvidence: round(
      confidence * (1 - uncertainty) * (1 - continuityBreak)
    ),
    interactionDisruption: round(
      Math.max(uncertainty, continuityBreak)
    ),
    novelty: round(observedNovelty ?? defaultNovelty),
    repetition: isRepetition ? 1 : 0
  };
}
