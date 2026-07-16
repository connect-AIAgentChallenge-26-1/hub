package com.placepick.infrastructure.observability;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.recommendation.job.RecommendationJobEvent;
import com.placepick.recommendation.job.RecommendationJobEventListener;
import com.placepick.recommendation.job.RecommendationJobEventPublisher;
import com.placepick.recommendation.job.RecommendationJobStreamPayload;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;

@Component
public final class RecommendationJobMetricsListener implements RecommendationJobEventListener {

    private final RecommendationJobEventPublisher publisher;
    private final ObjectMapper objectMapper;
    private final PlacePickMetrics metrics;

    public RecommendationJobMetricsListener(
        RecommendationJobEventPublisher publisher,
        ObjectMapper objectMapper,
        PlacePickMetrics metrics
    ) {
        this.publisher = publisher;
        this.objectMapper = objectMapper;
        this.metrics = metrics;
        publisher.addListener(this);
    }

    @Override
    public void onEvent(RecommendationJobEvent event) {
        try {
            RecommendationJobStreamPayload payload = objectMapper.readValue(
                event.payloadJson(),
                RecommendationJobStreamPayload.class
            );
            if (payload.snapshot() == null) {
                return;
            }
            metrics.jobStage(payload.snapshot().stage().name().toLowerCase(java.util.Locale.ROOT));
            if ("completed".equals(event.eventType())) {
                metrics.jobOutcome("success", payload.snapshot().degraded());
            } else if ("failed".equals(event.eventType())) {
                metrics.jobOutcome("failure", false);
            }
        } catch (JsonProcessingException ignored) {
            // Stored event validation and recovery remain authoritative; payload is never logged.
        }
    }

    @PreDestroy
    void close() {
        publisher.removeListener(this);
    }
}
