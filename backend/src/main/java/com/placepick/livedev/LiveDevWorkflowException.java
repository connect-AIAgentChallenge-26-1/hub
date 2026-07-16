package com.placepick.livedev;

import java.io.Serial;
import org.springframework.http.HttpStatus;

public final class LiveDevWorkflowException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    private final HttpStatus status;
    private final String errorCode;
    private final String diagnosticCode;

    LiveDevWorkflowException(HttpStatus status, String errorCode, String message) {
        this(status, errorCode, null, message);
    }

    LiveDevWorkflowException(
        HttpStatus status,
        String errorCode,
        String diagnosticCode,
        String message
    ) {
        super(message, null, false, false);
        this.status = status;
        this.errorCode = errorCode;
        this.diagnosticCode = diagnosticCode;
    }

    HttpStatus status() {
        return status;
    }

    String errorCode() {
        return errorCode;
    }

    String diagnosticCode() {
        return diagnosticCode;
    }
}
