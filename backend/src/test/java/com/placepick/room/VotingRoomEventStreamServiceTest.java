package com.placepick.room;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class VotingRoomEventStreamServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-16T00:00:00Z");

    private final VotingRoomService roomService = mock(VotingRoomService.class);
    private final VotingRoomEmitterRegistry registry = mock(VotingRoomEmitterRegistry.class);
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
    private final VotingRoomEventStreamService service = new VotingRoomEventStreamService(
        roomService,
        registry,
        clock
    );

    @Test
    void registersBeforeReadingTheConvergentSnapshotThenActivatesPendingDelivery() {
        UUID roomId = UUID.randomUUID();
        RoomView initialSnapshot = new RoomView(
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
        RoomView convergentSnapshot = new RoomView(
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
        VotingRoomService.RoomSubscriptionContext initial =
            new VotingRoomService.RoomSubscriptionContext(
                roomId,
                "share-token",
                null,
                false,
                NOW.plusSeconds(3_600),
                3L,
                initialSnapshot
            );
        VotingRoomService.RoomSubscriptionContext state =
            new VotingRoomService.RoomSubscriptionContext(
                roomId,
                "share-token",
                null,
                false,
                NOW.plusSeconds(3_600),
                5L,
                convergentSnapshot
            );
        VotingRoomEmitterRegistry.Registration registration = mock(
            VotingRoomEmitterRegistry.Registration.class
        );
        when(roomService.subscription("share-token", null, null)).thenReturn(initial, state);
        when(registry.register(eq(initial), eq(0L), any()))
            .thenReturn(registration);
        when(registry.sendSnapshot(registration, convergentSnapshot)).thenReturn(true);

        service.subscribe("share-token", null, null, 3L);

        InOrder delivery = inOrder(roomService, registry);
        delivery.verify(roomService).subscription("share-token", null, null);
        delivery.verify(registry).register(eq(initial), eq(0L), any(SseEmitter.class));
        delivery.verify(roomService).subscription("share-token", null, null);
        delivery.verify(registry).synchronizeCursor(registration, 5L);
        delivery.verify(registry).sendSnapshot(registration, convergentSnapshot);
        delivery.verify(registry).activate(registration);
    }

    @Test
    void rejectsNegativeReconnectCursorBeforeOpeningAResource() {
        assertThatThrownBy(() -> service.subscribe("share-token", null, null, -1L))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("non-negative");

        verifyNoInteractions(roomService, registry);
    }

    @Test
    void closesImmediatelyAfterFinalizedSnapshot() {
        UUID roomId = UUID.randomUUID();
        RoomView snapshot = new RoomView(
            roomId,
            "share-token",
            RoomStatus.FINALIZED,
            List.of(),
            List.of(),
            Map.of(),
            true,
            UUID.randomUUID(),
            NOW.plusSeconds(3_600)
        );
        VotingRoomService.RoomSubscriptionContext initial =
            new VotingRoomService.RoomSubscriptionContext(
                roomId,
                "share-token",
                null,
                true,
                NOW.plusSeconds(3_600),
                1L,
                snapshot
            );
        VotingRoomService.RoomSubscriptionContext state =
            new VotingRoomService.RoomSubscriptionContext(
                roomId,
                "share-token",
                null,
                true,
                NOW.plusSeconds(3_600),
                2L,
                snapshot
            );
        VotingRoomEmitterRegistry.Registration registration = mock(
            VotingRoomEmitterRegistry.Registration.class
        );
        when(roomService.subscription("share-token", null, null)).thenReturn(initial, state);
        when(registry.register(any(), org.mockito.ArgumentMatchers.eq(0L), any(SseEmitter.class)))
            .thenReturn(registration);
        when(registry.sendSnapshot(registration, snapshot)).thenReturn(true);

        service.subscribe("share-token", null, null, null);

        verify(registry).synchronizeCursor(registration, 2L);
        verify(registry).complete(registration);
    }
}
