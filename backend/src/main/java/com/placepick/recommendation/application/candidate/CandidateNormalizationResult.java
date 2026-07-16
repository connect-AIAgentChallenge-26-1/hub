package com.placepick.recommendation.application.candidate;

import com.placepick.recommendation.domain.candidate.NormalizedCandidate;
import java.util.List;
import java.util.Objects;

/** Eligible candidates together with count-only normalization diagnostics. */
public record CandidateNormalizationResult(
    List<NormalizedCandidate> candidates,
    CandidateFunnel funnel
) {

    public CandidateNormalizationResult {
        candidates = List.copyOf(Objects.requireNonNull(candidates, "candidates"));
        funnel = Objects.requireNonNull(funnel, "funnel");
        if (candidates.size() != funnel.eligibleCount()) {
            throw new IllegalArgumentException(
                "Eligible candidate count must match the candidate funnel."
            );
        }
    }
}
