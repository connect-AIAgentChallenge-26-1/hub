package com.placepick.livedev;

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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.BiConsumer;

/** Converts core observations into provider-neutral developer trace events. */
final class LiveDevTraceCollector implements RecommendationTraceSink {

    private final BiConsumer<String, Map<String, Object>> publisher;

    LiveDevTraceCollector(BiConsumer<String, Map<String, Object>> publisher) {
        this.publisher = Objects.requireNonNull(publisher, "publisher");
    }

    @Override
    public void queryPlanned(CandidateQueryPlan plan, boolean relaxed) {
        publisher.accept("SEARCH_QUERY_PLANNED", Map.of(
            "query", plan.query(),
            "relaxed", relaxed,
            "includedPreferences", plan.includedPreferences().stream()
                .map(value -> Map.of(
                    "value", value.preference().value(),
                    "priority", value.preference().priority(),
                    "originalIndex", value.originalIndex()
                ))
                .toList()
        ));
    }

    @Override
    public void localSearchCompleted(
        PlaceSearchQuery query,
        PlaceSearchResult result,
        boolean relaxed
    ) {
        publisher.accept("NAVER_LOCAL_COMPLETED", Map.of(
            "query", query.query(),
            "limit", query.limit(),
            "relaxed", relaxed,
            "total", result.total(),
            "items", result.items().stream().map(LiveDevApiDto.PlaceSearchItemView::from).toList()
        ));
    }

    @Override
    public void candidatesNormalized(
        List<NormalizedCandidate> candidates,
        boolean relaxed
    ) {
        publisher.accept("CANDIDATES_NORMALIZED", Map.of(
            "relaxed", relaxed,
            "count", candidates.size(),
            "candidates", candidates.stream().map(LiveDevApiDto.CandidateView::from).toList()
        ));
    }

    @Override
    public void preliminaryRankingCompleted(List<ScoredCandidate> candidates) {
        publisher.accept("PRELIMINARY_RANKING_COMPLETED", Map.of(
            "count", candidates.size(),
            "candidates", candidates.stream()
                .map(LiveDevApiDto.ScoredCandidateView::from)
                .toList()
        ));
    }

    @Override
    public void blogSearchCompleted(
        NormalizedCandidate candidate,
        BlogSearchQuery query,
        BlogSearchResult result
    ) {
        publisher.accept("NAVER_BLOG_COMPLETED", Map.of(
            "candidate", LiveDevApiDto.CandidateView.from(candidate),
            "query", query.query(),
            "limit", query.limit(),
            "total", result.total(),
            "items", result.items().stream().map(LiveDevApiDto.BlogSearchItemView::from).toList()
        ));
    }

    @Override
    public void blogSearchFailed(NormalizedCandidate candidate, String failureCode) {
        publisher.accept("NAVER_BLOG_FAILED", Map.of(
            "candidate", LiveDevApiDto.CandidateView.from(candidate),
            "failureCode", failureCode
        ));
    }

    @Override
    public void finalRankingCompleted(List<RankedPlace> places, boolean degraded) {
        publisher.accept("FINAL_RANKING_COMPLETED", Map.of(
            "degraded", degraded,
            "places", places.stream().map(LiveDevApiDto.RankedPlaceView::from).toList()
        ));
    }

    @Override
    public void reasonGenerationRequested(ReasonGenerationCommand command) {
        publisher.accept("ELICE_REASON_REQUESTED", Map.of(
            "request", LiveDevApiDto.ReasonRequestView.from(command)
        ));
    }

    @Override
    public void reasonGenerationCompleted(
        ReasonGenerationOutcome outcome,
        boolean fallbackUsed
    ) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("fallbackUsed", fallbackUsed);
        if (outcome == null) {
            data.put("errorCode", "UNEXPECTED_PROVIDER_FAILURE");
        } else {
            data.put("errorCode", outcome.errorCode().name());
            if (outcome.generated()) {
                data.put(
                    "places",
                    outcome.batch().places().stream()
                        .map(LiveDevApiDto.GeneratedReasonView::from)
                        .toList()
                );
            }
        }
        publisher.accept("ELICE_REASON_COMPLETED", data);
    }
}
