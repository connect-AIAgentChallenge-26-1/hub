package com.placepick.room;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

@Component
public class OrganizerCookieFactory {

    public static final String COOKIE_NAME = "PLACEPICK_ORGANIZER";
    private static final Pattern SHARE_TOKEN = Pattern.compile("[A-Za-z0-9_-]{32,128}");

    private final boolean secure;
    private final Clock clock;

    @Autowired
    public OrganizerCookieFactory(Environment environment, Clock clock) {
        this.secure = environment.acceptsProfiles(Profiles.of("production"));
        this.clock = clock;
    }

    OrganizerCookieFactory(boolean secure, Clock clock) {
        this.secure = secure;
        this.clock = clock;
    }

    public ResponseCookie create(
        String shareToken,
        String capability,
        Instant expiresAt
    ) {
        if (shareToken == null || !SHARE_TOKEN.matcher(shareToken).matches()) {
            throw new IllegalArgumentException("A valid room share token is required.");
        }
        Duration maxAge = Duration.between(clock.instant(), expiresAt);
        return ResponseCookie.from(COOKIE_NAME, capability)
            .httpOnly(true)
            .secure(secure)
            .sameSite("Lax")
            .path("/api/v1/rooms/" + shareToken)
            .maxAge(maxAge.isNegative() ? Duration.ZERO : maxAge)
            .build();
    }
}
