package com.placepick.recommendation.application.trace;

import com.placepick.recommendation.application.candidate.CandidateFunnel;
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
import com.placepick.recommendation.reason.application.ReasonBatchValidationCode;
import java.util.List;
import java.util.Objects;

/** Creates trace fan-out without coupling the recommendation application layer to metrics. */
public final class RecommendationTraceSinks {

    private RecommendationTraceSinks() {
    }

    public static RecommendationTraceSink compose(
        RecommendationTraceSink first,
        RecommendationTraceSink second
    ) {
        return new Composite(
            Objects.requireNonNull(first, "first"),
            Objects.requireNonNull(second, "second")
        );
    }

    private record Composite(
        RecommendationTraceSink first,
        RecommendationTraceSink second
    ) implements RecommendationTraceSink {

        @Override
        public void queryPlanned(CandidateQueryPlan plan, boolean relaxed) {
            first.queryPlanned(plan, relaxed);
            second.queryPlanned(plan, relaxed);
        }

        @Override
        public void localSearchCompleted(
            PlaceSearchQuery query,
            PlaceSearchResult result,
            boolean relaxed
        ) {
            first.localSearchCompleted(query, result, relaxed);
            second.localSearchCompleted(query, result, relaxed);
        }

        @Override
        public void localSearchFailed(
            PlaceSearchQuery query,
            String failureCode,
            boolean relaxed
        ) {
            first.localSearchFailed(query, failureCode, relaxed);
            second.localSearchFailed(query, failureCode, relaxed);
        }

        @Override
        public void candidatesNormalized(
            List<NormalizedCandidate> candidates,
            boolean relaxed
        ) {
            first.candidatesNormalized(candidates, relaxed);
            second.candidatesNormalized(candidates, relaxed);
        }

        @Override
        public void candidatesNormalized(
            List<NormalizedCandidate> candidates,
            CandidateFunnel funnel,
            boolean relaxed
        ) {
            first.candidatesNormalized(candidates, funnel, relaxed);
            second.candidatesNormalized(candidates, funnel, relaxed);
        }

        @Override
        public void candidateFunnelCompleted(CandidateFunnel funnel, boolean relaxed) {
            first.candidateFunnelCompleted(funnel, relaxed);
            second.candidateFunnelCompleted(funnel, relaxed);
        }

        @Override
        public void previouslyExposedCandidatesExcluded(int count) {
            first.previouslyExposedCandidatesExcluded(count);
            second.previouslyExposedCandidatesExcluded(count);
        }

        @Override
        public void preliminaryRankingCompleted(List<ScoredCandidate> candidates) {
            first.preliminaryRankingCompleted(candidates);
            second.preliminaryRankingCompleted(candidates);
        }

        @Override
        public void blogSearchCompleted(
            NormalizedCandidate candidate,
            BlogSearchQuery query,
            BlogSearchResult result
        ) {
            first.blogSearchCompleted(candidate, query, result);
            second.blogSearchCompleted(candidate, query, result);
        }

        @Override
        public void blogSearchFailed(NormalizedCandidate candidate, String failureCode) {
            first.blogSearchFailed(candidate, failureCode);
            second.blogSearchFailed(candidate, failureCode);
        }

        @Override
        public void finalRankingCompleted(List<RankedPlace> places, boolean degraded) {
            first.finalRankingCompleted(places, degraded);
            second.finalRankingCompleted(places, degraded);
        }

        @Override
        public void reasonGenerationRequested(ReasonGenerationCommand command) {
            first.reasonGenerationRequested(command);
            second.reasonGenerationRequested(command);
        }

        @Override
        public void reasonGenerationCompleted(
            ReasonGenerationOutcome outcome,
            boolean fallbackUsed
        ) {
            first.reasonGenerationCompleted(outcome, fallbackUsed);
            second.reasonGenerationCompleted(outcome, fallbackUsed);
        }

        @Override
        public void reasonValidationFailed(ReasonBatchValidationCode code) {
            first.reasonValidationFailed(code);
            second.reasonValidationFailed(code);
        }
    }
}
