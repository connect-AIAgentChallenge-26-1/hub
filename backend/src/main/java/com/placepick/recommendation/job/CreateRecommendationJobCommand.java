package com.placepick.recommendation.job;

import java.util.Objects;
import java.util.UUID;

public record CreateRecommendationJobCommand(
    UUID sessionId,
    UUID draftId,
    String idempotencyKey,
    String traceId
) {
    public CreateRecommendationJobCommand {
        sessionId = Objects.requireNonNull(sessionId, "sessionId");
        draftId = Objects.requireNonNull(draftId, "draftId");
        idempotencyKey = bounded(idempotencyKey, "idempotencyKey", 128);
        traceId = bounded(traceId, "traceId", 128);
    }

    public CreateRecommendationJobCommand(
        UUID sessionId,
        UUID draftId,
        String idempotencyKey
    ) {
        this(sessionId, draftId, idempotencyKey, "unavailable");
    }

    private static String bounded(String value, String name, int maximum) {
        Objects.requireNonNull(value, name);
        String normalized = value.strip();
        int length = normalized.codePointCount(0, normalized.length());
        if (normalized.isBlank() || length > maximum || normalized.codePoints().anyMatch(
            Character::isISOControl
        )) {
            throw new IllegalArgumentException(name + " is outside the supported contract.");
        }
        return normalized;
    }
}
