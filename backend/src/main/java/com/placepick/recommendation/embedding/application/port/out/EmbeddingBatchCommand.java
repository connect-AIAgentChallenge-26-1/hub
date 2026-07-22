package com.placepick.recommendation.embedding.application.port.out;

import java.util.List;

/** One complete corpus batch. Inputs are never included in logs or {@code toString}. */
public record EmbeddingBatchCommand(List<String> inputs) {

    public static final int MAX_INPUTS = 64;

    public EmbeddingBatchCommand {
        inputs = List.copyOf(inputs);
        if (inputs.isEmpty() || inputs.size() > MAX_INPUTS ||
            inputs.stream().anyMatch(value ->
            value == null || value.isBlank() ||
                value.codePointCount(0, value.length()) > 300 ||
                value.codePoints().anyMatch(Character::isISOControl))) {
            throw new IllegalArgumentException("Embedding batch inputs are outside the contract.");
        }
    }

    @Override
    public String toString() {
        return "EmbeddingBatchCommand[inputCount=" + inputs.size() + ", inputs=<redacted>]";
    }
}
