package com.placepick.session;

import com.placepick.recommendation.job.infrastructure.PlacePickRoleCondition;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Instant;
import org.springframework.context.annotation.Conditional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Conditional(PlacePickRoleCondition.Api.class)
@RequestMapping("/api/v1/anonymous-sessions")
public final class AnonymousSessionController {

    private final AnonymousSessionService sessionService;
    private final SessionCookieFactory cookieFactory;

    public AnonymousSessionController(
        AnonymousSessionService sessionService,
        SessionCookieFactory cookieFactory
    ) {
        this.sessionService = sessionService;
        this.cookieFactory = cookieFactory;
    }

    @PostMapping
    public ResponseEntity<SessionResponse> create(
        @CookieValue(name = SessionAuthenticator.SESSION_COOKIE, required = false)
        String currentToken,
        HttpServletResponse servletResponse
    ) {
        IssuedAnonymousSession issued = sessionService.createOrRefresh(currentToken);
        servletResponse.addHeader(
            HttpHeaders.SET_COOKIE,
            cookieFactory.create(issued.sessionToken()).toString()
        );
        return ResponseEntity.status(HttpStatus.CREATED)
            .header(HttpHeaders.CACHE_CONTROL, "no-store")
            .body(new SessionResponse(issued.csrfToken(), issued.expiresAt()));
    }

    public record SessionResponse(String csrfToken, Instant expiresAt) {
    }
}
