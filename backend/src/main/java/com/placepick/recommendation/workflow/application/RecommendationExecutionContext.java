package com.placepick.recommendation.workflow.application;

import com.placepick.recommendation.domain.candidate.CandidateKey;
import java.util.Objects;
import java.util.Set;

/** Internal execution context; fingerprints and variant IDs are never exposed through the API. */
public record RecommendationExecutionContext(
    int explorationRound,
    Set<CandidateKey> excludedCandidateKeys,
    Set<String> usedVariantIds
) {

    public RecommendationExecutionContext {
        if (explorationRound < 0) {
            throw new IllegalArgumentException("Exploration round must not be negative.");
        }
        excludedCandidateKeys = Set.copyOf(Objects.requireNonNull(
            excludedCandidateKeys,
            "excludedCandidateKeys"
        ));
        usedVariantIds = Set.copyOf(Objects.requireNonNull(usedVariantIds, "usedVariantIds"));
        if (usedVariantIds.stream().anyMatch(value -> value == null ||
            !value.matches("[a-z0-9][a-z0-9._-]{0,63}"))) {
            throw new IllegalArgumentException("Used variant IDs contain an invalid value.");
        }
    }

    public static RecommendationExecutionContext initial() {
        return new RecommendationExecutionContext(0, Set.of(), Set.of());
    }

    public static RecommendationExecutionContext alternative(
        int explorationRound,
        Set<CandidateKey> excludedCandidateKeys,
        Set<String> usedVariantIds
    ) {
        if (explorationRound < 1) {
            throw new IllegalArgumentException("An alternative requires a positive exploration round.");
        }
        return new RecommendationExecutionContext(
            explorationRound,
            excludedCandidateKeys,
            usedVariantIds
        );
    }

    public boolean alternative() {
        return explorationRound > 0;
    }
}
