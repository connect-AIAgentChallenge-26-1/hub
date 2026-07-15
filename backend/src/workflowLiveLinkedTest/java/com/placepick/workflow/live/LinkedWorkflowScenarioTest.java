package com.placepick.workflow.live;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.placepick.recommendation.application.candidate.CandidateQueryPlanner;
import com.placepick.recommendation.application.candidate.CategoryTaxonomy;
import com.placepick.recommendation.condition.application.port.out.ConditionWarning;
import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

@Tag("offline")
class LinkedWorkflowScenarioTest {

    @Test
    void catalogPinsThreeDistinctFixturesAndTheirDeterministicQueries() {
        List<LinkedWorkflowScenario> scenarios = LinkedWorkflowScenario.all();

        assertThat(scenarios).hasSize(3);
        assertThat(scenarios.stream().map(LinkedWorkflowScenario::id))
            .containsExactly(
                "seoul-cafe-complete-v1",
                "seoul-cafe-dessert-v1",
                "seoul-restaurant-nullable-v1"
            );
        assertThat(new HashSet<>(scenarios.stream()
            .map(LinkedWorkflowScenario::fixtureHash).toList())).hasSize(3);
        scenarios.forEach(scenario -> assertThat(scenario.fixtureHash())
            .isEqualTo(sha256(scenario.syntheticInput())));

        CandidateQueryPlanner planner = new CandidateQueryPlanner(new CategoryTaxonomy());
        for (LinkedWorkflowScenario scenario : scenarios) {
            var initial = planner.initial(scenario.confirmedCondition());
            assertThat(initial.query()).isEqualTo(scenario.initialQuery());
            var relaxed = planner.relax(initial);
            if (scenario.relaxedQuery() == null) {
                assertThat(relaxed).isEmpty();
            } else {
                assertThat(relaxed).isPresent();
                assertThat(relaxed.orElseThrow().query()).isEqualTo(scenario.relaxedQuery());
            }
        }
        assertThatThrownBy(() -> LinkedWorkflowScenario.require("unknown-v1"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageNotContaining("서울");
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    @Test
    void everyCanonicalDraftMatchesOnlyItsVersionedExpectedMeaning() {
        for (LinkedWorkflowScenario scenario : LinkedWorkflowScenario.all()) {
            var expected = scenario.expectedDraft();
            DraftRecommendationCondition draft = new DraftRecommendationCondition(
                scenario.confirmedCondition().locationQuery(),
                expected.placeType(),
                expected.placeTypeDetail(),
                expected.partySize(),
                expected.budgetMinimum(),
                expected.budgetMaximum(),
                scenario.confirmedCondition().preferences().stream()
                    .map(value -> new Preference(value.value(), null))
                    .toList(),
                scenario.confirmedCondition().exclusions()
            );

            assertThat(LinkedDraftSemanticVerifier.firstMismatchCode(
                draft,
                expected.warnings().stream().toList(),
                expected
            )).isNull();
        }
    }

    @Test
    void verifierClassifiesMeaningChangesWithoutReturningRawValues() {
        LinkedWorkflowScenario scenario = LinkedWorkflowScenario.require(
            "seoul-cafe-complete-v1"
        );
        var expected = scenario.expectedDraft();

        assertMismatch(scenario, draft("부산", PlaceType.CAFE, 2, null, 20_000,
            List.of(new Preference("조용한", null)), List.of("흡연")), List.of(),
            "SEMANTIC_LOCATION_MISMATCH");
        assertMismatch(scenario, draft("서울", PlaceType.RESTAURANT, 2, null, 20_000,
            List.of(new Preference("조용한", null)), List.of("흡연")), List.of(),
            "SEMANTIC_PLACE_TYPE_MISMATCH");
        assertMismatch(scenario, draft("서울", PlaceType.CAFE, 3, null, 20_000,
            List.of(new Preference("조용한", null)), List.of("흡연")), List.of(),
            "SEMANTIC_PARTY_SIZE_MISMATCH");
        assertMismatch(scenario, draft("서울", PlaceType.CAFE, 2, null, 21_000,
            List.of(new Preference("조용한", null)), List.of("흡연")), List.of(),
            "SEMANTIC_BUDGET_MISMATCH");
        assertMismatch(scenario, draft("서울", PlaceType.CAFE, 2, null, 20_000,
            List.of(), List.of("흡연")), List.of(),
            "SEMANTIC_PREFERENCE_COUNT_MISMATCH");
        assertMismatch(scenario, draft("서울", PlaceType.CAFE, 2, null, 20_000,
            List.of(new Preference("조용하지 않음", null)), List.of("흡연")), List.of(),
            "SEMANTIC_PREFERENCE_VALUE_MISMATCH");
        assertMismatch(scenario, draft("서울", PlaceType.CAFE, 2, null, 20_000,
            List.of(new Preference("조용한", 10)), List.of("흡연")), List.of(),
            "SEMANTIC_PREFERENCE_PRIORITY_MISMATCH");
        assertMismatch(scenario, draft("서울", PlaceType.CAFE, 2, null, 20_000,
            List.of(new Preference("조용한", null)), List.of()), List.of(),
            "SEMANTIC_EXCLUSION_COUNT_MISMATCH");
        assertMismatch(scenario, draft("서울", PlaceType.CAFE, 2, null, 20_000,
            List.of(new Preference("조용한", null)), List.of("금연")), List.of(),
            "SEMANTIC_EXCLUSION_VALUE_MISMATCH");
        assertMismatch(scenario, draft("서울", PlaceType.CAFE, 2, null, 20_000,
            List.of(new Preference("조용한", null)), List.of("흡연")),
            List.of(ConditionWarning.BUDGET_NOT_PROVIDED),
            "SEMANTIC_WARNING_MISMATCH");

        assertThat(expected.locationAliases()).contains("서울특별시");
    }

    private static DraftRecommendationCondition draft(
        String location,
        PlaceType type,
        Integer partySize,
        Integer budgetMinimum,
        Integer budgetMaximum,
        List<Preference> preferences,
        List<String> exclusions
    ) {
        return new DraftRecommendationCondition(
            location,
            type,
            null,
            partySize,
            budgetMinimum,
            budgetMaximum,
            preferences,
            exclusions
        );
    }

    private static void assertMismatch(
        LinkedWorkflowScenario scenario,
        DraftRecommendationCondition draft,
        List<ConditionWarning> warnings,
        String expectedCode
    ) {
        String actual = LinkedDraftSemanticVerifier.firstMismatchCode(
            draft,
            warnings,
            scenario.expectedDraft()
        );
        assertThat(actual).isEqualTo(expectedCode).doesNotContain("서울", "조용", "흡연");
    }
}
