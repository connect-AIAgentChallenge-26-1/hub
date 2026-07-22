package com.placepick.recommendation.embedding.domain;

import java.util.Objects;

public record EmbeddingShadowMetrics(
    double selectedThreshold,
    BinaryClassificationMetrics embeddingTrain,
    BinaryClassificationMetrics lexicalHoldout,
    BinaryClassificationMetrics embeddingHoldout,
    boolean promotionEligible
) {

    public EmbeddingShadowMetrics {
        if (!Double.isFinite(selectedThreshold) ||
            selectedThreshold < -1 || selectedThreshold > Math.nextUp(1.0)) {
            throw new IllegalArgumentException("Selected cosine threshold is invalid.");
        }
        embeddingTrain = Objects.requireNonNull(embeddingTrain, "embeddingTrain");
        lexicalHoldout = Objects.requireNonNull(lexicalHoldout, "lexicalHoldout");
        embeddingHoldout = Objects.requireNonNull(embeddingHoldout, "embeddingHoldout");
    }
}
