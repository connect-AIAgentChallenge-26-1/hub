package com.placepick.infrastructure.external.llm;

import com.placepick.recommendation.condition.application.port.out.ExtractionCommand;
import com.placepick.recommendation.condition.application.port.out.ExtractionOutcome;
import java.net.URI;

/** Keeps the loopback-only constructor out of the production public API. */
public final class LinkedLiveConditionClientFactory {

    private LinkedLiveConditionClientFactory() {
    }

    public static EliceConditionExtractionClient create(
        URI gatewayV1,
        String localBearer
    ) {
        return EliceConditionExtractionClient.createForTesting(
            gatewayV1,
            localBearer,
            EliceConditionExtractionClient.MODEL,
            EliceConditionExtractionClient.CONNECT_TIMEOUT,
            EliceConditionExtractionClient.RESPONSE_TIMEOUT,
            EliceConditionExtractionClient.MAX_RESPONSE_BYTES
        );
    }

    public static LinkedLiveExtraction extract(
        EliceConditionExtractionClient client,
        ExtractionCommand command
    ) {
        EliceConditionExtractionClient.ExtractionDiagnostic diagnostic =
            client.extractForDiagnostics(command);
        return new LinkedLiveExtraction(diagnostic.outcome(), diagnostic.boundaryCode());
    }

    public record LinkedLiveExtraction(
        ExtractionOutcome outcome,
        String boundaryCode
    ) {
    }
}
