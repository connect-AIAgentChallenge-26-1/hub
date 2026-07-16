package com.placepick.room;

import com.placepick.recommendation.job.infrastructure.PlacePickRoleCondition;
import com.placepick.session.AuthenticatedSession;
import com.placepick.session.SessionAuthenticator;
import com.placepick.web.ApiErrorCode;
import com.placepick.web.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.UUID;
import org.springframework.context.annotation.Conditional;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@Validated
@Conditional(PlacePickRoleCondition.Api.class)
@RequestMapping("/api/v1")
public class VotingRoomController {

    private final SessionAuthenticator authenticator;
    private final VotingRoomService roomService;
    private final VotingRoomEventStreamService streamService;
    private final OrganizerCookieFactory organizerCookieFactory;

    public VotingRoomController(
        SessionAuthenticator authenticator,
        VotingRoomService roomService,
        VotingRoomEventStreamService streamService,
        OrganizerCookieFactory organizerCookieFactory
    ) {
        this.authenticator = authenticator;
        this.roomService = roomService;
        this.streamService = streamService;
        this.organizerCookieFactory = organizerCookieFactory;
    }

    @PostMapping("/recommendations/{jobId}/rooms")
    public ResponseEntity<RoomCreated> create(
        @PathVariable UUID jobId,
        @Valid @RequestBody(required = false) CreateRoomRequest body,
        @RequestHeader(name = "Idempotency-Key")
        @NotBlank @Size(max = 128) String idempotencyKey,
        HttpServletRequest request,
        HttpServletResponse response
    ) {
        AuthenticatedSession session = authenticator.require(request, true);
        Integer expiresInHours = body == null ? null : body.expiresInHours();
        IssuedRoom issued = roomService.create(
            jobId,
            session.id(),
            expiresInHours,
            idempotencyKey
        );
        response.addHeader(
            HttpHeaders.SET_COOKIE,
            organizerCookieFactory.create(
                issued.shareToken(),
                issued.organizerCapability(),
                issued.expiresAt()
            ).toString()
        );
        String apiLocation = "/api/v1/rooms/" + issued.shareToken();
        return ResponseEntity.created(URI.create(apiLocation))
            .cacheControl(CacheControl.noStore())
            .body(new RoomCreated(
                issued.shareToken(),
                "/rooms/" + issued.shareToken(),
                issued.expiresAt()
            ));
    }

    @GetMapping("/rooms/{shareToken}")
    public ResponseEntity<RoomView> get(
        @PathVariable String shareToken,
        @CookieValue(name = OrganizerCookieFactory.COOKIE_NAME, required = false)
        String organizerCapability,
        HttpServletRequest request
    ) {
        UUID sessionId = authenticator.optional(request)
            .map(AuthenticatedSession::id)
            .orElse(null);
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(roomService.get(shareToken, sessionId, organizerCapability));
    }

    @PutMapping("/rooms/{shareToken}/votes/{placeId}")
    public ResponseEntity<VoteMutationResult> putVote(
        @PathVariable String shareToken,
        @PathVariable UUID placeId,
        @Valid @RequestBody VoteRequest body,
        HttpServletRequest request
    ) {
        AuthenticatedSession session = authenticator.require(request, true);
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(roomService.putVote(shareToken, session.id(), placeId, body.value()));
    }

    @DeleteMapping("/rooms/{shareToken}/votes/{placeId}")
    public ResponseEntity<Void> deleteVote(
        @PathVariable String shareToken,
        @PathVariable UUID placeId,
        HttpServletRequest request
    ) {
        AuthenticatedSession session = authenticator.require(request, true);
        roomService.deleteVote(shareToken, session.id(), placeId);
        return ResponseEntity.noContent()
            .cacheControl(CacheControl.noStore())
            .build();
    }

    @PutMapping("/rooms/{shareToken}/final-result")
    public ResponseEntity<FinalResultView> finalizeRoom(
        @PathVariable String shareToken,
        @CookieValue(name = OrganizerCookieFactory.COOKIE_NAME, required = false)
        String organizerCapability,
        @RequestHeader(name = "Idempotency-Key")
        @NotBlank @Size(max = 128) String idempotencyKey,
        @Valid @RequestBody FinalizeRoomRequest body,
        HttpServletRequest request
    ) {
        AuthenticatedSession session = authenticator.require(request, true);
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(roomService.finalizeRoom(
                shareToken,
                session.id(),
                organizerCapability,
                body.placeId(),
                idempotencyKey
            ));
    }

    @GetMapping("/rooms/{shareToken}/result")
    public ResponseEntity<FinalResultView> getResult(@PathVariable String shareToken) {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(roomService.getResult(shareToken));
    }

    @GetMapping(
        value = "/rooms/{shareToken}/events",
        produces = MediaType.TEXT_EVENT_STREAM_VALUE
    )
    public ResponseEntity<SseEmitter> events(
        @PathVariable String shareToken,
        @CookieValue(name = OrganizerCookieFactory.COOKIE_NAME, required = false)
        String organizerCapability,
        @RequestHeader(name = "Last-Event-ID", required = false) String lastEventId,
        HttpServletRequest request
    ) {
        UUID sessionId = authenticator.optional(request)
            .map(AuthenticatedSession::id)
            .orElse(null);
        SseEmitter emitter = streamService.subscribe(
            shareToken,
            sessionId,
            organizerCapability,
            parseLastEventId(lastEventId)
        );
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .header("X-Content-Type-Options", "nosniff")
            .header("X-Accel-Buffering", "no")
            .contentType(MediaType.TEXT_EVENT_STREAM)
            .body(emitter);
    }

    private Long parseLastEventId(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            long parsed = Long.parseLong(value);
            if (parsed < 0) {
                throw new NumberFormatException("negative");
            }
            return parsed;
        } catch (NumberFormatException exception) {
            throw new ApiException(
                HttpStatus.BAD_REQUEST,
                ApiErrorCode.INVALID_REQUEST,
                "Last-Event-ID must be a non-negative integer."
            );
        }
    }

    public record CreateRoomRequest(
        @Min(1) @Max(168) Integer expiresInHours
    ) {
    }

    public record VoteRequest(@NotNull VoteValue value) {
    }

    public record FinalizeRoomRequest(@NotNull UUID placeId) {
    }
}
