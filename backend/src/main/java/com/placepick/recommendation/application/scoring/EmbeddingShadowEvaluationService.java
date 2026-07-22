package com.placepick.recommendation.application.scoring;

import com.placepick.recommendation.embedding.application.port.out.EmbeddingBatchCommand;
import com.placepick.recommendation.embedding.application.port.out.EmbeddingBatchErrorCode;
import com.placepick.recommendation.embedding.application.port.out.EmbeddingBatchOutcome;
import com.placepick.recommendation.embedding.application.port.out.EmbeddingBatchPort;
import com.placepick.recommendation.embedding.application.EmbeddingShadowEvaluationObserver;
import com.placepick.recommendation.embedding.domain.BinaryClassificationMetrics;
import com.placepick.recommendation.embedding.domain.EmbeddingShadowCaseResult;
import com.placepick.recommendation.embedding.domain.EmbeddingShadowEvaluationResult;
import com.placepick.recommendation.embedding.domain.EmbeddingShadowExample;
import com.placepick.recommendation.embedding.domain.EmbeddingShadowFailureCode;
import com.placepick.recommendation.embedding.domain.EmbeddingShadowMetrics;
import com.placepick.recommendation.embedding.domain.EmbeddingVector;
import com.placepick.recommendation.embedding.domain.ShadowCorpusSplit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.TreeSet;

/**
 * Offline-only embedding shadow evaluator.
 *
 * <p>This type has no dependency on {@link CandidateScoringPolicy} or {@link CandidateRanker};
 * its output is metrics-only and therefore cannot alter a recommendation score or order.</p>
 */
public final class EmbeddingShadowEvaluationService {

    public static final double REQUIRED_F1_IMPROVEMENT = 0.05;
    private static final double COMPARISON_EPSILON = 1.0e-12;

    private final EmbeddingBatchPort embeddingPort;
    private final EmbeddingShadowEvaluationObserver observer;
    private final PreferenceEvidenceMatcher lexicalMatcher;
    private final List<EmbeddingShadowExample> corpus;

    public EmbeddingShadowEvaluationService(EmbeddingBatchPort embeddingPort) {
        this(embeddingPort, EmbeddingShadowEvaluationObserver.none());
    }

    public EmbeddingShadowEvaluationService(
        EmbeddingBatchPort embeddingPort,
        EmbeddingShadowEvaluationObserver observer
    ) {
        this.embeddingPort = Objects.requireNonNull(embeddingPort, "embeddingPort");
        this.observer = Objects.requireNonNull(observer, "observer");
        this.lexicalMatcher = new PreferenceEvidenceMatcher();
        this.corpus = EmbeddingShadowCorpus.fixedV1();
    }

    public EmbeddingShadowEvaluationResult evaluate() {
        List<String> inputs = corpus.stream()
            .flatMap(example -> java.util.stream.Stream.of(
                example.preferenceText(),
                example.evidenceText()
            ))
            .toList();
        EmbeddingBatchOutcome outcome = embeddingPort.embed(new EmbeddingBatchCommand(inputs));
        if (outcome == null) {
            throw new IllegalStateException("Embedding batch port returned no outcome.");
        }
        if (!outcome.embedded()) {
            return completed(
                EmbeddingShadowEvaluationResult.failed(mapFailure(outcome.errorCode()))
            );
        }

        List<Double> similarities;
        try {
            similarities = similarities(outcome.vectors());
        } catch (IllegalArgumentException exception) {
            return completed(
                EmbeddingShadowEvaluationResult.failed(
                    EmbeddingShadowFailureCode.INVALID_VECTOR_RESPONSE
                )
            );
        }

        List<Integer> trainingIndexes = indexes(ShadowCorpusSplit.TRAIN);
        List<Integer> holdoutIndexes = indexes(ShadowCorpusSplit.HOLDOUT);
        double threshold = selectThreshold(similarities, trainingIndexes);
        List<Boolean> embeddingPredictions = similarities.stream()
            .map(similarity -> similarity >= threshold)
            .toList();
        List<Boolean> lexicalPredictions = corpus.stream()
            .map(example -> lexicalMatcher.matches(
                example.preferenceText(),
                example.evidenceText()
            ))
            .toList();

        BinaryClassificationMetrics embeddingTrain = metrics(
            trainingIndexes,
            embeddingPredictions
        );
        BinaryClassificationMetrics lexicalHoldout = metrics(
            holdoutIndexes,
            lexicalPredictions
        );
        BinaryClassificationMetrics embeddingHoldout = metrics(
            holdoutIndexes,
            embeddingPredictions
        );
        boolean promotionEligible =
            embeddingHoldout.f1() + COMPARISON_EPSILON >=
                lexicalHoldout.f1() + REQUIRED_F1_IMPROVEMENT &&
                embeddingHoldout.falsePositive() <= lexicalHoldout.falsePositive();

        List<EmbeddingShadowCaseResult> cases = new ArrayList<>();
        for (int index = 0; index < corpus.size(); index++) {
            EmbeddingShadowExample example = corpus.get(index);
            cases.add(new EmbeddingShadowCaseResult(
                example.caseId(),
                example.split(),
                example.expectedMatch()
            ));
        }
        return completed(EmbeddingShadowEvaluationResult.succeeded(
            new EmbeddingShadowMetrics(
                threshold,
                embeddingTrain,
                lexicalHoldout,
                embeddingHoldout,
                promotionEligible
            ),
            cases
        ));
    }

