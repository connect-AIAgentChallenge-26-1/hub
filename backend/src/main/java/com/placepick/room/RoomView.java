package com.placepick.room;

import com.placepick.recommendation.job.RecommendationJobPlace;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record RoomView(
    UUID roomId,
    String shareToken,
    RoomStatus status,
    List<RecommendationJobPlace> places,
    List<VoteAggregate> aggregate,
    Map<UUID, VoteValue> myVotes,
    boolean canFinalize,
    UUID finalizedPlaceId,
    Instant expiresAt
) {
    public RoomView {
        places = List.copyOf(places);
        aggregate = List.copyOf(aggregate);
        myVotes = Map.copyOf(new LinkedHashMap<>(myVotes));
    }
}
