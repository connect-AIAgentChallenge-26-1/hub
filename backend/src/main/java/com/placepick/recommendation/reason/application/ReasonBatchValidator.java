package com.placepick.recommendation.reason.application;

import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.domain.GeneratedReasonBatch;
import com.placepick.recommendation.reason.domain.PlaceReasonStatements;
import com.placepick.recommendation.reason.domain.ReasonPlaceContext;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

final class ReasonBatchValidator {

    private final ReasonStatementPolicy statementPolicy;

    ReasonBatchValidator(ReasonStatementPolicy statementPolicy) {
        this.statementPolicy = statementPolicy;
    }

    List<PlaceReasonStatements> validateAndOrder(
        ReasonGenerationCommand command,
        GeneratedReasonBatch batch
    ) {
        if (!GeneratedReasonBatch.SCHEMA_VERSION.equals(batch.schemaVersion()) ||
            batch.places().size() != command.places().size()) {
            throw invalid(ReasonBatchValidationCode.SCHEMA_OR_SIZE);
        }

        Map<UUID, ReasonPlaceContext> expected = new HashMap<>();
        command.places().forEach(value -> expected.put(value.placeId(), value));
        Map<UUID, PlaceReasonStatements> actual = new HashMap<>();
        for (PlaceReasonStatements place : batch.places()) {
            if (!expected.containsKey(place.placeId())) {
                throw invalid(ReasonBatchValidationCode.PLACE_REFERENCE);
            }
            if (actual.put(place.placeId(), place) != null) {
                throw invalid(ReasonBatchValidationCode.DUPLICATE_PLACE);
            }
            Set<String> statementTexts = new HashSet<>();
            for (var statement : place.statements()) {
                if (!statementTexts.add(statement.text())) {
                    throw invalid(ReasonBatchValidationCode.DUPLICATE_STATEMENT);
                }
                ReasonStatementPolicy.ValidationResult validation = statementPolicy.validate(
                    statement,
                    expected.get(place.placeId())
                );
                if (validation != ReasonStatementPolicy.ValidationResult.SUPPORTED) {
                    throw invalid(validationCode(validation));
                }
            }
        }
        if (!actual.keySet().equals(expected.keySet())) {
            throw invalid(ReasonBatchValidationCode.INCOMPLETE_PLACE_SET);
        }
        return command.places().stream().map(value -> actual.get(value.placeId())).toList();
    }

    static ReasonBatchValidationCode validationCode(
        ReasonStatementPolicy.ValidationResult result
    ) {
        return switch (result) {
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
