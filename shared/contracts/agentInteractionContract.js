export const AGENT_INTERACTION_SCHEMA_VERSION = "v1";

export const AGENT_ACTION_TYPES = Object.freeze([
  "continue_task",
  "request_clarification",
  "verify_context",
  "ask_priority",
  "explore_topic",
  "reduce_scope",
  "pause_or_recover",
  "acknowledge_observation"
]);

export const AGENT_INTERACTION_FIELDS = Object.freeze([
  "browserBindingId",
  "clientRequestId",
  "message",
  "sensoryObservations"
]);

export const AGENT_INTERACTION_FORBIDDEN_FIELDS = Object.freeze([
  "internalState",
  "stateDelta",
  "stateOverride",
  "memoryImportance",
  "selectedAction",
  "decisionTrace",
  "aiResponse",
  "image",
  "video",
  "audio",
  "landmarks",
  "blendshapes"
]);

export const AGENT_INTERACTION_LIMITS = Object.freeze({
  messageTextLength: 1000,
  sensoryObservationCount: 6,
  responseTextLength: 2000,
  historyLimit: 20,
  maximumHistoryLimit: 100
});
