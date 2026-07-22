package com.placepick.recommendation.embedding.application.port.out;

public enum EmbeddingBatchErrorCode {
    NONE,
    INVALID_REQUEST,
    AUTHENTICATION_FAILED,
    RATE_LIMITED,
    INVALID_RESPONSE,
    PROVIDER_UNAVAILABLE
}
