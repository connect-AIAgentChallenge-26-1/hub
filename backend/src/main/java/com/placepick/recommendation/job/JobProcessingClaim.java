package com.placepick.recommendation.job;

import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import java.util.List;
import java.util.UUID;

public record JobProcessingClaim(
    UUID jobId,
    ConfirmedRecommendationCondition condition,
    int explorationRound,
    List<String> excludedCandidateKeys,
    List<String> usedVariantIds,
    boolean alreadyProcessed,
    boolean terminal
) {
    public JobProcessingClaim {
        excludedCandidateKeys = excludedCandidateKeys == null
            ? List.of()
            : List.copyOf(excludedCandidateKeys);
        usedVariantIds = usedVariantIds == null ? List.of() : List.copyOf(usedVariantIds);
    }

    public static JobProcessingClaim ready(
        UUID jobId,
        ConfirmedRecommendationCondition condition,
        int explorationRound,
        List<String> excludedCandidateKeys,
        List<String> usedVariantIds
    ) {
        return new JobProcessingClaim(
            jobId,
            condition,
            explorationRound,
            excludedCandidateKeys,
            usedVariantIds,
            false,
            false
        );
    }

    public static JobProcessingClaim duplicate(UUID jobId) {
        return new JobProcessingClaim(jobId, null, 0, List.of(), List.of(), true, false);
    }

    public static JobProcessingClaim terminal(UUID jobId) {
        return new JobProcessingClaim(jobId, null, 0, List.of(), List.of(), false, true);
    }
}
