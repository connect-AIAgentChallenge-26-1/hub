package com.placepick.room;

import com.placepick.recommendation.job.RecommendationJobPlace;
import java.util.Objects;
import java.util.UUID;

public record VotingRoomPlace(UUID roomId, UUID placeId, int ordinal, RecommendationJobPlace place) {
    public VotingRoomPlace {
        roomId = Objects.requireNonNull(roomId, "roomId");
        placeId = Objects.requireNonNull(placeId, "placeId");
        if (ordinal < 1 || ordinal > 3) {
            throw new IllegalArgumentException("Room place ordinal must be between 1 and 3.");
        }
        place = Objects.requireNonNull(place, "place");
        if (!placeId.equals(place.placeId())) {
            throw new IllegalArgumentException("Room place ID must match its snapshot.");
        }
    }
}
