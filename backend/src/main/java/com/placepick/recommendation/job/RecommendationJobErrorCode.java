package com.placepick.recommendation.job;

public enum RecommendationJobErrorCode {
    DRAFT_NOT_FOUND,
    DRAFT_EXPIRED,
    DRAFT_NOT_CONFIRMED,
    DRAFT_ALREADY_CONSUMED,
    IDEMPOTENCY_KEY_REUSED,
    JOB_NOT_FOUND,
    JOB_EXPIRED,
    NO_ALTERNATIVE_CANDIDATES,
    INVALID_STATE
}
