package com.placepick.analytics;

import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

public record ProductEvent(
    UUID eventId,
    UUID sessionId,
    ProductEventName name,
    Instant occurredAt,
    Map<String, String> context,
    Instant receivedAt,
    Instant expiresAt
) {
    public ProductEvent {
        eventId = Objects.requireNonNull(eventId, "eventId");
        sessionId = Objects.requireNonNull(sessionId, "sessionId");
        name = Objects.requireNonNull(name, "name");
        occurredAt = Objects.requireNonNull(occurredAt, "occurredAt");
        context = Map.copyOf(context);
        receivedAt = Objects.requireNonNull(receivedAt, "receivedAt");
        expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
        if (!expiresAt.isAfter(receivedAt)) {
            throw new IllegalArgumentException("Product event expiry must follow receipt time.");
        }
    }
}
