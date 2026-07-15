package com.placepick.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.placepick.security.RateLimitExceededException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

class ApiExceptionHandlerRateLimitTest {

    @Test
    void returnsRfc9457ProblemAndRetryAfterWithoutClientIdentity() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/events");
        request.setAttribute(TraceIdFilter.REQUEST_ATTRIBUTE, "trace-safe");

        ResponseEntity<ProblemDetail> response = new ApiExceptionHandler().handleRateLimit(
            new RateLimitExceededException(17),
            request
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(response.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo("17");
        assertThat(response.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL)).isEqualTo("no-store");
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getProperties())
            .containsEntry("errorCode", "RATE_LIMITED")
            .containsEntry("traceId", "trace-safe");
        assertThat(response.getBody().getDetail())
            .isEqualTo("The request rate limit was exceeded.");
    }

    @Test
    void mapsUnexpectedFailuresToTheDocumentedInternalError() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/example");
        request.setAttribute(TraceIdFilter.REQUEST_ATTRIBUTE, "trace-safe");

        ResponseEntity<ProblemDetail> response = new ApiExceptionHandler().handleUnexpected(
            new IllegalStateException("sensitive internal detail"),
            request
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getProperties())
            .containsEntry("errorCode", "INTERNAL_ERROR")
            .containsEntry("traceId", "trace-safe");
        assertThat(response.getBody().getDetail()).doesNotContain("sensitive");
    }

}
