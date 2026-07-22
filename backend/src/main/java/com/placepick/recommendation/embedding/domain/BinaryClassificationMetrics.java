package com.placepick.recommendation.embedding.domain;

public record BinaryClassificationMetrics(
    int sampleCount,
    int truePositive,
    int falsePositive,
    int trueNegative,
    int falseNegative,
    double precision,
    double recall,
    double f1
) {

    public BinaryClassificationMetrics {
        if (sampleCount < 1 || truePositive < 0 || falsePositive < 0 ||
            trueNegative < 0 || falseNegative < 0 ||
            truePositive + falsePositive + trueNegative + falseNegative != sampleCount ||
            !bounded(precision) || !bounded(recall) || !bounded(f1)) {
            throw new IllegalArgumentException("Binary metrics are outside the contract.");
        }
    }

    public static BinaryClassificationMetrics calculate(
        java.util.List<Boolean> labels,
        java.util.List<Boolean> predictions
    ) {
        labels = java.util.List.copyOf(labels);
        predictions = java.util.List.copyOf(predictions);
        if (labels.isEmpty() || labels.size() != predictions.size()) {
            throw new IllegalArgumentException("Labels and predictions must have the same size.");
        }
        int truePositive = 0;
        int falsePositive = 0;
        int trueNegative = 0;
        int falseNegative = 0;
        for (int index = 0; index < labels.size(); index++) {
            boolean label = labels.get(index);
            boolean prediction = predictions.get(index);
            if (label && prediction) {
                truePositive++;
            } else if (!label && prediction) {
                falsePositive++;
            } else if (!label) {
                trueNegative++;
            } else {
                falseNegative++;
            }
        }
        double precision = ratio(truePositive, truePositive + falsePositive);
        double recall = ratio(truePositive, truePositive + falseNegative);
        double f1 = precision + recall == 0
            ? 0
            : 2 * precision * recall / (precision + recall);
        return new BinaryClassificationMetrics(
            labels.size(),
            truePositive,
            falsePositive,
            trueNegative,
            falseNegative,
            precision,
            recall,
            f1
        );
    }

    private static double ratio(int numerator, int denominator) {
        return denominator == 0 ? 0 : numerator / (double) denominator;
    }

    private static boolean bounded(double value) {
        return Double.isFinite(value) && value >= 0 && value <= 1;
    }
}
