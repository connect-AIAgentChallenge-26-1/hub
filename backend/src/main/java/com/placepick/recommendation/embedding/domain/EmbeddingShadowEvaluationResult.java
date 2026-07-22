package com.placepick.recommendation.embedding.domain;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

/** Metrics-only shadow result. It cannot carry corpus text, raw vectors, or ranking decisions. */
public record EmbeddingShadowEvaluationResult(
    Status status,
    EmbeddingShadowFailureCode failureCode,
    int providerCalls,
    Optional<EmbeddingShadowMetrics> metrics,
    List<EmbeddingShadowCaseResult> cases
) {

    public EmbeddingShadowEvaluationResult {
        status = Objects.requireNonNull(status, "status");
        failureCode = Objects.requireNonNull(failureCode, "failureCode");
        metrics = Objects.requireNonNull(metrics, "metrics");
        cases = List.copyOf(cases);
        if (providerCalls != 1) {
            throw new IllegalArgumentException(
                "Shadow evaluation must make exactly one provider call."
            );
        }
        if ((status == Status.SUCCEEDED) != metrics.isPresent() ||
            (status == Status.SUCCEEDED) != (failureCode == EmbeddingShadowFailureCode.NONE) ||
            (status == Status.SUCCEEDED) != !cases.isEmpty()) {
            throw new IllegalArgumentException("Shadow evaluation result is inconsistent.");
        }
    }

    public static EmbeddingShadowEvaluationResult succeeded(
        EmbeddingShadowMetrics metrics,
        List<EmbeddingShadowCaseResult> cases
    ) {
        return new EmbeddingShadowEvaluationResult(
            Status.SUCCEEDED,
            EmbeddingShadowFailureCode.NONE,
            1,
            Optional.of(Objects.requireNonNull(metrics, "metrics")),
            cases
        );
    }

    public static EmbeddingShadowEvaluationResult failed(
        EmbeddingShadowFailureCode failureCode
    ) {
        if (failureCode == EmbeddingShadowFailureCode.NONE) {
            throw new IllegalArgumentException("A shadow failure code is required.");
        }
        return new EmbeddingShadowEvaluationResult(
            Status.FAILED,
            failureCode,
            1,
            Optional.empty(),
            List.of()
        );
    }

    public enum Status {
        SUCCEEDED,
        FAILED
    }
}
