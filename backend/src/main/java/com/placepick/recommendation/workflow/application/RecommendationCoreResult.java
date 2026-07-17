package com.placepick.recommendation.workflow.application;

import java.util.List;
import java.util.Set;

public record RecommendationCoreResult(
    List<RecommendationCorePlace> places,
    boolean degraded,
    List<String> warnings,
    boolean reasonFallback,
    boolean relaxed,
    int placeSearchCalls,
    int blogSearchCalls,
    int reasonGenerationCalls,
    int explorationRound,
    Set<String> usedVariantIds,
    boolean searchExhausted
) {

    public RecommendationCoreResult {
        places = List.copyOf(places);
        warnings = List.copyOf(warnings);
        usedVariantIds = Set.copyOf(usedVariantIds);
        if (places.isEmpty() || places.size() > 3) {
            throw new IllegalArgumentException("A successful core result requires one to three places.");
        }
        if (placeSearchCalls < 1 || placeSearchCalls > 8 ||
            blogSearchCalls < 0 || blogSearchCalls > 8 ||
            reasonGenerationCalls != 1) {
            throw new IllegalArgumentException("Core provider call counts are outside the contract.");
        }
        if (explorationRound < 0) {
            throw new IllegalArgumentException("Exploration round must not be negative.");
        }
    }

    public RecommendationCoreResult(
        List<RecommendationCorePlace> places,
        boolean degraded,
        List<String> warnings,
        boolean reasonFallback,
        boolean relaxed,
        int placeSearchCalls,
        int blogSearchCalls,
        int reasonGenerationCalls
    ) {
        this(
            places,
            degraded,
            warnings,
            reasonFallback,
            relaxed,
            placeSearchCalls,
            blogSearchCalls,
            reasonGenerationCalls,
            0,
            Set.of(),
            false
        );
    }

    public boolean partial() {
        return places.size() < 3;
    }

    public int resultCount() {
        return places.size();
    }

    /** Excludes the condition extraction call, which is outside the confirmed-condition core. */
    public int providerCalls() {
        return placeSearchCalls + blogSearchCalls + reasonGenerationCalls;
    }
}
