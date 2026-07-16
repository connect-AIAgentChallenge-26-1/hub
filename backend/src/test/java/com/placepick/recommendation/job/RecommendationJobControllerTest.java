package com.placepick.recommendation.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.placepick.session.AuthenticatedSession;
import com.placepick.session.SessionAuthenticator;
import com.placepick.security.RateLimitExceededException;
import com.placepick.web.ApiExceptionHandler;
import com.placepick.web.TraceIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class RecommendationJobControllerTest {

    @Test
    void createsExactlyAcceptedResponseWithJobLocationAndAuthenticatedCsrfBoundary() {
        SessionAuthenticator authenticator = mock(SessionAuthenticator.class);
        RecommendationJobService jobService = mock(RecommendationJobService.class);
        RecommendationJobEventStreamService streamService = mock(
            RecommendationJobEventStreamService.class
        );
        HttpServletRequest request = mock(HttpServletRequest.class);
        UUID sessionId = UUID.randomUUID();
        UUID draftId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        when(authenticator.require(request, true)).thenReturn(new AuthenticatedSession(
            sessionId,
            Instant.parse("2026-07-17T00:00:00Z")
        ));
        when(request.getAttribute(TraceIdFilter.REQUEST_ATTRIBUTE)).thenReturn("trace-1");
        when(jobService.create(new CreateRecommendationJobCommand(
            sessionId,
            draftId,
            "idempotency-key-1",
            "trace-1"
        ))).thenReturn(new RecommendationJobSubmission(
            jobId,
            RecommendationJobStatus.ACCEPTED,
            false
        ));
        RecommendationJobController controller = new RecommendationJobController(
            authenticator,
            jobService,
            streamService
        );

        var response = controller.create(
            new RecommendationJobController.CreateJobRequest(draftId),
            "idempotency-key-1",
            request
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat(response.getHeaders().getLocation()).hasToString(
            "/api/v1/recommendations/" + jobId
        );
        assertThat(response.getBody()).isEqualTo(
            new RecommendationJobController.AcceptedJobView(
                jobId,
                RecommendationJobStatus.ACCEPTED
            )
        );
        verify(authenticator).require(request, true);
        verify(jobService).create(new CreateRecommendationJobCommand(
            sessionId,
            draftId,
            "idempotency-key-1",
            "trace-1"
        ));
    }

    @Test
    void mapsSseConnectionLimitTo429WithRetryAfter() throws Exception {
        SessionAuthenticator authenticator = mock(SessionAuthenticator.class);
        RecommendationJobService jobService = mock(RecommendationJobService.class);
        RecommendationJobEventStreamService streamService = mock(
            RecommendationJobEventStreamService.class
        );
        UUID sessionId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        when(authenticator.require(any(HttpServletRequest.class), eq(false))).thenReturn(
            new AuthenticatedSession(sessionId, Instant.parse("2026-07-17T00:00:00Z"))
        );
        when(streamService.subscribe(jobId, sessionId, null))
            .thenThrow(new RateLimitExceededException(15));
        var mvc = MockMvcBuilders.standaloneSetup(new RecommendationJobController(
                authenticator,
                jobService,
                streamService
            ))
            .setControllerAdvice(new ApiExceptionHandler())
            .build();

        mvc.perform(get("/api/v1/recommendations/{jobId}/events", jobId))
            .andExpect(status().isTooManyRequests())
            .andExpect(header().string("Retry-After", "15"))
            .andExpect(jsonPath("$.errorCode").value("RATE_LIMITED"));
    }
}
