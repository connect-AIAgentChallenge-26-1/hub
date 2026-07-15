package com.placepick.lifecycle;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DataRetentionService {

    private final DataRetentionRepository repository;
    private final Clock clock;
    private final Duration processedEventRetention;
    private final Duration publishedOutboxRetention;

    @Autowired
    public DataRetentionService(
        DataRetentionRepository repository,
        Clock clock,
        @Value("${placepick.retention.processed-event:PT24H}") String processedEventRetention,
        @Value("${placepick.retention.published-outbox:PT24H}") String publishedOutboxRetention
    ) {
        this(
            repository,
            clock,
            Duration.parse(processedEventRetention),
            Duration.parse(publishedOutboxRetention)
        );
    }

    DataRetentionService(
        DataRetentionRepository repository,
        Clock clock,
        Duration processedEventRetention,
        Duration publishedOutboxRetention
    ) {
        this.repository = repository;
        this.clock = clock;
        this.processedEventRetention = requireRetention(processedEventRetention);
        this.publishedOutboxRetention = requireRetention(publishedOutboxRetention);
    }

    @Transactional
    public RetentionCleanupReport cleanupExpired() {
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        return repository.deleteExpired(
            now,
            now.minus(processedEventRetention),
            now.minus(publishedOutboxRetention)
        );
    }

    private static Duration requireRetention(Duration value) {
        if (value == null || value.isZero() || value.isNegative()
            || value.compareTo(Duration.ofDays(30)) > 0) {
            throw new IllegalArgumentException("Operational retention must be 1 second to 30 days.");
        }
        return value;
    }
}
