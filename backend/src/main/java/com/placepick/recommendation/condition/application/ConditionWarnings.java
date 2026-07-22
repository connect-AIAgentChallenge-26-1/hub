package com.placepick.recommendation.condition.application;

import com.placepick.recommendation.condition.application.port.out.ConditionWarning;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Computes server-owned warnings from the condition currently shown to the user. */
public final class ConditionWarnings {

    private ConditionWarnings() {
    }

    public static List<ConditionWarning> from(DraftRecommendationCondition condition) {
        Objects.requireNonNull(condition, "condition");
        return fromValues(
            condition.partySize(),
            condition.budgetPerPersonMin(),
            condition.budgetPerPersonMax()
        );
    }

    public static List<ConditionWarning> from(ConfirmedRecommendationCondition condition) {
        Objects.requireNonNull(condition, "condition");
        return fromValues(
            condition.partySize(),
            condition.budgetPerPersonMin(),
            condition.budgetPerPersonMax()
        );
    }

    private static List<ConditionWarning> fromValues(
        Integer partySize,
        Integer minimumBudget,
        Integer maximumBudget
    ) {
        List<ConditionWarning> warnings = new ArrayList<>();
        if (partySize == null) {
            warnings.add(ConditionWarning.PARTY_SIZE_NOT_PROVIDED);
        }
        if (minimumBudget == null && maximumBudget == null) {
            warnings.add(ConditionWarning.BUDGET_NOT_PROVIDED);
        }
        return List.copyOf(warnings);
    }
}
