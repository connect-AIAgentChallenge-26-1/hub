package com.placepick.recommendation.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.placepick.recommendation.domain.scoring.EvidenceLevel;
import com.placepick.recommendation.domain.scoring.ScoreBreakdown;
import com.placepick.recommendation.reason.domain.ReasonStatement;
import com.placepick.recommendation.workflow.application.ReasonSource;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RecommendationJobPlaceTest {

    @Test
    void restoresMissingHistoricalReasonSourceFromPersistedWarnings() {
        RecommendationJobPlace fallback = place(null, List.of("LLM_REASON_FALLBACK"));
        RecommendationJobPlace generated = place(null, List.of());

        assertThat(fallback.reasonSource()).isEqualTo(ReasonSource.TEMPLATE);
        assertThat(generated.reasonSource()).isEqualTo(ReasonSource.GENERATED);
    }

    @Test
    void preservesExplicitPerPlaceReasonSourceAndNullableSourceUrl() {
        RecommendationJobPlace place = place(ReasonSource.TEMPLATE, List.of());

        assertThat(place.reasonSource()).isEqualTo(ReasonSource.TEMPLATE);
        assertThat(place.sourceUrl()).isNull();
    }

    private RecommendationJobPlace place(ReasonSource source, List<String> warnings) {
        return new RecommendationJobPlace(
            UUID.randomUUID(),
            "합성 후보",
            "카페",
            "서울 합성로",
            "서울 합성동",
            null,
            65,
            new ScoreBreakdown(15, 20, 15, 15),
            List.of(new ReasonStatement("검증된 합성 근거입니다.", List.of("local-1"))),
            List.of(),
            "합성 후보를 확인해 보세요.",
            EvidenceLevel.LOCAL_ONLY,
            source,
            warnings
        );
    }
}
