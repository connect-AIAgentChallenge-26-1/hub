package com.placepick.recommendation.job;

import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import java.util.UUID;

public record JobProcessingClaim(
    UUID jobId,
    ConfirmedRecommendationCondition condition,
    boolean alreadyProcessed,
    boolean terminal
) {
    public static JobProcessingClaim ready(
        UUID jobId,
        ConfirmedRecommendationCondition condition
    ) {
        return new JobProcessingClaim(jobId, condition, false, false);
    }

    public static JobProcessingClaim duplicate(UUID jobId) {
        return new JobProcessingClaim(jobId, null, true, false);
    }

    public static JobProcessingClaim terminal(UUID jobId) {
        return new JobProcessingClaim(jobId, null, false, true);
    }
}
