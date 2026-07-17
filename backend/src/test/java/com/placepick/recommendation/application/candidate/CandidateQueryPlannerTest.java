package com.placepick.recommendation.application.candidate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import com.placepick.recommendation.application.port.out.PlaceSearchSort;
import com.placepick.recommendation.application.scoring.RetrievalPolicy;
import com.placepick.recommendation.workflow.application.RecommendationExecutionContext;
import java.util.List;
import org.junit.jupiter.api.Test;

class CandidateQueryPlannerTest {

    private final CandidateQueryPlanner planner = new CandidateQueryPlanner(new CategoryTaxonomy());

    @Test
    void ordersPreferencesByPriorityThenOriginalOrderWithoutSplittingTokens() {
        ConfirmedRecommendationCondition condition = condition(
            "서울 강남구",
            List.of(
                new Preference("조용한 좌석", 5),
                new Preference("디저트", 10),
                new Preference("주차 가능", 5)
            )
        );

        CandidateQueryPlan plan = planner.initial(condition);

        assertThat(plan.query()).isEqualTo("서울 강남구 카페 디저트 조용한 좌석 주차 가능");
        assertThat(plan.includedPreferences())
            .extracting(value -> value.preference().value())
            .containsExactly("디저트", "조용한 좌석", "주차 가능");
    }

    @Test
    void keepsTheQueryAtTheBoundaryAndSkipsAnEntirePreferenceThatDoesNotFit() {
        String location = "가".repeat(95);
        ConfirmedRecommendationCondition condition = condition(
            location,
            List.of(new Preference("긴 선호", 10), new Preference("나", 9))
        );

        CandidateQueryPlan plan = planner.initial(condition);

        assertThat(plan.query()).hasSize(100).endsWith("카페 나");
        assertThat(plan.query()).doesNotContain("긴 선호");
        assertThat(plan.includedPreferences()).singleElement()
            .extracting(value -> value.preference().value())
            .isEqualTo("나");
    }

    @Test
    void rejectsRequiredTokensThatCannotFitInsteadOfSilentlyTruncatingThem() {
        ConfirmedRecommendationCondition condition = condition("가".repeat(100), List.of());

        assertThatThrownBy(() -> planner.initial(condition))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("required place type");
    }

    @Test
    void countsUnicodeCodePointsRatherThanUtf16CodeUnitsAtTheProviderBoundary() {
        String supplementaryCharacter = new String(Character.toChars(0x20000));
        ConfirmedRecommendationCondition condition = condition(
            supplementaryCharacter.repeat(95),
            List.of(new Preference("나", 10))
        );

        CandidateQueryPlan plan = planner.initial(condition);

        assertThat(plan.query().codePointCount(0, plan.query().length())).isEqualTo(100);
        assertThat(plan.query()).endsWith("카페 나");
    }

    @Test
    void relaxesOnlyTheLastOriginalPreferenceAmongTheLowestIncludedPriority() {
        ConfirmedRecommendationCondition condition = condition(
            "서울",
            List.of(
                new Preference("창가", 3),
                new Preference("조용함", 8),
                new Preference("주차", 3)
            )
        );

        CandidateQueryPlan relaxed = planner.relax(planner.initial(condition)).orElseThrow();

        assertThat(relaxed.query()).isEqualTo("서울 카페 조용함 창가");
        assertThat(relaxed.includedPreferences())
            .extracting(value -> value.preference().value())
            .containsExactly("조용함", "창가");
    }

    @Test
    void plansDeterministicUniqueAccuracyPopularityPreferenceTypeAndLocationVariants() {
        ConfirmedRecommendationCondition condition = condition(
            "서울 강남구",
            List.of(
                new Preference("창가", 3),
                new Preference("조용함", 8)
            )
        );

        List<CandidateQueryPlan> variants = planner.variants(
            condition,
            RecommendationExecutionContext.initial(),
            RetrievalPolicy.qualityDefaults()
        );

        assertThat(variants).extracting(CandidateQueryPlan::variantId)
            .startsWith("v2.base.accuracy", "v2.base.popularity", "v2.preference.1");
        assertThat(variants).extracting(CandidateQueryPlan::sort)
            .startsWith(PlaceSearchSort.ACCURACY, PlaceSearchSort.POPULARITY);
        assertThat(variants).extracting(value ->
            SearchTextNormalizer.comparison(value.query()) + "|" + value.sort()
        ).doesNotHaveDuplicates();
        assertThat(variants).allSatisfy(value ->
            assertThat(value.query().codePointCount(0, value.query().length()))
                .isLessThanOrEqualTo(100)
        );
    }

    @Test
    void excludesAlreadyUsedVariantsForAnAlternativeRound() {
        List<CandidateQueryPlan> variants = planner.variants(
            condition("서울", List.of(new Preference("조용함", 10))),
            RecommendationExecutionContext.alternative(
                1,
                java.util.Set.of(),
                java.util.Set.of("v2.base.accuracy", "v2.base.popularity")
            ),
            RetrievalPolicy.qualityDefaults()
        );

        assertThat(variants).extracting(CandidateQueryPlan::variantId)
            .doesNotContain("v2.base.accuracy", "v2.base.popularity");
    }

    private ConfirmedRecommendationCondition condition(
        String location,
        List<Preference> preferences
    ) {
        return new ConfirmedRecommendationCondition(
            location,
            PlaceType.CAFE,
            null,
            null,
            null,
            null,
            preferences,
            List.of()
        );
    }
}
