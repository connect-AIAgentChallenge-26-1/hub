package com.placepick.recommendation.application.scoring;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PreferenceEvidenceMatcherTest {

    private final PreferenceEvidenceMatcher matcher = new PreferenceEvidenceMatcher();

    @Test
    void doesNotTreatTheSyllableInsideReviewAsAViewPreference() {
        assertThat(matcher.matches("뷰", "신규 매장 리뷰입니다")).isFalse();
    }

    @Test
    void acceptsAStandaloneShortPreferenceWithAKoreanParticle() {
        assertThat(matcher.matches("뷰", "창가에서 보이는 뷰가 좋습니다")).isTrue();
    }
}
