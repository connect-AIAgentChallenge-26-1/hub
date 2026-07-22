package com.placepick.recommendation.application.scoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import com.placepick.recommendation.embedding.application.port.out.EmbeddingBatchCommand;
import com.placepick.recommendation.embedding.application.port.out.EmbeddingBatchErrorCode;
import com.placepick.recommendation.embedding.application.port.out.EmbeddingBatchOutcome;
import com.placepick.recommendation.embedding.application.port.out.EmbeddingBatchPort;
import com.placepick.recommendation.embedding.domain.EmbeddingShadowEvaluationResult;
import com.placepick.recommendation.embedding.domain.EmbeddingShadowExample;
import com.placepick.recommendation.embedding.domain.EmbeddingShadowFailureCode;
import com.placepick.recommendation.embedding.domain.EmbeddingVector;
import com.placepick.recommendation.embedding.domain.ShadowCorpusSplit;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

class EmbeddingShadowEvaluationServiceTest {

    @Test
    void embedsTheCompleteCorpusInExactlyOneBatchAndReturnsMetricsOnly() {
        RecordingPort port = new RecordingPort(command ->
            EmbeddingBatchOutcome.embedded(vectors(goodSimilarities()))
        );
        AtomicReference<EmbeddingShadowEvaluationResult> observed = new AtomicReference<>();

        EmbeddingShadowEvaluationResult result =
            new EmbeddingShadowEvaluationService(port, observed::set).evaluate();

        assertThat(port.calls).hasValue(1);
        assertThat(observed).hasValue(result);
        assertThat(port.lastCommand.inputs())
            .hasSize(EmbeddingShadowCorpus.fixedV1().size() * 2);
        assertThat(result.status())
            .isEqualTo(EmbeddingShadowEvaluationResult.Status.SUCCEEDED);
        assertThat(result.providerCalls()).isEqualTo(1);
        assertThat(result.metrics()).hasValueSatisfying(metrics -> {
            assertThat(metrics.selectedThreshold()).isCloseTo(0.8, within(1.0e-12));
            assertThat(metrics.lexicalHoldout().f1()).isLessThan(
                metrics.embeddingHoldout().f1()
            );
            assertThat(metrics.embeddingHoldout().falsePositive())
                .isLessThanOrEqualTo(metrics.lexicalHoldout().falsePositive());
            assertThat(metrics.promotionEligible()).isTrue();
        });
        assertThat(result.cases()).hasSize(EmbeddingShadowCorpus.fixedV1().size())
            .allSatisfy(value -> {
                assertThat(value.caseId()).startsWith("shadow-");
                assertThat(value.split()).isNotNull();
            });
        assertThat(result.toString()).doesNotContain(
            EmbeddingShadowCorpus.fixedV1().get(0).preferenceText(),
            EmbeddingShadowCorpus.fixedV1().get(0).evidenceText(),
            "0.8, 0.6"
        );
    }

    @Test
    void selectsTheThresholdFromTrainingWithoutHoldoutLeakage() {
        List<Double> original = goodSimilarities();
        List<Double> changedHoldout = new ArrayList<>(original);
        for (int index = 0; index < EmbeddingShadowCorpus.fixedV1().size(); index++) {
            if (EmbeddingShadowCorpus.fixedV1().get(index).split() ==
                ShadowCorpusSplit.HOLDOUT) {
                changedHoldout.set(index, 0.99);
            }
        }

        var firstMetrics = evaluate(original).metrics().orElseThrow();
        var secondMetrics = evaluate(changedHoldout).metrics().orElseThrow();

        assertThat(firstMetrics.selectedThreshold())
            .isEqualTo(secondMetrics.selectedThreshold());
        assertThat(secondMetrics.embeddingHoldout().f1() -
            secondMetrics.lexicalHoldout().f1())
            .isGreaterThanOrEqualTo(
                EmbeddingShadowEvaluationService.REQUIRED_F1_IMPROVEMENT
            );
        assertThat(secondMetrics.embeddingHoldout().falsePositive())
            .isGreaterThan(secondMetrics.lexicalHoldout().falsePositive());
        assertThat(secondMetrics.promotionEligible()).isFalse();
    }

    @Test
    void doesNotPromoteWhenEmbeddingDoesNotImproveTheLexicalBaseline() {
        PreferenceEvidenceMatcher matcher = new PreferenceEvidenceMatcher();
        List<Double> similarities = EmbeddingShadowCorpus.fixedV1().stream()
            .map(example -> matcher.matches(
                example.preferenceText(),
                example.evidenceText()
            ) ? 0.9 : 0.1)
            .toList();

        var metrics = evaluate(similarities).metrics().orElseThrow();

        assertThat(metrics.embeddingHoldout().f1())
            .isEqualTo(metrics.lexicalHoldout().f1());
        assertThat(metrics.promotionEligible()).isFalse();
    }

