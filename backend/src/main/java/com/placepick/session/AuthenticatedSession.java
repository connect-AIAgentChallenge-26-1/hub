package com.placepick.session;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record AuthenticatedSession(UUID id, Instant expiresAt) {
    public AuthenticatedSession {
        id = Objects.requireNonNull(id, "id");
        expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
    }
}
