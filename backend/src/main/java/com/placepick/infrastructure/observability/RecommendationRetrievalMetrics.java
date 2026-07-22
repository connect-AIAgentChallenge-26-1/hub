package com.placepick.infrastructure.observability;

import com.placepick.recommendation.application.port.out.BlogSearchQuery;
import com.placepick.recommendation.application.port.out.BlogSearchResult;
import com.placepick.recommendation.application.port.out.PlaceSearchQuery;
import com.placepick.recommendation.application.port.out.PlaceSearchResult;
import com.placepick.recommendation.application.trace.RecommendationTraceSink;
import com.placepick.recommendation.domain.candidate.NormalizedCandidate;
import com.placepick.recommendation.domain.scoring.RankedPlace;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.Locale;
import java.util.List;
import org.springframework.stereotype.Component;

/** Low-cardinality retrieval and ranking quality signals. Provider values are never labels. */
@Component
public final class RecommendationRetrievalMetrics implements RecommendationTraceSink {

    private final MeterRegistry registry;

    public RecommendationRetrievalMetrics(MeterRegistry registry) {
        this.registry = registry;
    }

    @Override
    public void localSearchCompleted(
        PlaceSearchQuery query,
        PlaceSearchResult result,
        boolean expanded
    ) {
        String sort = query.sort().name().toLowerCase(Locale.ROOT);
        registry.counter(
            "placepick.recommendation.retrieval.local.calls",
            "sort", sort,
            "expanded", Boolean.toString(expanded),
            "outcome", "success"
        ).increment();
        summary(
            "placepick.recommendation.retrieval.local.items",
            "Items returned by one Local search call",
            "sort", sort
        ).record(result.items().size());
    }

    @Override
    public void localSearchFailed(
        PlaceSearchQuery query,
        String failureCode,
        boolean expanded
    ) {
        registry.counter(
            "placepick.recommendation.retrieval.local.calls",
            "sort", query.sort().name().toLowerCase(Locale.ROOT),
            "expanded", Boolean.toString(expanded),
            "outcome", "failure"
        ).increment();
    }

    @Override
    public void blogSearchCompleted(
        NormalizedCandidate candidate,
        BlogSearchQuery query,
        BlogSearchResult result
    ) {
        registry.counter(
            "placepick.recommendation.retrieval.blog.calls",
            "outcome", "success"
        ).increment();
        summary(
            "placepick.recommendation.retrieval.blog.items",
            "Items returned by one Blog search call",
            "outcome", "success"
        ).record(result.items().size());
    }

    @Override
    public void blogSearchFailed(NormalizedCandidate candidate, String failureCode) {
        registry.counter(
            "placepick.recommendation.retrieval.blog.calls",
            "outcome", "failure"
        ).increment();
    }

    @Override
    public void previouslyExposedCandidatesExcluded(int count) {
        DistributionSummary.builder(
                "placepick.recommendation.retrieval.previously.exposed"
            )
            .description("Previously exposed candidates excluded from an alternative search")
            .register(registry)
            .record(count);
    }

    @Override
    public void finalRankingCompleted(List<RankedPlace> places, boolean degraded) {
        String level = degraded ? "local_only" : "local_and_blog";
        registry.counter(
            "placepick.recommendation.evidence.candidates",
            "level", level
        ).increment(places.size());
        DistributionSummary evidence = DistributionSummary.builder(
                "placepick.recommendation.evidence.count"
            )
            .description("Validated Blog evidence count attached to one ranked candidate")
            .tag("level", level)
            .register(registry);
        places.forEach(place -> evidence.record(place.evidence().size()));
    }

    private DistributionSummary summary(
        String name,
        String description,
        String tagName,
        String tagValue
    ) {
        return DistributionSummary.builder(name)
            .description(description)
            .tag(tagName, tagValue)
            .register(registry);
    }
}
