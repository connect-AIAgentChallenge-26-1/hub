package com.placepick.recommendation.condition.application;

/** Receives only closed, value-free extraction resolution signals. */
@FunctionalInterface
public interface ConditionExtractionRecoveryObserver {

    void completed(ConditionExtractionResolution resolution);

    static ConditionExtractionRecoveryObserver none() {
        return ignored -> {
        };
    }
}
