package com.placepick.livedev;

import com.placepick.recommendation.application.trace.RecommendationTraceSink;
import com.placepick.recommendation.workflow.application.RecommendationCoreUseCase;

@FunctionalInterface
public interface LiveDevCoreFactory {

    RecommendationCoreUseCase create(RecommendationTraceSink traceSink);
}
