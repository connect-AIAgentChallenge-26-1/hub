package com.placepick.lifecycle;

public record RetentionCleanupReport(
    int rooms,
    int jobs,
    int drafts,
    int idempotencyRecords,
    int processedEvents,
    int publishedOutboxEvents,
    int sessions
) {
    public int totalDeleted() {
        return rooms + jobs + drafts + idempotencyRecords + processedEvents
            + publishedOutboxEvents + sessions;
    }
}
