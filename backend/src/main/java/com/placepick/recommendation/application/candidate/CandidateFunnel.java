package com.placepick.recommendation.application.candidate;

import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;
import java.util.Objects;

/** Count-only candidate normalization diagnostics safe for metrics and operational traces. */
public record CandidateFunnel(
    int receivedCount,
    int eligibleCount,
    Map<CandidateRejectionReason, Integer> rejectionCounts
) {

    public CandidateFunnel {
        if (receivedCount < 0 || eligibleCount < 0 || eligibleCount > receivedCount) {
            throw new IllegalArgumentException("Candidate funnel counts are invalid.");
        }
        Objects.requireNonNull(rejectionCounts, "rejectionCounts");
        EnumMap<CandidateRejectionReason, Integer> normalized =
            new EnumMap<>(CandidateRejectionReason.class);
        for (CandidateRejectionReason reason : CandidateRejectionReason.values()) {
            int count = rejectionCounts.getOrDefault(reason, 0);
            if (count < 0) {
                throw new IllegalArgumentException("Candidate rejection count cannot be negative.");
            }
            normalized.put(reason, count);
        }
        int rejected = normalized.values().stream().mapToInt(Integer::intValue).sum();
        if (receivedCount != eligibleCount + rejected) {
            throw new IllegalArgumentException(
                "Candidate funnel must account for every received item exactly once."
            );
        }
        rejectionCounts = Collections.unmodifiableMap(normalized);
    }

    public int rejectedCount() {
        return receivedCount - eligibleCount;
    }

    public int rejectedBy(CandidateRejectionReason reason) {
        return rejectionCounts.get(Objects.requireNonNull(reason, "reason"));
    }
}
