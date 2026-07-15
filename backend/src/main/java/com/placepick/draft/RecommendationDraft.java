package com.placepick.draft;

import com.placepick.recommendation.condition.application.port.out.ConditionWarning;
import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public record RecommendationDraft(
    UUID id,
    UUID sessionId,
    DraftStatus status,
    String requestText,
    DraftRecommendationCondition condition,
    List<ConditionWarning> warnings,
    UUID consumedJobId,
    Instant createdAt,
    Instant updatedAt,
    Instant expiresAt
) {
    public RecommendationDraft {
        id = Objects.requireNonNull(id, "id");
        sessionId = Objects.requireNonNull(sessionId, "sessionId");
        status = Objects.requireNonNull(status, "status");
        requestText = Objects.requireNonNull(requestText, "requestText");
        condition = Objects.requireNonNull(condition, "condition");
        warnings = List.copyOf(warnings);
        createdAt = Objects.requireNonNull(createdAt, "createdAt");
        updatedAt = Objects.requireNonNull(updatedAt, "updatedAt");
        expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
    }

    public boolean expiredAt(Instant instant) {
        return !expiresAt.isAfter(instant);
    }

    @Override
    public String toString() {
        return "RecommendationDraft[id=" + id + ", sessionId=" + sessionId +
            ", status=" + status + ", requestText=<redacted>, expiresAt=" + expiresAt + "]";
    }
}
