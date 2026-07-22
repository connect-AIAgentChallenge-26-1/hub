package com.placepick.draft;

import com.placepick.recommendation.condition.application.ConditionWarnings;
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
    boolean manualEntryRequired,
    Instant expiresAt
) {
    public static DraftView from(RecommendationDraft draft) {
        return new DraftView(
            draft.id(),
            draft.status(),
            draft.condition(),
            ConditionWarnings.from(draft.condition()),
            draft.status() == DraftStatus.EXTRACTED && !draft.condition().isProcessable(),
            draft.expiresAt()
        );
    }

    public DraftView {
        warnings = List.copyOf(warnings);
    }
}
