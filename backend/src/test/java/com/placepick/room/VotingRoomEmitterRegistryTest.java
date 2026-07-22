package com.placepick.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.Mockito.mock;

import com.placepick.infrastructure.observability.SseMetrics;
import com.placepick.security.RateLimitExceededException;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class VotingRoomEmitterRegistryTest {

    private static final Instant NOW = Instant.parse("2026-07-16T00:00:00Z");

    private final VotingRoomEmitterRegistry registry = new VotingRoomEmitterRegistry(
        new VotingRoomEventPublisher(),
        mock(VotingRoomService.class),
        Clock.fixed(NOW, ZoneOffset.UTC)
    );

    @AfterEach
    void closeRegistry() {
        registry.close();
    }

    @Test
    void rejectsTheSixthConnectionForOneSessionAsRateLimited() {
        UUID roomId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        VotingRoomService.RoomSubscriptionContext context = context(roomId, sessionId);
        for (int index = 0; index < 5; index++) {
            registry.register(context, 0L, new SseEmitter());
        }

        RateLimitExceededException exception = catchThrowableOfType(
            RateLimitExceededException.class,
            () -> registry.register(context, 0L, new SseEmitter())
        );

        assertThat(exception.retryAfterSeconds()).isEqualTo(15L);
        assertThat(registry.activeConnectionCount()).isEqualTo(5);
    }

    @Test
    void rejectsTheTwentyFirstConnectionForOneRoomAsRateLimited() {
        UUID roomId = UUID.randomUUID();
        for (int index = 0; index < 20; index++) {
            registry.register(context(roomId, UUID.randomUUID()), 0L, new SseEmitter());
        }

        RateLimitExceededException exception = catchThrowableOfType(
            RateLimitExceededException.class,
            () -> registry.register(
                context(roomId, UUID.randomUUID()),
                0L,
                new SseEmitter()
            )
        );

        assertThat(exception.retryAfterSeconds()).isEqualTo(15L);
        assertThat(registry.activeConnectionCount()).isEqualTo(20);
    }

    @Test
    void recordsResumeSnapshotSendFailureCloseAndLifetime() {
        SimpleMeterRegistry meters = new SimpleMeterRegistry();
        VotingRoomEmitterRegistry observedRegistry = new VotingRoomEmitterRegistry(
            new VotingRoomEventPublisher(),
            mock(VotingRoomService.class),
            Clock.fixed(NOW, ZoneOffset.UTC),
            new SseMetrics(meters)
        );
        VotingRoomService.RoomSubscriptionContext context = context(
            UUID.randomUUID(),
            UUID.randomUUID()
        );
        var registration = observedRegistry.register(
            context,
            8L,
            new FailAfterFirstSseEmitter()
        );

        assertThat(observedRegistry.sendSnapshot(registration, context.snapshot())).isTrue();
        observedRegistry.heartbeat();

        assertThat(observedRegistry.activeConnectionCount()).isZero();
        assertThat(meters.get("placepick.sse.connections.opened")
            .tag("stream", "room").counter().count()).isEqualTo(1.0d);
        assertThat(meters.get("placepick.sse.connections.resumed")
            .tag("stream", "room").counter().count()).isEqualTo(1.0d);
        assertThat(meters.get("placepick.sse.events.replayed")
            .tag("stream", "room").tag("kind", "snapshot")
            .counter().count()).isEqualTo(1.0d);
        assertThat(meters.get("placepick.sse.send.failures")
            .tag("stream", "room").tag("kind", "heartbeat")
            .counter().count()).isEqualTo(1.0d);
        assertThat(meters.get("placepick.sse.connections.closed")
            .tag("stream", "room").tag("reason", "send_failure")
            .counter().count()).isEqualTo(1.0d);
        assertThat(meters.get("placepick.sse.connection.lifetime")
            .tag("stream", "room").tag("reason", "send_failure")
            .timer().count()).isEqualTo(1L);
        observedRegistry.close();
    }

    private static VotingRoomService.RoomSubscriptionContext context(
        UUID roomId,
        UUID sessionId
    ) {
        RoomView snapshot = new RoomView(
            roomId,
            "share-token",
            RoomStatus.OPEN,
            List.of(),
            List.of(),
            Map.of(),
            false,
            null,
            NOW.plusSeconds(3_600)
        );
        return new VotingRoomService.RoomSubscriptionContext(
            roomId,
            "share-token",
            sessionId,
            false,
            NOW.plusSeconds(3_600),
            0L,
            snapshot
        );
    }

    private static final class FailAfterFirstSseEmitter extends SseEmitter {
        private int sends;

        @Override
        public void send(SseEventBuilder builder) throws IOException {
            if (++sends > 1) {
                throw new IOException("synthetic transport failure");
            }
        }
    }
}
