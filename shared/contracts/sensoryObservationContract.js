export const SENSORY_OBSERVATION_SCHEMA_VERSION = "v1";

export const SENSORY_OBSERVATION_TYPES = Object.freeze([
  "runtime_telemetry",
  "task_context"
]);

export const SENSORY_OBSERVATION_SOURCES = Object.freeze({
  runtime_telemetry: Object.freeze(["system_monitor"]),
  task_context: Object.freeze(["client_observation"])
});

export const SENSORY_FEATURE_NAMES = Object.freeze({
  runtime_telemetry: Object.freeze([
    "cpuLoad",
    "memoryPressure",
    "queuePressure",
    "networkLatency"
  ]),
  task_context: Object.freeze([
    "ambiguity",
    "novelty",
    "goalCompetition",
    "continuityBreak"
  ])
});

export const SENSORY_OBSERVATION_FIELDS = Object.freeze([
  "type",
  "source",
  "schemaVersion",
  "observedAt",
  "confidence",
  "uncertainty",
  "features"
]);

export const SENSORY_FEATURE_FIELDS = Object.freeze(["name", "value"]);

export const SENSORY_OBSERVATION_LIMITS = Object.freeze({
  featureCount: 8,
  evidenceValueMinimum: 0,
  evidenceValueMaximum: 1
});
