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
        String provider,
        Duration timeout
    ) {
        return command -> metrics.observe(
            provider,
            "condition",
            timeout,
            () -> delegate.extract(command),
            outcome -> extractionOutcome(outcome.errorCode()),
            () -> ExtractionOutcome.providerFailure(
                ConditionExtractionErrorCode.PROVIDER_RATE_LIMITED
            )
        );
    }

    public static PlaceSearchPort places(
        PlaceSearchPort delegate,
        ProviderCallMetrics metrics,
        String provider,
        Duration timeout
    ) {
        return query -> metrics.observe(
            provider,
            "local",
            timeout,
            () -> delegate.searchPlaces(query),
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
        return query -> metrics.observe(
            provider,
            "blog",
            timeout,
            () -> delegate.searchBlogs(query),
            ignored -> "success",
            ObservedProviderPorts::searchRejected
        );
    }

    public static GroundedReasonGenerationPort reasons(
        GroundedReasonGenerationPort delegate,
        ProviderCallMetrics metrics,
        String provider,
        Duration timeout
    ) {
        return command -> metrics.observe(
            provider,
            "reason",
            timeout,
            () -> delegate.generate(command),
            outcome -> reasonOutcome(outcome.errorCode()),
            () -> ReasonGenerationOutcome.providerFailure(
                ReasonGenerationErrorCode.PROVIDER_RATE_LIMITED
            )
        );
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
