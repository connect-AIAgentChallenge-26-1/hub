package com.placepick.infrastructure.external.llm;

import com.placepick.recommendation.condition.application.port.out.ExtractionCommand;
import com.placepick.recommendation.condition.application.port.out.ExtractionOutcome;

/** Live-evidence-only access to normalized diagnostic metadata, never provider payloads. */
public final class LiveEvidenceConditionProbe {

    private LiveEvidenceConditionProbe() {
    }

    public static Result extract(
        EliceConditionExtractionClient client,
        ExtractionCommand command
    ) {
        EliceConditionExtractionClient.ExtractionDiagnostic diagnostic =
            client.extractForDiagnostics(command);
        return new Result(
            diagnostic.outcome(),
            diagnostic.boundaryCode(),
            diagnostic.failureStage() == null ? null : diagnostic.failureStage().name()
        );
    }

    public record Result(
        ExtractionOutcome outcome,
        String boundaryCode,
        String failureStage
    ) {
    }
}
