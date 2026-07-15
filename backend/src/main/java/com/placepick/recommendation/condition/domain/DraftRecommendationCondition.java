package com.placepick.recommendation.condition.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.util.List;

/**
 * A condition proposed by a provider and awaiting explicit user confirmation.
 *
 * <p>Location, type, party size, budgets, and preference priorities may be absent in a draft.
 * Present values are still validated so an invalid provider value never crosses this boundary.</p>
 */
public record DraftRecommendationCondition(
    String locationQuery,
    PlaceType placeType,
    String placeTypeDetail,
    Integer partySize,
    Integer budgetPerPersonMin,
    Integer budgetPerPersonMax,
    List<Preference> preferences,
    List<String> exclusions
) {

    public DraftRecommendationCondition {
        locationQuery = ConditionValues.optionalText(locationQuery, "Location query", 100);
        placeTypeDetail = ConditionValues.optionalText(
            placeTypeDetail,
            "Place type detail",
            30
        );
        partySize = ConditionValues.optionalPartySize(partySize);
        budgetPerPersonMin = ConditionValues.optionalBudget(
            budgetPerPersonMin,
            "Minimum budget"
        );
        budgetPerPersonMax = ConditionValues.optionalBudget(
            budgetPerPersonMax,
            "Maximum budget"
        );
        preferences = ConditionValues.preferences(preferences);
        exclusions = ConditionValues.exclusions(exclusions);
        ConditionValues.validateCrossFields(
            placeType,
            placeTypeDetail,
            budgetPerPersonMin,
            budgetPerPersonMax
        );
    }

    @JsonIgnore
    public boolean isProcessable() {
        return locationQuery != null && placeType != null;
    }

    public ConfirmedRecommendationCondition confirm() {
        return new ConfirmedRecommendationCondition(
            locationQuery,
            placeType,
            placeTypeDetail,
            partySize,
            budgetPerPersonMin,
            budgetPerPersonMax,
            preferences,
            exclusions
        );
    }
}
