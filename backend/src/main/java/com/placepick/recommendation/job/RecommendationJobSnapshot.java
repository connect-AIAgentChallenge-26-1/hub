package com.placepick.recommendation.job;

import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record RecommendationJobSnapshot(
    UUID jobId,
    UUID sessionId,
    UUID draftId,
    UUID rootJobId,
    UUID parentJobId,
    int explorationRound,
    List<String> excludedCandidateKeys,
    List<String> usedVariantIds,
    boolean searchExhausted,
    RecommendationJobStatus status,
    RecommendationJobStage stage,
    int progress,
    boolean degraded,
    List<String> warnings,
    ConfirmedRecommendationCondition condition,
    List<RecommendationJobPlace> places,
    RecommendationJobFailure failure,
    Instant createdAt,
    Instant updatedAt,
    Instant expiresAt,
    long version
) {
    public RecommendationJobSnapshot {
        if (explorationRound < 0) {
            throw new IllegalArgumentException("Exploration round must not be negative.");
        }
        if (explorationRound == 0 && (!jobId.equals(rootJobId) || parentJobId != null)) {
            throw new IllegalArgumentException("Initial recommendation lineage is invalid.");
        }
        if (explorationRound > 0 && (jobId.equals(rootJobId) || parentJobId == null)) {
            throw new IllegalArgumentException("Alternative recommendation lineage is invalid.");
        }
        excludedCandidateKeys = List.copyOf(excludedCandidateKeys);
        usedVariantIds = List.copyOf(usedVariantIds);
        warnings = List.copyOf(warnings);
        places = places == null ? List.of() : List.copyOf(places);
    }

    public boolean terminal() {
        return status == RecommendationJobStatus.COMPLETED ||
            status == RecommendationJobStatus.FAILED;
    }

    public boolean partial() {
        return status == RecommendationJobStatus.COMPLETED &&
            !places.isEmpty() && places.size() < 3;
    }

    public int resultCount() {
        return places.size();
    }
}
