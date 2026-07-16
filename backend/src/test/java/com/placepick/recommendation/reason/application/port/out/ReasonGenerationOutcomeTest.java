package com.placepick.recommendation.reason.application.port.out;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.placepick.recommendation.application.port.out.LlmFailureStage;
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
}
