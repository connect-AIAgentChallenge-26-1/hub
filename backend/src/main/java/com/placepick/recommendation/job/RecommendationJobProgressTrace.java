package com.placepick.recommendation.job;

import com.placepick.recommendation.application.candidate.CandidateQueryPlan;
import com.placepick.recommendation.application.port.out.BlogSearchQuery;
import com.placepick.recommendation.application.port.out.BlogSearchResult;
import com.placepick.recommendation.application.port.out.PlaceSearchQuery;
import com.placepick.recommendation.application.port.out.PlaceSearchResult;
import com.placepick.recommendation.application.trace.RecommendationTraceSink;
import com.placepick.recommendation.domain.candidate.NormalizedCandidate;
import com.placepick.recommendation.domain.scoring.RankedPlace;
import com.placepick.recommendation.domain.scoring.ScoredCandidate;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationOutcome;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

final class RecommendationJobProgressTrace implements RecommendationTraceSink {

    private final UUID jobId;
    private final RecommendationJobTransactionCoordinator coordinator;
    private final AtomicInteger completedBlogCalls = new AtomicInteger();

    RecommendationJobProgressTrace(
        UUID jobId,
        RecommendationJobTransactionCoordinator coordinator
    ) {
        this.jobId = jobId;
        this.coordinator = coordinator;
    }

    @Override
    public void queryPlanned(CandidateQueryPlan plan, boolean relaxed) {
        coordinator.progress(jobId, RecommendationJobStage.LOCAL_SEARCH, relaxed ? 25 : 10);
    }

    @Override
    public void localSearchCompleted(
        PlaceSearchQuery query,
        PlaceSearchResult result,
        boolean relaxed
    ) {
        coordinator.progress(jobId, RecommendationJobStage.LOCAL_SEARCH, relaxed ? 35 : 30);
    }

    @Override
    public void candidatesNormalized(List<NormalizedCandidate> candidates, boolean relaxed) {
        coordinator.progress(jobId, RecommendationJobStage.SCORING, relaxed ? 42 : 40);
    }

    @Override
    public void preliminaryRankingCompleted(List<ScoredCandidate> candidates) {
        coordinator.progress(jobId, RecommendationJobStage.SCORING, 45);
    }

    @Override
    public void blogSearchCompleted(
        NormalizedCandidate candidate,
        BlogSearchQuery query,
        BlogSearchResult result
    ) {
        int progress = Math.min(70, 45 + completedBlogCalls.incrementAndGet() * 5);
        coordinator.progress(jobId, RecommendationJobStage.BLOG_SEARCH, progress);
    }

    @Override
    public void blogSearchFailed(NormalizedCandidate candidate, String failureCode) {
        coordinator.progress(jobId, RecommendationJobStage.BLOG_SEARCH, 70);
    }

    @Override
    public void finalRankingCompleted(List<RankedPlace> places, boolean degraded) {
        coordinator.progress(jobId, RecommendationJobStage.SCORING, 75);
    }

    @Override
    public void reasonGenerationRequested(ReasonGenerationCommand command) {
        coordinator.progress(jobId, RecommendationJobStage.REASON_GENERATION, 80);
    }

    @Override
    public void reasonGenerationCompleted(
        ReasonGenerationOutcome outcome,
        boolean fallbackUsed
    ) {
        coordinator.progress(jobId, RecommendationJobStage.PERSISTING, 90);
    }
}
