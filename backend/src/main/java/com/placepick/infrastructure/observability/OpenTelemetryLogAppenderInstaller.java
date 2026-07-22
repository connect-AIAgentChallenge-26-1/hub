package com.placepick.infrastructure.observability;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.instrumentation.logback.appender.v1_0.OpenTelemetryAppender;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Connects the production-only safe Logback appender to Boot's OpenTelemetry SDK. */
@Component
@Profile("production")
public final class OpenTelemetryLogAppenderInstaller implements InitializingBean {

    private final OpenTelemetry openTelemetry;

    public OpenTelemetryLogAppenderInstaller(OpenTelemetry openTelemetry) {
        this.openTelemetry = openTelemetry;
    }

    @Override
    public void afterPropertiesSet() {
        OpenTelemetryAppender.install(openTelemetry);
    }
}
