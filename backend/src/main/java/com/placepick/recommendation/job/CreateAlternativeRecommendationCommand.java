package com.placepick.recommendation.job;

import java.util.Objects;
import java.util.UUID;

public record CreateAlternativeRecommendationCommand(
    UUID sessionId,
    UUID sourceJobId,
    String idempotencyKey,
    String traceId,
    String traceparent,
    String tracestate
) {
    public CreateAlternativeRecommendationCommand {
        sessionId = Objects.requireNonNull(sessionId, "sessionId");
        sourceJobId = Objects.requireNonNull(sourceJobId, "sourceJobId");
        idempotencyKey = bounded(idempotencyKey, "idempotencyKey", 128);
        traceId = bounded(traceId, "traceId", 128);
        traceparent = optionalBounded(traceparent, "traceparent", 55);
        tracestate = optionalBounded(tracestate, "tracestate", 512);
    }

    public CreateAlternativeRecommendationCommand(
        UUID sessionId,
        UUID sourceJobId,
        String idempotencyKey,
        String traceId
    ) {
        this(sessionId, sourceJobId, idempotencyKey, traceId, null, null);
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

    private static String optionalBounded(String value, String name, int maximum) {
        if (value == null) {
            return null;
        }
        return bounded(value, name, maximum);
    }
}
