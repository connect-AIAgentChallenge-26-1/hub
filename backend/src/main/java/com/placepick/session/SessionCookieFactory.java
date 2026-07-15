package com.placepick.session;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

@Component
public final class SessionCookieFactory {

    private final boolean secure;
    private final Duration sessionTtl;

    @Autowired
    public SessionCookieFactory(
        Environment environment,
        @Value("${placepick.session.ttl:PT24H}") String sessionTtl
    ) {
        this(environment.acceptsProfiles(Profiles.of("production")), Duration.parse(sessionTtl));
    }

    SessionCookieFactory(boolean secure, Duration sessionTtl) {
        this.secure = secure;
        this.sessionTtl = sessionTtl;
    }

    public ResponseCookie create(String token) {
        return ResponseCookie.from(SessionAuthenticator.SESSION_COOKIE, token)
            .httpOnly(true)
            .secure(secure)
            .sameSite("Lax")
            .path("/")
            .maxAge(sessionTtl)
            .build();
    }
}
