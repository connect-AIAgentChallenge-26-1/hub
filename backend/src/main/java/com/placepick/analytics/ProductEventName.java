package com.placepick.analytics;

import java.util.Arrays;
import java.util.Optional;

/** Client-observable product events. Server-side domain events do not enter this endpoint. */
public enum ProductEventName {
    DRAFT_CREATED("draftCreated"),
    RECOMMENDATION_VIEWED("recommendationViewed"),
    ROOM_SHARED("roomShared"),
    VOTE_CHANGED("voteChanged"),
    FINAL_RESULT_VIEWED("finalResultViewed");

    private final String wireName;

    ProductEventName(String wireName) {
        this.wireName = wireName;
    }

    public String wireName() {
        return wireName;
    }

    static Optional<ProductEventName> fromWireName(String value) {
        return Arrays.stream(values())
            .filter(candidate -> candidate.wireName.equals(value))
            .findFirst();
    }
}
