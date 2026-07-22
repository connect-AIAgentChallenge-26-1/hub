package com.placepick.infrastructure.observability;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.context.Scope;
import java.util.Objects;
import java.util.function.Function;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;

/** Provider span boundary that never records a URL, request, response, or exception payload. */
@Component
public final class SafeProviderTracing {

    private final OpenTelemetry openTelemetry;

    public SafeProviderTracing(OpenTelemetry openTelemetry) {
        this.openTelemetry = Objects.requireNonNull(openTelemetry, "openTelemetry");
    }

    public <T> T within(String provider, String operation, Supplier<T> invocation) {
        return within(provider, operation, invocation, ignored -> "success");
    }

    public <T> T within(
        String provider,
        String operation,
        Supplier<T> invocation,
        Function<T, String> outcomeClassifier
    ) {
        String safeProvider = closedProvider(provider);
        String safeOperation = closedOperation(operation);
        Span span = openTelemetry.getTracer("com.placepick.provider")
            .spanBuilder("placepick.provider." + safeOperation)
            .setSpanKind(SpanKind.CLIENT)
            .setAttribute("placepick.provider", safeProvider)
            .setAttribute("placepick.operation", safeOperation)
            .startSpan();
        Scope scope = span.makeCurrent();
        try {
            T result = invocation.get();
            String outcome = closedOutcome(outcomeClassifier.apply(result));
            span.setAttribute("placepick.outcome", outcome);
            if ("success".equals(outcome)) {
                span.setStatus(StatusCode.OK);
            } else {
                span.setStatus(StatusCode.ERROR, "provider outcome failed");
            }
            return result;
        } catch (RuntimeException exception) {
            span.setStatus(StatusCode.ERROR, "provider call failed");
            span.setAttribute("placepick.failure.type", "provider_failure");
            span.setAttribute("placepick.outcome", "exception");
            throw exception;
        } finally {
            scope.close();
            span.end();
        }
    }

    private static String closedProvider(String value) {
        String normalized = Objects.toString(value, "unknown");
        return switch (normalized) {
            case "naver", "elice", "mock" -> normalized;
            default -> "unknown";
        };
    }

    private static String closedOperation(String value) {
        String normalized = Objects.toString(value, "unknown");
        return switch (normalized) {
            case "condition", "local", "blog", "reason" -> normalized;
            default -> "unknown";
        };
    }

    private static String closedOutcome(String value) {
        String normalized = Objects.toString(value, "unexpected");
        return switch (normalized) {
            case "success", "unprocessable", "invalid_request",
                 "authentication_failed", "rate_limited", "invalid_response",
                 "unavailable", "exception" -> normalized;
            default -> "unexpected";
        };
    }
}
