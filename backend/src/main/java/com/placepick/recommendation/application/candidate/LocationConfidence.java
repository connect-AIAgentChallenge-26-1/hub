package com.placepick.recommendation.application.candidate;

public enum LocationConfidence {
    MISMATCH(0),
    APPROXIMATE(8),
    ALIAS(12),
    EXACT(15);

    private final int score;

    LocationConfidence(int score) {
        this.score = score;
    }

    public int score() {
        return score;
    }
}
