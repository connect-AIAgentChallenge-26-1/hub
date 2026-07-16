package com.placepick.recommendation.job;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** Public SSE envelope shared by snapshot, progress, completed, failed, and heartbeat. */
public record RecommendationJobStreamPayload(
    String eventId,
    Instant occurredAt,
    UUID aggregateId,
    RecommendationJobView snapshot
) {
    public RecommendationJobStreamPayload {
        eventId = Objects.requireNonNull(eventId, "eventId");
        occurredAt = Objects.requireNonNull(occurredAt, "occurredAt");
        aggregateId = Objects.requireNonNull(aggregateId, "aggregateId");
    }
}
