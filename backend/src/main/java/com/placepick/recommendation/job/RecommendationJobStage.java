package com.placepick.recommendation.job;

public enum RecommendationJobStage {
    QUEUED,
    LOCAL_SEARCH,
    BLOG_SEARCH,
    SCORING,
    REASON_GENERATION,
    PERSISTING,
    FINISHED
}
