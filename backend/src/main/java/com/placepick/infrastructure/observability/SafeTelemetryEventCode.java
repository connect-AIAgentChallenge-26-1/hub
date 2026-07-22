package com.placepick.infrastructure.observability;

/** Closed, payload-free event codes allowed in production logs and traces. */
public enum SafeTelemetryEventCode {
    WORKER_STARTED,
    WORKER_COMPLETED,
    WORKER_FAILED,
    OUTBOX_PUBLISHED,
    OUTBOX_PUBLISH_FAILED
}
