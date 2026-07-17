package com.placepick.recommendation.application.candidate;

import com.placepick.recommendation.application.port.out.PlaceSearchItem;
import java.util.Objects;

public record PlaceSearchHit(PlaceSearchItem item, SearchObservation observation) {

    public PlaceSearchHit {
        item = Objects.requireNonNull(item, "item");
        observation = Objects.requireNonNull(observation, "observation");
    }
}
