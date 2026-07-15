package com.placepick.outbox;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record OutboxEvent(
    UUID id,
    String aggregateType,
    UUID aggregateId,
    String eventType,
    String payloadJson,
    Instant createdAt,
    int attemptCount
) {
    public OutboxEvent {
        id = Objects.requireNonNull(id, "id");
        aggregateType = Objects.requireNonNull(aggregateType, "aggregateType");
        aggregateId = Objects.requireNonNull(aggregateId, "aggregateId");
        eventType = Objects.requireNonNull(eventType, "eventType");
        payloadJson = Objects.requireNonNull(payloadJson, "payloadJson");
        createdAt = Objects.requireNonNull(createdAt, "createdAt");
    }
}