    @Test
    void mapsSafeProviderFailuresToFailedEvaluationWithoutRetry() {
        for (EmbeddingBatchErrorCode providerCode : List.of(
            EmbeddingBatchErrorCode.INVALID_REQUEST,
            EmbeddingBatchErrorCode.AUTHENTICATION_FAILED,
            EmbeddingBatchErrorCode.RATE_LIMITED,
            EmbeddingBatchErrorCode.INVALID_RESPONSE,
            EmbeddingBatchErrorCode.PROVIDER_UNAVAILABLE
        )) {
            RecordingPort port = new RecordingPort(command ->
                EmbeddingBatchOutcome.failed(providerCode)
            );

            EmbeddingShadowEvaluationResult result =
                new EmbeddingShadowEvaluationService(port).evaluate();

            assertThat(port.calls).as(providerCode.name()).hasValue(1);
            assertThat(result.status())
                .as(providerCode.name())
                .isEqualTo(EmbeddingShadowEvaluationResult.Status.FAILED);
            assertThat(result.failureCode()).isNotEqualTo(EmbeddingShadowFailureCode.NONE);
            assertThat(result.metrics()).isEmpty();
            assertThat(result.cases()).isEmpty();
        }
    }

    @Test
    void rejectsWrongVectorCountAndDimensionsAsSafeInvalidVectorResults() {
        EmbeddingShadowEvaluationResult wrongCount =
            new EmbeddingShadowEvaluationService(command ->
                EmbeddingBatchOutcome.embedded(List.of(vector(0.5), vector(0.5)))
            ).evaluate();
        List<EmbeddingVector> inconsistent = vectors(goodSimilarities());
        inconsistent.set(3, new EmbeddingVector(new double[]{1, 0, 0}));
        EmbeddingShadowEvaluationResult wrongDimensions =
            new EmbeddingShadowEvaluationService(command ->
                EmbeddingBatchOutcome.embedded(inconsistent)
            ).evaluate();

        assertThat(wrongCount.failureCode())
            .isEqualTo(EmbeddingShadowFailureCode.INVALID_VECTOR_RESPONSE);
        assertThat(wrongDimensions.failureCode())
            .isEqualTo(EmbeddingShadowFailureCode.INVALID_VECTOR_RESPONSE);
    }

    @Test
    void nullOutcomeAndUnexpectedProviderBugAreNotReportedAsSafeFailures() {
        assertThatThrownBy(() -> new EmbeddingShadowEvaluationService(command -> null).evaluate())
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("Embedding batch port returned no outcome.");
        assertThatThrownBy(() -> new EmbeddingShadowEvaluationService(command -> {
            throw new IllegalStateException("provider implementation bug");
        }).evaluate()).hasMessage("provider implementation bug");
    }

    @Test
    void commandOutcomeAndVectorStringRepresentationsDoNotExposeValues() {
        EmbeddingBatchCommand command = new EmbeddingBatchCommand(
            List.of("private preference", "private evidence")
        );
        EmbeddingVector vector = new EmbeddingVector(new double[]{0.25, 0.75});
        EmbeddingBatchOutcome outcome = EmbeddingBatchOutcome.embedded(List.of(vector));

        assertThat(command.toString()).doesNotContain("private preference", "private evidence");
        assertThat(vector.toString()).doesNotContain("0.25", "0.75");
        assertThat(outcome.toString()).doesNotContain("0.25", "0.75");
    }

    private EmbeddingShadowEvaluationResult evaluate(List<Double> similarities) {
        return new EmbeddingShadowEvaluationService(command ->
            EmbeddingBatchOutcome.embedded(vectors(similarities))
        ).evaluate();
    }

    private List<Double> goodSimilarities() {
        List<Double> result = new ArrayList<>();
        int holdoutNegative = 0;
        for (EmbeddingShadowExample example : EmbeddingShadowCorpus.fixedV1()) {
            if (example.split() == ShadowCorpusSplit.TRAIN) {
                result.add(example.expectedMatch() ? 0.8 : 0.2);
            } else if (example.expectedMatch()) {
                result.add(0.85);
            } else {
                result.add(holdoutNegative++ == 0 ? 0.9 : 0.1);
            }
        }
        return List.copyOf(result);
    }

    private List<EmbeddingVector> vectors(List<Double> similarities) {
        List<EmbeddingVector> result = new ArrayList<>();
        for (double similarity : similarities) {
            result.add(new EmbeddingVector(new double[]{1, 0}));
            result.add(vector(similarity));
        }
        return result;
    }

    private EmbeddingVector vector(double similarity) {
        return new EmbeddingVector(new double[]{
            similarity,
            Math.sqrt(1 - similarity * similarity)
        });
    }

    private static final class RecordingPort implements EmbeddingBatchPort {

        private final Function<EmbeddingBatchCommand, EmbeddingBatchOutcome> response;
        private final AtomicInteger calls = new AtomicInteger();
        private EmbeddingBatchCommand lastCommand;

        private RecordingPort(
            Function<EmbeddingBatchCommand, EmbeddingBatchOutcome> response
        ) {
            this.response = response;
        }

        @Override
        public EmbeddingBatchOutcome embed(EmbeddingBatchCommand command) {
            calls.incrementAndGet();
            lastCommand = command;
            return response.apply(command);
        }
    }
}
