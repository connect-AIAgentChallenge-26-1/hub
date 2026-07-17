package com.placepick.recommendation.reason.application.port.out;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.reason.domain.ReasonClaim;
import com.placepick.recommendation.reason.domain.ReasonEvidence;
import com.placepick.recommendation.reason.domain.ReasonEvidenceType;
import com.placepick.recommendation.reason.domain.ReasonPlaceContext;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ReasonGenerationCommandTest {

    @Test
    void mapsEvidenceToStableSlotScopedClaimsInSourceOrder() {
        ReasonGenerationCommand command = ReasonGenerationCommand.forPlace(
            condition(),
            2,
            place()
        );

        assertThat(command.slot()).isEqualTo("p2");
        assertThat(command.claims()).extracting(ReasonClaim::claimId)
            .containsExactly("p2-c1", "p2-c2");
        assertThat(command.claims()).extracting(ReasonClaim::evidenceId)
            .containsExactly("local:1", "blog:1");
        assertThat(command.toString()).doesNotContain(
            "서울 성동구",
            "성수 정원",
            "local:1"
        );
    }

    @Test
    void rejectsClaimsThatDoNotExactlyMirrorPlaceEvidence() {
        ReasonPlaceContext place = place();
        ReasonClaim altered = new ReasonClaim(
            "p1-c1",
            "local:1",
            ReasonEvidenceType.LOCAL,
            "다른 제목",
            "서울 성동구"
        );

        assertThatThrownBy(() -> new ReasonGenerationCommand(
            condition(),
            "p1",
            place,
            List.of(altered, new ReasonClaim(
                "p1-c2",
                "blog:1",
                ReasonEvidenceType.BLOG,
                "성수 정원 방문",
                "조용한 좌석"
            ))
        )).hasMessage("Reason claims must preserve evidence order and content.");
    }

    private ConfirmedRecommendationCondition condition() {
        return new ConfirmedRecommendationCondition(
            "서울 성동구",
            PlaceType.CAFE,
            null,
            null,
            null,
            null,
            List.of(),
            List.of()
        );
    }

    private ReasonPlaceContext place() {
        return new ReasonPlaceContext(
            UUID.fromString("00000000-0000-4000-8000-000000000001"),
            "성수 정원",
            "카페",
            List.of(
                new ReasonEvidence(
                    "local:1",
                    ReasonEvidenceType.LOCAL,
                    "성수 정원",
                    "서울 성동구"
                ),
                new ReasonEvidence(
                    "blog:1",
                    ReasonEvidenceType.BLOG,
                    "성수 정원 방문",
                    "조용한 좌석"
                )
            )
        );
    }
}
