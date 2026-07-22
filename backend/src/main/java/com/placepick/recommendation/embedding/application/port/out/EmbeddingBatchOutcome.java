package com.placepick.recommendation.embedding.application.port.out;

import com.placepick.recommendation.embedding.domain.EmbeddingVector;
import java.util.List;
import java.util.Objects;

/** Safe provider outcome. Vector values remain encapsulated in memory and are never rendered. */
public record EmbeddingBatchOutcome(
    EmbeddingBatchErrorCode errorCode,
    List<EmbeddingVector> vectors
) {

    public EmbeddingBatchOutcome {
        errorCode = Objects.requireNonNull(errorCode, "errorCode");
        vectors = List.copyOf(vectors);
        if ((errorCode == EmbeddingBatchErrorCode.NONE) != !vectors.isEmpty()) {
            throw new IllegalArgumentException("Embedding batch outcome is inconsistent.");
        }
    }

    public static EmbeddingBatchOutcome embedded(List<EmbeddingVector> vectors) {
        return new EmbeddingBatchOutcome(EmbeddingBatchErrorCode.NONE, vectors);
    }

    public static EmbeddingBatchOutcome failed(EmbeddingBatchErrorCode errorCode) {
        if (errorCode == EmbeddingBatchErrorCode.NONE) {
            throw new IllegalArgumentException("An embedding provider failure code is required.");
        }
        return new EmbeddingBatchOutcome(errorCode, List.of());
    }

    public boolean embedded() {
        return errorCode == EmbeddingBatchErrorCode.NONE;
    }

    @Override
    public String toString() {
        return "EmbeddingBatchOutcome[errorCode=" + errorCode +
            ", vectorCount=" + vectors.size() + ", vectors=<redacted>]";
    }
}
