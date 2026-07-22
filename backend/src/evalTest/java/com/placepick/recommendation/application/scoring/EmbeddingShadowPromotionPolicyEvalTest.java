package com.placepick.recommendation.application.scoring;

import static org.assertj.core.api.Assertions.assertThat;

import com.placepick.recommendation.embedding.application.port.out.EmbeddingBatchOutcome;
import com.placepick.recommendation.embedding.domain.EmbeddingShadowExample;
import com.placepick.recommendation.embedding.domain.EmbeddingVector;
import com.placepick.recommendation.embedding.domain.ShadowCorpusSplit;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class EmbeddingShadowPromotionPolicyEvalTest {

    @Test
    void fixedCorpusKeepsTrainAndHoldoutBalancedAndEnforcesPromotionGate() {
        List<EmbeddingShadowExample> corpus = EmbeddingShadowCorpus.fixedV1();
        List<EmbeddingVector> vectors = new ArrayList<>();
        int holdoutNegative = 0;
        for (EmbeddingShadowExample example : corpus) {
            double similarity;
            if (example.split() == ShadowCorpusSplit.TRAIN) {
                similarity = example.expectedMatch() ? 0.8 : 0.2;
            } else if (example.expectedMatch()) {
                similarity = 0.85;
            } else {
                similarity = holdoutNegative++ == 0 ? 0.9 : 0.1;
            }
            vectors.add(new EmbeddingVector(new double[]{1, 0}));
            vectors.add(new EmbeddingVector(new double[]{
                similarity,
                Math.sqrt(1 - similarity * similarity)
            }));
        }

        var result = new EmbeddingShadowEvaluationService(command ->
            EmbeddingBatchOutcome.embedded(vectors)
        ).evaluate();
        var metrics = result.metrics().orElseThrow();

        assertThat(corpus).filteredOn(value -> value.split() == ShadowCorpusSplit.TRAIN)
            .hasSize(10);
        assertThat(corpus).filteredOn(value -> value.split() == ShadowCorpusSplit.HOLDOUT)
            .hasSize(10);
        assertThat(corpus)
            .filteredOn(value -> value.split() == ShadowCorpusSplit.TRAIN)
            .filteredOn(EmbeddingShadowExample::expectedMatch)
            .hasSize(5);
        assertThat(corpus)
            .filteredOn(value -> value.split() == ShadowCorpusSplit.TRAIN)
            .filteredOn(value -> !value.expectedMatch())
            .hasSize(5);
        assertThat(corpus)
            .filteredOn(value -> value.split() == ShadowCorpusSplit.HOLDOUT)
            .filteredOn(EmbeddingShadowExample::expectedMatch)
            .hasSize(5);
        assertThat(corpus)
            .filteredOn(value -> value.split() == ShadowCorpusSplit.HOLDOUT)
            .filteredOn(value -> !value.expectedMatch())
            .hasSize(5);
        assertThat(metrics.embeddingHoldout().f1() - metrics.lexicalHoldout().f1())
            .isGreaterThanOrEqualTo(
                EmbeddingShadowEvaluationService.REQUIRED_F1_IMPROVEMENT
            );
        assertThat(metrics.embeddingHoldout().falsePositive())
            .isLessThanOrEqualTo(metrics.lexicalHoldout().falsePositive());
        assertThat(metrics.promotionEligible()).isTrue();
        assertThat(result.providerCalls()).isEqualTo(1);
    }
}
