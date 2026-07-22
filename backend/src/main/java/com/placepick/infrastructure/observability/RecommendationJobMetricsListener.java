package com.placepick.infrastructure.observability;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.recommendation.job.RecommendationJobEvent;
import com.placepick.recommendation.job.RecommendationJobEventListener;
import com.placepick.recommendation.job.RecommendationJobEventPublisher;
import com.placepick.recommendation.job.RecommendationJobStreamPayload;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.stereotype.Component;

@Component
public final class RecommendationJobMetricsListener implements RecommendationJobEventListener {

    private final RecommendationJobEventPublisher publisher;
    private final ObjectMapper objectMapper;
    private final PlacePickMetrics metrics;
    private final ConcurrentMap<UUID, StageSample> activeStages = new ConcurrentHashMap<>();

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
            String stage = payload.snapshot().stage().name().toLowerCase(Locale.ROOT);
            metrics.jobStage(stage);
            recordStageDuration(event.jobId(), stage, event.occurredAt(), event.eventType());
            if ("completed".equals(event.eventType())) {
                metrics.jobOutcome("success", payload.snapshot().degraded());
                metrics.jobResult(
                    payload.snapshot().partial(),
                    payload.snapshot().degraded(),
                    payload.snapshot().places().stream().map(place -> place.score()).toList()
                );
            } else if ("failed".equals(event.eventType())) {
                metrics.jobOutcome("failure", false);
                if (payload.snapshot().failure() != null
                    && "INSUFFICIENT_CANDIDATES".equals(
                        payload.snapshot().failure().errorCode()
                    )) {
                    metrics.candidateZero();
                }
            }
        } catch (JsonProcessingException ignored) {
            // Stored event validation and recovery remain authoritative; payload is never logged.
        }
    }

    private void recordStageDuration(
        UUID jobId,
        String stage,
        Instant occurredAt,
        String eventType
    ) {
        boolean terminal = "completed".equals(eventType) || "failed".equals(eventType);
        activeStages.compute(jobId, (ignored, previous) -> {
            if (previous != null && (!previous.stage().equals(stage) || terminal)) {
                metrics.jobStageDuration(
                    previous.stage(),
                    Duration.between(previous.startedAt(), occurredAt)
                );
            }
            if (terminal) {
                return null;
            }
            return previous == null || !previous.stage().equals(stage)
                ? new StageSample(stage, occurredAt)
                : previous;
        });
    }

    @PreDestroy
    void close() {
        publisher.removeListener(this);
        activeStages.clear();
    }

    private record StageSample(String stage, Instant startedAt) {
    }
}
