package com.placepick.recommendation.reason.application.port.out;

import com.placepick.recommendation.reason.domain.GeneratedReasonBatch;
import com.placepick.recommendation.application.port.out.LlmFailureStage;
import java.util.Objects;

public record ReasonGenerationOutcome(
    ReasonGenerationErrorCode errorCode,
    GeneratedReasonBatch batch,
    ReasonGenerationDiagnosticCode diagnosticCode,
    LlmFailureStage failureStage
) {

    public ReasonGenerationOutcome {
        errorCode = Objects.requireNonNull(errorCode, "errorCode");
        diagnosticCode = Objects.requireNonNull(diagnosticCode, "diagnosticCode");
        failureStage = Objects.requireNonNull(failureStage, "failureStage");
        if ((errorCode == ReasonGenerationErrorCode.NONE) != (batch != null)) {
            throw new IllegalArgumentException("Reason generation outcome is inconsistent.");
        }
        if (errorCode == ReasonGenerationErrorCode.NONE &&
            (diagnosticCode != ReasonGenerationDiagnosticCode.NONE ||
                failureStage != LlmFailureStage.NONE)) {
            throw new IllegalArgumentException(
                "Successful reason generation cannot contain diagnostics."
            );
        }
        if (errorCode != ReasonGenerationErrorCode.NONE &&
            failureStage == LlmFailureStage.NONE) {
            throw new IllegalArgumentException("Provider failure stage is required.");
        }
        if (errorCode != ReasonGenerationErrorCode.NONE) {
            requireDiagnosticStage(diagnosticCode, failureStage);
        }
    }

    public static ReasonGenerationOutcome generated(GeneratedReasonBatch batch) {
        return new ReasonGenerationOutcome(
            ReasonGenerationErrorCode.NONE,
            Objects.requireNonNull(batch, "batch"),
            ReasonGenerationDiagnosticCode.NONE,
            LlmFailureStage.NONE
        );
    }

    public static ReasonGenerationOutcome providerFailure(ReasonGenerationErrorCode errorCode) {
        return providerFailure(
            errorCode,
            ReasonGenerationDiagnosticCode.NONE,
            LlmFailureStage.UNSPECIFIED
        );
    }

    public static ReasonGenerationOutcome providerFailure(
        ReasonGenerationErrorCode errorCode,
        ReasonGenerationDiagnosticCode diagnosticCode,
        LlmFailureStage failureStage
    ) {
        if (errorCode == ReasonGenerationErrorCode.NONE) {
            throw new IllegalArgumentException("A provider failure code is required.");
        }
        return new ReasonGenerationOutcome(
            errorCode,
            null,
            diagnosticCode,
            failureStage
        );
    }

    public boolean generated() {
        return errorCode == ReasonGenerationErrorCode.NONE;
    }

    private static void requireDiagnosticStage(
        ReasonGenerationDiagnosticCode diagnosticCode,
        LlmFailureStage failureStage
    ) {
        LlmFailureStage expected = switch (diagnosticCode) {
            case NONE -> null;
            case UPSTREAM_INVALID_RESPONSE,
                 UPSTREAM_RESPONSE_TOO_LARGE,
                 UPSTREAM_AUTHENTICATION_FAILED,
                 UPSTREAM_RATE_LIMITED,
                 UPSTREAM_INVALID_REQUEST,
                 UPSTREAM_UNAVAILABLE -> LlmFailureStage.HTTP_STATUS;
            case REASON_REQUEST_SERIALIZATION -> LlmFailureStage.CLIENT;
            case REASON_TRANSPORT -> LlmFailureStage.TRANSPORT;
            case REASON_HTTP_CONTENT_TYPE -> LlmFailureStage.MEDIA_TYPE;
            case REASON_HTTP_RESPONSE_TOO_LARGE -> LlmFailureStage.RESPONSE_SIZE;
            case REASON_ENVELOPE_JSON -> LlmFailureStage.JSON;
            case REASON_ENVELOPE_METADATA -> LlmFailureStage.CHAT_METADATA;
            case REASON_ENVELOPE_CHOICES -> LlmFailureStage.CHAT_CHOICES;
            case REASON_ENVELOPE_MESSAGE -> LlmFailureStage.CHAT_MESSAGE;
            case REASON_ENVELOPE_CONTENT -> LlmFailureStage.CHAT_CONTENT;
            case REASON_ENVELOPE_USAGE -> LlmFailureStage.CHAT_USAGE;
            case REASON_CONTENT_ROOT_SCHEMA,
                 REASON_CONTENT_PLACES_SCHEMA,
                 REASON_CONTENT_SCHEMA,
                 REASON_CONTENT_PLACE_REFERENCE,
                 REASON_CONTENT_EVIDENCE_OWNERSHIP,
                 REASON_CONTENT_PLACE_SET,
                 REASON_CONTENT_PLACE_SCHEMA,
                 REASON_CONTENT_STATEMENTS_SCHEMA,
                 REASON_CONTENT_STATEMENT_SCHEMA,
                 REASON_CONTENT_EVIDENCE_SCHEMA,
                 REASON_CONTENT_STATEMENT_CONSTRAINT,
                 REASON_CONTENT_UNKNOWN_EVIDENCE,
                 REASON_CONTENT_TEMPLATE_EVIDENCE_TYPE_MISMATCH,
                 REASON_CONTENT_FORBIDDEN_CLAIM,
                 REASON_CONTENT_NO_LEXICAL_GROUNDING ->
                LlmFailureStage.CHAT_CONTENT_SCHEMA;
        };
        if (expected != null && failureStage != expected) {
            throw new IllegalArgumentException(
                "Reason diagnostic and failure stage are inconsistent."
            );
        }
    }

    @Override
    public String toString() {
        return "ReasonGenerationOutcome[errorCode=" + errorCode +
            ", diagnosticCode=" + diagnosticCode +
            ", failureStage=" + failureStage +
            ", batch=" + (batch == null ? "absent" : "<redacted>") + "]";
    }
}
