package com.placepick.recommendation.application.port.out;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class SearchPortContractTest {

    @Test
    void normalizesQueriesAndEnforcesUseCaseLimits() {
        assertThat(new PlaceSearchQuery("  서울 카페  ", 5).query()).isEqualTo("서울 카페");
        assertThat(new BlogSearchQuery("  서울 카페 후기  ", 10).query())
            .isEqualTo("서울 카페 후기");
        assertThat(new PlaceSearchQuery("서울 카페", 5).sort())
            .isEqualTo(PlaceSearchSort.ACCURACY);
        assertThat(new BlogSearchQuery("서울 카페", 10).sort())
            .isEqualTo(BlogSearchSort.SIMILARITY);
        assertThat(PlaceSearchSort.ACCURACY.providerValue()).isEqualTo("random");
        assertThat(PlaceSearchSort.POPULARITY.providerValue()).isEqualTo("comment");
        assertThat(BlogSearchSort.SIMILARITY.providerValue()).isEqualTo("sim");

        assertThatThrownBy(() -> new PlaceSearchQuery("서울 카페", 6))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("between 1 and 5");
        assertThatThrownBy(() -> new BlogSearchQuery(" ", 1))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("must not be blank");
        assertThatThrownBy(() -> new BlogSearchQuery("서울 카페 후기", 11))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("between 1 and 10");
        assertThatThrownBy(() -> new PlaceSearchQuery("가".repeat(101), 1))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("100 characters");
    }

    @Test
    void copiesResultItemsToKeepPortResultsImmutable() {
        List<PlaceSearchItem> source = new ArrayList<>();
        source.add(new PlaceSearchItem("가상 장소", "", "카페", "", "", "", "", ""));

        PlaceSearchResult result = new PlaceSearchResult(1, source);
        source.clear();

        assertThat(result.items()).hasSize(1);
        assertThatThrownBy(() -> result.items().clear())
            .isInstanceOf(UnsupportedOperationException.class);
    }
}
