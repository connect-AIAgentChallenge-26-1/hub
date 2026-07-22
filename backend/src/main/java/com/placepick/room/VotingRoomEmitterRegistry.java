package com.placepick.room;

import com.placepick.infrastructure.observability.SseMetrics;
import com.placepick.infrastructure.observability.SseMetrics.CloseReason;
import com.placepick.infrastructure.observability.SseMetrics.ReplayKind;
import com.placepick.infrastructure.observability.SseMetrics.SendKind;
import com.placepick.infrastructure.observability.SseMetrics.Stream;
import com.placepick.recommendation.job.infrastructure.PlacePickRoleCondition;
import com.placepick.security.RateLimitExceededException;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Conditional;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Component
@Conditional(PlacePickRoleCondition.Api.class)
public class VotingRoomEmitterRegistry implements VotingRoomEventListener {

    private static final int MAX_CONNECTIONS_PER_ROOM = 20;
    private static final int MAX_CONNECTIONS_PER_SESSION = 5;
    private static final int CONNECTION_RETRY_AFTER_SECONDS = 15;

    private final VotingRoomEventPublisher publisher;
    private final VotingRoomService roomService;
    private final Clock clock;
    private final SseMetrics metrics;
    private final Map<UUID, CopyOnWriteArrayList<Registration>> registrations =
        new ConcurrentHashMap<>();
    private final Map<UUID, AtomicLong> sessionConnectionCounts = new ConcurrentHashMap<>();

    @Autowired
    public VotingRoomEmitterRegistry(
        VotingRoomEventPublisher publisher,
        VotingRoomService roomService,
        Clock clock,
        SseMetrics metrics
    ) {
        this.publisher = publisher;
        this.roomService = roomService;
        this.clock = clock;
        this.metrics = metrics;
        publisher.addListener(this);
    }

    public VotingRoomEmitterRegistry(
        VotingRoomEventPublisher publisher,
        VotingRoomService roomService,
        Clock clock
    ) {
        this(publisher, roomService, clock, SseMetrics.noop());
    }

    public Registration register(
        VotingRoomService.RoomSubscriptionContext context,
        long lastSequenceId,
        SseEmitter emitter
    ) {
        CopyOnWriteArrayList<Registration> roomRegistrations = registrations.computeIfAbsent(
            context.roomId(),
            ignored -> new CopyOnWriteArrayList<>()
        );
        if (roomRegistrations.size() >= MAX_CONNECTIONS_PER_ROOM) {
            throw new RateLimitExceededException(CONNECTION_RETRY_AFTER_SECONDS);
        }
        incrementSession(context.sessionId());
        Registration registration = new Registration(context, emitter, lastSequenceId);
        registration.openedAtNanos = metrics.opened(Stream.ROOM, lastSequenceId > 0);
        roomRegistrations.add(registration);
        emitter.onCompletion(() -> remove(registration, CloseReason.CLIENT_COMPLETE));
        emitter.onTimeout(() -> remove(registration, CloseReason.TIMEOUT));
        emitter.onError(ignored -> remove(registration, CloseReason.ERROR));
        return registration;
    }

    public boolean sendSnapshot(Registration registration, RoomView snapshot) {
        long sequenceId = registration.lastSequenceId.get();
        boolean sent = registration.send(
            "snapshot",
            Long.toString(sequenceId),
            new RoomStreamEnvelope(
                Long.toString(sequenceId),
                clock.instant(),
                registration.context.roomId(),
                snapshot
            ),
            SendKind.SNAPSHOT
        );
        if (sent && registration.resumed()) {
            metrics.replayed(Stream.ROOM, ReplayKind.SNAPSHOT, 1L);
        }
        return sent;
    }

    public void markResumed(Registration registration) {
        registration.markResumed();
    }

    public void synchronizeCursor(Registration registration, long sequenceId) {
        registration.synchronizeCursor(sequenceId);
    }

    public boolean activate(Registration registration) {
        boolean activated = registration.activate();
        if (!activated) {
            remove(registration, CloseReason.SEND_FAILURE);
        } else if (registration.terminalDelivered()) {
            complete(registration, CloseReason.TERMINAL_EVENT);
        }
        return activated;
    }

    public void complete(Registration registration) {
        complete(registration, CloseReason.SERVER_COMPLETE);
    }

    @Override
    public void onEvent(VotingRoomEvent event) {
        List<Registration> listeners = registrations.getOrDefault(
            event.roomId(),
            new CopyOnWriteArrayList<>()
        );
        for (Registration registration : listeners) {
            try {
                RoomView snapshot = roomService.refreshSubscription(registration.context);
                if (!registration.offerLive(event, snapshot)) {
                    remove(registration, CloseReason.SEND_FAILURE);
                } else if (registration.terminalDelivered()) {
                    complete(registration, CloseReason.TERMINAL_EVENT);
                }
            } catch (RuntimeException exception) {
                remove(registration, CloseReason.UPSTREAM_FAILURE);
                registration.emitter.complete();
            }
        }
    }

