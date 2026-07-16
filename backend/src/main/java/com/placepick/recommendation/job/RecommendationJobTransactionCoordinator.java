package com.placepick.recommendation.job;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.recommendation.workflow.application.RecommendationCoreResult;
import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Short database transactions around worker state; provider calls happen outside this type. */
@Service
public class RecommendationJobTransactionCoordinator {

    public static final String CONSUMER_NAME = "recommendation-worker-v1";

    private final RecommendationJobRepository repository;
    private final RecommendationJobEventPublisher eventPublisher;
    private final TransactionTemplate transactions;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public RecommendationJobTransactionCoordinator(
        RecommendationJobRepository repository,
        RecommendationJobEventPublisher eventPublisher,
        TransactionTemplate transactions,
        ObjectMapper objectMapper,
        Clock clock
    ) {
        this.repository = repository;
        this.eventPublisher = eventPublisher;
        this.transactions = transactions;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    public JobProcessingClaim claim(UUID eventId, UUID jobId) {
        return Objects.requireNonNull(transactions.execute(status -> {
            RecommendationJobSnapshot snapshot = repository.lockJob(jobId)
                .orElseThrow(() -> new IllegalStateException("Recommendation job is absent."));
            if (repository.isProcessed(eventId, CONSUMER_NAME)) {
                return JobProcessingClaim.duplicate(jobId);
            }
            if (snapshot.terminal()) {
                repository.markProcessed(eventId, CONSUMER_NAME, clock.instant());
                return JobProcessingClaim.terminal(jobId);
            }
            Instant now = clock.instant();
            repository.markProcessing(jobId, now);
            appendEvent(jobId, "progress", current(jobId), now);
            return JobProcessingClaim.ready(jobId, snapshot.condition());
        }));
    }

    public void progress(UUID jobId, RecommendationJobStage stage, int progress) {
        transactions.executeWithoutResult(status -> {
            RecommendationJobSnapshot snapshot = repository.lockJob(jobId)
                .orElseThrow(() -> new IllegalStateException("Recommendation job is absent."));
            if (snapshot.terminal()) {
                return;
            }
            Instant now = clock.instant();
            repository.updateProgress(jobId, stage, progress, now);
            appendEvent(jobId, "progress", current(jobId), now);
        });
    }

    public void complete(
        UUID eventId,
        UUID jobId,
        RecommendationCoreResult result
    ) {
        transactions.executeWithoutResult(status -> {
            RecommendationJobSnapshot snapshot = repository.lockJob(jobId)
                .orElseThrow(() -> new IllegalStateException("Recommendation job is absent."));
            if (repository.isProcessed(eventId, CONSUMER_NAME)) {
                return;
            }
            Instant now = clock.instant();
            if (!snapshot.terminal()) {
                repository.complete(jobId, result, now);
                appendEvent(jobId, "completed", current(jobId), now);
            }
            repository.markProcessed(eventId, CONSUMER_NAME, now);
        });
    }

    public void fail(
        UUID eventId,
        UUID jobId,
        String failureCode,
        String safeMessage
    ) {
        transactions.executeWithoutResult(status -> {
            RecommendationJobSnapshot snapshot = repository.lockJob(jobId)
                .orElseThrow(() -> new IllegalStateException("Recommendation job is absent."));
            if (repository.isProcessed(eventId, CONSUMER_NAME)) {
                return;
            }
            Instant now = clock.instant();
            if (!snapshot.terminal()) {
                repository.fail(jobId, failureCode, safeMessage, now);
                appendEvent(jobId, "failed", current(jobId), now);
            }
            repository.markProcessed(eventId, CONSUMER_NAME, now);
        });
    }

    private void appendEvent(
        UUID jobId,
        String eventType,
        RecommendationJobSnapshot snapshot,
        Instant now
    ) {
        UUID eventId = UUID.randomUUID();
        RecommendationJobEvent event = repository.appendEvent(
            eventId,
            jobId,
            eventType,
            writeJson(new RecommendationJobStreamPayload(
                eventId.toString(),
                now,
                jobId,
                RecommendationJobView.from(snapshot)
            )),
            now
        );
        eventPublisher.publishAfterCommit(event);
    }

    private RecommendationJobSnapshot current(UUID jobId) {
        return repository.lockJob(jobId)
            .orElseThrow(() -> new IllegalStateException("Recommendation job is absent."));
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Recommendation job event could not be encoded.", exception);
        }
    }
}
