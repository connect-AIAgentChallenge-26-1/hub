package com.placepick.session;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AnonymousSessionService {

    private final AnonymousSessionRepository repository;
    private final SessionTokenCodec tokenCodec;
    private final Clock clock;
    private final Duration sessionTtl;

    @Autowired
    public AnonymousSessionService(
        AnonymousSessionRepository repository,
        SessionTokenCodec tokenCodec,
        Clock clock,
        @Value("${placepick.session.ttl:PT24H}") String sessionTtl
    ) {
        this(repository, tokenCodec, clock, Duration.parse(sessionTtl));
    }

    AnonymousSessionService(
        AnonymousSessionRepository repository,
        SessionTokenCodec tokenCodec,
        Clock clock,
        Duration sessionTtl
    ) {
        this.repository = repository;
        this.tokenCodec = tokenCodec;
        this.clock = clock;
        this.sessionTtl = sessionTtl;
    }

    @Transactional
    public IssuedAnonymousSession createOrRefresh(String presentedToken) {
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        Instant expiresAt = now.plus(sessionTtl);
        String csrfToken = tokenCodec.issue();

        Optional<AnonymousSession> current = findPresented(presentedToken);
        if (current.isPresent() && current.orElseThrow().activeAt(now)) {
            AnonymousSession session = current.orElseThrow();
            repository.refresh(session.id(), tokenCodec.hash(csrfToken), now, expiresAt);
            return new IssuedAnonymousSession(
                session.id(),
                presentedToken,
                csrfToken,
                expiresAt
            );
        }

        String sessionToken = tokenCodec.issue();
        UUID sessionId = UUID.randomUUID();
        repository.insert(new AnonymousSession(
            sessionId,
            tokenCodec.hash(sessionToken),
            tokenCodec.hash(csrfToken),
            now,
            now,
            expiresAt
        ));
        return new IssuedAnonymousSession(sessionId, sessionToken, csrfToken, expiresAt);
    }

    private Optional<AnonymousSession> findPresented(String token) {
        if (!tokenCodec.hasValidFormat(token)) {
            return Optional.empty();
        }
        return repository.findByTokenHash(tokenCodec.hash(token));
    }
}
