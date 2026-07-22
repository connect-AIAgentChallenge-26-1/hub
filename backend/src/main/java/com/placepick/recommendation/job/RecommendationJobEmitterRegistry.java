package com.placepick.recommendation.job;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
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

/** Immediate in-process fan-out plus persisted-event polling for split API/worker roles. */
@Component
@Conditional(PlacePickRoleCondition.Api.class)
public class RecommendationJobEmitterRegistry implements RecommendationJobEventListener {

    private static final int MAX_CONNECTIONS_PER_JOB = 20;
    private static final int MAX_CONNECTIONS_PER_SESSION = 5;
    private static final int PERSISTED_EVENT_BATCH_SIZE = 1_000;
    private static final int CONNECTION_RETRY_AFTER_SECONDS = 15;

    private final RecommendationJobEventPublisher publisher;
    private final RecommendationJobRepository repository;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final SseMetrics metrics;
    private final Map<UUID, CopyOnWriteArrayList<Registration>> registrations =
        new ConcurrentHashMap<>();
    private final Map<UUID, AtomicLong> sessionConnectionCounts = new ConcurrentHashMap<>();

    @Autowired
    public RecommendationJobEmitterRegistry(
        RecommendationJobEventPublisher publisher,
        RecommendationJobRepository repository,
        ObjectMapper objectMapper,
        Clock clock,
        SseMetrics metrics
    ) {
        this.publisher = publisher;
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.clock = clock;
        this.metrics = metrics;
        publisher.addListener(this);
    }

    public RecommendationJobEmitterRegistry(
        RecommendationJobEventPublisher publisher,
        RecommendationJobRepository repository,
        ObjectMapper objectMapper,
        Clock clock
    ) {
        this(publisher, repository, objectMapper, clock, SseMetrics.noop());
    }

    /** Reliable cross-process fallback when API and worker roles run in different JVMs. */
    @Scheduled(fixedDelayString = "${placepick.sse.poll-delay-ms:1000}")
    public void pollPersistedEvents() {
        registrations.values().forEach(list -> list.forEach(registration -> {
            try {
                List<RecommendationJobEvent> events = repository.findEventsAfter(
                    registration.jobId,
                    registration.lastSequenceId.get(),
                    PERSISTED_EVENT_BATCH_SIZE
                );
                for (RecommendationJobEvent event : events) {
                    if (!registration.offerReplay(toStreamEvent(event))) {
                        remove(registration, CloseReason.SEND_FAILURE);
                        break;
                    }
                    if (registration.terminalDelivered()) {
                        complete(registration, CloseReason.TERMINAL_EVENT);
                        break;
                    }
                }
            } catch (RuntimeException ignored) {
                // A later poll or GET snapshot recovers; request/provider data is never logged.
            }
        }));
    }

    public Registration register(
        UUID jobId,
        UUID sessionId,
        long lastSequenceId,
        SseEmitter emitter
    ) {
        CopyOnWriteArrayList<Registration> jobRegistrations = registrations.computeIfAbsent(
            jobId,
            ignored -> new CopyOnWriteArrayList<>()
        );
        if (jobRegistrations.size() >= MAX_CONNECTIONS_PER_JOB) {
            throw new RateLimitExceededException(CONNECTION_RETRY_AFTER_SECONDS);
        }
        AtomicLong sessionCount = sessionConnectionCounts.computeIfAbsent(
            sessionId,
            ignored -> new AtomicLong()
        );
        if (sessionCount.incrementAndGet() > MAX_CONNECTIONS_PER_SESSION) {
            sessionCount.decrementAndGet();
            throw new RateLimitExceededException(CONNECTION_RETRY_AFTER_SECONDS);
        }
        Registration registration = new Registration(
            jobId,
            sessionId,
            emitter,
            lastSequenceId
        );
        registration.openedAtNanos = metrics.opened(Stream.RECOMMENDATION, lastSequenceId > 0);
        jobRegistrations.add(registration);
        emitter.onCompletion(() -> remove(registration, CloseReason.CLIENT_COMPLETE));
        emitter.onTimeout(() -> remove(registration, CloseReason.TIMEOUT));
        emitter.onError(ignored -> remove(registration, CloseReason.ERROR));
        return registration;
    }

    public boolean sendSnapshot(
        Registration registration,
        RecommendationJobSnapshot snapshot
    ) {
        long sequenceId = registration.lastSequenceId.get();
        boolean sent = registration.send(
            "snapshot",
            Long.toString(sequenceId),
            new RecommendationJobStreamPayload(
                Long.toString(sequenceId),
                clock.instant(),
                snapshot.jobId(),
                RecommendationJobView.from(snapshot)
            ),
            SendKind.SNAPSHOT
        );
        if (sent && registration.resumed()) {
            metrics.replayed(Stream.RECOMMENDATION, ReplayKind.SNAPSHOT, 1L);
        }
        return sent;
    }

    public void markResumed(Registration registration) {
        registration.markResumed();
    }

    /**
     * Starts live delivery only after the convergent snapshot has been sent. Events
     * published during subscription initialization are held here, closing the race that could
     * otherwise let progress arrive before the required initial snapshot.
     */
    public boolean activate(Registration registration) {
        boolean activated = registration.activate();
        if (!activated) {
            remove(registration, CloseReason.SEND_FAILURE);
        } else if (registration.terminalDelivered()) {
            complete(registration, CloseReason.TERMINAL_EVENT);
        }
        return activated;
    }

    public void synchronizeCursor(Registration registration, long sequenceId) {
        registration.synchronizeCursor(sequenceId);
    }

    public void complete(Registration registration) {
        complete(registration, CloseReason.SERVER_COMPLETE);
    }

