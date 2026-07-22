package com.placepick.recommendation.condition.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.placepick.recommendation.application.port.out.LlmFailureStage;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionDiagnosticCode;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionErrorCode;
import com.placepick.recommendation.condition.application.port.out.ConditionWarning;
import com.placepick.recommendation.condition.application.port.out.ExtractionCommand;
import com.placepick.recommendation.condition.application.port.out.ExtractionOutcome;
import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import java.util.ArrayDeque;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class ConditionExtractionRecoveryServiceTest {

    private static final ExtractionCommand COMMAND = new ExtractionCommand(
        "서울에서 카페를 찾아줘",
        "synthetic-session-0001"
    );

    @Test
    void returnsFirstSuccessfulExtractionWithoutRetrying() {
        ScriptedPort port = new ScriptedPort(success());

        ConditionExtractionResolution result =
            new ConditionExtractionRecoveryService(port).extract(COMMAND);

        assertThat(result.status()).isEqualTo(ConditionExtractionResolution.Status.EXTRACTED);
        assertThat(result.attempts()).isEqualTo(1);
        assertThat(result.recovered()).isFalse();
        assertThat(result.condition().isProcessable()).isTrue();
        assertThat(port.calls()).isEqualTo(1);
    }

    @Test
    void turnsMissingRequiredFieldsIntoAManualResolutionWithoutRetrying() {
        DraftRecommendationCondition partial = condition(null, PlaceType.CAFE);
        ScriptedPort port = new ScriptedPort(ExtractionOutcome.unprocessable(
            partial,
            List.of(ConditionWarning.PARTY_SIZE_NOT_PROVIDED),
            ConditionExtractionDiagnosticCode.UNPROCESSABLE_LOCATION_MISSING
        ));

        ConditionExtractionResolution result =
            new ConditionExtractionRecoveryService(port).extract(COMMAND);

        assertThat(result.manualEntryRequired()).isTrue();
        assertThat(result.attempts()).isEqualTo(1);
        assertThat(result.condition()).isSameAs(partial);
        assertThat(result.condition().placeType()).isEqualTo(PlaceType.CAFE);
        assertThat(result.warnings()).containsExactly(
            ConditionWarning.PARTY_SIZE_NOT_PROVIDED,
            ConditionWarning.BUDGET_NOT_PROVIDED
        );
        assertThat(port.calls()).isEqualTo(1);
    }

    @Test
    void retriesSchemaStructureFailureExactlyOnceAndCanRecover() {
        ScriptedPort port = new ScriptedPort(
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_INVALID_RESPONSE,
                LlmFailureStage.CHAT_CONTENT_SCHEMA
            ),
            success()
        );

        ConditionExtractionResolution result =
            new ConditionExtractionRecoveryService(port).extract(COMMAND);

        assertThat(result.extracted()).isTrue();
        assertThat(result.attempts()).isEqualTo(2);
        assertThat(result.recovered()).isTrue();
        assertThat(port.calls()).isEqualTo(2);
    }

    @Test
    void retriesRateLimitServerAndTimeoutFailuresExactlyOnce() {
        for (ExtractionOutcome first : List.of(
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_RATE_LIMITED,
                LlmFailureStage.HTTP_STATUS
            ),
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_UNAVAILABLE,
                LlmFailureStage.HTTP_STATUS
            ),
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_UNAVAILABLE,
                LlmFailureStage.TRANSPORT_TIMEOUT
            )
        )) {
            ScriptedPort port = new ScriptedPort(first, success());

            ConditionExtractionResolution result =
                new ConditionExtractionRecoveryService(port).extract(COMMAND);

            assertThat(result.recovered()).isTrue();
            assertThat(result.attempts()).isEqualTo(2);
            assertThat(port.calls()).isEqualTo(2);
        }
    }

    @Test
    void returnsManualAfterTwoRetryableFailuresOrASecondUnprocessableOutcome() {
        ScriptedPort exhausted = new ScriptedPort(
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_UNAVAILABLE,
                LlmFailureStage.TRANSPORT_TIMEOUT
            ),
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_INVALID_RESPONSE,
                LlmFailureStage.CHAT_MESSAGE
            )
        );
        ConditionExtractionResolution exhaustedResult =
            new ConditionExtractionRecoveryService(exhausted).extract(COMMAND);

        assertThat(exhaustedResult.manualEntryRequired()).isTrue();
        assertThat(exhaustedResult.attempts()).isEqualTo(2);
        assertThat(exhaustedResult.condition().isProcessable()).isFalse();
        assertThat(exhausted.calls()).isEqualTo(2);

        DraftRecommendationCondition partial = condition("서울", null);
        ScriptedPort becameUnprocessable = new ScriptedPort(
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_RATE_LIMITED,
                LlmFailureStage.HTTP_STATUS
            ),
            ExtractionOutcome.unprocessable(
                partial,
                List.of(),
                ConditionExtractionDiagnosticCode.UNPROCESSABLE_PLACE_TYPE_MISSING
            )
        );
        ConditionExtractionResolution unprocessableResult =
            new ConditionExtractionRecoveryService(becameUnprocessable).extract(COMMAND);

        assertThat(unprocessableResult.manualEntryRequired()).isTrue();
        assertThat(unprocessableResult.attempts()).isEqualTo(2);
        assertThat(unprocessableResult.condition()).isSameAs(partial);
        assertThat(becameUnprocessable.calls()).isEqualTo(2);
    }

    @Test
    void neverRetriesBadRequestAuthenticationOrStableContractFailures() {
        for (ExtractionOutcome outcome : List.of(
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_INVALID_REQUEST,
                LlmFailureStage.HTTP_STATUS
            ),
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_AUTHENTICATION_FAILED,
                LlmFailureStage.HTTP_STATUS
            ),
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_INVALID_RESPONSE,
                LlmFailureStage.CHAT_MODEL
            ),
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_INVALID_RESPONSE,
                LlmFailureStage.RESPONSE_SIZE
            ),
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_INVALID_RESPONSE,
                LlmFailureStage.CHAT_REFUSAL
            ),
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_RATE_LIMITED,
                LlmFailureStage.CLIENT
            ),
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_UNAVAILABLE,
                LlmFailureStage.TRANSPORT
            ),
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_UNAVAILABLE,
                LlmFailureStage.UNEXPECTED
            )
        )) {
            ScriptedPort port = new ScriptedPort(outcome);

            ConditionExtractionResolution result =
                new ConditionExtractionRecoveryService(port).extract(COMMAND);

            assertThat(result.failed()).isTrue();
            assertThat(result.attempts()).isEqualTo(1);
            assertThat(port.calls()).isEqualTo(1);
        }
    }

    @Test
    void retriesIncompleteCompletionButNeverRetriesExplicitRefusal() {
        ScriptedPort incomplete = new ScriptedPort(
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_INVALID_RESPONSE,
                LlmFailureStage.CHAT_INCOMPLETE
            ),
            success()
        );
        ScriptedPort refusal = new ScriptedPort(
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_INVALID_RESPONSE,
                LlmFailureStage.CHAT_REFUSAL
            )
        );

        assertThat(new ConditionExtractionRecoveryService(incomplete).extract(COMMAND).recovered())
            .isTrue();
        assertThat(incomplete.calls()).isEqualTo(2);
        assertThat(new ConditionExtractionRecoveryService(refusal).extract(COMMAND).failed())
            .isTrue();
        assertThat(refusal.calls()).isEqualTo(1);
    }

    @Test
    void aPermanentSecondFailureRemainsFailedInsteadOfBecomingManual() {
        ScriptedPort port = new ScriptedPort(
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_INVALID_RESPONSE,
                LlmFailureStage.JSON
            ),
            providerFailure(
                ConditionExtractionErrorCode.PROVIDER_AUTHENTICATION_FAILED,
                LlmFailureStage.HTTP_STATUS
            )
        );

        ConditionExtractionResolution result =
            new ConditionExtractionRecoveryService(port).extract(COMMAND);

        assertThat(result.failed()).isTrue();
        assertThat(result.attempts()).isEqualTo(2);
        assertThat(result.errorCode())
            .isEqualTo(ConditionExtractionErrorCode.PROVIDER_AUTHENTICATION_FAILED);
        assertThat(port.calls()).isEqualTo(2);
    }

    @Test
    void doesNotHideNullOrUnexpectedProviderDefects() {
        ConditionExtractionRecoveryService nullOutcome =
            new ConditionExtractionRecoveryService(command -> null);
        ConditionExtractionRecoveryService throwing =
            new ConditionExtractionRecoveryService(command -> {
                throw new IllegalStateException("synthetic internal failure");
            });

        assertThatThrownBy(() -> nullOutcome.extract(COMMAND))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("Condition extraction port returned no outcome.");
        assertThatThrownBy(() -> throwing.extract(COMMAND))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("synthetic internal failure");
    }

    private static ExtractionOutcome success() {
        return ExtractionOutcome.extracted(
            condition("서울", PlaceType.CAFE),
            List.of(ConditionWarning.PARTY_SIZE_NOT_PROVIDED)
        );
    }

    private static ExtractionOutcome providerFailure(
        ConditionExtractionErrorCode errorCode,
        LlmFailureStage failureStage
    ) {
        ConditionExtractionDiagnosticCode diagnostic = failureStage == LlmFailureStage.HTTP_STATUS
            ? switch (errorCode) {
                case PROVIDER_INVALID_REQUEST ->
                    ConditionExtractionDiagnosticCode.UPSTREAM_INVALID_REQUEST;
                case PROVIDER_AUTHENTICATION_FAILED ->
                    ConditionExtractionDiagnosticCode.UPSTREAM_AUTHENTICATION_FAILED;
                case PROVIDER_RATE_LIMITED ->
                    ConditionExtractionDiagnosticCode.UPSTREAM_RATE_LIMITED;
                case PROVIDER_UNAVAILABLE ->
                    ConditionExtractionDiagnosticCode.UPSTREAM_UNAVAILABLE;
                case PROVIDER_INVALID_RESPONSE ->
                    ConditionExtractionDiagnosticCode.UPSTREAM_INVALID_RESPONSE;
                case NONE, UNPROCESSABLE_CONDITION -> throw new IllegalArgumentException(
                    "A provider failure code is required."
                );
            }
            : ConditionExtractionDiagnosticCode.NONE;
        return ExtractionOutcome.providerFailure(errorCode, diagnostic, failureStage);
    }

    private static DraftRecommendationCondition condition(
        String location,
        PlaceType placeType
    ) {
        return new DraftRecommendationCondition(
            location,
            placeType,
            null,
            null,
            null,
            null,
            List.of(),
            List.of()
        );
    }

    private static final class ScriptedPort
        implements com.placepick.recommendation.condition.application.port.out.ConditionExtractionPort {

        private final ArrayDeque<ExtractionOutcome> outcomes;
        private final AtomicInteger calls = new AtomicInteger();

        private ScriptedPort(ExtractionOutcome... outcomes) {
            this.outcomes = new ArrayDeque<>(List.of(outcomes));
        }

        @Override
        public ExtractionOutcome extract(ExtractionCommand command) {
            calls.incrementAndGet();
            ExtractionOutcome outcome = outcomes.pollFirst();
            if (outcome == null) {
                throw new AssertionError("Condition extraction was called beyond its budget.");
            }
            return outcome;
        }

        private int calls() {
            return calls.get();
        }
    }
}
