package com.placepick.recommendation.application.candidate;

import com.placepick.recommendation.condition.domain.PlaceType;
import java.util.List;

public final class CategoryTaxonomy {

    public static final String VERSION = "place-category.v1";

    private static final List<String> RESTAURANT = List.of(
        "음식점", "식당", "한식", "중식", "일식", "양식", "분식", "뷔페"
    );
    private static final List<String> CAFE = List.of("카페", "커피", "디저트", "베이커리");
    private static final List<String> BAR = List.of(
        "술집", "주점", "바", "호프", "맥주", "와인", "칵테일", "이자카야"
    );

    public boolean matches(PlaceType placeType, String placeTypeDetail, String name, String category) {
        String normalizedName = SearchTextNormalizer.comparison(name);
        String normalizedCategory = SearchTextNormalizer.comparison(category);
        return switch (placeType) {
            case RESTAURANT -> containsAny(normalizedName, normalizedCategory, RESTAURANT);
            case CAFE -> containsAny(normalizedName, normalizedCategory, CAFE);
            case BAR -> containsAny(normalizedName, normalizedCategory, BAR);
            case OTHER -> matchesOther(
                SearchTextNormalizer.comparison(placeTypeDetail),
                normalizedName,
                normalizedCategory
            );
        };
    }

    public String queryToken(PlaceType placeType, String placeTypeDetail) {
        return switch (placeType) {
            case RESTAURANT -> "음식점";
            case CAFE -> "카페";
            case BAR -> "술집";
            case OTHER -> SearchTextNormalizer.display(placeTypeDetail);
        };
    }

    public List<String> queryTokens(PlaceType placeType, String placeTypeDetail) {
        return switch (placeType) {
            case RESTAURANT -> List.of("음식점", "식당", "맛집");
            case CAFE -> List.of("카페", "커피", "디저트");
            case BAR -> List.of("술집", "주점", "바");
            case OTHER -> List.of(SearchTextNormalizer.display(placeTypeDetail));
        };
    }

    private boolean containsAny(String name, String category, List<String> terms) {
        List<String> categorySegments = List.of(category.split("[>\\s,/|]+"));
        List<String> nameTokens = List.of(name.split("\\s+"));
        return terms.stream().anyMatch(term ->
            categorySegments.stream().anyMatch(value -> matchesToken(value, term))
                || nameTokens.stream().anyMatch(value -> matchesToken(value, term))
        );
    }

    private boolean matchesToken(String value, String term) {
        return value.equals(term) || (value.length() > term.length() && value.endsWith(term));
    }

    private boolean matchesOther(String detail, String name, String category) {
        if (name.contains(detail)) {
            return true;
        }
        return List.of(category.split("[>\\s,/|]+"))
            .stream()
            .anyMatch(detail::equals);
    }
}
