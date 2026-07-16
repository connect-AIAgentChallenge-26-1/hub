package com.placepick.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-process sliding-window limiter for the single-instance MVP. Keys are one-way digests and
 * buckets never contain raw IP addresses, cookies, session tokens, or request content.
 */
public final class InMemoryRateLimiter {

    private final Clock clock;
    private final int maximumBuckets;
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    public InMemoryRateLimiter(Clock clock, int maximumBuckets) {
        this.clock = clock;
        if (maximumBuckets < 100 || maximumBuckets > 1_000_000) {
            throw new IllegalArgumentException("Rate-limit bucket capacity is invalid.");
        }
        this.maximumBuckets = maximumBuckets;
    }

    RateLimitDecision acquire(String key, int requestLimit, Duration window) {
        if (key == null || key.isBlank()) {
            throw new IllegalArgumentException("A hashed rate-limit key is required.");
        }
        if (requestLimit < 1 || window == null || window.isZero() || window.isNegative()) {
            throw new IllegalArgumentException("The rate-limit policy is invalid.");
        }

        while (true) {
            Bucket bucket = bucketFor(key);
            if (bucket == null) {
                return RateLimitDecision.rejected(Math.max(1, window.toSeconds()));
            }
            Instant now = clock.instant();
            synchronized (bucket) {
                if (!bucket.active) {
                    continue;
                }
                Instant threshold = now.minus(window);
                while (!bucket.requests.isEmpty()
                    && !bucket.requests.peekFirst().isAfter(threshold)) {
                    bucket.requests.removeFirst();
                }
                bucket.lastSeen = now;
                if (bucket.requests.size() >= requestLimit) {
                    Duration remaining = Duration.between(
                        now,
                        bucket.requests.peekFirst().plus(window)
                    );
                    return RateLimitDecision.rejected(ceilSeconds(remaining));
                }
                bucket.requests.addLast(now);
                return RateLimitDecision.allow();
            }
        }
    }

    public int removeIdle(Duration idleTime) {
        if (idleTime == null || idleTime.isZero() || idleTime.isNegative()) {
            throw new IllegalArgumentException("Rate-limit idle time must be positive.");
        }
        Instant threshold = clock.instant().minus(idleTime);
        synchronized (buckets) {
            int before = buckets.size();
            buckets.entrySet().removeIf(entry -> {
                Bucket bucket = entry.getValue();
                synchronized (bucket) {
                    boolean idle = bucket.lastSeen != null
                        && bucket.lastSeen.isBefore(threshold);
                    if (idle) {
                        bucket.active = false;
                    }
                    return idle;
                }
            });
            return before - buckets.size();
        }
    }

    int bucketCount() {
        return buckets.size();
    }

    private Bucket bucketFor(String key) {
        Bucket existing = buckets.get(key);
        if (existing != null) {
            return existing;
        }
        synchronized (buckets) {
            existing = buckets.get(key);
            if (existing != null) {
                return existing;
            }
            if (buckets.size() >= maximumBuckets) {
                return null;
            }
            Bucket created = new Bucket();
            buckets.put(key, created);
            return created;
        }
    }

    private static long ceilSeconds(Duration duration) {
        long seconds = duration.toSeconds();
        return duration.minusSeconds(seconds).isZero() ? Math.max(1, seconds) : seconds + 1;
    }

    private static final class Bucket {
        private final ArrayDeque<Instant> requests = new ArrayDeque<>();
        private Instant lastSeen;
        private boolean active = true;
    }
}
