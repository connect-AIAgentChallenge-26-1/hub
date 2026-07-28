import {
  AGENT_INTERACTION_FIELDS,
  AGENT_INTERACTION_LIMITS
} from "../../../shared/contracts/agentInteractionContract.js";
import {
  SENSORY_FEATURE_FIELDS,
  SENSORY_FEATURE_NAMES,
  SENSORY_OBSERVATION_FIELDS,
  SENSORY_OBSERVATION_LIMITS,
  SENSORY_OBSERVATION_SCHEMA_VERSION,
  SENSORY_OBSERVATION_SOURCES,
  SENSORY_OBSERVATION_TYPES
} from "../../../shared/contracts/sensoryObservationContract.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_REQUEST_FIELDS = new Set(AGENT_INTERACTION_FIELDS);
const ALLOWED_OBSERVATION_TYPES = new Set(SENSORY_OBSERVATION_TYPES);
const ALLOWED_OBSERVATION_FIELDS = new Set(SENSORY_OBSERVATION_FIELDS);
const ALLOWED_FEATURE_FIELDS = new Set(SENSORY_FEATURE_FIELDS);

export class AgentInteractionValidationError extends Error {
  constructor(details) {
    super("The agent interaction request contains invalid fields.");
    this.name = "AgentInteractionValidationError";
    this.code = "VALIDATION_ERROR";
    this.details = details;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknownFields(source, allowedFields, path, errors) {
  if (!isPlainObject(source)) return;

  Object.keys(source).forEach((field) => {
    if (!allowedFields.has(field)) {
      errors.push({
        field: path ? `${path}.${field}` : field,
        message: `${field} is not allowed.`
      });
    }
  });
}

function readUuid(body, field, errors) {
  const value = body[field];

  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    errors.push({
      field,
      message: `${field} must be a valid UUID.`
    });
    return "";
  }

  return value.trim();
}

function readMessage(body, errors) {
  const message = body.message;

  if (!isPlainObject(message)) {
    errors.push({
      field: "message",
      message: "message must be a JSON object."
    });
    return { text: "" };
  }

  rejectUnknownFields(message, new Set(["text"]), "message", errors);
  const text = typeof message.text === "string" ? message.text.trim() : "";

  if (!text) {
    errors.push({
      field: "message.text",
      message: "message.text must be a non-empty string."
    });
  } else if (text.length > AGENT_INTERACTION_LIMITS.messageTextLength) {
    errors.push({
      field: "message.text",
      message:
        `message.text must contain at most ` +
        `${AGENT_INTERACTION_LIMITS.messageTextLength} characters.`
    });
  }

  return { text };
}

function readUnitInterval(value, field, errors) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < SENSORY_OBSERVATION_LIMITS.evidenceValueMinimum ||
    value > SENSORY_OBSERVATION_LIMITS.evidenceValueMaximum
  ) {
    errors.push({
      field,
      message: `${field} must be a finite number between 0 and 1.`
    });
    return 0;
  }

  return value;
}

function readFeatures(observation, observationIndex, type, errors) {
  const path = `sensoryObservations[${observationIndex}].features`;
  const features = observation.features;

  if (
    !Array.isArray(features) ||
    features.length > SENSORY_OBSERVATION_LIMITS.featureCount
  ) {
    errors.push({
      field: path,
      message:
        `${path} must be an array with at most ` +
        `${SENSORY_OBSERVATION_LIMITS.featureCount} items.`
    });
    return [];
  }

  const allowedNames = new Set(SENSORY_FEATURE_NAMES[type] || []);
  const seenNames = new Set();

  return features.map((feature, featureIndex) => {
    const featurePath = `${path}[${featureIndex}]`;

    if (!isPlainObject(feature)) {
      errors.push({
        field: featurePath,
        message: `${featurePath} must be a JSON object.`
      });
      return { name: "", value: 0 };
    }

    rejectUnknownFields(
      feature,
      ALLOWED_FEATURE_FIELDS,
      featurePath,
      errors
    );
    const name = typeof feature.name === "string" ? feature.name : "";

    if (!allowedNames.has(name)) {
      errors.push({
        field: `${featurePath}.name`,
        message: `${featurePath}.name is not allowed for ${type || "this type"}.`
      });
    } else if (seenNames.has(name)) {
      errors.push({
        field: `${featurePath}.name`,
        message: `${featurePath}.name must not be duplicated.`
      });
    }
    seenNames.add(name);

    return {
      name,
      value: readUnitInterval(
        feature.value,
        `${featurePath}.value`,
        errors
      )
    };
  });
}

