package com.placepick.infrastructure.observability;

import static org.assertj.core.api.Assertions.assertThat;

import com.placepick.recommendation.application.port.out.LlmFailureStage;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionDiagnosticCode;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionErrorCode;
import com.placepick.recommendation.condition.application.port.out.ExtractionCommand;
import com.placepick.recommendation.condition.application.port.out.ExtractionOutcome;
import com.placepick.recommendation.condition.application.ConditionExtractionRecoveryService;
import com.placepick.recommendation.embedding.domain.BinaryClassificationMetrics;
import com.placepick.recommendation.embedding.domain.EmbeddingShadowCaseResult;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationDiagnosticCode;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationErrorCode;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationOutcome;
import com.placepick.recommendation.reason.application.ReasonBatchValidationCode;
import com.placepick.recommendation.embedding.domain.EmbeddingShadowEvaluationResult;
import com.placepick.recommendation.embedding.domain.EmbeddingShadowFailureCode;
import com.placepick.recommendation.embedding.domain.EmbeddingShadowMetrics;
import com.placepick.recommendation.embedding.domain.ShadowCorpusSplit;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import io.micrometer.prometheusmetrics.PrometheusConfig;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;

class LlmProviderDiagnosticMetricsTest {

    @Test
    void observedConditionPortRecordsOnlyClosedDiagnosticDimensions() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        ProviderCallMetrics providerMetrics = new ProviderCallMetrics(
            registry,
            1,
            Duration.ZERO
        );
        LlmProviderDiagnosticMetrics diagnosticMetrics =
            new LlmProviderDiagnosticMetrics(registry);
        var observed = ObservedProviderPorts.condition(
            command -> ExtractionOutcome.providerFailure(
                ConditionExtractionErrorCode.PROVIDER_INVALID_RESPONSE,
                ConditionExtractionDiagnosticCode.CONDITION_BUDGET_ORDER_INVALID,
                LlmFailureStage.CHAT_CONTENT_CONDITION
            ),
            providerMetrics,
            diagnosticMetrics,
            "elice",
            Duration.ofSeconds(30)
        );

        observed.extract(new ExtractionCommand("합성 조건", "synthetic-session-0001"));

