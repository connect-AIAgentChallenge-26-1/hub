package com.placepick.recommendation.job;

import com.placepick.recommendation.job.infrastructure.PlacePickRoleCondition;
import java.time.Clock;
import java.time.Duration;
import java.util.UUID;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
@Conditional(PlacePickRoleCondition.Api.class)
public class RecommendationJobEventStreamService {

    private final RecommendationJobService jobService;
    private final RecommendationJobEmitterRegistry registry;
    private final Clock clock;

    public RecommendationJobEventStreamService(
        RecommendationJobService jobService,
        RecommendationJobEmitterRegistry registry,
        Clock clock
    ) {
        this.jobService = jobService;
        this.registry = registry;
        this.clock = clock;
    }

    public SseEmitter subscribe(UUID jobId, UUID sessionId, Long lastEventId) {
        RecommendationJobSnapshot initial = jobService.get(jobId, sessionId);
        long cursor = lastEventId == null ? 0L : lastEventId;
        if (cursor < 0) {
            throw new IllegalArgumentException("Last-Event-ID must not be negative.");
        }
        long timeout = Math.max(
            1L,
            Duration.between(clock.instant(), initial.expiresAt()).toMillis()
        );
        SseEmitter emitter = new SseEmitter(timeout);
        var registration = registry.register(jobId, sessionId, 0L, emitter);
        RecommendationJobSubscriptionState state;
        try {
            state = jobService.subscriptionState(jobId, sessionId);
        } catch (RuntimeException exception) {
            registry.complete(registration);
            throw exception;
        }
        registry.synchronizeCursor(registration, state.latestSequenceId());
        if (!registry.sendSnapshot(registration, state.snapshot())) {
            registry.complete(registration);
        } else if (state.snapshot().terminal()) {
            registry.complete(registration);
        } else {
            registry.activate(registration);
        }
        return emitter;
    }
}
