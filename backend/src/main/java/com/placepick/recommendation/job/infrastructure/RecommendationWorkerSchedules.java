package com.placepick.recommendation.job.infrastructure;

import com.placepick.outbox.OutboxRelay;
import com.placepick.stream.RecommendationStreamConsumer;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.scheduling.annotation.Scheduled;

public class RecommendationWorkerSchedules {

    private final OutboxRelay outboxRelay;
    private final RecommendationStreamConsumer streamConsumer;
    private final AtomicBoolean polling = new AtomicBoolean();

    public RecommendationWorkerSchedules(
        OutboxRelay outboxRelay,
        RecommendationStreamConsumer streamConsumer
    ) {
        this.outboxRelay = outboxRelay;
        this.streamConsumer = streamConsumer;
    }

    @Scheduled(fixedDelayString = "${placepick.worker.poll-delay:500}")
    public void relayAndConsume() {
        if (!polling.compareAndSet(false, true)) {
            return;
        }
        try {
            outboxRelay.relayBatch();
            streamConsumer.pollOnce();
        } finally {
            polling.set(false);
        }
    }
}
