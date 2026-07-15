package com.placepick.infrastructure.observability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.recommendation.job.RecommendationJobEvent;
import com.placepick.recommendation.job.RecommendationJobEventPublisher;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RecommendationJobMetricsListenerTest {

    @Test
    void recordsClosedStageOutcomeAndDegradedLabelsFromTheStoredEnvelope() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        RecommendationJobMetricsListener listener = new RecommendationJobMetricsListener(
            new RecommendationJobEventPublisher(),
            new ObjectMapper().findAndRegisterModules(),
            new PlacePickMetrics(registry)
        );
        UUID jobId = UUID.randomUUID();
        String now = "2026-07-16T03:04:05Z";
        String payload = """
            {
              "eventId": "event-safe",
              "occurredAt": "%s",
              "aggregateId": "%s",
              "snapshot": {
                "jobId": "%s",
                "status": "COMPLETED",
                "stage": "FINISHED",
                "progress": 100,
                "degraded": true,
                "warnings": [],
                "condition": null,
                "places": [],
                "failure": null,
                "createdAt": "%s",
                "updatedAt": "%s",
                "expiresAt": "2026-07-16T03:34:05Z"
              }
            }
            """.formatted(now, jobId, jobId, now, now);

        listener.onEvent(event(jobId, "completed", payload));

        assertThat(registry.get("placepick.job.stage.events")
            .tag("stage", "finished").counter().count()).isEqualTo(1.0);
        assertThat(registry.get("placepick.job.outcomes")
            .tags("outcome", "success", "degraded", "true")
            .counter().count()).isEqualTo(1.0);
    }

    @Test
    void ignoresMalformedPayloadWithoutIncludingItInAnExceptionOrMetric() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        RecommendationJobMetricsListener listener = new RecommendationJobMetricsListener(
            new RecommendationJobEventPublisher(),
            new ObjectMapper(),
            new PlacePickMetrics(registry)
        );

        assertThatCode(() -> listener.onEvent(event(
            UUID.randomUUID(),
            "failed",
            "sensitive malformed payload"
        ))).doesNotThrowAnyException();
        assertThat(registry.find("placepick.job.outcomes").meters()).isEmpty();
    }

    @Test
    void collapsesUnexpectedMetricValuesInsteadOfCreatingUnboundedLabels() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        PlacePickMetrics metrics = new PlacePickMetrics(registry);

        metrics.jobStage(UUID.randomUUID().toString());
        metrics.jobOutcome("request-specific-value", false);
        metrics.rateLimitRejected("client-specific-value");
        metrics.deadLetter("provider-body-value");

        assertThat(registry.get("placepick.job.stage.events")
            .tag("stage", "unknown").counter().count()).isEqualTo(1.0);
        assertThat(registry.get("placepick.job.outcomes")
            .tags("outcome", "unknown", "degraded", "false")
            .counter().count()).isEqualTo(1.0);
        assertThat(registry.get("placepick.rate.limit.rejected")
            .tag("scope", "unknown").counter().count()).isEqualTo(1.0);
        assertThat(registry.get("placepick.stream.dlq")
            .tag("reason", "unknown").counter().count()).isEqualTo(1.0);
    }

    private static RecommendationJobEvent event(UUID jobId, String type, String payload) {
        return new RecommendationJobEvent(
            1,
            UUID.randomUUID(),
            jobId,
            type,
            payload,
            Instant.parse("2026-07-16T03:04:05Z")
        );
    }
}
