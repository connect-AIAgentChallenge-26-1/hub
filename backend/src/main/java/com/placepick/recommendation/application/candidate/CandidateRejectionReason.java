package com.placepick.recommendation.application.candidate;

/**
 * Closed, provider-neutral reasons why a Local search item did not become an eligible candidate.
 *
 * <p>The values are intentionally low-cardinality and contain no provider payload. An item is
 * assigned to exactly one reason, in the order enforced by {@link CandidateNormalizer}.</p>
 */
public enum CandidateRejectionReason {
    MISSING_IDENTITY,
    LOCATION,
    TYPE,
    EXCLUSION,
    DUPLICATE
}
