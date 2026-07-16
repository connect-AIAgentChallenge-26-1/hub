package com.placepick.infrastructure.observability;

import com.placepick.recommendation.condition.application.port.out.ExtractionOutcome;
import com.placepick.recommendation.application.trace.RecommendationTraceSink;
import com.placepick.recommendation.reason.application.ReasonBatchValidationCode;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationOutcome;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.Locale;
import java.util.Objects;

/** Records only closed, provider-neutral LLM outcome diagnostics. */
public final class LlmProviderDiagnosticMetrics implements RecommendationTraceSink {

    private final MeterRegistry registry;

    public LlmProviderDiagnosticMetrics(MeterRegistry registry) {
        this.registry = Objects.requireNonNull(registry, "registry");
    }

    public void recordCondition(String provider, ExtractionOutcome outcome) {
        Objects.requireNonNull(outcome, "outcome");
        record(
            provider,
            "condition",
            outcome.errorCode().name(),
            outcome.failureStage().name(),
            outcome.diagnosticCode().name()
        );
    }

    public void recordReason(String provider, ReasonGenerationOutcome outcome) {
        Objects.requireNonNull(outcome, "outcome");
        record(
            provider,
            "reason",
            outcome.errorCode().name(),
            outcome.failureStage().name(),
            outcome.diagnosticCode().name()
        );
    }

    @Override
    public void reasonValidationFailed(ReasonBatchValidationCode code) {
        registry.counter(
            "placepick.provider.llm.validation.failures",
            "operation", "reason",
            "code", lower(Objects.requireNonNull(code, "code").name())
        ).increment();
    }

    private void record(
        String provider,
        String operation,
        String errorCode,
        String failureStage,
        String diagnosticCode
    ) {
        registry.counter(
            "placepick.provider.llm.outcomes",
            "provider", closedProvider(provider),
            "operation", operation,
            "error", lower(errorCode),
            "stage", lower(failureStage),
            "diagnostic", lower(diagnosticCode)
        ).increment();
    }

    private static String closedProvider(String value) {
        if (value == null) {
            return "unknown";
        }
        return switch (value) {
            case "elice", "mock" -> value;
            default -> "unknown";
        };
    }

    private static String lower(String value) {
        return value.toLowerCase(Locale.ROOT);
    }
}
