package com.placepick.room;

import com.placepick.recommendation.job.infrastructure.PlacePickRoleCondition;
import java.time.Clock;
import java.time.Duration;
import java.util.UUID;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
@Conditional(PlacePickRoleCondition.Api.class)
public class VotingRoomEventStreamService {

    private final VotingRoomService roomService;
    private final VotingRoomEmitterRegistry registry;
    private final Clock clock;

    public VotingRoomEventStreamService(
        VotingRoomService roomService,
        VotingRoomEmitterRegistry registry,
        Clock clock
    ) {
        this.roomService = roomService;
        this.registry = registry;
        this.clock = clock;
    }

    public SseEmitter subscribe(
        String shareToken,
        UUID sessionId,
        String organizerCapability,
        Long requestedLastEventId
    ) {
        if (requestedLastEventId != null && requestedLastEventId < 0) {
            throw new IllegalArgumentException("Last-Event-ID must be non-negative.");
        }
        VotingRoomService.RoomSubscriptionContext initial = roomService.subscription(
            shareToken,
            sessionId,
            organizerCapability
        );
        long timeout = Math.max(
            1L,
            Duration.between(clock.instant(), initial.expiresAt()).toMillis()
        );
        SseEmitter emitter = new SseEmitter(timeout);
        VotingRoomEmitterRegistry.Registration registration = registry.register(
            initial,
            0L,
            emitter
        );
        VotingRoomService.RoomSubscriptionContext state;
        try {
            state = roomService.subscription(shareToken, sessionId, organizerCapability);
        } catch (RuntimeException exception) {
            registry.complete(registration);
            throw exception;
        }
        if (!initial.roomId().equals(state.roomId())) {
            registry.complete(registration);
            throw new IllegalStateException("Voting room subscription identity changed.");
        }
        registry.synchronizeCursor(registration, state.latestSequenceId());
        if (!registry.sendSnapshot(registration, state.snapshot())) {
            registry.complete(registration);
            return emitter;
        }
        if (state.snapshot().status() == RoomStatus.FINALIZED) {
            registry.complete(registration);
        } else {
            registry.activate(registration);
        }
        return emitter;
    }
}
