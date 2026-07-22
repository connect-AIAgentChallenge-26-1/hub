package com.placepick.security;

import ch.qos.logback.classic.spi.ILoggingEvent;
import org.springframework.boot.json.JsonWriter.ValueProcessor;
import org.springframework.boot.logging.structured.StructuredLoggingJsonMembersCustomizer;

/** Applies the same last-resort redaction to every string emitted by JSON logging. */
public final class RedactingStructuredLoggingCustomizer
    implements StructuredLoggingJsonMembersCustomizer<ILoggingEvent> {

    @Override
    public void customize(org.springframework.boot.json.JsonWriter.Members<ILoggingEvent> members) {
        members.applyingValueProcessor(ValueProcessor.of(
            String.class,
            SensitiveValueRedactor::redact
        ));
    }
}
