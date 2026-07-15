package com.placepick.recommendation.job;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record RecommendationJobEvent(
    long sequenceId,
    UUID eventId,
    UUID jobId,
    String eventType,
    String payloadJson,
    Instant occurredAt
) {
    public RecommendationJobEvent {
        eventId = Objects.requireNonNull(eventId, "eventId");
        jobId = Objects.requireNonNull(jobId, "jobId");
        eventType = Objects.requireNonNull(eventType, "eventType");
        payloadJson = Objects.requireNonNull(payloadJson, "payloadJson");
        occurredAt = Objects.requireNonNull(occurredAt, "occurredAt");
    }
}
