package com.placepick.recommendation.job;

public record RecommendationJobSubscriptionState(
    RecommendationJobSnapshot snapshot,
    long latestSequenceId
) {
}
