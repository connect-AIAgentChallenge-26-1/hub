package com.placepick.recommendation.job;

import java.util.Objects;
import java.util.UUID;

public record CreateAlternativeRecommendationCommand(
    UUID sessionId,
    UUID sourceJobId,
    String idempotencyKey,
    String traceId
) {
    public CreateAlternativeRecommendationCommand {
        sessionId = Objects.requireNonNull(sessionId, "sessionId");
        sourceJobId = Objects.requireNonNull(sourceJobId, "sourceJobId");
        idempotencyKey = bounded(idempotencyKey, "idempotencyKey", 128);
        traceId = bounded(traceId, "traceId", 128);
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
