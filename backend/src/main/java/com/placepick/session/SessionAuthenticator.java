package com.placepick.session;

import com.placepick.web.ApiErrorCode;
import com.placepick.web.ApiException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.util.WebUtils;

@Component
public final class SessionAuthenticator {

    public static final String SESSION_COOKIE = "PLACEPICK_SESSION";
    public static final String CSRF_HEADER = "X-CSRF-Token";

    private final AnonymousSessionRepository repository;
    private final SessionTokenCodec tokenCodec;
    private final Clock clock;

    public SessionAuthenticator(
        AnonymousSessionRepository repository,
        SessionTokenCodec tokenCodec,
        Clock clock
    ) {
        this.repository = repository;
        this.tokenCodec = tokenCodec;
        this.clock = clock;
    }

    public AuthenticatedSession require(HttpServletRequest request, boolean csrfRequired) {
        AnonymousSession session = findActiveSession(request).orElseThrow(() -> new ApiException(
            HttpStatus.UNAUTHORIZED,
            ApiErrorCode.SESSION_REQUIRED,
            "A valid anonymous session is required."
        ));

        if (csrfRequired && !tokenCodec.matches(
            request.getHeader(CSRF_HEADER),
            session.csrfTokenHash()
        )) {
            throw new ApiException(
                HttpStatus.FORBIDDEN,
                ApiErrorCode.CSRF_INVALID,
                "A valid CSRF token is required."
            );
        }

        return new AuthenticatedSession(session.id(), session.expiresAt());
    }

    public Optional<AuthenticatedSession> optional(HttpServletRequest request) {
        return findActiveSession(request)
            .map(session -> new AuthenticatedSession(session.id(), session.expiresAt()));
    }

    private Optional<AnonymousSession> findActiveSession(HttpServletRequest request) {
        Cookie cookie = WebUtils.getCookie(request, SESSION_COOKIE);
        if (cookie == null || !tokenCodec.hasValidFormat(cookie.getValue())) {
            return Optional.empty();
        }
        return repository.findByTokenHash(tokenCodec.hash(cookie.getValue()))
            .filter(session -> session.activeAt(clock.instant()));
    }
}
