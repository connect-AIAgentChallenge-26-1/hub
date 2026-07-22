package com.placepick.recommendation.condition.application;

import com.placepick.recommendation.application.port.out.LlmFailureStage;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionErrorCode;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionPort;
import com.placepick.recommendation.condition.application.port.out.ExtractionCommand;
import com.placepick.recommendation.condition.application.port.out.ExtractionOutcome;
import java.util.EnumSet;
import java.util.Objects;
import java.util.Set;

/**
 * Owns the single application-level retry allowed for condition extraction.
 *
 * <p>The provider adapter remains no-retry. Missing required user fields become a manual draft
 * immediately. Only transient failures and response structures that can change on regeneration
 * receive one additional invocation.</p>
 */
public final class ConditionExtractionRecoveryService {

    private static final Set<LlmFailureStage> REGENERATABLE_STAGES =
        EnumSet.of(
            LlmFailureStage.JSON,
            LlmFailureStage.CHAT_METADATA,
            LlmFailureStage.CHAT_CHOICES,
            LlmFailureStage.CHAT_MESSAGE,
            LlmFailureStage.CHAT_INCOMPLETE,
            LlmFailureStage.CHAT_CONTENT,
            LlmFailureStage.CHAT_CONTENT_SCHEMA,
            LlmFailureStage.CHAT_CONTENT_CONDITION,
            LlmFailureStage.CHAT_CONTENT_WARNINGS,
            LlmFailureStage.CHAT_USAGE
        );

    private final ConditionExtractionPort extractionPort;
    private final ConditionExtractionRecoveryObserver observer;

    public ConditionExtractionRecoveryService(ConditionExtractionPort extractionPort) {
        this(extractionPort, ConditionExtractionRecoveryObserver.none());
    }

    public ConditionExtractionRecoveryService(
        ConditionExtractionPort extractionPort,
        ConditionExtractionRecoveryObserver observer
    ) {
        this.extractionPort = Objects.requireNonNull(extractionPort, "extractionPort");
        this.observer = Objects.requireNonNull(observer, "observer");
    }

    public ConditionExtractionResolution extract(ExtractionCommand command) {
        Objects.requireNonNull(command, "command");
        ExtractionOutcome first = invoke(command);
        if (first.extracted()) {
            return completed(ConditionExtractionResolution.extracted(first, 1));
        }
        if (first.errorCode() == ConditionExtractionErrorCode.UNPROCESSABLE_CONDITION) {
            return completed(ConditionExtractionResolution.manual(first, 1));
        }
        if (!retryable(first)) {
            return completed(ConditionExtractionResolution.failed(first, 1));
        }

        ExtractionOutcome second = invoke(command);
        if (second.extracted()) {
            return completed(ConditionExtractionResolution.extracted(second, 2));
        }
        if (second.errorCode() == ConditionExtractionErrorCode.UNPROCESSABLE_CONDITION ||
            retryable(second)) {
            return completed(ConditionExtractionResolution.manual(second, 2));
        }
        return completed(ConditionExtractionResolution.failed(second, 2));
    }

    static boolean retryable(ExtractionOutcome outcome) {
        Objects.requireNonNull(outcome, "outcome");
        return switch (outcome.errorCode()) {
            case PROVIDER_RATE_LIMITED ->
                outcome.failureStage() == LlmFailureStage.HTTP_STATUS;
            case PROVIDER_UNAVAILABLE ->
                outcome.failureStage() == LlmFailureStage.HTTP_STATUS ||
                    outcome.failureStage() == LlmFailureStage.TRANSPORT_TIMEOUT;
            case PROVIDER_INVALID_RESPONSE ->
                REGENERATABLE_STAGES.contains(outcome.failureStage());
            case NONE, UNPROCESSABLE_CONDITION, PROVIDER_INVALID_REQUEST,
                 PROVIDER_AUTHENTICATION_FAILED -> false;
        };
    }

    private ExtractionOutcome invoke(ExtractionCommand command) {
        ExtractionOutcome outcome = extractionPort.extract(command);
        if (outcome == null) {
            throw new IllegalStateException("Condition extraction port returned no outcome.");
        }
        return outcome;
    }

    private ConditionExtractionResolution completed(
        ConditionExtractionResolution resolution
    ) {
        observer.completed(resolution);
        return resolution;
    }
}