    private List<Double> similarities(List<EmbeddingVector> vectors) {
        if (vectors.size() != corpus.size() * 2) {
            throw new IllegalArgumentException("Embedding vector count does not match the corpus.");
        }
        int dimensions = vectors.get(0).dimensions();
        if (vectors.stream().anyMatch(vector -> vector.dimensions() != dimensions)) {
            throw new IllegalArgumentException("Embedding vector dimensions are inconsistent.");
        }
        List<Double> similarities = new ArrayList<>();
        for (int index = 0; index < corpus.size(); index++) {
            similarities.add(vectors.get(index * 2).cosineSimilarity(
                vectors.get(index * 2 + 1)
            ));
        }
        return List.copyOf(similarities);
    }

    private double selectThreshold(List<Double> similarities, List<Integer> trainingIndexes) {
        TreeSet<Double> candidates = new TreeSet<>();
        trainingIndexes.forEach(index -> candidates.add(similarities.get(index)));
        candidates.add(Math.nextUp(candidates.last()));

        ThresholdSelection best = null;
        for (double candidate : candidates) {
            List<Boolean> predictions = trainingIndexes.stream()
                .map(index -> similarities.get(index) >= candidate)
                .toList();
            BinaryClassificationMetrics metrics = metrics(trainingIndexes, predictions);
            ThresholdSelection selection = new ThresholdSelection(candidate, metrics);
            if (best == null || BETTER_THRESHOLD.compare(selection, best) < 0) {
                best = selection;
            }
        }
        return Objects.requireNonNull(best, "best threshold").threshold();
    }

    private BinaryClassificationMetrics metrics(
        List<Integer> indexes,
        List<Boolean> allPredictions
    ) {
        return BinaryClassificationMetrics.calculate(
            indexes.stream().map(index -> corpus.get(index).expectedMatch()).toList(),
            indexes.stream().map(allPredictions::get).toList()
        );
    }

    private List<Integer> indexes(ShadowCorpusSplit split) {
        List<Integer> indexes = new ArrayList<>();
        for (int index = 0; index < corpus.size(); index++) {
            if (corpus.get(index).split() == split) {
                indexes.add(index);
            }
        }
        if (indexes.isEmpty()) {
            throw new IllegalStateException("Shadow corpus split must not be empty.");
        }
        return List.copyOf(indexes);
    }

    private static EmbeddingShadowFailureCode mapFailure(EmbeddingBatchErrorCode errorCode) {
        return switch (errorCode) {
            case NONE -> throw new IllegalArgumentException(
                "A successful embedding outcome cannot be mapped to failure."
            );
            case INVALID_REQUEST -> EmbeddingShadowFailureCode.PROVIDER_INVALID_REQUEST;
            case AUTHENTICATION_FAILED ->
                EmbeddingShadowFailureCode.PROVIDER_AUTHENTICATION_FAILED;
            case RATE_LIMITED -> EmbeddingShadowFailureCode.PROVIDER_RATE_LIMITED;
            case INVALID_RESPONSE -> EmbeddingShadowFailureCode.PROVIDER_INVALID_RESPONSE;
            case PROVIDER_UNAVAILABLE -> EmbeddingShadowFailureCode.PROVIDER_UNAVAILABLE;
        };
    }

    private EmbeddingShadowEvaluationResult completed(
        EmbeddingShadowEvaluationResult result
    ) {
        observer.completed(result);
        return result;
    }

    private static final Comparator<ThresholdSelection> BETTER_THRESHOLD =
        Comparator.<ThresholdSelection>comparingDouble(value -> value.metrics().f1())
            .reversed()
            .thenComparingInt(value -> value.metrics().falsePositive())
            .thenComparing(ThresholdSelection::threshold, Comparator.reverseOrder());

    private record ThresholdSelection(
        double threshold,
        BinaryClassificationMetrics metrics
    ) {
    }
}
