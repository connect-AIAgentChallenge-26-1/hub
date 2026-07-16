package com.placepick.recommendation.application.candidate;

import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.Preference;
import com.placepick.recommendation.application.port.out.PlaceSearchSort;
import com.placepick.recommendation.application.scoring.RetrievalPolicy;
import com.placepick.recommendation.workflow.application.RecommendationExecutionContext;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public final class CandidateQueryPlanner {

    private static final int MAX_QUERY_LENGTH = 100;

    private final CategoryTaxonomy taxonomy;
    private final LocationResolver locationResolver;

    public CandidateQueryPlanner(CategoryTaxonomy taxonomy) {
        this(taxonomy, new LocationResolver());
    }

    public CandidateQueryPlanner(CategoryTaxonomy taxonomy, LocationResolver locationResolver) {
        this.taxonomy = taxonomy;
        this.locationResolver = locationResolver;
    }

    public CandidateQueryPlan initial(ConfirmedRecommendationCondition condition) {
        List<String> tokens = new ArrayList<>();
        tokens.add(SearchTextNormalizer.display(condition.locationQuery()));
        tokens.add(taxonomy.queryToken(condition.placeType(), condition.placeTypeDetail()));
        String base = String.join(" ", tokens);
        if (length(base) > MAX_QUERY_LENGTH) {
            throw new IllegalArgumentException(
                "Location and required place type exceed the provider query limit."
            );
        }

        List<IncludedPreference> ordered = new ArrayList<>();
        for (int index = 0; index < condition.preferences().size(); index++) {
            ordered.add(new IncludedPreference(condition.preferences().get(index), index));
        }
        ordered.sort(Comparator
            .comparingInt((IncludedPreference value) -> value.preference().priority()).reversed()
            .thenComparingInt(IncludedPreference::originalIndex));

        List<IncludedPreference> included = new ArrayList<>();
        for (IncludedPreference candidate : ordered) {
            String token = SearchTextNormalizer.display(candidate.preference().value());
            if (!token.isBlank() && appendLength(tokens, token) <= MAX_QUERY_LENGTH) {
                tokens.add(token);
                included.add(candidate);
            }
        }
        return new CandidateQueryPlan(String.join(" ", tokens), included);
    }

    public Optional<CandidateQueryPlan> relax(CandidateQueryPlan initial) {
        Optional<IncludedPreference> removable = initial.includedPreferences().stream()
            .min(Comparator
                .comparingInt((IncludedPreference value) -> value.preference().priority())
                .thenComparing(Comparator.comparingInt(IncludedPreference::originalIndex).reversed()));
        if (removable.isEmpty()) {
            return Optional.empty();
        }
        IncludedPreference removed = removable.orElseThrow();
        List<IncludedPreference> remaining = initial.includedPreferences().stream()
            .filter(value -> value.originalIndex() != removed.originalIndex())
            .toList();

        String removedToken = SearchTextNormalizer.display(removed.preference().value());
        List<String> queryTokens = new ArrayList<>(List.of(initial.query().split(" ")));
        removeLastSequence(queryTokens, List.of(removedToken.split(" ")));
        return Optional.of(new CandidateQueryPlan(String.join(" ", queryTokens), remaining));
    }

    public String blogQuery(String candidateName, String locationQuery) {
        String query = SearchTextNormalizer.display(candidateName) + " "
            + SearchTextNormalizer.display(locationQuery);
        if (length(query) > MAX_QUERY_LENGTH) {
            throw new IllegalArgumentException("Candidate and location exceed the provider query limit.");
        }
        return query;
    }

    public List<CandidateQueryPlan> variants(
        ConfirmedRecommendationCondition condition,
        RecommendationExecutionContext context,
        RetrievalPolicy policy
    ) {
        String location = SearchTextNormalizer.display(condition.locationQuery());
        List<String> typeTokens = taxonomy.queryTokens(
            condition.placeType(),
            condition.placeTypeDetail()
        );
        String requiredBase = location + " " + typeTokens.get(0);
        if (length(requiredBase) > MAX_QUERY_LENGTH) {
            throw new IllegalArgumentException(
                "Location and required place type exceed the provider query limit."
            );
        }
        List<IncludedPreference> preferences = orderedPreferences(condition);
        LinkedHashMap<String, CandidateQueryPlan> unique = new LinkedHashMap<>();

        addVariant(
            unique,
            "v2.base.accuracy",
            location,
            typeTokens.get(0),
            null,
            List.of(),
            PlaceSearchSort.ACCURACY,
            1_000
        );
        addVariant(
            unique,
            "v2.base.popularity",
            location,
            typeTokens.get(0),
            null,
            List.of(),
            PlaceSearchSort.POPULARITY,
            900
        );
        for (IncludedPreference preference : preferences) {
            addVariant(
                unique,
                "v2.preference." + preference.originalIndex(),
                location,
                typeTokens.get(0),
                preference.preference().value(),
                List.of(preference),
                PlaceSearchSort.ACCURACY,
                800
            );
        }
        for (int index = 1; index < typeTokens.size(); index++) {
            addVariant(
                unique,
                "v2.type." + index,
                location,
                typeTokens.get(index),
                null,
                List.of(),
                PlaceSearchSort.ACCURACY,
                700
            );
        }
        List<String> locationForms = locationResolver.queryForms(condition.locationQuery());
        for (int index = 1; index < locationForms.size(); index++) {
            addVariant(
                unique,
                "v2.location." + index,
                locationForms.get(index),
                typeTokens.get(0),
                null,
                List.of(),
                PlaceSearchSort.ACCURACY,
                700
            );
        }

        return unique.values().stream()
            .filter(value -> !context.usedVariantIds().contains(value.variantId()))
            .toList();
    }

    private List<IncludedPreference> orderedPreferences(
        ConfirmedRecommendationCondition condition
    ) {
        List<IncludedPreference> ordered = new ArrayList<>();
        for (int index = 0; index < condition.preferences().size(); index++) {
            ordered.add(new IncludedPreference(condition.preferences().get(index), index));
        }
        ordered.sort(Comparator
            .comparingInt((IncludedPreference value) -> value.preference().priority()).reversed()
            .thenComparingInt(IncludedPreference::originalIndex));
        return List.copyOf(ordered);
    }

    private void addVariant(
        Map<String, CandidateQueryPlan> unique,
        String variantId,
        String location,
        String type,
        String preference,
        List<IncludedPreference> included,
        PlaceSearchSort sort,
        int weightBasisPoints
    ) {
        List<String> tokens = new ArrayList<>(List.of(location, type));
        if (preference != null && !SearchTextNormalizer.display(preference).isBlank()) {
            tokens.add(SearchTextNormalizer.display(preference));
        }
        String query = String.join(" ", tokens);
        if (length(query) > MAX_QUERY_LENGTH) {
            return;
        }
        String key = SearchTextNormalizer.comparison(query) + "|" + sort.name();
        unique.putIfAbsent(
            key,
            new CandidateQueryPlan(query, included, variantId, sort, weightBasisPoints)
        );
    }

    private int appendLength(List<String> existing, String candidate) {
        return length(String.join(" ", existing)) + 1 + length(candidate);
    }

    private int length(String value) {
        return value.codePointCount(0, value.length());
    }

    private void removeLastSequence(List<String> source, List<String> sequence) {
        for (int start = source.size() - sequence.size(); start >= 0; start--) {
            if (source.subList(start, start + sequence.size()).equals(sequence)) {
                source.subList(start, start + sequence.size()).clear();
                return;
            }
        }
        throw new IllegalStateException("Included preference token must be present in its query.");
    }
}
