package com.placepick.security;

import com.placepick.infrastructure.observability.PlacePickMetrics;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import org.springframework.web.servlet.HandlerInterceptor;

final class ApiRateLimitInterceptor implements HandlerInterceptor {

    private final InMemoryRateLimiter limiter;
    private final ApiClientIdentityResolver identityResolver;
    private final PlacePickMetrics metrics;
    private final Duration window;
    private final int sessionLimit;
    private final int ipLimit;

    ApiRateLimitInterceptor(
        InMemoryRateLimiter limiter,
        ApiClientIdentityResolver identityResolver,
        PlacePickMetrics metrics,
        Duration window,
        int sessionLimit,
        int ipLimit
    ) {
        this.limiter = limiter;
        this.identityResolver = identityResolver;
        this.metrics = metrics;
        this.window = requireWindow(window);
        if (sessionLimit < 1 || ipLimit < sessionLimit) {
            throw new IllegalArgumentException("API rate-limit capacities are invalid.");
        }
        this.sessionLimit = sessionLimit;
        this.ipLimit = ipLimit;
    }

    @Override
    public boolean preHandle(
        HttpServletRequest request,
        HttpServletResponse response,
        Object handler
    ) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        ApiClientIdentityResolver.ClientIdentities identities = identityResolver.resolve(request);
        RateLimitDecision ip = limiter.acquire("ip:" + identities.ipKey(), ipLimit, window);
        if (!ip.allowed()) {
            metrics.rateLimitRejected("ip");
            throw new RateLimitExceededException(ip.retryAfterSeconds());
        }
        if (identities.sessionKey().isPresent()) {
            RateLimitDecision session = limiter.acquire(
                "session:" + identities.sessionKey().orElseThrow(),
                sessionLimit,
                window
            );
            if (!session.allowed()) {
                metrics.rateLimitRejected("session");
                throw new RateLimitExceededException(session.retryAfterSeconds());
            }
        }
        return true;
    }

    private static Duration requireWindow(Duration value) {
        if (value == null || value.isZero() || value.isNegative()
            || value.compareTo(Duration.ofHours(1)) > 0) {
            throw new IllegalArgumentException("API rate-limit window is invalid.");
        }
        return value;
    }
}
