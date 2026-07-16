package com.placepick.room;

import java.util.UUID;

public record VoteAggregate(UUID placeId, long likeCount, long dislikeCount) {
    public VoteAggregate {
        if (placeId == null || likeCount < 0 || dislikeCount < 0) {
            throw new IllegalArgumentException("Vote aggregate is invalid.");
        }
    }
}
