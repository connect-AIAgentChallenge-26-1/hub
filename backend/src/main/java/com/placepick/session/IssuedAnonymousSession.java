package com.placepick.session;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record IssuedAnonymousSession(
    UUID sessionId,
    String sessionToken,
    String csrfToken,
    Instant expiresAt
) {
    public IssuedAnonymousSession {
        sessionId = Objects.requireNonNull(sessionId, "sessionId");
        sessionToken = Objects.requireNonNull(sessionToken, "sessionToken");
        csrfToken = Objects.requireNonNull(csrfToken, "csrfToken");
        expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
    }

    @Override
    public String toString() {
        return "IssuedAnonymousSession[sessionId=" + sessionId +
            ", sessionToken=<redacted>, csrfToken=<redacted>, expiresAt=" + expiresAt + "]";
    }
}
