package com.placepick.infrastructure.observability;

import com.placepick.stream.RecommendationStreamGateway;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;

/** Periodic, bounded backlog snapshot; scrape threads never block on PostgreSQL or Redis. */
public final class OperationalBacklogMetrics {

    private final JdbcClient jdbcClient;
    private final RecommendationStreamGateway streamGateway;
    private final MeterRegistry registry;
    private final Clock clock;
    private final Duration stuckThreshold;
    private final AtomicLong outboxPending = new AtomicLong();
    private final AtomicLong outboxOldestMillis = new AtomicLong();
    private final AtomicLong streamPending = new AtomicLong();
    private final AtomicLong streamOldestMillis = new AtomicLong();
    private final AtomicLong stuckJobs = new AtomicLong();
    private final AtomicLong databaseSnapshotLastSuccessEpochSeconds = new AtomicLong();
    private final AtomicLong streamSnapshotLastSuccessEpochSeconds = new AtomicLong();

    public OperationalBacklogMetrics(
        JdbcClient jdbcClient,
        RecommendationStreamGateway streamGateway,
        MeterRegistry registry,
        Clock clock,
        Duration stuckThreshold
    ) {
        this.jdbcClient = Objects.requireNonNull(jdbcClient, "jdbcClient");
        this.streamGateway = Objects.requireNonNull(streamGateway, "streamGateway");
        this.registry = Objects.requireNonNull(registry, "registry");
        this.clock = Objects.requireNonNull(clock, "clock");
        if (stuckThreshold == null || stuckThreshold.isZero()
            || stuckThreshold.isNegative() || stuckThreshold.compareTo(Duration.ofHours(1)) > 0) {
            throw new IllegalArgumentException("Stuck job threshold is invalid.");
        }
        this.stuckThreshold = stuckThreshold;
        registerGauges(registry);
    }

    @Scheduled(
        initialDelayString = "${placepick.metrics.backlog-initial-delay:PT10S}",
        fixedDelayString = "${placepick.metrics.backlog-refresh-delay:PT30S}"
    )
    public void refresh() {
        refreshDatabase();
        refreshStream();
    }

    private void refreshDatabase() {
        try {
            Long pending = jdbcClient.sql("""
                    SELECT COUNT(*) FROM outbox_event WHERE published_at IS NULL
                    """)
                .query(Long.class)
                .single();
            Double oldestSeconds = jdbcClient.sql("""
                    SELECT COALESCE(
                        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MIN(created_at))),
                        0.0
                    )
                    FROM outbox_event
                    WHERE published_at IS NULL
                    """)
                .query(Double.class)
                .single();
            Long stuck = jdbcClient.sql("""
                    SELECT COUNT(*)
                    FROM recommendation_job
                    WHERE status IN ('ACCEPTED', 'PROCESSING')
                      AND updated_at < :cutoff
                    """)
                .param(
                    "cutoff",
                    OffsetDateTime.ofInstant(clock.instant().minus(stuckThreshold), ZoneOffset.UTC)
                )
                .query(Long.class)
                .single();
            outboxPending.set(pending);
            outboxOldestMillis.set(Math.round(oldestSeconds * 1_000.0d));
            stuckJobs.set(stuck);
            databaseSnapshotLastSuccessEpochSeconds.set(clock.instant().getEpochSecond());
            registry.counter("placepick.telemetry.snapshot", "source", "database", "outcome", "success")
                .increment();
        } catch (RuntimeException exception) {
            registry.counter("placepick.telemetry.snapshot", "source", "database", "outcome", "failure")
                .increment();
        }
    }

    private void refreshStream() {
        try {
            var snapshot = streamGateway.backlog();
            streamPending.set(snapshot.pending());
            streamOldestMillis.set(snapshot.oldestAge().toMillis());
            streamSnapshotLastSuccessEpochSeconds.set(clock.instant().getEpochSecond());
            registry.counter("placepick.telemetry.snapshot", "source", "redis", "outcome", "success")
                .increment();
        } catch (RuntimeException exception) {
            registry.counter("placepick.telemetry.snapshot", "source", "redis", "outcome", "failure")
                .increment();
        }
    }

    private void registerGauges(MeterRegistry meterRegistry) {
        Gauge.builder("placepick.outbox.pending", outboxPending, AtomicLong::get)
            .register(meterRegistry);
        Gauge.builder(
                "placepick.outbox.oldest.age.seconds",
                outboxOldestMillis,
                value -> value.get() / 1_000.0d
            )
            .register(meterRegistry);
        Gauge.builder("placepick.stream.pending", streamPending, AtomicLong::get)
            .register(meterRegistry);
        Gauge.builder(
                "placepick.stream.oldest.age.seconds",
                streamOldestMillis,
                value -> value.get() / 1_000.0d
            )
            .register(meterRegistry);
        Gauge.builder("placepick.job.stuck", stuckJobs, AtomicLong::get)
            .register(meterRegistry);
        Gauge.builder(
                "placepick.telemetry.snapshot.last.success.timestamp.seconds",
                databaseSnapshotLastSuccessEpochSeconds,
                AtomicLong::get
            )
            .tag("source", "database")
            .description("Unix timestamp of the last successful bounded database snapshot")
            .register(meterRegistry);
        Gauge.builder(
                "placepick.telemetry.snapshot.last.success.timestamp.seconds",
                streamSnapshotLastSuccessEpochSeconds,
                AtomicLong::get
            )
            .tag("source", "redis")
            .description("Unix timestamp of the last successful bounded Redis snapshot")
            .register(meterRegistry);
    }
}
