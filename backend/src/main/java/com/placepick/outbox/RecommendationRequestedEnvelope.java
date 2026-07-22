package com.placepick.outbox;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

public record RecommendationRequestedEnvelope(
    UUID eventId,
    String eventType,
    int version,
    UUID aggregateId,
    String idempotencyKey,
    Instant occurredAt,
    String traceId,
    String traceparent,
    String tracestate,
    Payload payload
) {
    public static final String EVENT_TYPE = "recommendation.requested.v1";
    public static final int CURRENT_ENVELOPE_VERSION = 2;
    private static final Pattern TRACEPARENT = Pattern.compile(
        "00-[0-9a-f]{32}-[0-9a-f]{16}-(?:00|01)"
    );

    public RecommendationRequestedEnvelope {
        eventId = Objects.requireNonNull(eventId, "eventId");
        eventType = Objects.requireNonNull(eventType, "eventType");
        aggregateId = Objects.requireNonNull(aggregateId, "aggregateId");
        idempotencyKey = Objects.requireNonNull(idempotencyKey, "idempotencyKey");
        occurredAt = Objects.requireNonNull(occurredAt, "occurredAt");
        traceId = Objects.requireNonNull(traceId, "traceId");
        traceparent = optional(traceparent, 55, "traceparent");
        tracestate = optional(tracestate, 512, "tracestate");
        payload = Objects.requireNonNull(payload, "payload");
        if (!EVENT_TYPE.equals(eventType) || (version != 1 && version != 2)
            || !aggregateId.equals(payload.jobId())) {
            throw new IllegalArgumentException("Recommendation event envelope is invalid.");
        }
        if (traceparent != null && !TRACEPARENT.matcher(traceparent).matches()) {
            throw new IllegalArgumentException("Recommendation traceparent is invalid.");
        }
        if (traceparent != null && !traceparent.substring(3, 35).equals(traceId)) {
            throw new IllegalArgumentException(
                "Recommendation trace ID and traceparent do not match."
            );
        }
    }

    public RecommendationRequestedEnvelope(
        UUID eventId,
        String eventType,
        int version,
        UUID aggregateId,
        String idempotencyKey,
        Instant occurredAt,
        String traceId,
        Payload payload
    ) {
        this(
            eventId,
            eventType,
            version,
            aggregateId,
            idempotencyKey,
            occurredAt,
            traceId,
            null,
            null,
            payload
        );
    }

    private static String optional(String value, int maximum, String name) {
        if (value == null) {
            return null;
        }
        String normalized = value.strip();
        if (normalized.isBlank() || normalized.length() > maximum
            || normalized.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("Recommendation " + name + " is invalid.");
        }
        return normalized;
    }

    public record Payload(UUID jobId) {
        public Payload {
            jobId = Objects.requireNonNull(jobId, "jobId");
        }
    }
}
