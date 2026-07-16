package com.placepick.recommendation.application.port.out;

import java.util.Objects;

public record PlaceSearchQuery(String query, int limit, PlaceSearchSort sort) {

    public PlaceSearchQuery {
        query = SearchPortValues.requireQuery(query);
        if (limit < 1 || limit > 5) {
            throw new IllegalArgumentException("Place search limit must be between 1 and 5.");
        }
        sort = Objects.requireNonNull(sort, "sort");
    }

    public PlaceSearchQuery(String query, int limit) {
        this(query, limit, PlaceSearchSort.ACCURACY);
    }
}
