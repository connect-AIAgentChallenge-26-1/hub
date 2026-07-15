package com.placepick.recommendation.job;

@FunctionalInterface
public interface RecommendationJobEventListener {

    void onEvent(RecommendationJobEvent event);
}
