package com.placepick.recommendation.embedding.domain;

public enum EmbeddingShadowFailureCode {
    NONE,
    PROVIDER_INVALID_REQUEST,
    PROVIDER_AUTHENTICATION_FAILED,
    PROVIDER_RATE_LIMITED,
    PROVIDER_INVALID_RESPONSE,
    PROVIDER_UNAVAILABLE,
    INVALID_VECTOR_RESPONSE
}
