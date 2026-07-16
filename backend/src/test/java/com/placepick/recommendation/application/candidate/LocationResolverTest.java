package com.placepick.recommendation.application.candidate;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class LocationResolverTest {

    private final LocationResolver resolver = new LocationResolver();

    @Test
    void resolvesAdministrativeExactAndAliasMatchesWithoutGenericSuffixStripping() {
        assertThat(resolver.resolve(
            "서울 강남구", "서울 강남구 역삼동", "", true
        ).confidence()).isEqualTo(LocationConfidence.EXACT);
        assertThat(resolver.resolve(
            "서울 강남구", "서울특별시 강남구 역삼동", "", true
        ).confidence()).isEqualTo(LocationConfidence.ALIAS);
        assertThat(LocationResolver.VERSION).isEqualTo("place-location.v2");
    }

    @Test
    void neverTruncatesYeouidoOrSeongsuRoadAsIfTheyWereParticles() {
        assertThat(resolver.resolve(
            "여의도", "서울 영등포구 여의도동", "", true
        ).confidence()).isEqualTo(LocationConfidence.APPROXIMATE);
        assertThat(resolver.resolve(
            "성수로", "서울 성동구 성수로 1", "", true
        ).confidence()).isEqualTo(LocationConfidence.EXACT);
    }

    @Test
    void acceptsKnownLifestyleAreasOnlyAsProviderBackedApproximation() {
        assertThat(resolver.resolve(
            "서울 홍대", "서울특별시 마포구", "", true
        ).confidence()).isEqualTo(LocationConfidence.APPROXIMATE);
        assertThat(resolver.resolve(
            "서울 홍대", "서울특별시 마포구", "", false
        ).confidence()).isEqualTo(LocationConfidence.MISMATCH);
        assertThat(resolver.resolve(
            "서울 강남구", "부산광역시 해운대구", "", true
        ).accepted()).isFalse();
    }
}
