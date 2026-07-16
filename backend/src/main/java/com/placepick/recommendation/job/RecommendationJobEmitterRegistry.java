package com.placepick.recommendation.job;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    private final Map<UUID, CopyOnWriteArrayList<Registration>> registrations =
        new ConcurrentHashMap<>();
    private final Map<UUID, AtomicLong> sessionConnectionCounts = new ConcurrentHashMap<>();

    public RecommendationJobEmitterRegistry(
        RecommendationJobEventPublisher publisher,
        RecommendationJobRepository repository,
        ObjectMapper objectMapper,
        Clock clock
    ) {
        this.publisher = publisher;
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.clock = clock;
        publisher.addListener(this);
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
                    if (!registration.offerLive(toStreamEvent(event))) {
                        remove(registration);
                        break;
                    }
                    if (registration.terminalDelivered()) {
                        complete(registration);
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
        jobRegistrations.add(registration);
        emitter.onCompletion(() -> remove(registration));
        emitter.onTimeout(() -> remove(registration));
        emitter.onError(ignored -> remove(registration));
        return registration;
    }

    public boolean sendSnapshot(
        Registration registration,
        RecommendationJobSnapshot snapshot
    ) {
        long sequenceId = registration.lastSequenceId.get();
        return registration.send(
            "snapshot",
            Long.toString(sequenceId),
            new RecommendationJobStreamPayload(
                Long.toString(sequenceId),
                clock.instant(),
                snapshot.jobId(),
                RecommendationJobView.from(snapshot)
            )
        );
    }

    /**
     * Starts live delivery only after the convergent snapshot has been sent. Events
     * published during subscription initialization are held here, closing the race that could
     * otherwise let progress arrive before the required initial snapshot.
     */
    public boolean activate(Registration registration) {
        boolean activated = registration.activate();
        if (!activated) {
            remove(registration);
        } else if (registration.terminalDelivered()) {
            complete(registration);
        }
        return activated;
    }

    public void synchronizeCursor(Registration registration, long sequenceId) {
        registration.synchronizeCursor(sequenceId);
    }

    public void complete(Registration registration) {
        remove(registration);
        registration.emitter.complete();
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
                remove(registration);
            } else if (registration.terminalDelivered()) {
                complete(registration);
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
            ))) {
                remove(registration);
            }
        }));
    }

    @PreDestroy
    public void close() {
        publisher.removeListener(this);
        registrations.values().forEach(list -> list.forEach(registration ->
            registration.emitter.complete()
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

    private void remove(Registration registration) {
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
        private final List<RecommendationJobStreamEvent> pendingLiveEvents = new ArrayList<>();
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
        }

        private synchronized boolean offerLive(RecommendationJobStreamEvent event) {
            if (!active) {
                pendingLiveEvents.add(event);
                return true;
            }
            return sendEvent(event);
        }

        private synchronized boolean activate() {
            active = true;
            pendingLiveEvents.sort(Comparator.comparingLong(
                RecommendationJobStreamEvent::sequenceId
            ));
            for (RecommendationJobStreamEvent event : pendingLiveEvents) {
                if (!sendEvent(event)) {
                    pendingLiveEvents.clear();
                    return false;
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
                event.payload()
            )) {
                return false;
            }
            lastSequenceId.set(event.sequenceId());
            terminalDelivered = terminal(event.eventType());
            return true;
        }

        private synchronized boolean send(String name, String id, Object data) {
            try {
                SseEmitter.SseEventBuilder builder = SseEmitter.event().name(name).data(data);
                if (id != null) {
                    builder.id(id);
                }
                emitter.send(builder);
                return true;
            } catch (IOException | IllegalStateException exception) {
                emitter.complete();
                return false;
            }
        }
    }
}
