package com.placepick.infrastructure.observability;

import static org.assertj.core.api.Assertions.assertThat;

import com.placepick.recommendation.application.candidate.CandidateFunnel;
import com.placepick.recommendation.application.candidate.CandidateRejectionReason;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import io.micrometer.prometheusmetrics.PrometheusConfig;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class CandidateFunnelMetricsTest {

    @Test
    void recordsOnlyClosedCountTagsWithoutCandidateOrProviderValues() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        CandidateFunnelMetrics metrics = new CandidateFunnelMetrics(registry);
        CandidateFunnel funnel = new CandidateFunnel(
            6,
            1,
            Map.of(
                CandidateRejectionReason.MISSING_IDENTITY, 1,
                CandidateRejectionReason.LOCATION, 1,
                CandidateRejectionReason.TYPE, 1,
                CandidateRejectionReason.EXCLUSION, 1,
                CandidateRejectionReason.DUPLICATE, 1
            )
        );

        metrics.candidateFunnelCompleted(funnel, true);

        assertThat(summary(registry, "received", "none", "true")).isEqualTo(6.0);
        assertThat(summary(registry, "eligible", "none", "true")).isEqualTo(1.0);
        for (CandidateRejectionReason reason : CandidateRejectionReason.values()) {
            assertThat(summary(
                registry,
                "rejected",
                reason.name().toLowerCase(java.util.Locale.ROOT),
                "true"
            )).isEqualTo(1.0);
        }
        assertThat(registry.getMeters()).allSatisfy(meter ->
            assertThat(meter.getId().getTags()).extracting(tag -> tag.getKey())
                .allMatch(Set.of("reason", "relaxed", "result")::contains)
        );
        assertThat(registry.get("placepick.recommendation.candidate.funnel.runs")
            .tag("relaxed", "true").counter().count()).isEqualTo(1.0);
    }

    @Test
    void prometheusNamesMatchTheProvisionedDashboardContract() {
        PrometheusMeterRegistry registry = new PrometheusMeterRegistry(
            PrometheusConfig.DEFAULT
        );
        CandidateFunnelMetrics metrics = new CandidateFunnelMetrics(registry);

        metrics.candidateFunnelCompleted(
            new CandidateFunnel(0, 0, Map.of()),
            false
        );

        assertThat(registry.scrape())
            .contains("placepick_recommendation_candidate_funnel_count")
            .contains("placepick_recommendation_candidate_funnel_sum")
            .contains("placepick_recommendation_candidate_funnel_runs_total");
    }

    private static double summary(
        SimpleMeterRegistry registry,
        String result,
        String reason,
        String relaxed
    ) {
        return registry.get("placepick.recommendation.candidate.funnel")
            .tags("result", result, "reason", reason, "relaxed", relaxed)
            .summary()
            .totalAmount();
    }
}
