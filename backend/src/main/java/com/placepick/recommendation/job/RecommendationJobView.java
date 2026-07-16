package com.placepick.recommendation.job;

import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Public recommendation snapshot. Session ownership and persistence version stay server-side. */
public record RecommendationJobView(
    UUID jobId,
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
    Instant expiresAt
) {
    public RecommendationJobView {
        warnings = List.copyOf(warnings);
        places = List.copyOf(places);
    }

    public static RecommendationJobView from(RecommendationJobSnapshot source) {
        return new RecommendationJobView(
            source.jobId(),
            source.status(),
            source.stage(),
            source.progress(),
            source.degraded(),
            source.warnings(),
            source.condition(),
            source.places(),
            source.failure(),
            source.createdAt(),
            source.updatedAt(),
            source.expiresAt()
        );
    }
}
