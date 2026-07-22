package com.placepick.recommendation.condition.application;

import com.placepick.recommendation.application.port.out.LlmFailureStage;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionDiagnosticCode;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionErrorCode;
import com.placepick.recommendation.condition.application.port.out.ConditionWarning;
import com.placepick.recommendation.condition.application.port.out.ExtractionOutcome;
import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import java.util.List;
import java.util.Objects;

/**
 * Application decision after the bounded condition-extraction attempt budget is exhausted.
 *
 * <p>A manual resolution deliberately carries an incomplete draft condition so the caller can
 * persist or display a user-editable draft. A failed resolution carries no provider values.</p>
 */
public record ConditionExtractionResolution(
    Status status,
    DraftRecommendationCondition condition,
    List<ConditionWarning> warnings,
    ConditionExtractionErrorCode errorCode,
    ConditionExtractionDiagnosticCode diagnosticCode,
    LlmFailureStage failureStage,
    int attempts
) {

    public enum Status {
        EXTRACTED,
        MANUAL,
        FAILED
    }

    public ConditionExtractionResolution {
        status = Objects.requireNonNull(status, "status");
        Objects.requireNonNull(warnings, "warnings");
        warnings = condition == null
            ? List.copyOf(warnings)
            : ConditionWarnings.from(condition);
        errorCode = Objects.requireNonNull(errorCode, "errorCode");
        diagnosticCode = Objects.requireNonNull(diagnosticCode, "diagnosticCode");
        failureStage = Objects.requireNonNull(failureStage, "failureStage");
        if (attempts < 1 || attempts > 2) {
            throw new IllegalArgumentException("Extraction attempts must be between one and two.");
        }
        switch (status) {
            case EXTRACTED -> requireExtracted(
                condition,
                errorCode,
                diagnosticCode,
                failureStage
            );
            case MANUAL -> requireManual(condition, errorCode);
            case FAILED -> requireFailed(condition, errorCode);
        }
    }

    static ConditionExtractionResolution extracted(ExtractionOutcome outcome, int attempts) {
        return from(Status.EXTRACTED, outcome, attempts, outcome.condition());
    }

    static ConditionExtractionResolution manual(ExtractionOutcome outcome, int attempts) {
        DraftRecommendationCondition condition = outcome.condition() == null
            ? emptyDraft()
            : outcome.condition();
        return from(Status.MANUAL, outcome, attempts, condition);
    }

    static ConditionExtractionResolution failed(ExtractionOutcome outcome, int attempts) {
        return from(Status.FAILED, outcome, attempts, null);
    }

    public boolean extracted() {
        return status == Status.EXTRACTED;
    }

    public boolean manualEntryRequired() {
        return status == Status.MANUAL;
    }

    public boolean failed() {
        return status == Status.FAILED;
    }

    public boolean recovered() {
        return status == Status.EXTRACTED && attempts == 2;
    }

    private static ConditionExtractionResolution from(
        Status status,
        ExtractionOutcome outcome,
        int attempts,
        DraftRecommendationCondition condition
    ) {
        Objects.requireNonNull(outcome, "outcome");
        return new ConditionExtractionResolution(
            status,
            condition,
            condition == null ? List.of() : ConditionWarnings.from(condition),
            outcome.errorCode(),
            outcome.diagnosticCode(),
            outcome.failureStage(),
            attempts
        );
    }

    private static DraftRecommendationCondition emptyDraft() {
        return new DraftRecommendationCondition(
            null,
            null,
            null,
            null,
            null,
            null,
            List.of(),
            List.of()
        );
    }

    private static void requireExtracted(
        DraftRecommendationCondition condition,
        ConditionExtractionErrorCode errorCode,
        ConditionExtractionDiagnosticCode diagnosticCode,
        LlmFailureStage failureStage
    ) {
        if (condition == null || !condition.isProcessable() ||
            errorCode != ConditionExtractionErrorCode.NONE ||
            diagnosticCode != ConditionExtractionDiagnosticCode.NONE ||
            failureStage != LlmFailureStage.NONE) {
            throw new IllegalArgumentException(
                "Extracted resolution requires a successful processable outcome."
            );
        }
    }

    private static void requireManual(
        DraftRecommendationCondition condition,
        ConditionExtractionErrorCode errorCode
    ) {
        if (condition == null || condition.isProcessable() ||
            errorCode == ConditionExtractionErrorCode.NONE) {
            throw new IllegalArgumentException(
                "Manual resolution requires an incomplete failed outcome."
            );
        }
    }

    private static void requireFailed(
        DraftRecommendationCondition condition,
        ConditionExtractionErrorCode errorCode
    ) {
        if (condition != null || errorCode == ConditionExtractionErrorCode.NONE ||
            errorCode == ConditionExtractionErrorCode.UNPROCESSABLE_CONDITION) {
            throw new IllegalArgumentException(
                "Failed resolution requires a non-manual provider failure."
            );
        }
    }
}
