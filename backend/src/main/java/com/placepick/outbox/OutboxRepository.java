package com.placepick.outbox;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface OutboxRepository {

    void insert(OutboxEvent event);

    List<OutboxEvent> findUnpublished(int limit);

    void markPublished(UUID eventId, Instant publishedAt);

    void recordFailure(UUID eventId, String safeErrorCode);
}
