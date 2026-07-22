package com.placepick.infrastructure.observability;

import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Emits only closed event codes and opaque correlation IDs to the dedicated OTLP logger. */
@Component
public final class SafeTelemetryLogger {

    private static final Logger LOGGER = LoggerFactory.getLogger("com.placepick.telemetry.safe");

    private final String releaseSha;
    private final String role;

    public SafeTelemetryLogger(
        @Value("${RENDER_GIT_COMMIT:local}") String releaseSha,
        @Value("${placepick.role:all}") String role
    ) {
        this.releaseSha = bounded(releaseSha, "releaseSha", 64);
        this.role = bounded(role, "role", 16);
    }

    public void event(SafeTelemetryEventCode code, UUID jobId, UUID eventId) {
        Objects.requireNonNull(code, "code");
        LOGGER.atInfo()
            .addKeyValue("eventCode", code.name().toLowerCase(java.util.Locale.ROOT))
            .addKeyValue("releaseSha", releaseSha)
            .addKeyValue("role", role)
            .addKeyValue("jobId", Objects.toString(jobId, "unavailable"))
            .addKeyValue("eventId", Objects.toString(eventId, "unavailable"))
            .log("placepick.event");
    }

    private static String bounded(String value, String name, int maximum) {
        Objects.requireNonNull(value, name);
        String normalized = value.strip();
        if (normalized.isBlank() || normalized.length() > maximum
            || normalized.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException(name + " is outside the safe telemetry contract.");
        }
        return normalized;
    }
}