        assertThat(registry.get("placepick.provider.llm.outcomes").counter()
            .count()).isEqualTo(1.0);
        assertThat(registry.get("placepick.provider.llm.outcomes")
            .tag("provider", "elice")
            .tag("operation", "condition")
            .tag("error", "provider_invalid_response")
            .tag("stage", "chat_content_condition")
            .tag("diagnostic", "condition_budget_order_invalid")
            .counter().count()).isEqualTo(1.0);
    }

    @Test
    void recordsReasonDiagnosticWithoutAnyRequestOrResponseLabel() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        LlmProviderDiagnosticMetrics metrics = new LlmProviderDiagnosticMetrics(registry);

        metrics.recordReason(
            "elice",
            ReasonGenerationOutcome.providerFailure(
                ReasonGenerationErrorCode.PROVIDER_INVALID_RESPONSE,
                ReasonGenerationDiagnosticCode.REASON_CONTENT_EVIDENCE_OWNERSHIP,
                LlmFailureStage.CHAT_CONTENT_SCHEMA
            )
        );

        var meter = registry.get("placepick.provider.llm.outcomes").counter();
        assertThat(meter.count()).isEqualTo(1.0);
        assertThat(meter.getId().getTags()).extracting(tag -> tag.getKey())
            .containsExactlyInAnyOrder(
                "provider",
                "operation",
                "error",
                "stage",
                "diagnostic"
            );

        metrics.reasonValidationFailed(ReasonBatchValidationCode.UNKNOWN_EVIDENCE);

        assertThat(registry.get("placepick.provider.llm.validation.failures")
            .tag("operation", "reason")
            .tag("code", "unknown_evidence")
            .counter().count()).isEqualTo(1.0);

        metrics.reasonPlaceCompleted(false, 2, true);
        assertThat(registry.get("placepick.recommendation.reason.candidates")
            .tag("source", "generated")
            .tag("attempts", "2")
            .tag("recovered", "true")
            .counter().count()).isEqualTo(1.0);

        metrics.record("reason", 120, 30);
        assertThat(registry.get("placepick.provider.llm.tokens")
            .tag("operation", "reason")
            .tag("direction", "input")
            .counter().count()).isEqualTo(120.0);
    }

    @Test
    void recordsClosedConditionResolutionWithoutUserOrProviderValues() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        LlmProviderDiagnosticMetrics metrics = new LlmProviderDiagnosticMetrics(registry);
        var recovery = new ConditionExtractionRecoveryService(
            command -> ExtractionOutcome.unprocessable(
                java.util.List.of(),
                ConditionExtractionDiagnosticCode.UNPROCESSABLE_LOCATION_AND_TYPE_MISSING
            ),
            metrics
        );

        recovery.extract(new ExtractionCommand(
            "합성 사용자 문장",
            "synthetic-session-0001"
        ));

        var counter = registry.get("placepick.recommendation.condition.resolutions")
            .tag("status", "manual")
            .tag("attempts", "1")
            .tag("recovered", "false")
            .tag("diagnostic", "unprocessable_location_and_type_missing")
            .counter();
        assertThat(counter.count()).isEqualTo(1.0);
        assertThat(counter.getId().getTags()).extracting(tag -> tag.getValue())
            .doesNotContain("합성 사용자 문장", "synthetic-session-0001");
    }

    @Test
    void recordsOnlyClosedEmbeddingShadowOutcomeDimensions() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        LlmProviderDiagnosticMetrics metrics = new LlmProviderDiagnosticMetrics(registry);

        metrics.completed(EmbeddingShadowEvaluationResult.failed(
            EmbeddingShadowFailureCode.PROVIDER_UNAVAILABLE
        ));

        assertThat(registry.get(
                "placepick.recommendation.preference.shadow.evaluations"
            )
            .tag("status", "failed")
            .tag("eligible", "false")
            .tag("failure", "provider_unavailable")
            .counter().count()).isEqualTo(1.0);
    }

    @Test
    void recordsEmbeddingShadowF1AndFalsePositiveGateWithoutCorpusValues() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        LlmProviderDiagnosticMetrics metrics = new LlmProviderDiagnosticMetrics(registry);

        metrics.completed(successfulShadowResult());
        metrics.record("condition", 42, 7);

        assertThat(registry.get("placepick.recommendation.preference.shadow.f1")
            .tag("matcher", "lexical")
            .tag("split", "holdout")
            .summary().totalAmount()).isEqualTo(0.4);
        assertThat(registry.get(
                "placepick.recommendation.preference.shadow.false.positives"
            )
            .tag("matcher", "embedding")
            .tag("split", "holdout")
            .summary().totalAmount()).isEqualTo(1.0);
    }

    @Test
    void prometheusNamesMatchTheProvisionedDashboardContract() {
        PrometheusMeterRegistry registry = new PrometheusMeterRegistry(
            PrometheusConfig.DEFAULT
        );
        LlmProviderDiagnosticMetrics metrics = new LlmProviderDiagnosticMetrics(registry);

        metrics.recordReason(
            "elice",
            ReasonGenerationOutcome.providerFailure(
                ReasonGenerationErrorCode.PROVIDER_INVALID_RESPONSE,
                ReasonGenerationDiagnosticCode.REASON_ENVELOPE_JSON,
                LlmFailureStage.JSON
            )
        );
        metrics.reasonValidationFailed(ReasonBatchValidationCode.SCHEMA_OR_SIZE);
        metrics.reasonPlaceCompleted(true, 2, false);
        new ConditionExtractionRecoveryService(
            command -> ExtractionOutcome.unprocessable(
                java.util.List.of(),
                ConditionExtractionDiagnosticCode.UNPROCESSABLE_LOCATION_AND_TYPE_MISSING
            ),
            metrics
        ).extract(new ExtractionCommand("합성 조건", "synthetic-session-0001"));
        metrics.completed(successfulShadowResult());
        metrics.record("condition", 42, 7);

        assertThat(registry.scrape())
            .contains("placepick_provider_llm_outcomes_total")
            .contains("placepick_provider_llm_validation_failures_total")
            .contains("placepick_recommendation_reason_candidates_total")
            .contains("placepick_recommendation_condition_resolutions_total")
            .contains("placepick_recommendation_preference_shadow_evaluations_total")
            .contains("placepick_recommendation_preference_shadow_f1")
            .contains("placepick_recommendation_preference_shadow_false_positives");
        assertThat(registry.scrape()).contains("placepick_provider_llm_tokens_total");
    }

    private static EmbeddingShadowEvaluationResult successfulShadowResult() {
        BinaryClassificationMetrics lexical = new BinaryClassificationMetrics(
            10, 2, 3, 2, 3, 0.4, 0.4, 0.4
        );
        BinaryClassificationMetrics embedding = new BinaryClassificationMetrics(
            10, 5, 1, 4, 0, 5.0 / 6.0, 1.0, 10.0 / 11.0
        );
        return EmbeddingShadowEvaluationResult.succeeded(
            new EmbeddingShadowMetrics(0.8, embedding, lexical, embedding, true),
            List.of(new EmbeddingShadowCaseResult(
                "shadow-holdout-01",
                ShadowCorpusSplit.HOLDOUT,
                true
            ))
        );
    }
}
