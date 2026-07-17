package com.placepick.recommendation.reason.adapter.out.llm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationOutcome;
import com.placepick.recommendation.reason.domain.GeneratedReasonResult;
import com.placepick.recommendation.reason.domain.GeneratedReasonStatement;
import com.placepick.recommendation.reason.domain.ReasonEvidence;
import com.placepick.recommendation.reason.domain.ReasonEvidenceType;
import com.placepick.recommendation.reason.domain.ReasonPlaceContext;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EliceGroundedReasonClientSecurityTest {

    @Test
    void acceptsOnlyThePinnedModelAndCanonicalApprovedOrigin() {
        EliceGroundedReasonClient client = EliceGroundedReasonClient.create(
            URI.create("https://mlapi.run/00000000-0000-4000-8000-000000000999/v1"),
            "synthetic-reason-token",
            EliceGroundedReasonClient.MODEL
        );
        assertThat(client).isNotNull();

        for (String value : List.of(
            "http://mlapi.run/00000000-0000-4000-8000-000000000999/v1",
            "https://example.test/00000000-0000-4000-8000-000000000999/v1",
            "https://mlapi.run/not-a-uuid/v1",
            "https://mlapi.run/00000000-0000-4000-8000-000000000999/v1?target=x"
        )) {
            assertThatThrownBy(() -> EliceGroundedReasonClient.create(
                URI.create(value),
                "synthetic-reason-token",
                EliceGroundedReasonClient.MODEL
            )).as(value).isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> EliceGroundedReasonClient.create(
            URI.create("https://mlapi.run/00000000-0000-4000-8000-000000000999/v1"),
            "synthetic-reason-token",
            "openai/other-model"
        )).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsMissingOrWhitespaceCredentialsWithoutEchoingThem() {
        for (String token : new String[] {null, "", "secret token", "secret\ntoken"}) {
            assertThatThrownBy(() -> EliceGroundedReasonClient.create(
                URI.create("https://mlapi.run/00000000-0000-4000-8000-000000000999/v1"),
                token,
                EliceGroundedReasonClient.MODEL
            )).isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining("secret token")
                .hasMessageNotContaining("secret\ntoken");
        }
    }

    @Test
    void strictSchemaClosesEveryObjectAndPinsOnlyTheCurrentSlotAndClaimIds() {
        Map<String, Object> schema = EliceGroundedReasonClient.strictReasonSchema(command());

        assertThat(schema).containsEntry("additionalProperties", false);
        @SuppressWarnings("unchecked")
        Map<String, Object> properties = (Map<String, Object>) schema.get("properties");
        assertThat(properties).containsOnlyKeys("schemaVersion", "slot", "statements");
        @SuppressWarnings("unchecked")
        Map<String, Object> slot = (Map<String, Object>) properties.get("slot");
        assertThat(slot.get("enum")).isEqualTo(List.of("p1"));

        @SuppressWarnings("unchecked")
        Map<String, Object> statements = (Map<String, Object>) properties.get("statements");
        @SuppressWarnings("unchecked")
        Map<String, Object> statement = (Map<String, Object>) statements.get("items");
        assertThat(statement).containsEntry("additionalProperties", false);
        @SuppressWarnings("unchecked")
        Map<String, Object> statementProperties =
            (Map<String, Object>) statement.get("properties");
        assertThat(statementProperties).containsOnlyKeys("text", "claimIds");
        @SuppressWarnings("unchecked")
        Map<String, Object> claimIds =
            (Map<String, Object>) statementProperties.get("claimIds");
        @SuppressWarnings("unchecked")
        Map<String, Object> claimItem = (Map<String, Object>) claimIds.get("items");
        assertThat(claimItem.get("enum")).isEqualTo(List.of("p1-c1", "p1-c2"));
        assertThat(claimIds).containsEntry("minItems", 1).containsEntry("maxItems", 3);
        assertThat(schema.toString())
            .doesNotContain("placeId", "evidenceId", "score", "rank");
    }

    @Test
    void commandAndOutcomeToStringDoNotExposeCandidateOrClaimData() {
        ReasonGenerationCommand command = command();
        GeneratedReasonResult result = new GeneratedReasonResult(
            GeneratedReasonResult.SCHEMA_VERSION,
            "p1",
            List.of(new GeneratedReasonStatement(
                "블로그 검색 결과에서 조용한 공간으로 소개되었습니다.",
                List.of("p1-c2")
            ))
        );

        assertThat(command.toString())
            .doesNotContain("서울", "카페 1", "local-sensitive", "blog-sensitive");
        assertThat(result.toString())
            .doesNotContain("블로그 검색 결과", "p1-c2");
        assertThat(ReasonGenerationOutcome.generated(result).toString())
            .doesNotContain("블로그 검색 결과", "p1-c2", "카페 1");
    }

    private static ReasonGenerationCommand command() {
        ReasonPlaceContext place = new ReasonPlaceContext(
            UUID.fromString("00000000-0000-4000-8000-000000000001"),
            "카페 1",
            "카페>디저트",
            List.of(
                new ReasonEvidence(
                    "local-sensitive",
                    ReasonEvidenceType.LOCAL,
                    "카페 1",
                    "서울 강남구 카페"
                ),
                new ReasonEvidence(
                    "blog-sensitive",
                    ReasonEvidenceType.BLOG,
                    "카페 1 방문 기록",
                    "카페 1 조용한 공간"
                )
            )
        );
        return ReasonGenerationCommand.forPlace(
            new ConfirmedRecommendationCondition(
                "서울",
                PlaceType.CAFE,
                null,
                null,
                null,
                null,
                List.of(),
                List.of()
            ),
            1,
            place
        );
    }
}
