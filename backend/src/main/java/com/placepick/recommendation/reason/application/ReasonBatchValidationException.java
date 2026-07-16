package com.placepick.recommendation.reason.application;

import java.io.Serial;
import java.util.Objects;

/** Expected validation rejection for an otherwise successful provider response. */
public final class ReasonBatchValidationException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    private final ReasonBatchValidationCode code;

    ReasonBatchValidationException(ReasonBatchValidationCode code) {
        super("Generated reason batch failed server validation.", null, false, false);
        this.code = Objects.requireNonNull(code, "code");
    }

    public ReasonBatchValidationCode code() {
        return code;
    }
}
