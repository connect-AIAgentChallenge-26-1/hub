package com.placepick.liveevidence;

import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import java.util.List;
import java.util.Set;

record LiveEvidenceScenario(
    String id,
    String requestText,
    String safetyIdentifier,
    Set<String> locationAliases,
    PlaceType placeType,
    ConfirmedRecommendationCondition confirmedCondition
) {

    static List<LiveEvidenceScenario> all() {
        return List.of(
            new LiveEvidenceScenario(
                "seoul-cafe-complete-v1",
                "서울에서 2명이 1인당 20000원 이하로 조용한 카페를 찾습니다. 흡연 장소는 제외합니다.",
                "synthetic-live-evidence-0001",
                Set.of("서울", "서울시", "서울특별시", "Seoul", "seoul"),
                PlaceType.CAFE,
                new ConfirmedRecommendationCondition(
                    "서울", PlaceType.CAFE, null, 2, null, 20_000,
                    List.of(new Preference("조용한", 10)), List.of("흡연")
                )
            ),
            new LiveEvidenceScenario(
                "seoul-restaurant-nullable-v1",
                "서울 음식점을 찾습니다.",
                "synthetic-live-evidence-0002",
                Set.of("서울", "서울시", "서울특별시", "Seoul", "seoul"),
                PlaceType.RESTAURANT,
                new ConfirmedRecommendationCondition(
                    "서울", PlaceType.RESTAURANT, null, null, null, null,
                    List.of(), List.of()
                )
            ),
            new LiveEvidenceScenario(
                "seoul-cafe-dessert-v1",
                "서울 디저트 카페를 찾습니다. 흡연 장소는 제외합니다.",
                "synthetic-live-evidence-0003",
                Set.of("서울", "서울시", "서울특별시", "Seoul", "seoul"),
                PlaceType.CAFE,
                new ConfirmedRecommendationCondition(
                    "서울", PlaceType.CAFE, null, null, null, null,
                    List.of(new Preference("디저트", 10)), List.of("흡연")
                )
            )
        );
    }
}
