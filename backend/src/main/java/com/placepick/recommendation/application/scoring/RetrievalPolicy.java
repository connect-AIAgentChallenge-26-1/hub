package com.placepick.recommendation.application.scoring;

/** Configurable quality and provider-call budget for one recommendation execution. */
public record RetrievalPolicy(
    int defaultMaximumLocalCalls,
    int alternativeMaximumLocalCalls,
    int targetCandidatePoolSize,
    int preliminaryBlogPoolSize,
    int blogDisplayLimit
) {

    public RetrievalPolicy {
        requireRange(defaultMaximumLocalCalls, 2, 6, "defaultMaximumLocalCalls");
        requireRange(
            alternativeMaximumLocalCalls,
            defaultMaximumLocalCalls,
            8,
            "alternativeMaximumLocalCalls"
        );
        requireRange(targetCandidatePoolSize, 3, 100, "targetCandidatePoolSize");
        requireRange(preliminaryBlogPoolSize, 3, 8, "preliminaryBlogPoolSize");
        requireRange(blogDisplayLimit, 1, 10, "blogDisplayLimit");
    }

    public static RetrievalPolicy qualityDefaults() {
        return new RetrievalPolicy(6, 8, 10, 8, 10);
    }

    public int maximumLocalCalls(boolean alternative) {
        return alternative ? alternativeMaximumLocalCalls : defaultMaximumLocalCalls;
    }

    private static void requireRange(int value, int minimum, int maximum, String name) {
        if (value < minimum || value > maximum) {
            throw new IllegalArgumentException(name + " is outside the supported range.");
        }
    }
}
