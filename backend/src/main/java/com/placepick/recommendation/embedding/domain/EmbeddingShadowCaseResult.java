package com.placepick.recommendation.embedding.domain;

import java.util.Objects;

/** Safe case-level result: source text, vectors, and similarity values are intentionally absent. */
public record EmbeddingShadowCaseResult(
    String caseId,
    ShadowCorpusSplit split,
    boolean expectedMatch
) {

    public EmbeddingShadowCaseResult {
        caseId = Objects.requireNonNull(caseId, "caseId");
        split = Objects.requireNonNull(split, "split");
    }
}
