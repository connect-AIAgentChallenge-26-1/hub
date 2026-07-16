package com.placepick.draft;

import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface RecommendationDraftRepository {

    void insert(RecommendationDraft draft);

    Optional<RecommendationDraft> findOwned(UUID draftId, UUID sessionId);

    Optional<RecommendationDraft> findOwnedForUpdate(UUID draftId, UUID sessionId);

    boolean confirm(
        UUID draftId,
        UUID sessionId,
        DraftRecommendationCondition condition,
        Instant updatedAt
    );

    boolean consume(
        UUID draftId,
        UUID sessionId,
        UUID jobId,
        Instant updatedAt
    );
}
