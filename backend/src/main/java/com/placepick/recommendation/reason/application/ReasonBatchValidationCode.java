package com.placepick.recommendation.reason.application;

/** Closed, payload-free reason validation result safe for diagnostics. */
public enum ReasonBatchValidationCode {
    SCHEMA_OR_SIZE,
    PLACE_REFERENCE,
    DUPLICATE_PLACE,
    DUPLICATE_STATEMENT,
    INCOMPLETE_PLACE_SET,
    UNKNOWN_EVIDENCE,
    TEMPLATE_EVIDENCE_TYPE_MISMATCH,
    FORBIDDEN_CLAIM,
    NO_LEXICAL_GROUNDING
}
