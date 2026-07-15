package com.placepick.recommendation.job;

import java.io.Serial;
import java.util.Objects;

public final class RecommendationJobException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    private final RecommendationJobErrorCode errorCode;

    public RecommendationJobException(
        RecommendationJobErrorCode errorCode,
        String safeMessage
    ) {
        super(safeMessage, null, false, false);
        this.errorCode = Objects.requireNonNull(errorCode, "errorCode");
    }

    public RecommendationJobErrorCode errorCode() {
        return errorCode;
    }
}
