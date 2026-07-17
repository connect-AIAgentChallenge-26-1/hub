package com.placepick.recommendation.application.scoring;

import com.placepick.recommendation.domain.scoring.EvidenceLevel;
import com.placepick.recommendation.domain.scoring.RankedPlace;
import com.placepick.recommendation.domain.scoring.RecommendationWarning;
import java.util.List;
import java.util.Objects;
import java.util.Set;

public record CandidateRankingResult(
    List<RankedPlace> places,
    EvidenceLevel evidenceLevel,
    boolean degraded,
    List<RecommendationWarning> warnings,
    boolean relaxed,
    int placeSearchCalls,
    int blogSearchCalls,
    int explorationRound,
    Set<String> usedVariantIds,
    boolean searchExhausted
) {

    public CandidateRankingResult {
        places = List.copyOf(places);
        if (places.isEmpty() || places.size() > 3) {
            throw new IllegalArgumentException("A successful ranking must contain one to three places.");
        }
        evidenceLevel = Objects.requireNonNull(evidenceLevel, "evidenceLevel");
        warnings = List.copyOf(warnings);
        if (placeSearchCalls < 1 || placeSearchCalls > 8) {
            throw new IllegalArgumentException("Place search calls must be between one and eight.");
        }
        if (blogSearchCalls < 0 || blogSearchCalls > 8) {
            throw new IllegalArgumentException("Blog search calls must be between zero and eight.");
        }
        if (explorationRound < 0) {
            throw new IllegalArgumentException("Exploration round must not be negative.");
        }
        usedVariantIds = Set.copyOf(usedVariantIds);
    }

    public CandidateRankingResult(
        List<RankedPlace> places,
        EvidenceLevel evidenceLevel,
        boolean degraded,
        List<RecommendationWarning> warnings,
        boolean relaxed,
        int placeSearchCalls,
        int blogSearchCalls
    ) {
        this(
            places,
            evidenceLevel,
            degraded,
            warnings,
            relaxed,
            placeSearchCalls,
            blogSearchCalls,
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
}
