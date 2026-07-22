package com.placepick.recommendation.condition.application.port.out;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.placepick.recommendation.application.port.out.LlmFailureStage;
import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import java.util.List;
import org.junit.jupiter.api.Test;

class ExtractionContractTest {

    @Test
    void validatesRequestTextAndNonIdentifyingSafetyIdentifier() {
        ExtractionCommand command = new ExtractionCommand(
            "  서울에서 카페를 찾아줘  ",
            "session-derived-identifier"
        );

        assertThat(command.requestText()).isEqualTo("서울에서 카페를 찾아줘");
        assertThat(command.toString())
            .doesNotContain(command.requestText(), command.safetyIdentifier())
            .isEqualTo(
                "ExtractionCommand[requestText=<redacted>, safetyIdentifier=<redacted>]"
            );
        assertThatThrownBy(() -> new ExtractionCommand(" ", "session-derived-identifier"))
            .hasMessage("Request text must contain between 1 and 1000 safe characters.");
        assertThatThrownBy(() -> new ExtractionCommand("서울 카페", "user@example.com"))
            .hasMessage("Safety identifier has an invalid format.");
    }

    @Test
    void outcomeDoesNotAllowAFalseSuccessfulOrLeakyFailureState() {
        DraftRecommendationCondition missingLocation = new DraftRecommendationCondition(
            null,
            PlaceType.CAFE,
            null,
            null,
            null,
            null,
            List.of(),
            List.of()
        );

        assertThatThrownBy(() -> ExtractionOutcome.extracted(missingLocation, List.of()))
            .hasMessage("Successful extraction requires a processable draft condition.");
        assertThatThrownBy(() -> new ExtractionOutcome(
            ConditionExtractionErrorCode.PROVIDER_INVALID_RESPONSE,
            missingLocation,
            List.of(),
            ConditionExtractionDiagnosticCode.NONE,
            LlmFailureStage.UNSPECIFIED
        )).hasMessage("Failed extraction must not expose a condition.");
    }

    @Test
    void acceptsOnlyClosedUnprocessableDiagnosticsWithoutAProviderFailureStage() {
        DraftRecommendationCondition partial = new DraftRecommendationCondition(
            null,
            PlaceType.CAFE,
            null,
            null,
            null,
            null,
            List.of(),
            List.of()
        );
        ExtractionOutcome outcome = ExtractionOutcome.unprocessable(
            partial,
            List.of(),
            ConditionExtractionDiagnosticCode.UNPROCESSABLE_LOCATION_MISSING
        );

        assertThat(outcome.errorCode())
            .isEqualTo(ConditionExtractionErrorCode.UNPROCESSABLE_CONDITION);
        assertThat(outcome.failureStage()).isEqualTo(LlmFailureStage.NONE);
        assertThat(outcome.condition()).isSameAs(partial);
        assertThatThrownBy(() -> ExtractionOutcome.unprocessable(
            new DraftRecommendationCondition(
                "서울",
                PlaceType.CAFE,
                null,
                null,
                null,
                null,
                List.of(),
                List.of()
            ),
            List.of(),
            ConditionExtractionDiagnosticCode.UNPROCESSABLE_LOCATION_MISSING
        )).hasMessage(
            "Unprocessable extraction requires an incomplete condition and diagnostic."
        );
    }

    @Test
    void rejectsImpossibleProviderDiagnosticCombinations() {
        assertThatThrownBy(() -> ExtractionOutcome.providerFailure(
            ConditionExtractionErrorCode.PROVIDER_INVALID_RESPONSE,
            ConditionExtractionDiagnosticCode.UNPROCESSABLE_LOCATION_MISSING,
            LlmFailureStage.UNSPECIFIED
        )).hasMessage("Unprocessable diagnostics cannot describe a provider failure.");

        assertThatThrownBy(() -> ExtractionOutcome.providerFailure(
            ConditionExtractionErrorCode.PROVIDER_INVALID_RESPONSE,
            ConditionExtractionDiagnosticCode.CONDITION_BUDGET_ORDER_INVALID,
            LlmFailureStage.HTTP_STATUS
        )).hasMessage("Condition diagnostic and failure stage are inconsistent.");
    }
}
