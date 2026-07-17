package com.placepick.recommendation.reason.application.port.out;

import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.reason.domain.ReasonPlaceContext;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;

public record ReasonGenerationCommand(
    ConfirmedRecommendationCondition condition,
    List<ReasonPlaceContext> places
) {

    public ReasonGenerationCommand {
        condition = Objects.requireNonNull(condition, "condition");
        places = List.copyOf(places);
        if (places.isEmpty() || places.size() > 3) {
            throw new IllegalArgumentException("Reason generation requires one to three places.");
        }
        if (new HashSet<>(places.stream().map(ReasonPlaceContext::placeId).toList()).size() !=
            places.size()) {
            throw new IllegalArgumentException("Reason generation place IDs must be unique.");
        }
    }

    @Override
    public String toString() {
        return "ReasonGenerationCommand[condition=<redacted>, places=<redacted>]";
    }
}
