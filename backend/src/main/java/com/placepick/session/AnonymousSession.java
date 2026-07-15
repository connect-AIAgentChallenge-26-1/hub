package com.placepick.session;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record AnonymousSession(
    UUID id,
    String tokenHash,
    String csrfTokenHash,
    Instant createdAt,
    Instant updatedAt,
    Instant expiresAt
) {
    public AnonymousSession {
        id = Objects.requireNonNull(id, "id");
        tokenHash = Objects.requireNonNull(tokenHash, "tokenHash");
        csrfTokenHash = Objects.requireNonNull(csrfTokenHash, "csrfTokenHash");
        createdAt = Objects.requireNonNull(createdAt, "createdAt");
        updatedAt = Objects.requireNonNull(updatedAt, "updatedAt");
        expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
    }

    public boolean activeAt(Instant instant) {
        return expiresAt.isAfter(instant);
    }

    @Override
    public String toString() {
        return "AnonymousSession[id=" + id + ", tokenHash=<redacted>, csrfTokenHash=<redacted>, " +
            "expiresAt=" + expiresAt + "]";
    }
}
