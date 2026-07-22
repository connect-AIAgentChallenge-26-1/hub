package com.placepick.infrastructure.observability;

import com.placepick.recommendation.condition.application.port.out.ExtractionOutcome;
import com.placepick.recommendation.condition.application.ConditionExtractionRecoveryObserver;
import com.placepick.recommendation.condition.application.ConditionExtractionResolution;
import com.placepick.recommendation.embedding.application.EmbeddingShadowEvaluationObserver;
import com.placepick.recommendation.embedding.domain.EmbeddingShadowEvaluationResult;
import com.placepick.recommendation.application.trace.RecommendationTraceSink;
import com.placepick.recommendation.reason.application.ReasonBatchValidationCode;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationOutcome;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.DistributionSummary;
import java.util.Locale;
import java.util.Objects;

/** Records only closed, provider-neutral LLM outcome diagnostics. */
public final class LlmProviderDiagnosticMetrics
    implements RecommendationTraceSink, ConditionExtractionRecoveryObserver,
    EmbeddingShadowEvaluationObserver {

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
    public void completed(ConditionExtractionResolution resolution) {
        Objects.requireNonNull(resolution, "resolution");
        registry.counter(
            "placepick.recommendation.condition.resolutions",
            "status", lower(resolution.status().name()),
            "attempts", Integer.toString(resolution.attempts()),
            "recovered", Boolean.toString(resolution.recovered()),
            "diagnostic", lower(resolution.diagnosticCode().name())
        ).increment();
    }

    @Override
    public void completed(EmbeddingShadowEvaluationResult result) {
        Objects.requireNonNull(result, "result");
        boolean eligible = result.metrics()
            .map(metrics -> metrics.promotionEligible())
            .orElse(false);
        registry.counter(
            "placepick.recommendation.preference.shadow.evaluations",
            "status", lower(result.status().name()),
            "eligible", Boolean.toString(eligible),
            "failure", lower(result.failureCode().name())
        ).increment();
        result.metrics().ifPresent(metrics -> {
            DistributionSummary.builder(
                    "placepick.recommendation.preference.shadow.f1"
                )
                .tag("matcher", "lexical")
                .tag("split", "holdout")
                .register(registry)
                .record(metrics.lexicalHoldout().f1());
            DistributionSummary.builder(
                    "placepick.recommendation.preference.shadow.f1"
                )
                .tag("matcher", "embedding")
                .tag("split", "holdout")
                .register(registry)
                .record(metrics.embeddingHoldout().f1());
            DistributionSummary.builder(
                    "placepick.recommendation.preference.shadow.false.positives"
                )
                .tag("matcher", "lexical")
                .tag("split", "holdout")
                .register(registry)
                .record(metrics.lexicalHoldout().falsePositive());
            DistributionSummary.builder(
                    "placepick.recommendation.preference.shadow.false.positives"
                )
                .tag("matcher", "embedding")
                .tag("split", "holdout")
                .register(registry)
                .record(metrics.embeddingHoldout().falsePositive());
        });
    }

    @Override
    public void reasonValidationFailed(ReasonBatchValidationCode code) {
        registry.counter(
            "placepick.provider.llm.validation.failures",
            "operation", "reason",
            "code", lower(Objects.requireNonNull(code, "code").name())
        ).increment();
    }

    @Override
    public void reasonPlaceCompleted(
        boolean fallbackUsed,
        int attempts,
        boolean recovered
    ) {
        String safeAttempts = switch (attempts) {
            case 1 -> "1";
            case 2 -> "2";
            default -> "invalid";
        };
        registry.counter(
            "placepick.recommendation.reason.candidates",
            "source", fallbackUsed ? "template" : "generated",
            "attempts", safeAttempts,
            "recovered", Boolean.toString(recovered)
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
