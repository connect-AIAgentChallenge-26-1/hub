package com.placepick.recommendation.reason.application;

import com.placepick.recommendation.reason.domain.ReasonStatement;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public record EnrichedPlaceReason(
    UUID placeId,
    List<ReasonStatement> statements,
    List<String> cautions,
    String shareText,
    boolean fallbackUsed
) {

    public EnrichedPlaceReason {
        placeId = Objects.requireNonNull(placeId, "placeId");
        statements = List.copyOf(statements);
        if (statements.isEmpty() || statements.size() > 3) {
            throw new IllegalArgumentException("Enriched reason requires one to three statements.");
        }
        cautions = List.copyOf(cautions);
        shareText = Objects.requireNonNull(shareText, "shareText");
        if (shareText.isBlank()) {
            throw new IllegalArgumentException("shareText must not be blank.");
        }
    }
}
