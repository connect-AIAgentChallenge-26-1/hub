package com.placepick.recommendation.embedding.application.port.out;

public interface EmbeddingBatchPort {

    EmbeddingBatchOutcome embed(EmbeddingBatchCommand command);
}
