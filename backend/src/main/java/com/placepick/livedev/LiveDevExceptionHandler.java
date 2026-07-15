package com.placepick.livedev;

import java.net.URI;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/** Safe problem details for the local developer surface; exception internals are never returned. */
@Profile("live-dev")
@RestControllerAdvice(assignableTypes = LiveDevController.class)
public final class LiveDevExceptionHandler {

    @ExceptionHandler(LiveDevWorkflowException.class)
    ResponseEntity<ProblemDetail> workflowFailure(LiveDevWorkflowException exception) {
        return response(
            exception.status(),
            exception.errorCode(),
            exception.getMessage()
        );
    }

    @ExceptionHandler({
        HttpMessageNotReadableException.class,
        MethodArgumentNotValidException.class,
        MethodArgumentTypeMismatchException.class,
        IllegalArgumentException.class
    })
    ResponseEntity<ProblemDetail> invalidRequest(Exception ignored) {
        return response(
            HttpStatus.BAD_REQUEST,
            "INVALID_REQUEST",
            "요청 형식 또는 값이 올바르지 않습니다."
        );
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> unexpectedFailure(Exception ignored) {
        return response(
            HttpStatus.INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "로컬 워크플로 요청을 처리하지 못했습니다."
        );
    }

    private static ResponseEntity<ProblemDetail> response(
        HttpStatusCode status,
        String errorCode,
        String detail
    ) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setType(URI.create("urn:placepick:live-dev:error:" + errorCode.toLowerCase()));
        problem.setTitle("PlacePick live developer workflow error");
        problem.setProperty("errorCode", errorCode);
        return ResponseEntity.status(status)
            .contentType(MediaType.APPLICATION_PROBLEM_JSON)
            .body(problem);
    }
}
