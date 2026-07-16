package com.placepick.infrastructure.observability;

import com.placepick.recommendation.application.candidate.CandidateFunnel;
import com.placepick.recommendation.application.candidate.CandidateRejectionReason;
import com.placepick.recommendation.application.trace.RecommendationTraceSink;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

/** Low-cardinality counters for the Local-search-to-eligible-candidate funnel. */
@Component
public final class CandidateFunnelMetrics implements RecommendationTraceSink {

    private static final String METRIC_NAME = "placepick.recommendation.candidate.funnel";

    private final MeterRegistry registry;

    public CandidateFunnelMetrics(MeterRegistry registry) {
        this.registry = registry;
    }

    @Override
    public void candidateFunnelCompleted(CandidateFunnel funnel, boolean relaxed) {
        registry.counter(
            METRIC_NAME + ".runs",
            "relaxed", Boolean.toString(relaxed)
        ).increment();
        record("received", "none", relaxed, funnel.receivedCount());
        record("eligible", "none", relaxed, funnel.eligibleCount());
        for (CandidateRejectionReason reason : CandidateRejectionReason.values()) {
            record(
                "rejected",
                reason.name().toLowerCase(java.util.Locale.ROOT),
                relaxed,
                funnel.rejectedBy(reason)
            );
        }
    }

    private void record(String result, String reason, boolean relaxed, int count) {
        DistributionSummary.builder(METRIC_NAME)
            .description("Final candidate counts for one recommendation normalization funnel")
            .tag("result", result)
            .tag("reason", reason)
            .tag("relaxed", Boolean.toString(relaxed))
            .register(registry)
            .record(count);
    }
}
