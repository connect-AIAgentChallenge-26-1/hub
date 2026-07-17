package com.placepick.recommendation.reason.domain;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;

/** One model-generated statement tied only to opaque claims from the same place request. */
public record GeneratedReasonStatement(String text, List<String> claimIds) {

    public GeneratedReasonStatement {
        Objects.requireNonNull(text, "text");
        int length = text.codePointCount(0, text.length());
        if (text.isBlank() || length > 160 ||
            text.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException(
                "Generated reason statement must contain 1 to 160 safe characters."
            );
        }
        claimIds = List.copyOf(claimIds);
        if (claimIds.isEmpty() || claimIds.size() > 3 ||
            claimIds.stream().anyMatch(value ->
                value == null || !value.matches("p[1-3]-c[1-4]")) ||
            new HashSet<>(claimIds).size() != claimIds.size()) {
            throw new IllegalArgumentException(
                "Generated reason statement requires one to three unique claim IDs."
            );
        }
    }
}
