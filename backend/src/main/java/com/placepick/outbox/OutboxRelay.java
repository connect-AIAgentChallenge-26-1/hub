package com.placepick.outbox;

import com.placepick.stream.RecommendationStreamGateway;
import java.time.Clock;
import java.util.Objects;

public class OutboxRelay {

    private final OutboxRepository repository;
    private final RecommendationStreamGateway streamGateway;
    private final Clock clock;
    private final int batchSize;

    public OutboxRelay(
        OutboxRepository repository,
        RecommendationStreamGateway streamGateway,
        Clock clock,
        int batchSize
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.streamGateway = Objects.requireNonNull(streamGateway, "streamGateway");
        this.clock = Objects.requireNonNull(clock, "clock");
        if (batchSize < 1 || batchSize > 1_000) {
            throw new IllegalArgumentException("Outbox relay batch size is invalid.");
        }
        this.batchSize = batchSize;
    }

    public int relayBatch() {
        int published = 0;
        for (OutboxEvent event : repository.findUnpublished(batchSize)) {
            try {
                streamGateway.publish(event);
                repository.markPublished(event.id(), clock.instant());
                published++;
            } catch (RuntimeException exception) {
                repository.recordFailure(event.id(), "REDIS_PUBLISH_FAILED");
            }
        }
        return published;
    }
}
