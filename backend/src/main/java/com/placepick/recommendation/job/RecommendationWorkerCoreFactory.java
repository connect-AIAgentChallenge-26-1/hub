package com.placepick.recommendation.job;

import com.placepick.recommendation.application.trace.RecommendationTraceSink;
import com.placepick.recommendation.workflow.application.RecommendationCoreUseCase;

@FunctionalInterface
public interface RecommendationWorkerCoreFactory {

    RecommendationCoreUseCase create(RecommendationTraceSink traceSink);
}
