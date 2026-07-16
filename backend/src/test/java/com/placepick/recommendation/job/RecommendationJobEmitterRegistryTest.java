package com.placepick.recommendation.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import com.placepick.security.RateLimitExceededException;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyEmitter.DataWithMediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class RecommendationJobEmitterRegistryTest {

    private static final Instant NOW = Instant.parse("2026-07-16T00:00:00Z");

    @Test
    void buffersLiveProgressUntilSnapshotAndUsesSequenceAsTransportEventId() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        RecommendationJobEventPublisher publisher = new RecommendationJobEventPublisher();
        RecommendationJobEmitterRegistry registry = new RecommendationJobEmitterRegistry(
            publisher,
            mock(RecommendationJobRepository.class),
            objectMapper,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
        CapturingSseEmitter emitter = new CapturingSseEmitter();
        UUID jobId = UUID.randomUUID();
        UUID persistedEventId = UUID.randomUUID();
        RecommendationJobSnapshot snapshot = snapshot(jobId);
        RecommendationJobStreamPayload storedPayload = new RecommendationJobStreamPayload(
            persistedEventId.toString(),
            NOW,
            jobId,
            RecommendationJobView.from(snapshot)
        );
        var registration = registry.register(jobId, UUID.randomUUID(), 0L, emitter);

        registry.onEvent(new RecommendationJobEvent(
            1L,
            persistedEventId,
            jobId,
            "progress",
            objectMapper.writeValueAsString(storedPayload),
            NOW
        ));
        assertThat(emitter.events).isEmpty();

        assertThat(registry.sendSnapshot(registration, snapshot)).isTrue();
        assertThat(registry.activate(registration)).isTrue();

        assertThat(emitter.events).hasSize(2);
        assertThat(wireText(emitter.events.get(0)))
            .contains("event:snapshot", "id:0");
        assertThat(wireText(emitter.events.get(1)))
            .contains("event:progress", "id:1");
        RecommendationJobStreamPayload emitted = emitter.events.get(1).stream()
            .filter(RecommendationJobStreamPayload.class::isInstance)
            .map(RecommendationJobStreamPayload.class::cast)
            .findFirst()
            .orElseThrow();
        assertThat(emitted.eventId()).isEqualTo("1");
        assertThat(emitted.aggregateId()).isEqualTo(jobId);
        assertThat(emitted.snapshot().jobId()).isEqualTo(jobId);
        registry.close();
    }

    @Test
    void rejectsTheSixthSessionConnectionWithSafeRetryAfter() {
        RecommendationJobEventPublisher publisher = new RecommendationJobEventPublisher();
        RecommendationJobEmitterRegistry registry = new RecommendationJobEmitterRegistry(
            publisher,
            mock(RecommendationJobRepository.class),
            new ObjectMapper().findAndRegisterModules(),
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
        UUID sessionId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        for (int index = 0; index < 5; index++) {
            registry.register(jobId, sessionId, 0, new CapturingSseEmitter());
        }

        assertThatThrownBy(() -> registry.register(
            jobId,
            sessionId,
            0,
            new CapturingSseEmitter()
        )).isInstanceOfSatisfying(RateLimitExceededException.class, exception ->
            assertThat(exception.retryAfterSeconds()).isEqualTo(15)
        );
        registry.close();
    }

    private String wireText(List<Object> event) {
        return event.stream()
            .filter(String.class::isInstance)
            .map(String.class::cast)
            .reduce("", String::concat);
    }

    private RecommendationJobSnapshot snapshot(UUID jobId) {
        return new RecommendationJobSnapshot(
            jobId,
            UUID.randomUUID(),
            UUID.randomUUID(),
            RecommendationJobStatus.PROCESSING,
            RecommendationJobStage.LOCAL_SEARCH,
            10,
            false,
            List.of(),
            new ConfirmedRecommendationCondition(
                "서울 성수동",
                PlaceType.CAFE,
                null,
                null,
                null,
                null,
                List.of(new Preference("조용한", 5)),
                List.of()
            ),
            List.of(),
            null,
            NOW,
            NOW,
            NOW.plusSeconds(3_600),
            1L
        );
    }

    private static final class CapturingSseEmitter extends SseEmitter {
        private final List<List<Object>> events = new ArrayList<>();

        @Override
        public synchronized void send(SseEventBuilder builder) throws IOException {
            Set<DataWithMediaType> built = builder.build();
            events.add(built.stream().map(DataWithMediaType::getData).toList());
        }
    }
}