    @Scheduled(fixedDelay = 15_000L)
    public void heartbeat() {
        Instant now = clock.instant();
        registrations.values().forEach(list -> list.forEach(registration -> {
            String sequenceId = Long.toString(registration.lastSequenceId.get());
            RoomStreamEnvelope envelope = new RoomStreamEnvelope(
                sequenceId,
                now,
                registration.context.roomId(),
                null
            );
            if (!registration.send(
                "heartbeat",
                sequenceId,
                envelope,
                SendKind.HEARTBEAT
            )) {
                remove(registration, CloseReason.SEND_FAILURE);
            }
        }));
    }

    @PreDestroy
    public void close() {
        publisher.removeListener(this);
        registrations.values().forEach(list -> list.forEach(registration ->
            complete(registration, CloseReason.SHUTDOWN)
        ));
        registrations.clear();
        sessionConnectionCounts.clear();
    }

    public int activeConnectionCount() {
        return registrations.values().stream().mapToInt(List::size).sum();
    }

    private void incrementSession(UUID sessionId) {
        if (sessionId == null) {
            return;
        }
        AtomicLong count = sessionConnectionCounts.computeIfAbsent(
            sessionId,
            ignored -> new AtomicLong()
        );
        if (count.incrementAndGet() > MAX_CONNECTIONS_PER_SESSION) {
            count.decrementAndGet();
            throw new RateLimitExceededException(CONNECTION_RETRY_AFTER_SECONDS);
        }
    }

    private void complete(Registration registration, CloseReason reason) {
        remove(registration, reason);
        registration.emitter.complete();
    }

    private void remove(Registration registration, CloseReason reason) {
        boolean[] removed = new boolean[1];
        registrations.computeIfPresent(registration.context.roomId(), (roomId, existing) -> {
            removed[0] = existing.remove(registration);
            return existing.isEmpty() ? null : existing;
        });
        UUID sessionId = registration.context.sessionId();
        if (removed[0] && sessionId != null) {
            sessionConnectionCounts.computeIfPresent(
                sessionId,
                (ignored, count) -> count.decrementAndGet() <= 0 ? null : count
            );
        }
        if (removed[0]) {
            metrics.closed(Stream.ROOM, reason, registration.openedAtNanos);
        }
    }

    private static boolean terminal(String eventType) {
        return "finalized".equals(eventType);
    }

    public final class Registration {
        private final VotingRoomService.RoomSubscriptionContext context;
        private final SseEmitter emitter;
        private final AtomicLong lastSequenceId;
        private boolean resumed;
        private final List<PendingEvent> pendingLiveEvents = new ArrayList<>();
        private boolean active;
        private boolean terminalDelivered;
        private long openedAtNanos;

        private Registration(
            VotingRoomService.RoomSubscriptionContext context,
            SseEmitter emitter,
            long lastSequenceId
        ) {
            this.context = context;
            this.emitter = emitter;
            this.lastSequenceId = new AtomicLong(lastSequenceId);
            this.resumed = lastSequenceId > 0;
        }

        private synchronized boolean offerLive(VotingRoomEvent event, RoomView snapshot) {
            if (!active) {
                pendingLiveEvents.add(new PendingEvent(event, snapshot));
                return true;
            }
            return sendEvent(event, snapshot);
        }

        private synchronized boolean activate() {
            active = true;
            pendingLiveEvents.sort(Comparator.comparingLong(
                pending -> pending.event().sequenceId()
            ));
            for (PendingEvent pending : pendingLiveEvents) {
                if (!sendEvent(pending.event(), pending.snapshot())) {
                    pendingLiveEvents.clear();
                    return false;
                }
            }
            pendingLiveEvents.clear();
            return true;
        }

        private synchronized void synchronizeCursor(long sequenceId) {
            if (active || sequenceId < 0) {
                throw new IllegalStateException("Voting room SSE cursor is invalid.");
            }
            lastSequenceId.set(sequenceId);
        }

        private synchronized boolean terminalDelivered() {
            return terminalDelivered;
        }

        private synchronized boolean resumed() {
            return resumed;
        }

        private synchronized void markResumed() {
            if (!resumed) {
                resumed = true;
                metrics.resumed(Stream.ROOM);
            }
        }

        private boolean sendEvent(VotingRoomEvent event, RoomView snapshot) {
            if (event.sequenceId() <= lastSequenceId.get()) {
                return true;
            }
            RoomStreamEnvelope envelope = new RoomStreamEnvelope(
                Long.toString(event.sequenceId()),
                event.occurredAt(),
                event.roomId(),
                snapshot
            );
            if (!send(
                event.eventType(),
                Long.toString(event.sequenceId()),
                envelope,
                SendKind.EVENT
            )) {
                return false;
            }
            lastSequenceId.set(event.sequenceId());
            terminalDelivered = terminal(event.eventType());
            return true;
        }

        private synchronized boolean send(
            String name,
            String id,
            Object data,
            SendKind kind
        ) {
            try {
                SseEmitter.SseEventBuilder builder = SseEmitter.event().name(name).data(data);
                if (id != null) {
                    builder.id(id);
                }
                emitter.send(builder);
                return true;
            } catch (IOException | IllegalStateException exception) {
                metrics.sendFailed(Stream.ROOM, kind);
                remove(this, CloseReason.SEND_FAILURE);
                emitter.complete();
                return false;
            }
        }
    }

    private record PendingEvent(VotingRoomEvent event, RoomView snapshot) {
    }
}
