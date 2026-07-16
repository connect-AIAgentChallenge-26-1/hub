package com.placepick.room;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record VoteMutationResult(
    UUID placeId,
    VoteValue myVote,
    List<VoteAggregate> aggregate,
    Instant updatedAt
) {
    public VoteMutationResult {
        aggregate = List.copyOf(aggregate);
    }
}
