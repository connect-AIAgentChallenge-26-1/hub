package com.placepick.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.placepick.infrastructure.observability.PlacePickMetrics;
import com.placepick.session.SessionAuthenticator;
import com.placepick.session.SessionTokenCodec;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class ApiRateLimitInterceptorTest {

    @Test
    void enforcesBothHashedSessionAndIpLimits() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        SessionTokenCodec tokenCodec = new SessionTokenCodec();
        ApiRateLimitInterceptor interceptor = new ApiRateLimitInterceptor(
            new InMemoryRateLimiter(Clock.systemUTC(), 100),
            new ApiClientIdentityResolver(tokenCodec),
            new PlacePickMetrics(registry),
            Duration.ofMinutes(1),
            1,
            10
        );
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/events");
        request.setRemoteAddr("203.0.113.10");
        request.setCookies(new Cookie(
            SessionAuthenticator.SESSION_COOKIE,
            tokenCodec.issue()
        ));

        assertThat(interceptor.preHandle(request, new MockHttpServletResponse(), new Object()))
            .isTrue();
        assertThatThrownBy(() -> interceptor.preHandle(
            request,
            new MockHttpServletResponse(),
            new Object()
        )).isInstanceOf(RateLimitExceededException.class);
        assertThat(registry.get("placepick.rate.limit.rejected")
            .tag("scope", "session")
            .counter()
            .count()).isEqualTo(1);
    }

    @Test
    void bypassesCorsPreflight() {
        ApiRateLimitInterceptor interceptor = new ApiRateLimitInterceptor(
            new InMemoryRateLimiter(Clock.systemUTC(), 100),
            new ApiClientIdentityResolver(new SessionTokenCodec()),
            new PlacePickMetrics(new SimpleMeterRegistry()),
            Duration.ofMinutes(1),
            1,
            1
        );
        MockHttpServletRequest request = new MockHttpServletRequest("OPTIONS", "/api/v1/events");

        assertThat(interceptor.preHandle(request, new MockHttpServletResponse(), new Object()))
            .isTrue();
    }
}
