package com.placepick.recommendation.job;

import java.util.UUID;

public record RecommendationJobSubmission(
    UUID jobId,
    RecommendationJobStatus status,
    boolean replayed
) {
}
