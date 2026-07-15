package com.placepick.recommendation.reason.adapter.out.llm;

import com.placepick.recommendation.reason.application.port.out.GroundedReasonGenerationPort;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationOutcome;

/** Live-evidence-only wrapper that retains normalized failure metadata, never payloads. */
public final class LiveEvidenceReasonProbe implements GroundedReasonGenerationPort {

    private final EliceGroundedReasonClient client;
    private volatile ReasonGenerationOutcome lastOutcome;
    private volatile String lastBoundaryCode;

    public LiveEvidenceReasonProbe(EliceGroundedReasonClient client) {
        this.client = client;
    }

    @Override
    public ReasonGenerationOutcome generate(ReasonGenerationCommand command) {
        EliceGroundedReasonClient.ReasonDiagnostic diagnostic =
            client.generateForDiagnostics(command);
        lastOutcome = diagnostic.outcome();
        lastBoundaryCode = diagnostic.boundaryCode();
        return diagnostic.outcome();
    }

    public String lastErrorCode() {
        return lastOutcome == null ? null : lastOutcome.errorCode().name();
    }

    public String lastBoundaryCode() {
        return lastBoundaryCode;
    }
}
