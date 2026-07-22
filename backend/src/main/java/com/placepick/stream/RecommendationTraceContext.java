package com.placepick.stream;

import java.util.Objects;

/** Restores a persisted trace carrier around one Redis Stream delivery. */
@FunctionalInterface
public interface RecommendationTraceContext {

    void within(RecommendationStreamRecord record, Runnable operation);

    static RecommendationTraceContext noOp() {
        return (record, operation) -> {
            Objects.requireNonNull(record, "record");
            Objects.requireNonNull(operation, "operation").run();
        };
    }
}
