package com.placepick.recommendation.job;

public record RecommendationJobStreamEvent(
    long sequenceId,
    String eventType,
    RecommendationJobStreamPayload payload
) {
}
