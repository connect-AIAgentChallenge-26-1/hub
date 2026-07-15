package com.placepick.workflow.live;

import com.placepick.recommendation.condition.application.port.out.ConditionWarning;
import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import com.placepick.recommendation.condition.domain.Preference;
import java.text.Normalizer;
import java.util.List;
import java.util.Objects;
import java.util.Set;

final class LinkedDraftSemanticVerifier {

    private LinkedDraftSemanticVerifier() {
    }

    static String firstMismatchCode(
        DraftRecommendationCondition draft,
        List<ConditionWarning> warnings,
        LinkedWorkflowScenario.ExpectedDraft expected
    ) {
        if (!equivalent(draft.locationQuery(), expected.locationAliases())) {
            return "SEMANTIC_LOCATION_MISMATCH";
        }
        if (draft.placeType() != expected.placeType()) {
            return "SEMANTIC_PLACE_TYPE_MISMATCH";
        }
        if (!Objects.equals(draft.placeTypeDetail(), expected.placeTypeDetail())) {
            return "SEMANTIC_TYPE_DETAIL_MISMATCH";
        }
        if (!Objects.equals(draft.partySize(), expected.partySize())) {
            return "SEMANTIC_PARTY_SIZE_MISMATCH";
        }
        if (!Objects.equals(draft.budgetPerPersonMin(), expected.budgetMinimum()) ||
            !Objects.equals(draft.budgetPerPersonMax(), expected.budgetMaximum())) {
            return "SEMANTIC_BUDGET_MISMATCH";
        }
        if (draft.preferences().size() != expected.preferences().size()) {
            return "SEMANTIC_PREFERENCE_COUNT_MISMATCH";
        }
        for (int index = 0; index < expected.preferences().size(); index++) {
            LinkedWorkflowScenario.ExpectedPreference expectedPreference =
                expected.preferences().get(index);
            Preference actualPreference = draft.preferences().get(index);
            if (!equivalent(actualPreference.value(), expectedPreference.aliases())) {
                return "SEMANTIC_PREFERENCE_VALUE_MISMATCH";
            }
            if (!Objects.equals(actualPreference.priority(), expectedPreference.priority())) {
                return "SEMANTIC_PREFERENCE_PRIORITY_MISMATCH";
            }
        }
        if (draft.exclusions().size() != expected.exclusions().size()) {
            return "SEMANTIC_EXCLUSION_COUNT_MISMATCH";
        }
        for (int index = 0; index < expected.exclusions().size(); index++) {
            if (!equivalent(draft.exclusions().get(index), expected.exclusions().get(index))) {
                return "SEMANTIC_EXCLUSION_VALUE_MISMATCH";
            }
        }
        if (!Set.copyOf(warnings).equals(expected.warnings())) {
            return "SEMANTIC_WARNING_MISMATCH";
        }
        return null;
    }

    private static boolean equivalent(String value, Set<String> allowlist) {
        if (value == null) {
            return false;
        }
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFKC).strip();
        return allowlist.contains(normalized);
    }
}
