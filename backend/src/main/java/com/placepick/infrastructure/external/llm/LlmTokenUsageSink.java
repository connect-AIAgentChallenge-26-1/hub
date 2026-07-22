package com.placepick.infrastructure.external.llm;

@FunctionalInterface
public interface LlmTokenUsageSink {

    void record(String operation, int inputTokens, int outputTokens);

    static LlmTokenUsageSink noop() {
        return (operation, inputTokens, outputTokens) -> {
        };
    }
}
