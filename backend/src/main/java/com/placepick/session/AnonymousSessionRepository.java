package com.placepick.session;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface AnonymousSessionRepository {

    Optional<AnonymousSession> findByTokenHash(String tokenHash);

    void insert(AnonymousSession session);

    void refresh(UUID sessionId, String csrfTokenHash, Instant updatedAt, Instant expiresAt);
}
