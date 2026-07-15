package com.placepick.stream;

import com.placepick.recommendation.job.RecommendationJobWorker;
import com.placepick.recommendation.job.WorkerProcessingResult;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class RecommendationStreamConsumer {

    private final RecommendationStreamGateway gateway;
    private final RecommendationJobWorker worker;
    private final String consumerName;
    private final int batchSize;
    private final int maximumAttempts;
    private final Duration pendingIdle;

    public RecommendationStreamConsumer(
        RecommendationStreamGateway gateway,
        RecommendationJobWorker worker,
        String consumerName,
        int batchSize,
        int maximumAttempts,
        Duration pendingIdle
    ) {
        this.gateway = Objects.requireNonNull(gateway, "gateway");
        this.worker = Objects.requireNonNull(worker, "worker");
        this.consumerName = Objects.requireNonNull(consumerName, "consumerName");
        if (batchSize < 1 || batchSize > 100) {
            throw new IllegalArgumentException("Stream consumer batch size is invalid.");
        }
        if (maximumAttempts < 1 || maximumAttempts > 10) {
            throw new IllegalArgumentException("Stream maximum attempts is invalid.");
        }
        this.batchSize = batchSize;
        this.maximumAttempts = maximumAttempts;
        this.pendingIdle = Objects.requireNonNull(pendingIdle, "pendingIdle");
    }

    public int pollOnce() {
        List<RecommendationStreamRecord> records = new ArrayList<>(gateway.claimStale(
            consumerName,
            batchSize,
            pendingIdle
        ));
        if (records.size() < batchSize) {
            records.addAll(gateway.readNew(
                consumerName,
                batchSize - records.size(),
                Duration.ofMillis(100)
            ));
        }
        records.forEach(this::process);
        return records.size();
    }

    private void process(RecommendationStreamRecord record) {
        WorkerProcessingResult result = worker.process(record);
        if (result.disposition() == WorkerProcessingResult.Disposition.ACKNOWLEDGE) {
            gateway.acknowledge(record.recordId());
            return;
        }
        if (record.attempt() + 1 < maximumAttempts) {
            gateway.retry(record);
            gateway.acknowledge(record.recordId());
            return;
        }
        String failureCode = result.failureCode() == null
            ? "RETRY_EXHAUSTED"
            : result.failureCode();
        gateway.deadLetter(record, failureCode);
        worker.failAfterRetries(record, failureCode);
        gateway.acknowledge(record.recordId());
    }
}
