package com.placepick.recommendation.condition.application.port.out;

import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import com.placepick.recommendation.application.port.out.LlmFailureStage;
import java.util.List;
import java.util.Objects;

/** Provider-neutral result that never exposes provider payloads or credentials. */
public record ExtractionOutcome(
    ConditionExtractionErrorCode errorCode,
    DraftRecommendationCondition condition,
    List<ConditionWarning> warnings,
    ConditionExtractionDiagnosticCode diagnosticCode,
    LlmFailureStage failureStage
) {

    public static final String SCHEMA_VERSION = "placepick.condition-extraction.v1";

    public ExtractionOutcome {
        errorCode = Objects.requireNonNull(errorCode, "errorCode");
        warnings = List.copyOf(warnings);
        diagnosticCode = Objects.requireNonNull(diagnosticCode, "diagnosticCode");
        failureStage = Objects.requireNonNull(failureStage, "failureStage");
        if (errorCode == ConditionExtractionErrorCode.NONE) {
            if (condition == null || !condition.isProcessable()) {
                throw new IllegalArgumentException(
                    "Successful extraction requires a processable draft condition."
                );
            }
            requireNoFailureDiagnostic(diagnosticCode, failureStage);
        } else if (errorCode == ConditionExtractionErrorCode.UNPROCESSABLE_CONDITION) {
            if ((condition != null && condition.isProcessable()) ||
                !isUnprocessableDiagnostic(diagnosticCode) ||
                failureStage != LlmFailureStage.NONE) {
                throw new IllegalArgumentException(
                    "Unprocessable extraction requires an incomplete condition and diagnostic."
                );
            }
        } else if (condition != null) {
            throw new IllegalArgumentException("Failed extraction must not expose a condition.");
        } else if (failureStage == LlmFailureStage.NONE) {
            throw new IllegalArgumentException("Provider failure stage is required.");
        } else {
            requireProviderDiagnostic(diagnosticCode, failureStage);
        }
    }

    public static ExtractionOutcome extracted(
        DraftRecommendationCondition condition,
        List<ConditionWarning> warnings
    ) {
        return new ExtractionOutcome(
            ConditionExtractionErrorCode.NONE,
            condition,
            warnings,
            ConditionExtractionDiagnosticCode.NONE,
            LlmFailureStage.NONE
        );
    }

    public static ExtractionOutcome unprocessable(
        List<ConditionWarning> warnings,
        ConditionExtractionDiagnosticCode diagnosticCode
    ) {
        return unprocessable(null, warnings, diagnosticCode);
    }

    public static ExtractionOutcome unprocessable(
        DraftRecommendationCondition condition,
        List<ConditionWarning> warnings,
        ConditionExtractionDiagnosticCode diagnosticCode
    ) {
        return new ExtractionOutcome(
            ConditionExtractionErrorCode.UNPROCESSABLE_CONDITION,
            condition,
            warnings,
            diagnosticCode,
            LlmFailureStage.NONE
        );
    }

    public static ExtractionOutcome providerFailure(ConditionExtractionErrorCode errorCode) {
        return providerFailure(
            errorCode,
            ConditionExtractionDiagnosticCode.NONE,
            LlmFailureStage.UNSPECIFIED
        );
    }

    public static ExtractionOutcome providerFailure(
        ConditionExtractionErrorCode errorCode,
        ConditionExtractionDiagnosticCode diagnosticCode,
        LlmFailureStage failureStage
    ) {
        if (errorCode == ConditionExtractionErrorCode.NONE ||
            errorCode == ConditionExtractionErrorCode.UNPROCESSABLE_CONDITION) {
            throw new IllegalArgumentException("Provider failure code is required.");
        }
        return new ExtractionOutcome(
            errorCode,
            null,
            List.of(),
            diagnosticCode,
            failureStage
        );
    }

    public boolean extracted() {
        return errorCode == ConditionExtractionErrorCode.NONE;
    }

    private static void requireNoFailureDiagnostic(
        ConditionExtractionDiagnosticCode diagnosticCode,
        LlmFailureStage failureStage
    ) {
        if (diagnosticCode != ConditionExtractionDiagnosticCode.NONE ||
            failureStage != LlmFailureStage.NONE) {
            throw new IllegalArgumentException("Successful extraction cannot contain diagnostics.");
        }
    }

    private static boolean isUnprocessableDiagnostic(
        ConditionExtractionDiagnosticCode diagnosticCode
    ) {
        return switch (diagnosticCode) {
            case UNPROCESSABLE_LOCATION_AND_TYPE_MISSING,
                 UNPROCESSABLE_LOCATION_MISSING,
                 UNPROCESSABLE_PLACE_TYPE_MISSING,
                 UNPROCESSABLE_DOMAIN_CONSTRAINT -> true;
            default -> false;
        };
    }

    private static void requireProviderDiagnostic(
        ConditionExtractionDiagnosticCode diagnosticCode,
        LlmFailureStage failureStage
    ) {
        if (isUnprocessableDiagnostic(diagnosticCode)) {
            throw new IllegalArgumentException(
                "Unprocessable diagnostics cannot describe a provider failure."
            );
        }
        LlmFailureStage expected = switch (diagnosticCode) {
            case NONE -> null;
            case CONDITION_OTHER_DETAIL_MISSING,
                 CONDITION_BUDGET_ORDER_INVALID,
                 CONDITION_DOMAIN_CONSTRAINT_INVALID ->
                LlmFailureStage.CHAT_CONTENT_CONDITION;
            case UPSTREAM_INVALID_RESPONSE,
                 UPSTREAM_RESPONSE_TOO_LARGE,
                 UPSTREAM_AUTHENTICATION_FAILED,
                 UPSTREAM_RATE_LIMITED,
                 UPSTREAM_INVALID_REQUEST,
                 UPSTREAM_UNAVAILABLE -> LlmFailureStage.HTTP_STATUS;
            case UNPROCESSABLE_LOCATION_AND_TYPE_MISSING,
                 UNPROCESSABLE_LOCATION_MISSING,
                 UNPROCESSABLE_PLACE_TYPE_MISSING,
                 UNPROCESSABLE_DOMAIN_CONSTRAINT -> throw new IllegalStateException(
                     "Unprocessable diagnostics were not rejected."
                 );
        };
        if (expected != null && failureStage != expected) {
            throw new IllegalArgumentException(
                "Condition diagnostic and failure stage are inconsistent."
            );
        }
    }
}
