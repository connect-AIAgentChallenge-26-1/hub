package com.placepick.infrastructure.observability;

import com.placepick.recommendation.application.port.out.BlogSearchPort;
import com.placepick.recommendation.application.port.out.PlaceSearchPort;
import com.placepick.recommendation.application.port.out.SearchProviderException;
import com.placepick.recommendation.application.port.out.SearchProviderFailure;
import com.placepick.recommendation.application.port.out.SearchProviderFailureStage;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionErrorCode;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionPort;
import com.placepick.recommendation.condition.application.port.out.ExtractionOutcome;
import com.placepick.recommendation.reason.application.port.out.GroundedReasonGenerationPort;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationErrorCode;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationOutcome;
import java.time.Duration;

/** Provider-neutral decorators; no request or response value becomes a metric label. */
public final class ObservedProviderPorts {

    private ObservedProviderPorts() {
    }

    public static ConditionExtractionPort condition(
        ConditionExtractionPort delegate,
        ProviderCallMetrics metrics,
        LlmProviderDiagnosticMetrics diagnosticMetrics,
        String provider,
        Duration timeout
    ) {
        return condition(delegate, metrics, diagnosticMetrics, provider, timeout, null);
    }

    public static ConditionExtractionPort condition(
        ConditionExtractionPort delegate,
        ProviderCallMetrics metrics,
        LlmProviderDiagnosticMetrics diagnosticMetrics,
        String provider,
        Duration timeout,
        SafeProviderTracing tracing
    ) {
        return command -> metrics.observe(
            provider,
            "condition",
            timeout,
            () -> traced(
                tracing,
                provider,
                "condition",
                () -> delegate.extract(command),
                outcome -> extractionOutcome(outcome.errorCode())
            ),
            outcome -> {
                diagnosticMetrics.recordCondition(provider, outcome);
                return extractionOutcome(outcome.errorCode());
            },
            () -> rejectedExtraction(diagnosticMetrics, provider)
        );
    }

    public static PlaceSearchPort places(
        PlaceSearchPort delegate,
        ProviderCallMetrics metrics,
        String provider,
        Duration timeout
    ) {
        return places(delegate, metrics, provider, timeout, null);
    }

    public static PlaceSearchPort places(
        PlaceSearchPort delegate,
        ProviderCallMetrics metrics,
        String provider,
        Duration timeout,
        SafeProviderTracing tracing
    ) {
        return query -> metrics.observe(
            provider,
            "local",
            timeout,
            () -> traced(
                tracing,
                provider,
                "local",
                () -> delegate.searchPlaces(query),
                ignored -> "success"
            ),
            ignored -> "success",
            ObservedProviderPorts::searchRejected
        );
    }

    public static BlogSearchPort blogs(
        BlogSearchPort delegate,
        ProviderCallMetrics metrics,
        String provider,
        Duration timeout
    ) {
        return blogs(delegate, metrics, provider, timeout, null);
    }

    public static BlogSearchPort blogs(
        BlogSearchPort delegate,
        ProviderCallMetrics metrics,
        String provider,
        Duration timeout,
        SafeProviderTracing tracing
    ) {
        return query -> metrics.observe(
            provider,
            "blog",
            timeout,
            () -> traced(
                tracing,
                provider,
                "blog",
                () -> delegate.searchBlogs(query),
                ignored -> "success"
            ),
            ignored -> "success",
            ObservedProviderPorts::searchRejected
        );
    }

    public static GroundedReasonGenerationPort reasons(
        GroundedReasonGenerationPort delegate,
        ProviderCallMetrics metrics,
        LlmProviderDiagnosticMetrics diagnosticMetrics,
        String provider,
        Duration timeout
    ) {
        return reasons(delegate, metrics, diagnosticMetrics, provider, timeout, null);
    }

    public static GroundedReasonGenerationPort reasons(
        GroundedReasonGenerationPort delegate,
        ProviderCallMetrics metrics,
        LlmProviderDiagnosticMetrics diagnosticMetrics,
        String provider,
        Duration timeout,
        SafeProviderTracing tracing
    ) {
        return command -> metrics.observe(
            provider,
            "reason",
            timeout,
            () -> traced(
                tracing,
                provider,
                "reason",
                () -> delegate.generate(command),
                outcome -> reasonOutcome(outcome.errorCode())
            ),
            outcome -> {
                diagnosticMetrics.recordReason(provider, outcome);
                return reasonOutcome(outcome.errorCode());
            },
            () -> rejectedReason(diagnosticMetrics, provider)
        );
    }

    private static <T> T traced(
        SafeProviderTracing tracing,
        String provider,
        String operation,
        java.util.function.Supplier<T> invocation,
        java.util.function.Function<T, String> outcomeClassifier
    ) {
        return tracing == null
            ? invocation.get()
            : tracing.within(provider, operation, invocation, outcomeClassifier);
    }

    private static ExtractionOutcome rejectedExtraction(
        LlmProviderDiagnosticMetrics metrics,
        String provider
    ) {
        ExtractionOutcome outcome = ExtractionOutcome.providerFailure(
            ConditionExtractionErrorCode.PROVIDER_RATE_LIMITED
        );
        metrics.recordCondition(provider, outcome);
        return outcome;
    }

    private static ReasonGenerationOutcome rejectedReason(
        LlmProviderDiagnosticMetrics metrics,
        String provider
    ) {
        ReasonGenerationOutcome outcome = ReasonGenerationOutcome.providerFailure(
            ReasonGenerationErrorCode.PROVIDER_RATE_LIMITED
        );
        metrics.recordReason(provider, outcome);
        return outcome;
    }

    private static <T> T searchRejected() {
        throw new SearchProviderException(
            SearchProviderFailure.RATE_LIMITED,
            null,
            SearchProviderFailureStage.CLIENT,
            "The local provider concurrency budget is exhausted.",
            null
        );
    }

    private static String extractionOutcome(ConditionExtractionErrorCode code) {
        return switch (code) {
            case NONE -> "success";
            case UNPROCESSABLE_CONDITION -> "unprocessable";
            case PROVIDER_INVALID_REQUEST -> "invalid_request";
            case PROVIDER_AUTHENTICATION_FAILED -> "authentication_failed";
            case PROVIDER_RATE_LIMITED -> "rate_limited";
            case PROVIDER_INVALID_RESPONSE -> "invalid_response";
            case PROVIDER_UNAVAILABLE -> "unavailable";
        };
    }

    private static String reasonOutcome(ReasonGenerationErrorCode code) {
        return switch (code) {
            case NONE -> "success";
            case PROVIDER_INVALID_REQUEST -> "invalid_request";
            case PROVIDER_AUTHENTICATION_FAILED -> "authentication_failed";
            case PROVIDER_RATE_LIMITED -> "rate_limited";
            case PROVIDER_INVALID_RESPONSE -> "invalid_response";
            case PROVIDER_UNAVAILABLE -> "unavailable";
        };
    }
}
