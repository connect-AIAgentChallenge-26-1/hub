package com.placepick.recommendation.reason.domain;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;

/** Strict single-place reason result returned by the external model. */
public record GeneratedReasonResult(
    String schemaVersion,
    String slot,
    List<GeneratedReasonStatement> statements
) {

    public static final String SCHEMA_VERSION = "placepick.reason-statements.v3";

    public GeneratedReasonResult {
        schemaVersion = Objects.requireNonNull(schemaVersion, "schemaVersion");
        slot = Objects.requireNonNull(slot, "slot");
        if (!slot.matches("p[1-3]")) {
            throw new IllegalArgumentException("Reason result slot must be p1, p2, or p3.");
        }
        statements = List.copyOf(statements);
        if (statements.isEmpty() || statements.size() > 3) {
            throw new IllegalArgumentException(
                "A generated reason result requires one to three statements."
            );
        }
        if (new HashSet<>(statements.stream().map(GeneratedReasonStatement::text).toList())
            .size() != statements.size()) {
            throw new IllegalArgumentException("Generated reason statements must be unique.");
        }
    }

    @Override
    public String toString() {
        return "GeneratedReasonResult[schemaVersion=" + schemaVersion +
            ", slot=" + slot + ", statements=<redacted>]";
    }
}
