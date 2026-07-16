package com.placepick.security;

import com.placepick.infrastructure.observability.PlacePickMetrics;
import com.placepick.session.SessionTokenCodec;
import java.time.Clock;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods = false)
public class ApiRateLimitConfiguration implements WebMvcConfigurer {

    private final ApiRateLimitInterceptor interceptor;
    private final InMemoryRateLimiter limiter;
    private final Duration idleRetention;

    public ApiRateLimitConfiguration(
        Clock clock,
        SessionTokenCodec tokenCodec,
        PlacePickMetrics metrics,
        @Value("${placepick.rate-limit.window:PT1M}") String window,
        @Value("${placepick.rate-limit.session-requests:60}") int sessionRequests,
        @Value("${placepick.rate-limit.ip-requests:120}") int ipRequests,
        @Value("${placepick.rate-limit.maximum-buckets:20000}") int maximumBuckets,
        @Value("${placepick.rate-limit.idle-retention:PT10M}") String idleRetention
    ) {
        this.limiter = new InMemoryRateLimiter(clock, maximumBuckets);
        this.idleRetention = Duration.parse(idleRetention);
        this.interceptor = new ApiRateLimitInterceptor(
            limiter,
            new ApiClientIdentityResolver(tokenCodec),
            metrics,
            Duration.parse(window),
            sessionRequests,
            ipRequests
        );
    }

    @Bean
    InMemoryRateLimiter apiInMemoryRateLimiter() {
        return limiter;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(interceptor).addPathPatterns("/api/v1/**");
    }

    @Scheduled(fixedDelayString = "${placepick.rate-limit.cleanup-delay:PT1M}")
    void cleanupIdleBuckets() {
        limiter.removeIdle(idleRetention);
    }
}
