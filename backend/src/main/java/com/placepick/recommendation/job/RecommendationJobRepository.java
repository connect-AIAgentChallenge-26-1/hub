package com.placepick.recommendation.job;

import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.workflow.application.RecommendationCoreResult;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RecommendationJobRepository {

    void lockIdempotencyScope(UUID sessionId, String keyHash);

    Optional<IdempotencyReplay> findIdempotency(UUID sessionId, String keyHash);

    void insertJob(
        UUID jobId,
        UUID sessionId,
        UUID draftId,
        ConfirmedRecommendationCondition condition,
        Instant createdAt,
        Instant expiresAt
    );

    void insertIdempotency(
        UUID recordId,
        UUID sessionId,
        String keyHash,
        String requestHash,
        UUID jobId,
        Instant createdAt,
        Instant expiresAt
    );

    Optional<RecommendationJobSnapshot> findOwned(UUID jobId, UUID sessionId);

    Optional<RecommendationJobSubscriptionState> findSubscriptionState(
        UUID jobId,
        UUID sessionId
    );

    Optional<RecommendationJobSnapshot> lockJob(UUID jobId);

    void markProcessing(UUID jobId, Instant updatedAt);

    void updateProgress(
        UUID jobId,
        RecommendationJobStage stage,
        int progress,
        Instant updatedAt
    );

    void complete(UUID jobId, RecommendationCoreResult result, Instant updatedAt);

    void fail(UUID jobId, String failureCode, String safeMessage, Instant updatedAt);

    boolean isProcessed(UUID eventId, String consumerName);

    void markProcessed(UUID eventId, String consumerName, Instant processedAt);

    RecommendationJobEvent appendEvent(
        UUID eventId,
        UUID jobId,
        String eventType,
        String payloadJson,
        Instant occurredAt
    );

    List<RecommendationJobEvent> findEventsAfter(UUID jobId, long sequenceId, int limit);

    long latestEventSequence(UUID jobId);
}
