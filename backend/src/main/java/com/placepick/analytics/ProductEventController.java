package com.placepick.analytics;

import com.placepick.recommendation.job.infrastructure.PlacePickRoleCondition;
import com.placepick.session.AuthenticatedSession;
import com.placepick.session.SessionAuthenticator;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Conditional;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/events")
@Conditional(PlacePickRoleCondition.Api.class)
public final class ProductEventController {

    private final SessionAuthenticator authenticator;
    private final ProductEventService eventService;

    public ProductEventController(
        SessionAuthenticator authenticator,
        ProductEventService eventService
    ) {
        this.authenticator = authenticator;
        this.eventService = eventService;
    }

    @PostMapping
    public ResponseEntity<Void> accept(
        @RequestBody ProductEventRequest body,
        HttpServletRequest request
    ) {
        AuthenticatedSession session = authenticator.require(request, true);
        eventService.accept(session.id(), body);
        return ResponseEntity.accepted()
            .cacheControl(CacheControl.noStore())
            .build();
    }
}
