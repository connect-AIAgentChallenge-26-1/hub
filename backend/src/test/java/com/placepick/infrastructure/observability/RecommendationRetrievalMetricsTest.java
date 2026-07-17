package com.placepick.infrastructure.observability;

import static org.assertj.core.api.Assertions.assertThat;

import com.placepick.recommendation.application.port.out.BlogSearchQuery;
import com.placepick.recommendation.application.port.out.BlogSearchResult;
import com.placepick.recommendation.application.port.out.PlaceSearchQuery;
import com.placepick.recommendation.application.port.out.PlaceSearchResult;
import com.placepick.recommendation.application.port.out.PlaceSearchSort;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import io.micrometer.prometheusmetrics.PrometheusConfig;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import java.util.List;
import org.junit.jupiter.api.Test;

class RecommendationRetrievalMetricsTest {

    @Test
    void recordsOnlyClosedLowCardinalityDimensions() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        RecommendationRetrievalMetrics metrics = new RecommendationRetrievalMetrics(registry);

        metrics.localSearchCompleted(
            new PlaceSearchQuery("redacted", 5, PlaceSearchSort.POPULARITY),
            new PlaceSearchResult(237, List.of()),
            true
        );
        metrics.localSearchFailed(
            new PlaceSearchQuery("redacted", 5, PlaceSearchSort.POPULARITY),
            "DO_NOT_USE_AS_TAG",
            true
        );
        metrics.blogSearchCompleted(
            null,
            new BlogSearchQuery("redacted", 10),
            new BlogSearchResult(12, List.of())
        );
        metrics.blogSearchFailed(null, "DO_NOT_USE_AS_TAG");
        metrics.previouslyExposedCandidatesExcluded(3);
        new PlacePickMetrics(registry).jobResult(true, true, List.of(63));

        assertThat(registry.get("placepick.recommendation.retrieval.local.calls")
            .tags("sort", "popularity", "expanded", "true", "outcome", "success")
            .counter().count()).isEqualTo(1);
        assertThat(registry.get("placepick.recommendation.retrieval.local.calls")
            .tags("sort", "popularity", "expanded", "true", "outcome", "failure")
            .counter().count()).isEqualTo(1);
        assertThat(registry.get("placepick.recommendation.retrieval.blog.calls")
            .tag("outcome", "success").counter().count()).isEqualTo(1);
        assertThat(registry.get("placepick.recommendation.retrieval.blog.calls")
            .tag("outcome", "failure").counter().count()).isEqualTo(1);
        assertThat(registry.get("placepick.recommendation.results")
            .tags("partial", "true", "degraded", "true")
            .counter().count()).isEqualTo(1);
        assertThat(registry.getMeters()).allSatisfy(meter ->
            assertThat(meter.getId().getTags().toString())
                .doesNotContain("redacted", "DO_NOT_USE_AS_TAG")
        );
    }

    @Test
    void prometheusNamesMatchTheProvisionedDashboardContract() {
        PrometheusMeterRegistry registry = new PrometheusMeterRegistry(
            PrometheusConfig.DEFAULT
        );
        RecommendationRetrievalMetrics metrics = new RecommendationRetrievalMetrics(registry);

        metrics.localSearchCompleted(
            new PlaceSearchQuery("redacted", 5, PlaceSearchSort.ACCURACY),
            new PlaceSearchResult(0, List.of()),
            false
        );
        metrics.previouslyExposedCandidatesExcluded(1);
        new PlacePickMetrics(registry).jobResult(false, false, List.of(63));

        assertThat(registry.scrape())
            .contains("placepick_recommendation_retrieval_local_calls_total")
            .contains("placepick_recommendation_retrieval_local_items_count")
            .contains("placepick_recommendation_retrieval_previously_exposed_count")
            .contains("placepick_recommendation_results_total")
            .contains("placepick_recommendation_result_score_count");
    }

}
