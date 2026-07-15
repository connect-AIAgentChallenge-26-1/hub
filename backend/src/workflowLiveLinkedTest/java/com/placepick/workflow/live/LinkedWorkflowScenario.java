package com.placepick.workflow.live;

import com.placepick.recommendation.condition.application.port.out.ConditionWarning;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

record LinkedWorkflowScenario(
    String id,
    int version,
    String fixtureHash,
    String syntheticInput,
    String safetyIdentifier,
    ExpectedDraft expectedDraft,
    ConfirmedRecommendationCondition confirmedCondition,
    String initialQuery,
    String relaxedQuery
) {

    private static final Map<String, LinkedWorkflowScenario> SCENARIOS = scenarios();

    LinkedWorkflowScenario {
        if (!id.matches("[a-z0-9-]+-v1") || version != 1 ||
            !fixtureHash.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("Linked workflow scenario metadata is invalid.");
        }
    }

    static LinkedWorkflowScenario require(String id) {
        LinkedWorkflowScenario scenario = SCENARIOS.get(id);
        if (scenario == null) {
            throw new IllegalStateException("WORKFLOW_LINKED_SCENARIO is not allowlisted.");
        }
        return scenario;
    }

    static List<LinkedWorkflowScenario> all() {
        return SCENARIOS.values().stream().sorted(java.util.Comparator.comparing(
            LinkedWorkflowScenario::id
        )).toList();
    }

    private static Map<String, LinkedWorkflowScenario> scenarios() {
        Map<String, LinkedWorkflowScenario> scenarios = new LinkedHashMap<>();
        add(scenarios, new LinkedWorkflowScenario(
            "seoul-cafe-complete-v1",
            1,
            "af0245449bbcb15d0fac9d1e847d29090bcca83617c6921226bf88ee712b7c58",
            "서울에서 2명이 1인당 20000원 이하로 조용한 카페를 찾습니다. 흡연 장소는 제외합니다.",
            "synthetic-linked-workflow-session-0001",
            new ExpectedDraft(
                Set.of("서울", "서울시", "서울특별시"),
                PlaceType.CAFE,
                null,
                2,
                null,
                20_000,
                List.of(new ExpectedPreference(
                    Set.of("조용", "조용한", "조용함", "조용한 곳", "조용한 장소", "조용한 분위기"),
                    null
                )),
                List.of(Set.of("흡연", "흡연 장소", "흡연 가능", "흡연 가능 장소")),
                Set.of()
            ),
            new ConfirmedRecommendationCondition(
                "서울", PlaceType.CAFE, null, 2, null, 20_000,
                List.of(new Preference("조용한", 10)), List.of("흡연")
            ),
            "서울 카페 조용한",
            "서울 카페"
        ));
        add(scenarios, new LinkedWorkflowScenario(
            "seoul-restaurant-nullable-v1",
            1,
            "ec7e3a2d69f0b055f5c368ed651203a460a8aef028bcd665d3e4fdfe35d66e27",
            "서울에서 음식점을 추천해 주세요. 인원과 예산은 아직 정하지 않았습니다.",
            "synthetic-linked-workflow-session-0002",
            new ExpectedDraft(
                Set.of("서울", "서울시", "서울특별시"),
                PlaceType.RESTAURANT,
                null,
                null,
                null,
                null,
                List.of(),
                List.of(),
                Set.of(
                    ConditionWarning.PARTY_SIZE_NOT_PROVIDED,
                    ConditionWarning.BUDGET_NOT_PROVIDED
                )
            ),
            new ConfirmedRecommendationCondition(
                "서울", PlaceType.RESTAURANT, null, null, null, null,
                List.of(), List.of()
            ),
            "서울 음식점",
            null
        ));
        add(scenarios, new LinkedWorkflowScenario(
            "seoul-cafe-dessert-v1",
            1,
            "e909b3f5e2c7461f80e82bc4acd12fab11a7c242cf1fced9f69461591665ce04",
            "서울에서 디저트 카페를 찾습니다. 인원과 예산은 정하지 않았고 흡연 가능한 장소는 제외합니다.",
            "synthetic-linked-workflow-session-0003",
            new ExpectedDraft(
                Set.of("서울", "서울시", "서울특별시"),
                PlaceType.CAFE,
                null,
                null,
                null,
                null,
                List.of(new ExpectedPreference(Set.of("디저트", "디저트 카페"), null)),
                List.of(Set.of("흡연", "흡연 장소", "흡연 가능", "흡연 가능 장소")),
                Set.of(
                    ConditionWarning.PARTY_SIZE_NOT_PROVIDED,
                    ConditionWarning.BUDGET_NOT_PROVIDED
                )
            ),
            new ConfirmedRecommendationCondition(
                "서울", PlaceType.CAFE, null, null, null, null,
                List.of(new Preference("디저트", 10)), List.of("흡연")
            ),
            "서울 카페 디저트",
            "서울 카페"
        ));
        return Map.copyOf(scenarios);
    }

    private static void add(
        Map<String, LinkedWorkflowScenario> scenarios,
        LinkedWorkflowScenario scenario
    ) {
        if (scenarios.putIfAbsent(scenario.id(), scenario) != null) {
            throw new IllegalStateException("Duplicate linked workflow scenario ID.");
        }
    }

    record ExpectedDraft(
        Set<String> locationAliases,
        PlaceType placeType,
        String placeTypeDetail,
        Integer partySize,
        Integer budgetMinimum,
        Integer budgetMaximum,
        List<ExpectedPreference> preferences,
        List<Set<String>> exclusions,
        Set<ConditionWarning> warnings
    ) {
        ExpectedDraft {
            locationAliases = Set.copyOf(locationAliases);
            preferences = List.copyOf(preferences);
            exclusions = exclusions.stream().map(Set::copyOf).toList();
            warnings = Set.copyOf(warnings);
        }
    }

    record ExpectedPreference(Set<String> aliases, Integer priority) {
        ExpectedPreference {
            aliases = Set.copyOf(aliases);
        }
    }
}
