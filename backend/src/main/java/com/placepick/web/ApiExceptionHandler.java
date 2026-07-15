package com.placepick.web;

import com.placepick.web.ApiException.FieldViolation;
import com.placepick.recommendation.job.RecommendationJobErrorCode;
import com.placepick.recommendation.job.RecommendationJobException;
import com.placepick.security.RateLimitExceededException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.net.URI;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public final class ApiExceptionHandler {

    private static final String PROBLEM_BASE = "https://placepick.dev/problems/";

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ProblemDetail> handleApi(ApiException exception, HttpServletRequest request) {
        return response(
            exception.status(),
            exception.errorCode(),
            exception.getMessage(),
            exception.fieldErrors(),
            request
        );
    }

    @ExceptionHandler(RecommendationJobException.class)
    ResponseEntity<ProblemDetail> handleRecommendationJob(
        RecommendationJobException exception,
        HttpServletRequest request
    ) {
        JobProblemMapping mapping = jobMapping(exception.errorCode());
        return response(
            mapping.status(),
            mapping.errorCode(),
            exception.getMessage(),
            List.of(),
            request
        );
    }

    @ExceptionHandler(RateLimitExceededException.class)
    ResponseEntity<ProblemDetail> handleRateLimit(
        RateLimitExceededException exception,
        HttpServletRequest request
    ) {
        ResponseEntity<ProblemDetail> base = response(
            HttpStatus.TOO_MANY_REQUESTS,
            ApiErrorCode.RATE_LIMITED,
            exception.getMessage(),
            List.of(),
            request
        );
        return ResponseEntity.status(base.getStatusCode())
            .headers(base.getHeaders())
            .header(HttpHeaders.RETRY_AFTER, Long.toString(exception.retryAfterSeconds()))
            .body(base.getBody());
    }

    @ExceptionHandler({NoHandlerFoundException.class, NoResourceFoundException.class})
    ResponseEntity<ProblemDetail> handleUnknownRoute(
        Exception exception,
        HttpServletRequest request
    ) {
        return response(
            HttpStatus.NOT_FOUND,
            ApiErrorCode.RESOURCE_NOT_FOUND,
            "The requested resource was not found.",
            List.of(),
            request
        );
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ProblemDetail> handleMethodNotAllowed(
        HttpRequestMethodNotSupportedException exception,
        HttpServletRequest request
    ) {
        ResponseEntity<ProblemDetail> base = response(
            HttpStatus.METHOD_NOT_ALLOWED,
            ApiErrorCode.METHOD_NOT_ALLOWED,
            "The request method is not allowed for this resource.",
            List.of(),
            request
        );
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(base.getStatusCode())
            .headers(base.getHeaders());
        if (exception.getSupportedHttpMethods() != null) {
            builder.allow(exception.getSupportedHttpMethods().toArray(HttpMethod[]::new));
        }
        return builder.body(base.getBody());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemDetail> handleValidation(
        MethodArgumentNotValidException exception,
        HttpServletRequest request
    ) {
        List<FieldViolation> violations = exception.getBindingResult().getFieldErrors().stream()
            .map(this::fieldViolation)
            .toList();
        return response(
            HttpStatus.BAD_REQUEST,
            ApiErrorCode.INVALID_REQUEST,
            "The request contains invalid fields.",
            violations,
            request
        );
    }

    @ExceptionHandler({
        HttpMessageNotReadableException.class,
        MethodArgumentTypeMismatchException.class,
        HandlerMethodValidationException.class,
        MissingRequestHeaderException.class,
        ConstraintViolationException.class
    })
    ResponseEntity<ProblemDetail> handleUnreadable(Exception exception, HttpServletRequest request) {
        return response(
            HttpStatus.BAD_REQUEST,
            ApiErrorCode.INVALID_REQUEST,
            "The request could not be read.",
            List.of(),
            request
        );
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<ProblemDetail> handleInvalidCondition(
        IllegalArgumentException exception,
        HttpServletRequest request
    ) {
        return response(
            HttpStatus.BAD_REQUEST,
            ApiErrorCode.INVALID_CONDITION,
            "The recommendation condition is invalid.",
            List.of(),
            request
        );
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> handleUnexpected(Exception exception, HttpServletRequest request) {
        return response(
            HttpStatus.INTERNAL_SERVER_ERROR,
            ApiErrorCode.INTERNAL_ERROR,
            "The request could not be processed.",
            List.of(),
            request
        );
    }

    private FieldViolation fieldViolation(FieldError error) {
        String code = error.getCode() == null ? "INVALID" : error.getCode();
        String message = error.getDefaultMessage() == null
            ? "The field is invalid."
            : error.getDefaultMessage();
        return new FieldViolation(error.getField(), code, message);
    }

    private ResponseEntity<ProblemDetail> response(
        HttpStatus status,
        ApiErrorCode errorCode,
        String detail,
        List<FieldViolation> fieldErrors,
        HttpServletRequest request
    ) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(status.getReasonPhrase());
        problem.setType(URI.create(PROBLEM_BASE + problemSlug(errorCode)));
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("errorCode", errorCode.name());
        problem.setProperty("traceId", traceId(request));
        if (!fieldErrors.isEmpty()) {
            problem.setProperty("fieldErrors", fieldErrors);
        }

        return ResponseEntity.status(status)
            .header(HttpHeaders.CACHE_CONTROL, "no-store")
            .contentType(MediaType.APPLICATION_PROBLEM_JSON)
            .body(problem);
    }

    private String traceId(HttpServletRequest request) {
        Object traceId = request.getAttribute(TraceIdFilter.REQUEST_ATTRIBUTE);
        return traceId instanceof String value ? value : UUID.randomUUID().toString();
    }

    private String problemSlug(ApiErrorCode errorCode) {
        return errorCode.name().toLowerCase(Locale.ROOT).replace('_', '-');
    }

    private JobProblemMapping jobMapping(RecommendationJobErrorCode errorCode) {
        return switch (errorCode) {
            case DRAFT_NOT_FOUND, JOB_NOT_FOUND -> new JobProblemMapping(
                HttpStatus.NOT_FOUND,
                ApiErrorCode.RESOURCE_NOT_FOUND
            );
            case DRAFT_EXPIRED -> new JobProblemMapping(
                HttpStatus.GONE,
                ApiErrorCode.DRAFT_EXPIRED
            );
            case JOB_EXPIRED -> new JobProblemMapping(
                HttpStatus.GONE,
                ApiErrorCode.JOB_EXPIRED
            );
            case DRAFT_NOT_CONFIRMED -> new JobProblemMapping(
                HttpStatus.CONFLICT,
                ApiErrorCode.DRAFT_NOT_CONFIRMED
            );
            case DRAFT_ALREADY_CONSUMED -> new JobProblemMapping(
                HttpStatus.CONFLICT,
                ApiErrorCode.DRAFT_ALREADY_CONSUMED
            );
            case IDEMPOTENCY_KEY_REUSED -> new JobProblemMapping(
                HttpStatus.CONFLICT,
                ApiErrorCode.IDEMPOTENCY_KEY_REUSED
            );
            case INVALID_STATE -> new JobProblemMapping(
                HttpStatus.CONFLICT,
                ApiErrorCode.INVALID_STATE
            );
        };
    }

    private record JobProblemMapping(HttpStatus status, ApiErrorCode errorCode) {
    }
}
