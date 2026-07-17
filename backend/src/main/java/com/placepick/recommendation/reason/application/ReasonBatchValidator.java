package com.placepick.recommendation.reason.application;

import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.domain.GeneratedReasonResult;
import com.placepick.recommendation.reason.domain.PlaceReasonStatements;
import com.placepick.recommendation.reason.domain.ReasonClaim;
import com.placepick.recommendation.reason.domain.ReasonStatement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class ReasonBatchValidator {

    private final ReasonStatementPolicy statementPolicy;

    ReasonBatchValidator(ReasonStatementPolicy statementPolicy) {
        this.statementPolicy = statementPolicy;
    }

    PlaceReasonStatements validate(
        ReasonGenerationCommand command,
        GeneratedReasonResult result
    ) {
        if (!GeneratedReasonResult.SCHEMA_VERSION.equals(result.schemaVersion())) {
            throw invalid(ReasonBatchValidationCode.SCHEMA_OR_SIZE);
        }
        if (!command.slot().equals(result.slot())) {
            throw invalid(ReasonBatchValidationCode.SLOT_REFERENCE);
        }

        Map<String, ReasonClaim> claimsById = new HashMap<>();
        command.claims().forEach(claim -> claimsById.put(claim.claimId(), claim));
        Set<String> statementTexts = new HashSet<>();
        List<ReasonStatement> restored = new ArrayList<>();
        for (var statement : result.statements()) {
            if (!statementTexts.add(statement.text())) {
                throw invalid(ReasonBatchValidationCode.DUPLICATE_STATEMENT);
            }
            ReasonStatementPolicy.ValidationResult validation =
                statementPolicy.validate(statement, command);
            if (validation != ReasonStatementPolicy.ValidationResult.SUPPORTED) {
                throw invalid(validationCode(validation));
            }
            restored.add(new ReasonStatement(
                statement.text(),
                statement.claimIds().stream()
                    .map(claimsById::get)
                    .map(ReasonClaim::evidenceId)
                    .toList()
            ));
        }
        return new PlaceReasonStatements(command.place().placeId(), restored);
    }

    static ReasonBatchValidationCode validationCode(
        ReasonStatementPolicy.ValidationResult result
    ) {
        return switch (result) {
            case UNKNOWN_CLAIM -> ReasonBatchValidationCode.UNKNOWN_CLAIM;
            case BLOG_ATTRIBUTION_MISSING ->
                ReasonBatchValidationCode.BLOG_ATTRIBUTION_MISSING;
            case BLOG_ATTRIBUTION_MISMATCH ->
                ReasonBatchValidationCode.BLOG_ATTRIBUTION_MISMATCH;
            case UNSUPPORTED_GROUNDING ->
                ReasonBatchValidationCode.UNSUPPORTED_GROUNDING;
            case UNKNOWN_EVIDENCE -> ReasonBatchValidationCode.UNKNOWN_EVIDENCE;
            case TEMPLATE_EVIDENCE_TYPE_MISMATCH ->
                ReasonBatchValidationCode.TEMPLATE_EVIDENCE_TYPE_MISMATCH;
            case FORBIDDEN_CLAIM -> ReasonBatchValidationCode.FORBIDDEN_CLAIM;
            case NO_LEXICAL_GROUNDING -> ReasonBatchValidationCode.NO_LEXICAL_GROUNDING;
            case SUPPORTED -> throw new IllegalArgumentException(
                "Supported statements do not have a validation failure code."
            );
        };
    }

    private static ReasonBatchValidationException invalid(
        ReasonBatchValidationCode code
    ) {
        return new ReasonBatchValidationException(code);
    }
}
