package com.placepick.recommendation.application.candidate;

import java.util.Objects;

public record LocationMatch(LocationConfidence confidence) {

    public LocationMatch {
        confidence = Objects.requireNonNull(confidence, "confidence");
    }

    public boolean accepted() {
        return confidence != LocationConfidence.MISMATCH;
    }
}
