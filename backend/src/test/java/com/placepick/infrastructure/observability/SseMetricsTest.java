package com.placepick.infrastructure.observability;

import static org.assertj.core.api.Assertions.assertThat;

import com.placepick.infrastructure.observability.SseMetrics.CloseReason;
import com.placepick.infrastructure.observability.SseMetrics.ReplayKind;
import com.placepick.infrastructure.observability.SseMetrics.SendKind;
import com.placepick.infrastructure.observability.SseMetrics.Stream;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

class SseMetricsTest {

    @Test
    void recordsOnlyClosedLifecycleDimensions() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        SseMetrics metrics = new SseMetrics(registry);

        long openedAt = metrics.opened(Stream.RECOMMENDATION, true);
        metrics.replayed(Stream.RECOMMENDATION, ReplayKind.SNAPSHOT, 1L);
        metrics.replayed(Stream.RECOMMENDATION, ReplayKind.PERSISTED_EVENT, 2L);
        metrics.sendFailed(Stream.RECOMMENDATION, SendKind.EVENT);
        metrics.closed(Stream.RECOMMENDATION, CloseReason.SEND_FAILURE, openedAt);

        assertThat(registry.get("placepick.sse.connections.opened")
            .tag("stream", "recommendation").counter().count()).isEqualTo(1.0d);
        assertThat(registry.get("placepick.sse.connections.resumed")
            .tag("stream", "recommendation").counter().count()).isEqualTo(1.0d);
        assertThat(registry.get("placepick.sse.events.replayed")
            .tag("stream", "recommendation").tag("kind", "snapshot")
            .counter().count()).isEqualTo(1.0d);
        assertThat(registry.get("placepick.sse.events.replayed")
            .tag("stream", "recommendation").tag("kind", "persisted_event")
            .counter().count()).isEqualTo(2.0d);
        assertThat(registry.get("placepick.sse.send.failures")
            .tag("stream", "recommendation").tag("kind", "event")
            .counter().count()).isEqualTo(1.0d);
        assertThat(registry.get("placepick.sse.connections.closed")
            .tag("stream", "recommendation").tag("reason", "send_failure")
            .counter().count()).isEqualTo(1.0d);
        assertThat(registry.get("placepick.sse.connection.lifetime")
            .tag("stream", "recommendation").tag("reason", "send_failure")
            .timer().count()).isEqualTo(1L);
        assertThat(registry.getMeters()).allSatisfy(meter ->
            assertThat(meter.getId().getTags())
                .allSatisfy(tag -> assertThat(tag.getKey())
                    .isIn("stream", "kind", "reason"))
        );
    }
}
