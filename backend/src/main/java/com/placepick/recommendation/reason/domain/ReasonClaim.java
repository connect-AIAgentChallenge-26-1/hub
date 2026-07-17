package com.placepick.recommendation.reason.domain;

import java.util.Objects;

/**
 * Provider-neutral claim exposed to the reason model.
 *
 * <p>The opaque {@code claimId} is scoped to one place request. {@code evidenceId} never appears
 * in model output and is only used by the server to restore the original evidence relationship
 * after validation.</p>
 */
public record ReasonClaim(
    String claimId,
    String evidenceId,
    ReasonEvidenceType type,
    String title,
    String summary
) {

    public ReasonClaim {
        claimId = requireIdentifier(claimId, "claimId", "p[1-3]-c[1-4]");
        evidenceId = requireIdentifier(evidenceId, "evidenceId", "[A-Za-z0-9._:-]{1,80}");
        type = Objects.requireNonNull(type, "type");
        title = requireText(title, "title", 200);
        summary = requireText(summary, "summary", 500);
        if (title.isBlank() && summary.isBlank()) {
            throw new IllegalArgumentException("Reason claim requires text.");
        }
    }

    private static String requireIdentifier(
        String value,
        String field,
        String pattern
    ) {
        Objects.requireNonNull(value, field);
        if (!value.matches(pattern)) {
            throw new IllegalArgumentException(field + " has an invalid format.");
        }
        return value;
    }

    private static String requireText(String value, String field, int maximum) {
        Objects.requireNonNull(value, field);
        if (value.codePointCount(0, value.length()) > maximum ||
            value.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException(field + " is outside the reason claim contract.");
        }
        return value;
    }
}