    @Override
    public void onEvent(RecommendationJobEvent event) {
        List<Registration> listeners = registrations.getOrDefault(
            event.jobId(),
            new CopyOnWriteArrayList<>()
        );
        RecommendationJobStreamEvent streamEvent = toStreamEvent(event);
        for (Registration registration : listeners) {
            if (!registration.offerLive(streamEvent)) {
                remove(registration, CloseReason.SEND_FAILURE);
            } else if (registration.terminalDelivered()) {
                complete(registration, CloseReason.TERMINAL_EVENT);
            }
        }
    }

    @Scheduled(fixedDelay = 15_000L)
    public void heartbeat() {
        Instant now = clock.instant();
        registrations.values().forEach(list -> list.forEach(registration -> {
            if (!registration.send("heartbeat", null, Map.of(
                "eventId", Long.toString(registration.lastSequenceId.get()),
                "occurredAt", now,
                "aggregateId", registration.jobId
            ), SendKind.HEARTBEAT)) {
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

    private RecommendationJobStreamEvent toStreamEvent(RecommendationJobEvent event) {
        try {
            RecommendationJobStreamPayload payload = objectMapper.readValue(
                event.payloadJson(),
                RecommendationJobStreamPayload.class
            );
            if (!event.eventId().toString().equals(payload.eventId()) ||
                !event.jobId().equals(payload.aggregateId())) {
                throw new IllegalStateException(
                    "Stored recommendation event envelope does not match its metadata."
                );
            }
            return new RecommendationJobStreamEvent(
                event.sequenceId(),
                event.eventType(),
                new RecommendationJobStreamPayload(
                    Long.toString(event.sequenceId()),
                    payload.occurredAt(),
                    payload.aggregateId(),
                    payload.snapshot()
                )
            );
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored recommendation event JSON is invalid.", exception);
        }
    }

    private void complete(Registration registration, CloseReason reason) {
        remove(registration, reason);
        registration.emitter.complete();
    }

    private void remove(Registration registration, CloseReason reason) {
        boolean[] removed = new boolean[1];
        registrations.computeIfPresent(registration.jobId, (jobId, existing) -> {
            removed[0] = existing.remove(registration);
            return existing.isEmpty() ? null : existing;
        });
        if (removed[0]) {
            sessionConnectionCounts.computeIfPresent(
                registration.sessionId,
                (sessionId, count) -> count.decrementAndGet() <= 0 ? null : count
            );
            metrics.closed(Stream.RECOMMENDATION, reason, registration.openedAtNanos);
        }
    }

    private static boolean terminal(String eventType) {
        return "completed".equals(eventType) || "failed".equals(eventType);
    }

    public final class Registration {
        private final UUID jobId;
        private final UUID sessionId;
        private final SseEmitter emitter;
        private final AtomicLong lastSequenceId;
        private boolean resumed;
        private final List<PendingDelivery> pendingLiveEvents = new ArrayList<>();
        private long openedAtNanos;
        private boolean active;
        private boolean terminalDelivered;

        private Registration(
            UUID jobId,
            UUID sessionId,
            SseEmitter emitter,
            long lastSequenceId
        ) {
            this.jobId = jobId;
            this.sessionId = sessionId;
            this.emitter = emitter;
            this.lastSequenceId = new AtomicLong(lastSequenceId);
            this.resumed = lastSequenceId > 0;
        }

        private synchronized boolean offerLive(RecommendationJobStreamEvent event) {
            if (!active) {
                pendingLiveEvents.add(new PendingDelivery(event, false));
                return true;
            }
            return sendEvent(event);
        }

        private synchronized boolean offerReplay(RecommendationJobStreamEvent event) {
            if (!active) {
                pendingLiveEvents.add(new PendingDelivery(event, true));
                return true;
            }
            long cursor = lastSequenceId.get();
            boolean sent = sendEvent(event);
            if (sent && lastSequenceId.get() > cursor) {
                metrics.replayed(Stream.RECOMMENDATION, ReplayKind.PERSISTED_EVENT, 1L);
            }
            return sent;
        }

        private synchronized boolean resumed() {
            return resumed;
        }

        private synchronized void markResumed() {
            if (!resumed) {
                resumed = true;
                metrics.resumed(Stream.RECOMMENDATION);
            }
        }

        private synchronized boolean activate() {
            active = true;
            pendingLiveEvents.sort(Comparator.comparingLong(
                pending -> pending.event().sequenceId()
            ));
            for (PendingDelivery pending : pendingLiveEvents) {
                long cursor = lastSequenceId.get();
                if (!sendEvent(pending.event())) {
                    pendingLiveEvents.clear();
                    return false;
                }
                if (pending.replay() && lastSequenceId.get() > cursor) {
                    metrics.replayed(
                        Stream.RECOMMENDATION,
                        ReplayKind.PERSISTED_EVENT,
                        1L
                    );
                }
            }
            pendingLiveEvents.clear();
            return true;
        }

        private synchronized void synchronizeCursor(long sequenceId) {
            if (active || sequenceId < 0) {
                throw new IllegalStateException("Recommendation SSE cursor is invalid.");
            }
            lastSequenceId.set(sequenceId);
        }

        private synchronized boolean terminalDelivered() {
            return terminalDelivered;
        }

        private boolean sendEvent(RecommendationJobStreamEvent event) {
            if (event.sequenceId() <= lastSequenceId.get()) {
                return true;
            }
            if (!send(
                event.eventType(),
                Long.toString(event.sequenceId()),
                event.payload(),
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
                metrics.sendFailed(Stream.RECOMMENDATION, kind);
                remove(this, CloseReason.SEND_FAILURE);
                emitter.complete();
                return false;
            }
        }

        private record PendingDelivery(
            RecommendationJobStreamEvent event,
            boolean replay
        ) {
        }
    }
}
