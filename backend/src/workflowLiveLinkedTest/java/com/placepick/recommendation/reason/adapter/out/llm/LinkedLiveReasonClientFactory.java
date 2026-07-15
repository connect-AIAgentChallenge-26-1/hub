package com.placepick.recommendation.reason.adapter.out.llm;

import com.placepick.recommendation.reason.application.port.out.GroundedReasonGenerationPort;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationOutcome;
import java.net.URI;

/** Keeps the loopback-only constructor out of the production public API. */
public final class LinkedLiveReasonClientFactory {

    private LinkedLiveReasonClientFactory() {
    }

    public static DiagnosticClient create(
        URI gatewayV1,
        String localBearer
    ) {
        return new DiagnosticClient(
            EliceGroundedReasonClient.createForTesting(
                gatewayV1,
                localBearer,
                EliceGroundedReasonClient.MODEL,
                EliceGroundedReasonClient.CONNECT_TIMEOUT,
                EliceGroundedReasonClient.RESPONSE_TIMEOUT,
                EliceGroundedReasonClient.MAX_RESPONSE_BYTES
            )
        );
    }

    public static final class DiagnosticClient implements GroundedReasonGenerationPort {
        private final EliceGroundedReasonClient delegate;
        private String safeFailureCode;

        private DiagnosticClient(EliceGroundedReasonClient delegate) {
            this.delegate = delegate;
        }

        @Override
        public ReasonGenerationOutcome generate(ReasonGenerationCommand command) {
            EliceGroundedReasonClient.ReasonDiagnostic diagnostic =
                delegate.generateForDiagnostics(command);
            safeFailureCode = diagnostic.boundaryCode() != null
                ? diagnostic.boundaryCode()
                : diagnostic.outcome().generated()
                    ? null
                    : diagnostic.outcome().errorCode().name();
            return diagnostic.outcome();
        }

        public String safeFailureCode() {
            return safeFailureCode;
        }
    }
}
