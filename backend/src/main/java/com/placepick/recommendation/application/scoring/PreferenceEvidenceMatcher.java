package com.placepick.recommendation.application.scoring;

import com.placepick.recommendation.application.candidate.SearchTextNormalizer;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** Small, versioned lexical matcher. Embeddings remain shadow-only and cannot change ranking. */
final class PreferenceEvidenceMatcher {

    static final String VERSION = "preference-lexicon.v1";

    private static final Map<String, List<String>> SYNONYMS = synonyms();

    boolean matches(String preference, String evidenceText) {
        String requested = SearchTextNormalizer.comparison(preference);
        String source = SearchTextNormalizer.comparison(evidenceText);
        if (requested.isBlank() || source.isBlank()) {
            return false;
        }
        List<String> variants = SYNONYMS.entrySet().stream()
            .filter(entry -> entry.getValue().contains(requested) || entry.getKey().equals(requested))
            .findFirst()
            .map(entry -> entry.getValue())
            .orElse(List.of(requested));
        return variants.stream().anyMatch(variant -> containsVariant(source, variant));
    }

    private boolean containsVariant(String source, String variant) {
        if (variant.codePointCount(0, variant.length()) > 1) {
            return source.contains(variant);
        }
        String particle = "(?:은|는|이|가|을|를|도|의|와|과|로|으로|에서|만|부터|까지)?";
        return Pattern.compile(
            "(?:^|[^\\p{L}\\p{N}])" + Pattern.quote(variant) + particle +
                "(?:$|[^\\p{L}\\p{N}])"
        ).matcher(source).find();
    }

    private static Map<String, List<String>> synonyms() {
        Map<String, List<String>> values = new LinkedHashMap<>();
        values.put("조용", List.of("조용", "조용한", "조용함", "차분", "한적"));
        values.put("주차", List.of("주차", "주차장", "파킹"));
        values.put("창가", List.of("창가", "창가석", "윈도우석"));
        values.put("디저트", List.of("디저트", "베이커리", "케이크", "구움과자"));
        values.put("뷰", List.of("뷰", "전망", "경치"));
        return Map.copyOf(values);
    }
}
