package com.placepick.recommendation.reason.application;

import java.util.List;

public record ReasonEnrichmentResult(
    List<EnrichedPlaceReason> places,
    int generationCalls
) {

    public ReasonEnrichmentResult {
        places = List.copyOf(places);
        if (places.isEmpty() || places.size() > 3) {
            throw new IllegalArgumentException("Reason enrichment requires one to three places.");
        }
        if (generationCalls < places.size() || generationCalls > places.size() * 2) {
            throw new IllegalArgumentException(
                "Reason generation calls must match the per-place retry budget."
            );
        }
    }

    public boolean fallbackUsed() {
        return places.stream().anyMatch(EnrichedPlaceReason::fallbackUsed);
    }
}
