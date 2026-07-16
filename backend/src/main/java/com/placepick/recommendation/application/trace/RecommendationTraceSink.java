package com.placepick.recommendation.application.trace;

import com.placepick.recommendation.application.candidate.CandidateQueryPlan;
import com.placepick.recommendation.application.port.out.BlogSearchQuery;
import com.placepick.recommendation.application.port.out.BlogSearchResult;
import com.placepick.recommendation.application.port.out.PlaceSearchQuery;
import com.placepick.recommendation.application.port.out.PlaceSearchResult;
import com.placepick.recommendation.domain.candidate.NormalizedCandidate;
import com.placepick.recommendation.domain.scoring.RankedPlace;
import com.placepick.recommendation.domain.scoring.ScoredCandidate;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationOutcome;
import java.util.List;

/**
 * Optional, side-effect-only observation boundary for developer tooling and future metrics.
 *
 * <p>The recommendation result remains the source of truth. Implementations must never change
 * ranking decisions or expose credentials and provider response bodies.</p>
 */
public interface RecommendationTraceSink {

    RecommendationTraceSink NONE = new RecommendationTraceSink() {
    };

    static RecommendationTraceSink none() {
        return NONE;
    }

    default void queryPlanned(CandidateQueryPlan plan, boolean relaxed) {
    }

    default void localSearchCompleted(
        PlaceSearchQuery query,
        PlaceSearchResult result,
        boolean relaxed
    ) {
    }

    default void candidatesNormalized(
        List<NormalizedCandidate> candidates,
        boolean relaxed
    ) {
    }

    default void preliminaryRankingCompleted(List<ScoredCandidate> candidates) {
    }

    default void blogSearchCompleted(
        NormalizedCandidate candidate,
        BlogSearchQuery query,
        BlogSearchResult result
    ) {
    }

    default void blogSearchFailed(NormalizedCandidate candidate, String failureCode) {
    }

    default void finalRankingCompleted(List<RankedPlace> places, boolean degraded) {
    }

    default void reasonGenerationRequested(ReasonGenerationCommand command) {
    }

    default void reasonGenerationCompleted(
        ReasonGenerationOutcome outcome,
        boolean fallbackUsed
    ) {
    }
}
