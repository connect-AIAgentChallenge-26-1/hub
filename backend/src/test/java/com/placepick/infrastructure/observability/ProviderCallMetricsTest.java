package com.placepick.infrastructure.observability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class ProviderCallMetricsTest {

    @Test
    void recordsOnlyClosedLowCardinalityProviderDimensions() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        ProviderCallMetrics metrics = new ProviderCallMetrics(
            registry,
            2,
            Duration.ZERO
        );

        String result = metrics.observe(
            "untrusted-provider-name",
            "untrusted-operation-name",
            Duration.ofNanos(1),
            () -> "ok",
            ignored -> "success",
            () -> "rejected"
        );

        assertThat(result).isEqualTo("ok");
        assertThat(registry.get("placepick.provider.calls")
            .tags("provider", "unknown", "operation", "unknown", "outcome", "success")
            .counter().count()).isEqualTo(1.0);
        assertThat(registry.get("placepick.provider.timeout.budget.exhausted")
            .tags("provider", "unknown", "operation", "unknown")
            .counter().count()).isEqualTo(1.0);
    }

    @Test
    void rejectsAConcurrentCallWithoutInvokingItWhenTheProcessLimitIsFull() throws Exception {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        ProviderCallMetrics metrics = new ProviderCallMetrics(
            registry,
            1,
            Duration.ZERO
        );
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CompletableFuture<String> first = CompletableFuture.supplyAsync(() -> metrics.observe(
            "naver",
            "local",
            Duration.ofSeconds(1),
            () -> {
                entered.countDown();
                await(release);
                return "first";
            },
            ignored -> "success",
            () -> "rejected"
        ));
        assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();

        String second = metrics.observe(
            "naver",
            "local",
            Duration.ofSeconds(1),
            () -> "must-not-run",
            ignored -> "success",
            () -> "rejected"
        );
        release.countDown();

        assertThat(second).isEqualTo("rejected");
        assertThat(first.get(2, TimeUnit.SECONDS)).isEqualTo("first");
        assertThat(registry.get("placepick.provider.calls")
            .tags(
                "provider", "naver",
                "operation", "local",
                "outcome", "concurrency_rejected"
            )
            .counter().count()).isEqualTo(1.0);
    }

    @Test
    void exposesProviderRateLimitAsAQuotaProtectionSignal() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        ProviderCallMetrics metrics = new ProviderCallMetrics(
            registry,
            2,
            Duration.ZERO
        );

        metrics.observe(
            "elice",
            "reason",
            Duration.ofSeconds(30),
            () -> "provider-rate-limited",
            ignored -> "rate_limited",
            () -> "concurrency-rejected"
        );

        assertThat(registry.get("placepick.provider.quota.protected")
            .tag("provider", "elice").counter().count()).isEqualTo(1.0);
    }

    @Test
    void acceptsTheDocumentedSafeRangeAndRejectsValuesOutsideIt() {
        new ProviderCallMetrics(new SimpleMeterRegistry(), 1, Duration.ZERO);
        new ProviderCallMetrics(new SimpleMeterRegistry(), 64, Duration.ZERO);

        assertThatThrownBy(() -> new ProviderCallMetrics(
            new SimpleMeterRegistry(),
            0,
            Duration.ZERO
        ))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ProviderCallMetrics(
            new SimpleMeterRegistry(),
            65,
            Duration.ZERO
        ))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ProviderCallMetrics(
            new SimpleMeterRegistry(),
            2,
            Duration.ofSeconds(11)
        )).isInstanceOf(IllegalArgumentException.class);
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(2, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Test latch timed out.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Test thread was interrupted.", exception);
        }
    }
}
