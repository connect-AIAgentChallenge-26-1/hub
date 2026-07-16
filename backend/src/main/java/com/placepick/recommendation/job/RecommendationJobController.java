package com.placepick.recommendation.job;

import com.placepick.recommendation.job.infrastructure.PlacePickRoleCondition;
import com.placepick.session.AuthenticatedSession;
import com.placepick.session.SessionAuthenticator;
import com.placepick.web.ApiErrorCode;
import com.placepick.web.ApiException;
import com.placepick.web.TraceIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.UUID;
import org.springframework.context.annotation.Conditional;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@Validated
@Conditional(PlacePickRoleCondition.Api.class)
@RequestMapping("/api/v1/recommendations")
public class RecommendationJobController {

    private static final String IDEMPOTENCY_HEADER = "Idempotency-Key";
    private static final String LAST_EVENT_ID_HEADER = "Last-Event-ID";

    private final SessionAuthenticator authenticator;
    private final RecommendationJobService jobService;
    private final RecommendationJobEventStreamService streamService;

    public RecommendationJobController(
        SessionAuthenticator authenticator,
        RecommendationJobService jobService,
        RecommendationJobEventStreamService streamService
    ) {
        this.authenticator = authenticator;
        this.jobService = jobService;
        this.streamService = streamService;
    }

    @PostMapping
    public ResponseEntity<AcceptedJobView> create(
        @Valid @RequestBody CreateJobRequest body,
        @RequestHeader(IDEMPOTENCY_HEADER)
        @NotBlank
        @Size(max = 128)
        String idempotencyKey,
        HttpServletRequest request
    ) {
        AuthenticatedSession session = authenticator.require(request, true);
        RecommendationJobSubmission submission = jobService.create(
            new CreateRecommendationJobCommand(
                session.id(),
                body.draftId(),
                idempotencyKey,
                traceId(request)
            )
        );
        URI location = URI.create("/api/v1/recommendations/" + submission.jobId());
        return ResponseEntity.status(HttpStatus.ACCEPTED)
            .location(location)
            .cacheControl(CacheControl.noStore())
            .body(new AcceptedJobView(submission.jobId(), RecommendationJobStatus.ACCEPTED));
    }

    @GetMapping("/{jobId}")
    public ResponseEntity<RecommendationJobView> get(
        @PathVariable UUID jobId,
        HttpServletRequest request
    ) {
        AuthenticatedSession session = authenticator.require(request, false);
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(RecommendationJobView.from(jobService.get(jobId, session.id())));
    }

    @GetMapping(value = "/{jobId}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> events(
        @PathVariable UUID jobId,
        @RequestHeader(value = LAST_EVENT_ID_HEADER, required = false) String lastEventId,
        HttpServletRequest request
    ) {
        AuthenticatedSession session = authenticator.require(request, false);
        SseEmitter emitter = streamService.subscribe(
            jobId,
            session.id(),
            parseLastEventId(lastEventId)
        );
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .header("X-Content-Type-Options", "nosniff")
            .header("X-Accel-Buffering", "no")
            .contentType(MediaType.TEXT_EVENT_STREAM)
            .body(emitter);
    }

    private static Long parseLastEventId(String value) {
        if (value == null) {
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

    private static String traceId(HttpServletRequest request) {
        Object value = request.getAttribute(TraceIdFilter.REQUEST_ATTRIBUTE);
        return value instanceof String traceId ? traceId : "unavailable";
    }

    public record CreateJobRequest(@NotNull UUID draftId) {
    }

    public record AcceptedJobView(UUID jobId, RecommendationJobStatus status) {
    }
}
