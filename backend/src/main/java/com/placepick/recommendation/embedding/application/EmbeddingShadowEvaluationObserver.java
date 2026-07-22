package com.placepick.recommendation.embedding.application;

import com.placepick.recommendation.embedding.domain.EmbeddingShadowEvaluationResult;

/** Receives metrics-only shadow outcomes; raw input and vector values are unavailable here. */
@FunctionalInterface
public interface EmbeddingShadowEvaluationObserver {

    void completed(EmbeddingShadowEvaluationResult result);

    static EmbeddingShadowEvaluationObserver none() {
        return ignored -> {
        };
    }
}
