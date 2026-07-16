package com.placepick.web;

import java.io.Serial;
import java.util.List;
import java.util.Objects;
import org.springframework.http.HttpStatus;

/** A deliberately safe error. Detail must never contain credentials or provider payloads. */
public final class ApiException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    private final HttpStatus status;
    private final ApiErrorCode errorCode;
    private final List<FieldViolation> fieldErrors;

    public ApiException(HttpStatus status, ApiErrorCode errorCode, String detail) {
        this(status, errorCode, detail, List.of());
    }

    public ApiException(
        HttpStatus status,
        ApiErrorCode errorCode,
        String detail,
        List<FieldViolation> fieldErrors
    ) {
        super(Objects.requireNonNull(detail, "detail"), null, false, false);
        this.status = Objects.requireNonNull(status, "status");
        this.errorCode = Objects.requireNonNull(errorCode, "errorCode");
        this.fieldErrors = List.copyOf(fieldErrors);
    }

    public HttpStatus status() {
        return status;
    }

    public ApiErrorCode errorCode() {
        return errorCode;
    }

    public List<FieldViolation> fieldErrors() {
        return fieldErrors;
    }

    public record FieldViolation(String field, String code, String message) {
        public FieldViolation {
            field = Objects.requireNonNull(field, "field");
            code = Objects.requireNonNull(code, "code");
            message = Objects.requireNonNull(message, "message");
        }
    }
}
