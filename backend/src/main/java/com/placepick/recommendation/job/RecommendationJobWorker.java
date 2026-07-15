package com.placepick.recommendation.job;

import com.placepick.recommendation.application.port.out.SearchProviderException;
import com.placepick.recommendation.application.port.out.SearchProviderFailure;
import com.placepick.recommendation.application.scoring.InsufficientCandidatesException;
import com.placepick.recommendation.workflow.application.RecommendationCoreResult;
import com.placepick.stream.RecommendationStreamRecord;
import java.util.Objects;

public class RecommendationJobWorker {

    private final RecommendationJobTransactionCoordinator coordinator;
    private final RecommendationWorkerCoreFactory coreFactory;

    public RecommendationJobWorker(
        RecommendationJobTransactionCoordinator coordinator,
        RecommendationWorkerCoreFactory coreFactory
    ) {
        this.coordinator = Objects.requireNonNull(coordinator, "coordinator");
        this.coreFactory = Objects.requireNonNull(coreFactory, "coreFactory");
    }

    public WorkerProcessingResult process(RecommendationStreamRecord record) {
        var envelope = record.envelope();
        JobProcessingClaim claim;
        try {
            claim = coordinator.claim(envelope.eventId(), envelope.payload().jobId());
        } catch (RuntimeException exception) {
            return WorkerProcessingResult.retry("JOB_CLAIM_FAILED");
        }
        if (claim.alreadyProcessed() || claim.terminal()) {
            return WorkerProcessingResult.acknowledge();
        }

        try {
            RecommendationCoreResult result = coreFactory.create(
                new RecommendationJobProgressTrace(claim.jobId(), coordinator)
            ).recommend(claim.condition());
            coordinator.complete(envelope.eventId(), claim.jobId(), result);
            return WorkerProcessingResult.acknowledge();
        } catch (InsufficientCandidatesException exception) {
            coordinator.fail(
                envelope.eventId(),
                claim.jobId(),
                "INSUFFICIENT_CANDIDATES",
                "조건에 맞는 추천 후보가 충분하지 않습니다."
            );
            return WorkerProcessingResult.acknowledge();
        } catch (SearchProviderException exception) {
            if (retryable(exception.failure())) {
                return WorkerProcessingResult.retry(exception.failure().name());
            }
            coordinator.fail(
                envelope.eventId(),
                claim.jobId(),
                exception.failure().name(),
                "장소 검색 Provider 응답을 처리하지 못했습니다."
            );
            return WorkerProcessingResult.acknowledge();
        } catch (RuntimeException exception) {
            return WorkerProcessingResult.retry("WORKFLOW_EXECUTION_FAILED");
        }
    }

    public void failAfterRetries(RecommendationStreamRecord record, String failureCode) {
        coordinator.fail(
            record.envelope().eventId(),
            record.envelope().payload().jobId(),
            failureCode,
            "제한된 재시도 후 추천 작업을 완료하지 못했습니다."
        );
    }

    private static boolean retryable(SearchProviderFailure failure) {
        return failure == SearchProviderFailure.RATE_LIMITED ||
            failure == SearchProviderFailure.PROVIDER_UNAVAILABLE;
    }
}
