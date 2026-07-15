package com.placepick.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.Mockito.mock;

import com.placepick.security.RateLimitExceededException;
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
}
