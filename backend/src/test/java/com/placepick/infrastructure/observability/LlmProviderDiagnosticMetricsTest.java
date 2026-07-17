package com.placepick.infrastructure.observability;

import static org.assertj.core.api.Assertions.assertThat;

import com.placepick.recommendation.application.port.out.LlmFailureStage;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionDiagnosticCode;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionErrorCode;
import com.placepick.recommendation.condition.application.port.out.ExtractionCommand;
import com.placepick.recommendation.condition.application.port.out.ExtractionOutcome;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationDiagnosticCode;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationErrorCode;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationOutcome;
import com.placepick.recommendation.reason.application.ReasonBatchValidationCode;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import io.micrometer.prometheusmetrics.PrometheusConfig;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import java.time.Duration;
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

        assertThat(registry.scrape())
            .contains("placepick_provider_llm_outcomes_total")
            .contains("placepick_provider_llm_validation_failures_total")
            .contains("placepick_recommendation_reason_candidates_total");
    }
}
