package com.placepick.infrastructure.observability;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.Objects;
import org.springframework.boot.availability.ApplicationAvailability;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.stereotype.Component;

/** Exportable readiness state for push-based production telemetry. */
@Component
public final class ReadinessMetrics {

    public ReadinessMetrics(
        ApplicationAvailability availability,
        MeterRegistry meterRegistry
    ) {
        Objects.requireNonNull(availability, "availability");
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        Gauge.builder(
                "placepick.readiness",
                availability,
                state -> state.getReadinessState() == ReadinessState.ACCEPTING_TRAFFIC
                    ? 1.0d
                    : 0.0d
            )
            .description("One while the application accepts traffic")
            .register(meterRegistry);
    }
}
