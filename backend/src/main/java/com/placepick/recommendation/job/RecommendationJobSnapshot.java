package com.placepick.recommendation.job;

import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record RecommendationJobSnapshot(
    UUID jobId,
    UUID sessionId,
    UUID draftId,
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
        warnings = List.copyOf(warnings);
        places = places == null ? List.of() : List.copyOf(places);
    }

    public boolean terminal() {
        return status == RecommendationJobStatus.COMPLETED ||
            status == RecommendationJobStatus.FAILED;
    }
}
