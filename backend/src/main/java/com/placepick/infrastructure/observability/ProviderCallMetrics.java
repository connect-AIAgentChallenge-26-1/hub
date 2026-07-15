package com.placepick.infrastructure.observability;

import com.placepick.recommendation.application.port.out.SearchProviderException;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import java.util.Objects;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import java.util.function.Supplier;

/** Shared per-process provider concurrency boundary and redacted latency/quota telemetry. */
public final class ProviderCallMetrics {

    private final MeterRegistry registry;
    private final Semaphore permits;
    private final AtomicInteger active = new AtomicInteger();
    private final Duration acquireTimeout;

    public ProviderCallMetrics(
        MeterRegistry registry,
        int maximumConcurrency,
        Duration acquireTimeout
    ) {
        this.registry = Objects.requireNonNull(registry, "registry");
        if (maximumConcurrency < 1 || maximumConcurrency > 64) {
            throw new IllegalArgumentException(
                "Provider concurrency must be between 1 and 64."
            );
        }
        if (acquireTimeout == null || acquireTimeout.isNegative()
            || acquireTimeout.compareTo(Duration.ofSeconds(10)) > 0) {
            throw new IllegalArgumentException("Provider acquire timeout is invalid.");
        }
        this.permits = new Semaphore(maximumConcurrency, true);
        this.acquireTimeout = acquireTimeout;
        Gauge.builder("placepick.provider.active", active, AtomicInteger::get)
            .description("Current provider calls in this process")
            .register(registry);
    }

    public <T> T observe(
        String provider,
        String operation,
        Duration timeoutBudget,
        Supplier<T> invocation,
        Function<T, String> outcomeClassifier,
        Supplier<T> rejectedResult
    ) {
        Objects.requireNonNull(invocation, "invocation");
        Objects.requireNonNull(outcomeClassifier, "outcomeClassifier");
        Objects.requireNonNull(rejectedResult, "rejectedResult");
        if (timeoutBudget == null || timeoutBudget.isZero() || timeoutBudget.isNegative()
            || timeoutBudget.compareTo(Duration.ofMinutes(2)) > 0) {
            throw new IllegalArgumentException("Provider timeout budget is invalid.");
        }
        if (!acquire()) {
            record(provider, operation, "concurrency_rejected", Duration.ZERO, timeoutBudget);
            return rejectedResult.get();
        }

        long started = System.nanoTime();
        active.incrementAndGet();
        String outcome = "unexpected_error";
        try {
            T result = invocation.get();
            outcome = requireOutcome(outcomeClassifier.apply(result));
            return result;
        } catch (RuntimeException exception) {
            outcome = exceptionOutcome(exception);
            throw exception;
        } finally {
            Duration elapsed = Duration.ofNanos(System.nanoTime() - started);
            active.decrementAndGet();
            permits.release();
            record(provider, operation, outcome, elapsed, timeoutBudget);
        }
    }

    private boolean acquire() {
        try {
            return permits.tryAcquire(acquireTimeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private void record(
        String provider,
        String operation,
        String outcome,
        Duration elapsed,
        Duration timeoutBudget
    ) {
        String safeProvider = closedProvider(provider);
        String safeOperation = closedOperation(operation);
        String safeOutcome = requireOutcome(outcome);
        registry.counter(
            "placepick.provider.calls",
            "provider", safeProvider,
            "operation", safeOperation,
            "outcome", safeOutcome
        ).increment();
        Timer.builder("placepick.provider.latency")
            .tags("provider", safeProvider, "operation", safeOperation)
            .register(registry)
            .record(elapsed);
        if ("rate_limited".equals(safeOutcome)) {
            registry.counter(
                "placepick.provider.quota.protected",
                "provider", safeProvider
            ).increment();
        }
        if (elapsed.compareTo(timeoutBudget) >= 0) {
            registry.counter(
                "placepick.provider.timeout.budget.exhausted",
                "provider", safeProvider,
                "operation", safeOperation
            ).increment();
        }
    }

    private static String exceptionOutcome(RuntimeException exception) {
        if (exception instanceof SearchProviderException searchException) {
            return switch (searchException.failure()) {
                case INVALID_REQUEST -> "invalid_request";
                case AUTHENTICATION_FAILED -> "authentication_failed";
                case RATE_LIMITED -> "rate_limited";
                case INVALID_RESPONSE -> "invalid_response";
                case PROVIDER_UNAVAILABLE -> "unavailable";
            };
        }
        String name = exception.getClass().getSimpleName().toLowerCase(java.util.Locale.ROOT);
        return name.contains("timeout") ? "timeout" : "provider_error";
    }

    private static String requireOutcome(String value) {
        if (value == null) {
            return "unexpected_error";
        }
        return switch (value) {
            case "success", "invalid_request", "authentication_failed", "rate_limited",
                 "invalid_response", "unavailable", "timeout", "provider_error",
                 "concurrency_rejected", "unprocessable", "unexpected_error" -> value;
            default -> "unexpected_error";
        };
    }

    private static String closedProvider(String value) {
        if (value == null) {
            return "unknown";
        }
        return switch (value) {
            case "naver", "elice", "mock" -> value;
            default -> "unknown";
        };
    }

    private static String closedOperation(String value) {
        if (value == null) {
            return "unknown";
        }
        return switch (value) {
            case "condition", "local", "blog", "reason" -> value;
            default -> "unknown";
        };
    }
}
