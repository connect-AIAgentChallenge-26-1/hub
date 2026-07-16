package com.placepick.analytics;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ProductEventServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-16T03:04:05.123456789Z");

    @Test
    void appliesConfiguredRetentionAndTreatsRepositoryConflictAsAccepted() {
        CapturingRepository repository = new CapturingRepository(false);
        ProductEventService service = new ProductEventService(
            repository,
            new ProductEventValidator(new ObjectMapper()),
            Clock.fixed(NOW, ZoneOffset.UTC),
            Duration.ofDays(30)
        );

        UUID sessionId = UUID.randomUUID();
        service.accept(sessionId, new ProductEventRequest(
            UUID.randomUUID().toString(),
            "recommendationViewed",
            "2026-07-16T03:00:00Z",
            new ObjectMapper().createObjectNode().put("viewportClass", "desktop")
        ));

        ProductEvent stored = repository.event;
        assertThat(stored.sessionId()).isEqualTo(sessionId);
        assertThat(stored.receivedAt()).isEqualTo(Instant.parse("2026-07-16T03:04:05.123456Z"));
        assertThat(stored.expiresAt()).isEqualTo(stored.receivedAt().plus(Duration.ofDays(30)));
    }

    @Test
    void deletesEventsAtTheCurrentUtcDatabasePrecision() {
        CapturingRepository repository = new CapturingRepository(true);
        ProductEventService service = new ProductEventService(
            repository,
            new ProductEventValidator(new ObjectMapper()),
            Clock.fixed(NOW, ZoneOffset.UTC),
            Duration.ofDays(30)
        );

        assertThat(service.deleteExpired()).isEqualTo(3);
        assertThat(repository.cleanupTime)
            .isEqualTo(Instant.parse("2026-07-16T03:04:05.123456Z"));
    }

    private static final class CapturingRepository implements ProductEventRepository {
        private final boolean insertResult;
        private ProductEvent event;
        private Instant cleanupTime;

        private CapturingRepository(boolean insertResult) {
            this.insertResult = insertResult;
        }

        @Override
        public boolean insertIfAbsent(ProductEvent event) {
            this.event = event;
            return insertResult;
        }

        @Override
        public int deleteExpired(Instant now) {
            cleanupTime = now;
            return 3;
        }
    }
}