function readObservation(observation, index, errors) {
  const path = `sensoryObservations[${index}]`;

  if (!isPlainObject(observation)) {
    errors.push({
      field: path,
      message: `${path} must be a JSON object.`
    });
    return null;
  }

  rejectUnknownFields(
    observation,
    ALLOWED_OBSERVATION_FIELDS,
    path,
    errors
  );
  const type = observation.type;
  const source = observation.source;
  const allowedSources = new Set(SENSORY_OBSERVATION_SOURCES[type] || []);

  if (typeof type !== "string" || !ALLOWED_OBSERVATION_TYPES.has(type)) {
    errors.push({
      field: `${path}.type`,
      message: `${path}.type is not allowed.`
    });
  }

  if (typeof source !== "string" || !allowedSources.has(source)) {
    errors.push({
      field: `${path}.source`,
      message: `${path}.source is not allowed for ${type || "this type"}.`
    });
  }

  if (observation.schemaVersion !== SENSORY_OBSERVATION_SCHEMA_VERSION) {
    errors.push({
      field: `${path}.schemaVersion`,
      message:
        `${path}.schemaVersion must be ` +
        `${SENSORY_OBSERVATION_SCHEMA_VERSION}.`
    });
  }

  if (
    typeof observation.observedAt !== "string" ||
    !Number.isFinite(Date.parse(observation.observedAt))
  ) {
    errors.push({
      field: `${path}.observedAt`,
      message: `${path}.observedAt must be a valid timestamp.`
    });
  }

  return {
    type,
    source,
    schemaVersion: observation.schemaVersion,
    observedAt: observation.observedAt,
    confidence: readUnitInterval(
      observation.confidence,
      `${path}.confidence`,
      errors
    ),
    uncertainty: readUnitInterval(
      observation.uncertainty,
      `${path}.uncertainty`,
      errors
    ),
    features: readFeatures(observation, index, type, errors)
  };
}

function readSensoryObservations(body, errors) {
  const observations =
    body.sensoryObservations === undefined ? [] : body.sensoryObservations;

  if (
    !Array.isArray(observations) ||
    observations.length > AGENT_INTERACTION_LIMITS.sensoryObservationCount
  ) {
    errors.push({
      field: "sensoryObservations",
      message:
        `sensoryObservations must be an array with at most ` +
        `${AGENT_INTERACTION_LIMITS.sensoryObservationCount} items.`
    });
    return [];
  }

  return observations
    .map((observation, index) => readObservation(observation, index, errors))
    .filter(Boolean);
}

export function validateCreateAgentInteraction(body) {
  if (!isPlainObject(body)) {
    throw new AgentInteractionValidationError([
      {
        field: "body",
        message: "The request body must be a JSON object."
      }
    ]);
  }

  const errors = [];
  rejectUnknownFields(body, ALLOWED_REQUEST_FIELDS, "", errors);
  const browserBindingId = readUuid(body, "browserBindingId", errors);
  const clientRequestId = readUuid(body, "clientRequestId", errors);
  const message = readMessage(body, errors);
  const sensoryObservations = readSensoryObservations(body, errors);

  if (errors.length > 0) {
    throw new AgentInteractionValidationError(errors);
  }

  return {
    browserBindingId,
    clientRequestId,
    message,
    sensoryObservations
  };
}
