package com.placepick.recommendation.application.port.out;

import java.util.Objects;

public record BlogSearchQuery(String query, int limit, BlogSearchSort sort) {

    public BlogSearchQuery {
        query = SearchPortValues.requireQuery(query);
        if (limit < 1 || limit > 10) {
            throw new IllegalArgumentException("Blog search limit must be between 1 and 10.");
        }
        sort = Objects.requireNonNull(sort, "sort");
    }

    public BlogSearchQuery(String query, int limit) {
        this(query, limit, BlogSearchSort.SIMILARITY);
    }
}
