package com.placepick.stream;

import com.placepick.outbox.RecommendationRequestedEnvelope;
import java.util.Objects;

public record RecommendationStreamRecord(
    String recordId,
    RecommendationRequestedEnvelope envelope,
    int attempt
) {
    public RecommendationStreamRecord {
        recordId = Objects.requireNonNull(recordId, "recordId");
        envelope = Objects.requireNonNull(envelope, "envelope");
        if (attempt < 0) {
            throw new IllegalArgumentException("Stream delivery attempt must not be negative.");
        }
    }
}
