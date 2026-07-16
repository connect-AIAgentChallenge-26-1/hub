package com.placepick.session;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AnonymousSessionServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-16T00:00:00Z");

    private final SessionTokenCodec codec = new SessionTokenCodec();
    private final InMemoryRepository repository = new InMemoryRepository();
    private final AnonymousSessionService service = new AnonymousSessionService(
        repository,
        codec,
        Clock.fixed(NOW, ZoneOffset.UTC),
        Duration.ofHours(24)
    );

    @Test
    void createsVersionFourSessionAndStoresOnlyHashes() {
        IssuedAnonymousSession issued = service.createOrRefresh(null);
        AnonymousSession stored = repository.sessions.get(issued.sessionId());

        assertThat(issued.sessionId().version()).isEqualTo(4);
        assertThat(issued.expiresAt()).isEqualTo(NOW.plus(Duration.ofHours(24)));
        assertThat(stored.tokenHash()).isEqualTo(codec.hash(issued.sessionToken()));
        assertThat(stored.csrfTokenHash()).isEqualTo(codec.hash(issued.csrfToken()));
        assertThat(stored.toString())
            .doesNotContain(issued.sessionToken())
            .doesNotContain(issued.csrfToken());
    }

    @Test
    void refreshesTheSameActiveSessionAndRotatesCsrf() {
        IssuedAnonymousSession first = service.createOrRefresh(null);
        IssuedAnonymousSession refreshed = service.createOrRefresh(first.sessionToken());

        assertThat(refreshed.sessionId()).isEqualTo(first.sessionId());
        assertThat(refreshed.sessionToken()).isEqualTo(first.sessionToken());
        assertThat(refreshed.csrfToken()).isNotEqualTo(first.csrfToken());
        assertThat(repository.sessions).hasSize(1);
        assertThat(repository.sessions.get(first.sessionId()).csrfTokenHash())
            .isEqualTo(codec.hash(refreshed.csrfToken()));
    }

    private static final class InMemoryRepository implements AnonymousSessionRepository {
        private final Map<UUID, AnonymousSession> sessions = new HashMap<>();

        @Override
        public Optional<AnonymousSession> findByTokenHash(String tokenHash) {
            return sessions.values().stream()
                .filter(session -> session.tokenHash().equals(tokenHash))
                .findFirst();
        }

        @Override
        public void insert(AnonymousSession session) {
            sessions.put(session.id(), session);
        }

        @Override
        public void refresh(
            UUID sessionId,
            String csrfTokenHash,
            Instant updatedAt,
            Instant expiresAt
        ) {
            AnonymousSession current = sessions.get(sessionId);
            sessions.put(sessionId, new AnonymousSession(
                current.id(),
                current.tokenHash(),
                csrfTokenHash,
                current.createdAt(),
                updatedAt,
                expiresAt
            ));
        }
    }
}
