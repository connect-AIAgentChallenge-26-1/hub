package com.placepick.lifecycle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class DataRetentionServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-16T03:04:05.123456789Z");

    @Test
    void suppliesMicrosecondUtcCutoffsAndReturnsTheRepositoryReport() {
        CapturingRepository repository = new CapturingRepository();
        DataRetentionService service = new DataRetentionService(
            repository,
            Clock.fixed(NOW, ZoneOffset.UTC),
            Duration.ofHours(24),
            Duration.ofHours(12)
        );

        RetentionCleanupReport report = service.cleanupExpired();

        assertThat(repository.now)
            .isEqualTo(Instant.parse("2026-07-16T03:04:05.123456Z"));
        assertThat(repository.processedBefore)
            .isEqualTo(Instant.parse("2026-07-15T03:04:05.123456Z"));
        assertThat(repository.publishedBefore)
            .isEqualTo(Instant.parse("2026-07-15T15:04:05.123456Z"));
        assertThat(report.totalDeleted()).isEqualTo(28);
    }

    @Test
    void rejectsZeroNegativeAndUnboundedOperationalRetention() {
        CapturingRepository repository = new CapturingRepository();
        Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);

        assertThatThrownBy(() -> new DataRetentionService(
            repository,
            clock,
            Duration.ZERO,
            Duration.ofHours(1)
        )).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new DataRetentionService(
            repository,
            clock,
            Duration.ofHours(1),
            Duration.ofDays(31)
        )).isInstanceOf(IllegalArgumentException.class);
    }

    private static final class CapturingRepository implements DataRetentionRepository {
        private Instant now;
        private Instant processedBefore;
        private Instant publishedBefore;

        @Override
        public RetentionCleanupReport deleteExpired(
            Instant now,
            Instant processedBefore,
            Instant publishedOutboxBefore
        ) {
            this.now = now;
            this.processedBefore = processedBefore;
            this.publishedBefore = publishedOutboxBefore;
            return new RetentionCleanupReport(1, 2, 3, 4, 5, 6, 7);
        }
    }
}
