package com.placepick.outbox;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record RecommendationRequestedEnvelope(
    UUID eventId,
    String eventType,
    int version,
    UUID aggregateId,
    String idempotencyKey,
    Instant occurredAt,
    String traceId,
    Payload payload
) {
    public static final String EVENT_TYPE = "recommendation.requested.v1";

    public RecommendationRequestedEnvelope {
        eventId = Objects.requireNonNull(eventId, "eventId");
        eventType = Objects.requireNonNull(eventType, "eventType");
        aggregateId = Objects.requireNonNull(aggregateId, "aggregateId");
        idempotencyKey = Objects.requireNonNull(idempotencyKey, "idempotencyKey");
        occurredAt = Objects.requireNonNull(occurredAt, "occurredAt");
        traceId = Objects.requireNonNull(traceId, "traceId");
        payload = Objects.requireNonNull(payload, "payload");
        if (!EVENT_TYPE.equals(eventType) || version != 1 || !aggregateId.equals(payload.jobId())) {
            throw new IllegalArgumentException("Recommendation event envelope is invalid.");
        }
    }

    public record Payload(UUID jobId) {
        public Payload {
            jobId = Objects.requireNonNull(jobId, "jobId");
        }
    }
}
