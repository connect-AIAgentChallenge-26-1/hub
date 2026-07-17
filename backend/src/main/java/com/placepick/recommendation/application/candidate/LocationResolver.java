package com.placepick.recommendation.application.candidate;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Versioned Korean administrative alias and lifestyle-area resolver. */
public final class LocationResolver {

    public static final String VERSION = "place-location.v2";

    private static final Map<String, String> ADMIN_ALIASES = aliases();
    private static final Map<String, List<String>> QUERY_ALIASES = queryAliases();
    private static final Set<String> LIFESTYLE_AREAS = Set.of(
        "홍대", "홍대입구", "성수", "성수동", "강남역", "여의도"
    );
    private static final List<String> PARTICLES = List.of(
        "에서", "으로", "은", "는", "이", "가", "을", "를", "의"
    );

    public LocationMatch resolve(
        String locationQuery,
        String address,
        String roadAddress,
        boolean providerRelevant
    ) {
        List<String> requested = tokens(locationQuery);
        if (requested.isEmpty()) {
            return new LocationMatch(LocationConfidence.MISMATCH);
        }
        List<List<String>> addresses = List.of(tokens(address), tokens(roadAddress));
        if (addresses.stream().anyMatch(value -> containsAll(value, requested))) {
            return new LocationMatch(LocationConfidence.EXACT);
        }

        List<String> canonicalRequest = requested.stream().map(this::canonical).toList();
        if (addresses.stream().map(value -> value.stream().map(this::canonical).toList())
            .anyMatch(value -> containsAll(value, canonicalRequest))) {
            return new LocationMatch(LocationConfidence.ALIAS);
        }

        List<String> requiredAdministrative = requested.stream()
            .filter(value -> !LIFESTYLE_AREAS.contains(value))
            .map(this::canonical)
            .toList();
        boolean lifestyle = requested.stream().anyMatch(LIFESTYLE_AREAS::contains);
        boolean administrativeMatches = requiredAdministrative.isEmpty() || addresses.stream()
            .map(value -> value.stream().map(this::canonical).toList())
            .anyMatch(value -> containsAll(value, requiredAdministrative));
        if (lifestyle && providerRelevant && administrativeMatches) {
            return new LocationMatch(LocationConfidence.APPROXIMATE);
        }
        return new LocationMatch(LocationConfidence.MISMATCH);
    }

    public List<String> queryForms(String locationQuery) {
        String original = SearchTextNormalizer.display(locationQuery);
        LinkedHashSet<String> forms = new LinkedHashSet<>();
        if (!original.isBlank()) {
            forms.add(original);
        }
        List<String> source = tokens(locationQuery);
        for (int index = 0; index < source.size(); index++) {
            List<String> aliases = QUERY_ALIASES.getOrDefault(source.get(index), List.of());
            for (String alias : aliases) {
                List<String> changed = new ArrayList<>(source);
                changed.set(index, alias);
                forms.add(String.join(" ", changed));
            }
        }
        return List.copyOf(forms);
    }

    private String canonical(String token) {
        return ADMIN_ALIASES.getOrDefault(token, token);
    }

    private static boolean containsAll(List<String> source, List<String> required) {
        return required.stream().allMatch(source::contains);
    }

    private static List<String> tokens(String source) {
        String normalized = SearchTextNormalizer.comparison(source);
        if (normalized.isBlank()) {
            return List.of();
        }
        return Arrays.stream(normalized.split("[^\\p{L}\\p{N}]+"))
            .map(LocationResolver::removeParticle)
            .filter(value -> !value.isBlank())
            .toList();
    }

    private static String removeParticle(String token) {
        for (String particle : PARTICLES) {
            if (token.length() > particle.length() + 1 && token.endsWith(particle)) {
                return token.substring(0, token.length() - particle.length());
            }
        }
        return token;
    }

    private static Map<String, String> aliases() {
        Map<String, String> values = new LinkedHashMap<>();
        register(values, "서울", "서울", "서울특별시");
        register(values, "부산", "부산", "부산광역시");
        register(values, "대구", "대구", "대구광역시");
        register(values, "인천", "인천", "인천광역시");
        register(values, "광주", "광주", "광주광역시");
        register(values, "대전", "대전", "대전광역시");
        register(values, "울산", "울산", "울산광역시");
        register(values, "세종", "세종", "세종특별자치시");
        register(values, "제주", "제주", "제주특별자치도");
        return Map.copyOf(values);
    }

    private static Map<String, List<String>> queryAliases() {
        Map<String, List<String>> values = new LinkedHashMap<>();
        values.put("서울", List.of("서울특별시"));
        values.put("서울특별시", List.of("서울"));
        values.put("부산", List.of("부산광역시"));
        values.put("부산광역시", List.of("부산"));
        values.put("세종", List.of("세종특별자치시"));
        values.put("세종특별자치시", List.of("세종"));
        return Map.copyOf(values);
    }

    private static void register(Map<String, String> target, String canonical, String... aliases) {
        Arrays.stream(aliases)
            .map(value -> value.toLowerCase(Locale.ROOT))
            .forEach(value -> target.put(value, canonical));
    }
}
