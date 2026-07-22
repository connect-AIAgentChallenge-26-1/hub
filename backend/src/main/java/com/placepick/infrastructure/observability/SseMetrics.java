package com.placepick.infrastructure.observability;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;

/**
 * Records SSE lifecycle signals with closed labels only. Aggregate IDs, sessions, event IDs,
 * payloads, and exception messages must never become metric tags.
 */
@Component
public final class SseMetrics {

    private final MeterRegistry registry;

    public SseMetrics(MeterRegistry registry) {
        this.registry = Objects.requireNonNull(registry, "registry");
    }

    private SseMetrics() {
        this.registry = null;
    }

    public static SseMetrics noop() {
        return new SseMetrics();
    }

    public long opened(Stream stream, boolean resumed) {
        if (registry != null) {
            registry.counter(
                "placepick.sse.connections.opened",
                "stream", stream.tag()
            ).increment();
            if (resumed) {
                resumed(stream);
            }
        }
        return System.nanoTime();
    }

    public void resumed(Stream stream) {
        if (registry == null) {
            return;
        }
        registry.counter(
            "placepick.sse.connections.resumed",
            "stream", stream.tag()
        ).increment();
    }

    public void replayed(Stream stream, ReplayKind kind, long eventCount) {
        if (registry == null || eventCount <= 0) {
            return;
        }
        registry.counter(
            "placepick.sse.events.replayed",
            "stream", stream.tag(),
            "kind", kind.tag()
        ).increment(eventCount);
    }

    public void sendFailed(Stream stream, SendKind kind) {
        if (registry == null) {
            return;
        }
        registry.counter(
            "placepick.sse.send.failures",
            "stream", stream.tag(),
            "kind", kind.tag()
        ).increment();
    }

    public void closed(Stream stream, CloseReason reason, long openedAtNanos) {
        if (registry == null) {
            return;
        }
        registry.counter(
            "placepick.sse.connections.closed",
            "stream", stream.tag(),
            "reason", reason.tag()
        ).increment();
        long lifetimeNanos = Math.max(0L, System.nanoTime() - openedAtNanos);
        Timer.builder("placepick.sse.connection.lifetime")
            .description("SSE connection lifetime by stream and closed termination reason")
            .tag("stream", stream.tag())
            .tag("reason", reason.tag())
            .publishPercentileHistogram()
            .register(registry)
            .record(lifetimeNanos, TimeUnit.NANOSECONDS);
    }

    public enum Stream {
        RECOMMENDATION("recommendation"),
        ROOM("room");

        private final String tag;

        Stream(String tag) {
            this.tag = tag;
        }

        private String tag() {
            return tag;
        }
    }

    public enum ReplayKind {
        SNAPSHOT("snapshot"),
        PERSISTED_EVENT("persisted_event");

        private final String tag;

        ReplayKind(String tag) {
            this.tag = tag;
        }

        private String tag() {
            return tag;
        }
    }

    public enum SendKind {
        SNAPSHOT("snapshot"),
        EVENT("event"),
        HEARTBEAT("heartbeat");

        private final String tag;

        SendKind(String tag) {
            this.tag = tag;
        }

        private String tag() {
            return tag;
        }
    }

    public enum CloseReason {
        SERVER_COMPLETE("server_complete"),
        TERMINAL_EVENT("terminal_event"),
        CLIENT_COMPLETE("client_complete"),
        TIMEOUT("timeout"),
        ERROR("error"),
        SEND_FAILURE("send_failure"),
        UPSTREAM_FAILURE("upstream_failure"),
        SHUTDOWN("shutdown");

        private final String tag;

        CloseReason(String tag) {
            this.tag = tag;
        }

        private String tag() {
            return tag;
        }
    }
}
