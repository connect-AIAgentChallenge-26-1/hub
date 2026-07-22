package com.placepick.recommendation.embedding.domain;

import java.util.Objects;

/** One immutable, labeled preference/evidence pair used only by shadow evaluation. */
public record EmbeddingShadowExample(
    String caseId,
    ShadowCorpusSplit split,
    String preferenceText,
    String evidenceText,
    boolean expectedMatch
) {

    public EmbeddingShadowExample {
        caseId = Objects.requireNonNull(caseId, "caseId");
        split = Objects.requireNonNull(split, "split");
        if (!caseId.matches("shadow-(?:train|holdout)-\\d{2}")) {
            throw new IllegalArgumentException("Shadow case ID has an invalid format.");
        }
        preferenceText = requireText(preferenceText, "preferenceText");
        evidenceText = requireText(evidenceText, "evidenceText");
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field);
        if (value.isBlank() || value.codePointCount(0, value.length()) > 300 ||
            value.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException(field + " is outside the shadow corpus contract.");
        }
        return value;
    }

    @Override
    public String toString() {
        return "EmbeddingShadowExample[caseId=" + caseId +
            ", split=" + split +
            ", expectedMatch=" + expectedMatch +
            ", text=<redacted>]";
    }
}
