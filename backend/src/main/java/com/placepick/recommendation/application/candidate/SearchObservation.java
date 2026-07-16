package com.placepick.recommendation.application.candidate;

import com.placepick.recommendation.application.port.out.PlaceSearchSort;
import java.util.Objects;

/** Internal retrieval provenance used by deterministic RRF scoring. */
public record SearchObservation(
    String variantId,
    PlaceSearchSort sort,
    int providerRank,
    int weightBasisPoints
) {

    public SearchObservation {
        variantId = requireId(variantId);
        sort = Objects.requireNonNull(sort, "sort");
        if (providerRank < 1 || providerRank > 100) {
            throw new IllegalArgumentException("Provider rank must be between one and 100.");
        }
        if (weightBasisPoints < 1 || weightBasisPoints > 10_000) {
            throw new IllegalArgumentException("Search weight must be between one and 10000.");
        }
    }

    private static String requireId(String value) {
        Objects.requireNonNull(value, "variantId");
        String normalized = value.strip();
        if (!normalized.matches("[a-z0-9][a-z0-9._-]{0,63}")) {
            throw new IllegalArgumentException("Search variant ID is invalid.");
        }
        return normalized;
    }
}
