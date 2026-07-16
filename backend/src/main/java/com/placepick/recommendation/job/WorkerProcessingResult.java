package com.placepick.recommendation.job;

public record WorkerProcessingResult(Disposition disposition, String failureCode) {

    public static WorkerProcessingResult acknowledge() {
        return new WorkerProcessingResult(Disposition.ACKNOWLEDGE, null);
    }

    public static WorkerProcessingResult retry(String failureCode) {
        return new WorkerProcessingResult(Disposition.RETRY, failureCode);
    }

    public enum Disposition {
        ACKNOWLEDGE,
        RETRY
    }
}
