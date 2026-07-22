package com.placepick.recommendation.condition.infrastructure.mock;

import com.placepick.recommendation.condition.application.port.out.ConditionExtractionPort;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionDiagnosticCode;
import com.placepick.recommendation.condition.application.port.out.ConditionWarning;
import com.placepick.recommendation.condition.application.port.out.ExtractionCommand;
import com.placepick.recommendation.condition.application.port.out.ExtractionOutcome;
import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Network-free semantic fixture adapter for local, test, and evaluation suites.
 *
 * <p>It intentionally supports a bounded vocabulary. Unsupported or ambiguous values remain
 * absent instead of being guessed.</p>
 */
public final class DeterministicConditionExtractionAdapter implements ConditionExtractionPort {

    private static final Pattern LOCATION = Pattern.compile(
        "([\\p{L}\\p{N}]+(?:\\s+[\\p{L}\\p{N}]+){0,2})\\s*(?:에서|근처|주변)"
    );
    private static final Pattern PARTY = Pattern.compile("(\\d{1,3})\\s*(?:명|people|persons?)");
    private static final Pattern BUDGET_RANGE = Pattern.compile(
        "(\\d{1,7})\\s*(만원|원)?\\s*(?:~|-|에서)\\s*" +
            "(\\d{1,7})\\s*(만원|원)"
    );
    private static final Pattern BUDGET_MAXIMUM = Pattern.compile(
        "(\\d{1,7})\\s*(만원|원)\\s*(?:이하|까지|내|안쪽)"
    );
    private static final Pattern BUDGET_MINIMUM = Pattern.compile(
        "(\\d{1,7})\\s*(만원|원)\\s*(?:이상|부터)"
    );
    private static final Pattern EXCLUSION = Pattern.compile(
        "([\\p{L}\\p{N}]{1,50})\\s*(?:제외|빼고|싫어)"
    );
    private static final List<String> PREFERENCE_VOCABULARY = List.of(
        "조용한",
        "주차",
        "디저트",
        "룸",
        "뷰",
        "반려동물",
        "채식"
    );

    @Override
    public ExtractionOutcome extract(ExtractionCommand command) {
        String requestText = command.requestText();
        String lowerCaseText = requestText.toLowerCase(Locale.ROOT);

        String location = firstGroup(LOCATION, requestText);
        TypeMatch typeMatch = findPlaceType(lowerCaseText);
        Integer partySize = integerGroup(PARTY, lowerCaseText);
        Budget budget = findBudget(lowerCaseText);
        List<String> exclusions = findExclusions(lowerCaseText);
        List<Preference> preferences = findPreferences(lowerCaseText, exclusions);
        List<ConditionWarning> warnings = warnings(partySize, budget);

        try {
            DraftRecommendationCondition condition = new DraftRecommendationCondition(
                location,
                typeMatch.placeType(),
                typeMatch.detail(),
                partySize,
                budget.minimum(),
                budget.maximum(),
                preferences,
                exclusions
            );
            if (!condition.isProcessable()) {
                return ExtractionOutcome.unprocessable(
                    condition,
                    warnings,
                    missingRequiredDiagnostic(location, typeMatch.placeType())
                );
            }
            return ExtractionOutcome.extracted(condition, warnings);
        } catch (IllegalArgumentException exception) {
            return ExtractionOutcome.unprocessable(
                warnings,
                ConditionExtractionDiagnosticCode.UNPROCESSABLE_DOMAIN_CONSTRAINT
            );
        }
    }

    private static ConditionExtractionDiagnosticCode missingRequiredDiagnostic(
        String location,
        PlaceType placeType
    ) {
        if (location == null && placeType == null) {
            return ConditionExtractionDiagnosticCode
                .UNPROCESSABLE_LOCATION_AND_TYPE_MISSING;
        }
        return location == null
            ? ConditionExtractionDiagnosticCode.UNPROCESSABLE_LOCATION_MISSING
            : ConditionExtractionDiagnosticCode.UNPROCESSABLE_PLACE_TYPE_MISSING;
    }

    private static TypeMatch findPlaceType(String value) {
        if (containsAny(value, "카페", "커피", "디저트")) {
            return new TypeMatch(PlaceType.CAFE, null);
        }
        if (containsAny(value, "식당", "음식점", "맛집", "레스토랑")) {
            return new TypeMatch(PlaceType.RESTAURANT, null);
        }
        if (containsAny(value, "술집", "주점", "바 ", "bar", "호프")) {
            return new TypeMatch(PlaceType.BAR, null);
        }
        for (String other : List.of("공원", "볼링장", "전시장")) {
            if (value.contains(other)) {
                return new TypeMatch(PlaceType.OTHER, other);
            }
        }
        return new TypeMatch(null, null);
    }

    private static boolean containsAny(String value, String... candidates) {
        for (String candidate : candidates) {
            if (value.contains(candidate)) {
                return true;
            }
        }
        return false;
    }

    private static Budget findBudget(String value) {
        Matcher range = BUDGET_RANGE.matcher(value);
        if (range.find()) {
            return new Budget(
                won(range.group(1), range.group(2)),
                won(range.group(3), range.group(4))
            );
        }

        Matcher maximum = BUDGET_MAXIMUM.matcher(value);
        if (maximum.find()) {
            return new Budget(null, won(maximum.group(1), maximum.group(2)));
        }

        Matcher minimum = BUDGET_MINIMUM.matcher(value);
        if (minimum.find()) {
            return new Budget(won(minimum.group(1), minimum.group(2)), null);
        }
        return new Budget(null, null);
    }

    private static Integer won(String number, String unit) {
        try {
            long value = Long.parseLong(number);
            if ("만원".equals(unit)) {
                value = Math.multiplyExact(value, 10_000L);
            }
            return Math.toIntExact(value);
        } catch (ArithmeticException | NumberFormatException exception) {
            return Integer.MAX_VALUE;
        }
    }

    private static List<String> findExclusions(String value) {
        Set<String> exclusions = new LinkedHashSet<>();
        Matcher matcher = EXCLUSION.matcher(value);
        while (matcher.find() && exclusions.size() < 10) {
            exclusions.add(matcher.group(1));
        }
        return List.copyOf(exclusions);
    }

    private static List<Preference> findPreferences(String value, List<String> exclusions) {
        List<Preference> preferences = new ArrayList<>();
        for (String candidate : PREFERENCE_VOCABULARY) {
            if (value.contains(candidate) && !exclusions.contains(candidate)) {
                preferences.add(new Preference(candidate, 5));
            }
        }
        return List.copyOf(preferences);
    }

    private static List<ConditionWarning> warnings(Integer partySize, Budget budget) {
        List<ConditionWarning> warnings = new ArrayList<>();
        if (partySize == null) {
            warnings.add(ConditionWarning.PARTY_SIZE_NOT_PROVIDED);
        }
        if (budget.minimum() == null && budget.maximum() == null) {
            warnings.add(ConditionWarning.BUDGET_NOT_PROVIDED);
        }
        return List.copyOf(warnings);
    }

    private static String firstGroup(Pattern pattern, String value) {
        Matcher matcher = pattern.matcher(value);
        return matcher.find() ? matcher.group(1) : null;
    }

    private static Integer integerGroup(Pattern pattern, String value) {
        String matched = firstGroup(pattern, value);
        return matched == null ? null : Integer.valueOf(matched);
    }

    private record Budget(Integer minimum, Integer maximum) {
    }

    private record TypeMatch(PlaceType placeType, String detail) {
    }
}
