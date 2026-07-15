package com.placepick.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;

class InMemoryRateLimiterTest {

    @Test
    void appliesASlidingWindowAndReturnsCeilingRetryAfter() {
        MutableClock clock = new MutableClock(Instant.parse("2026-07-16T00:00:00Z"));
        InMemoryRateLimiter limiter = new InMemoryRateLimiter(clock, 100);

        assertThat(limiter.acquire("hashed", 2, Duration.ofSeconds(60)).allowed()).isTrue();
        clock.advance(Duration.ofMillis(500));
        assertThat(limiter.acquire("hashed", 2, Duration.ofSeconds(60)).allowed()).isTrue();
        clock.advance(Duration.ofMillis(500));
        RateLimitDecision rejected = limiter.acquire("hashed", 2, Duration.ofSeconds(60));

        assertThat(rejected.allowed()).isFalse();
        assertThat(rejected.retryAfterSeconds()).isEqualTo(59);
        clock.advance(Duration.ofSeconds(59));
        assertThat(limiter.acquire("hashed", 2, Duration.ofSeconds(60)).allowed()).isTrue();
    }

    @Test
    void boundsMemoryAndRemovesIdleDigestBuckets() {
        MutableClock clock = new MutableClock(Instant.parse("2026-07-16T00:00:00Z"));
        InMemoryRateLimiter limiter = new InMemoryRateLimiter(clock, 100);
        for (int index = 0; index < 100; index++) {
            assertThat(limiter.acquire("key-" + index, 1, Duration.ofMinutes(1)).allowed())
                .isTrue();
        }
        assertThat(limiter.acquire("overflow", 1, Duration.ofMinutes(1)).allowed()).isFalse();

        clock.advance(Duration.ofMinutes(11));
        assertThat(limiter.removeIdle(Duration.ofMinutes(10))).isEqualTo(100);
        assertThat(limiter.bucketCount()).isZero();
    }

    @Test
    void neverExceedsTheBucketCapDuringConcurrentFirstRequests() {
        InMemoryRateLimiter limiter = new InMemoryRateLimiter(Clock.systemUTC(), 100);

        List<CompletableFuture<Boolean>> attempts = java.util.stream.IntStream.range(0, 200)
            .mapToObj(index -> CompletableFuture.supplyAsync(() -> limiter.acquire(
                "concurrent-key-" + index,
                1,
                Duration.ofMinutes(1)
            ).allowed()))
            .toList();
        long allowed = attempts.stream().map(CompletableFuture::join)
            .filter(Boolean::booleanValue)
            .count();

        assertThat(allowed).isEqualTo(100);
        assertThat(limiter.bucketCount()).isEqualTo(100);
    }

    private static final class MutableClock extends Clock {
        private Instant current;

        private MutableClock(Instant current) {
            this.current = current;
        }

        private void advance(Duration duration) {
            current = current.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            if (!ZoneOffset.UTC.equals(zone)) {
                throw new IllegalArgumentException("Only UTC is supported in this test.");
            }
            return this;
        }

        @Override
        public Instant instant() {
            return current;
        }
    }
}
