package com.placepick.recommendation.reason.application.port.out;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.placepick.recommendation.application.port.out.LlmFailureStage;
import java.time.Duration;
import org.junit.jupiter.api.Test;

class ReasonGenerationOutcomeTest {

    @Test
    void rejectsImpossibleDiagnosticAndFailureStageCombinations() {
        assertThatThrownBy(() -> ReasonGenerationOutcome.providerFailure(
            ReasonGenerationErrorCode.PROVIDER_INVALID_RESPONSE,
            ReasonGenerationDiagnosticCode.REASON_CONTENT_EVIDENCE_OWNERSHIP,
            LlmFailureStage.HTTP_STATUS
        )).hasMessage("Reason diagnostic and failure stage are inconsistent.");

        assertThatThrownBy(() -> ReasonGenerationOutcome.providerFailure(
            ReasonGenerationErrorCode.PROVIDER_UNAVAILABLE,
            ReasonGenerationDiagnosticCode.UPSTREAM_UNAVAILABLE,
            LlmFailureStage.TRANSPORT
        )).hasMessage("Reason diagnostic and failure stage are inconsistent.");
    }

    @Test
    void preservesOnlyNonnegativeTransientRetryAfter() {
        ReasonGenerationOutcome limited = ReasonGenerationOutcome.providerFailure(
            ReasonGenerationErrorCode.PROVIDER_RATE_LIMITED,
            ReasonGenerationDiagnosticCode.UPSTREAM_RATE_LIMITED,
            LlmFailureStage.HTTP_STATUS,
            Duration.ofSeconds(2)
        );

        org.assertj.core.api.Assertions.assertThat(limited.retryAfter())
            .contains(Duration.ofSeconds(2));
        assertThatThrownBy(() -> ReasonGenerationOutcome.providerFailure(
            ReasonGenerationErrorCode.PROVIDER_RATE_LIMITED,
            ReasonGenerationDiagnosticCode.UPSTREAM_RATE_LIMITED,
            LlmFailureStage.HTTP_STATUS,
            Duration.ofMillis(-1)
        )).hasMessage("retryAfter must not be negative.");
        assertThatThrownBy(() -> ReasonGenerationOutcome.providerFailure(
            ReasonGenerationErrorCode.PROVIDER_INVALID_REQUEST,
            ReasonGenerationDiagnosticCode.UPSTREAM_INVALID_REQUEST,
            LlmFailureStage.HTTP_STATUS,
            Duration.ofSeconds(1)
        )).hasMessage("retryAfter is only valid for transient provider failures.");
    }
}
