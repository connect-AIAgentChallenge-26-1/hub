package com.placepick.analytics;

import com.placepick.analytics.ProductEventValidator.ValidatedProductEvent;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProductEventService {

    static final Duration DEFAULT_RETENTION = Duration.ofDays(30);
    private static final Duration MAXIMUM_RETENTION = Duration.ofDays(365);

    private final ProductEventRepository repository;
    private final ProductEventValidator validator;
    private final Clock clock;
    private final Duration retention;

    @Autowired
    public ProductEventService(
        ProductEventRepository repository,
        ProductEventValidator validator,
        Clock clock,
        @Value("${placepick.analytics.retention:P30D}") String retention
    ) {
        this(repository, validator, clock, parseRetention(retention));
    }

    ProductEventService(
        ProductEventRepository repository,
        ProductEventValidator validator,
        Clock clock,
        Duration retention
    ) {
        this.repository = repository;
        this.validator = validator;
        this.clock = clock;
        this.retention = requireRetention(retention);
    }

    @Transactional
    public void accept(UUID sessionId, ProductEventRequest request) {
        ValidatedProductEvent validated = validator.validate(request);
        Instant receivedAt = databaseTime();
        repository.insertIfAbsent(new ProductEvent(
            validated.eventId(),
            sessionId,
            validated.name(),
            validated.occurredAt(),
            validated.context(),
            receivedAt,
            receivedAt.plus(retention)
        ));
    }

    @Transactional
    public int deleteExpired() {
        return repository.deleteExpired(databaseTime());
    }

    private Instant databaseTime() {
        return clock.instant().truncatedTo(ChronoUnit.MICROS);
    }

    private static Duration parseRetention(String value) {
        try {
            return requireRetention(Duration.parse(value));
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException(
                "Product event retention must be an ISO-8601 duration."
            );
        }
    }

    private static Duration requireRetention(Duration value) {
        if (value == null || value.isZero() || value.isNegative()
            || value.compareTo(MAXIMUM_RETENTION) > 0) {
            throw new IllegalArgumentException(
                "Product event retention must be greater than zero and at most 365 days."
            );
        }
        return value;
    }
}
