package com.placepick.recommendation.application.candidate;

import com.placepick.recommendation.application.port.out.PlaceSearchSort;
import java.util.List;
import java.util.Objects;

public record CandidateQueryPlan(
    String query,
    List<IncludedPreference> includedPreferences,
    String variantId,
    PlaceSearchSort sort,
    int weightBasisPoints
) {

    public CandidateQueryPlan {
        if (query == null || query.isBlank() ||
            query.codePointCount(0, query.length()) > 100) {
            throw new IllegalArgumentException("Candidate query must contain between 1 and 100 characters.");
        }
        includedPreferences = List.copyOf(includedPreferences);
        variantId = Objects.requireNonNull(variantId, "variantId").strip();
        if (!variantId.matches("[a-z0-9][a-z0-9._-]{0,63}")) {
            throw new IllegalArgumentException("Candidate query variant ID is invalid.");
        }
        sort = Objects.requireNonNull(sort, "sort");
        if (weightBasisPoints < 1 || weightBasisPoints > 10_000) {
            throw new IllegalArgumentException("Candidate query weight is invalid.");
        }
    }

    public CandidateQueryPlan(String query, List<IncludedPreference> includedPreferences) {
        this(query, includedPreferences, "legacy.initial", PlaceSearchSort.ACCURACY, 1_000);
    }
}
