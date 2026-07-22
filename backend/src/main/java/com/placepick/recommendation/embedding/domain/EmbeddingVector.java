package com.placepick.recommendation.embedding.domain;

import java.util.Arrays;
import java.util.Objects;

/** In-memory-only vector value without a raw-vector accessor or value-bearing {@code toString}. */
public final class EmbeddingVector {

    private final double[] values;
    private final double magnitude;

    public EmbeddingVector(double[] values) {
        Objects.requireNonNull(values, "values");
        if (values.length == 0) {
            throw new IllegalArgumentException("Embedding vector must not be empty.");
        }
        this.values = Arrays.copyOf(values, values.length);
        double squaredMagnitude = 0;
        for (double value : this.values) {
            if (!Double.isFinite(value)) {
                throw new IllegalArgumentException("Embedding vector must contain finite values.");
            }
            squaredMagnitude += value * value;
        }
        this.magnitude = Math.sqrt(squaredMagnitude);
    }

    public int dimensions() {
        return values.length;
    }

    public double cosineSimilarity(EmbeddingVector other) {
        Objects.requireNonNull(other, "other");
        if (values.length != other.values.length) {
            throw new IllegalArgumentException("Embedding vector dimensions must match.");
        }
        if (magnitude == 0 || other.magnitude == 0) {
            throw new IllegalArgumentException("Embedding vectors must have a nonzero magnitude.");
        }
        double dotProduct = 0;
        for (int index = 0; index < values.length; index++) {
            dotProduct += values[index] * other.values[index];
        }
        double similarity = dotProduct / (magnitude * other.magnitude);
        if (!Double.isFinite(similarity)) {
            throw new IllegalArgumentException("Embedding cosine similarity must be finite.");
        }
        return Math.max(-1, Math.min(1, similarity));
    }

    @Override
    public String toString() {
        return "EmbeddingVector[dimensions=" + values.length + ", values=<redacted>]";
    }
}
