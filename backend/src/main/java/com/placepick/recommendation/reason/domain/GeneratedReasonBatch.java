package com.placepick.recommendation.reason.domain;

import java.util.List;
import java.util.Objects;

public record GeneratedReasonBatch(String schemaVersion, List<PlaceReasonStatements> places) {

    public static final String SCHEMA_VERSION = "placepick.reason-statements.v2";

    public GeneratedReasonBatch {
        schemaVersion = Objects.requireNonNull(schemaVersion, "schemaVersion");
        places = List.copyOf(places);
    }

    @Override
    public String toString() {
        return "GeneratedReasonBatch[schemaVersion=" + schemaVersion + ", places=<redacted>]";
    }
}
