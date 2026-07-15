package com.placepick.draft;

import com.placepick.recommendation.condition.application.port.out.ConditionWarning;
import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record DraftView(
    UUID draftId,
    DraftStatus status,
    DraftRecommendationCondition extractedCondition,
    List<ConditionWarning> warnings,
    Instant expiresAt
) {
    public static DraftView from(RecommendationDraft draft) {
        return new DraftView(
            draft.id(),
            draft.status(),
            draft.condition(),
            draft.warnings(),
            draft.expiresAt()
        );
    }

    public DraftView {
        warnings = List.copyOf(warnings);
    }
}
