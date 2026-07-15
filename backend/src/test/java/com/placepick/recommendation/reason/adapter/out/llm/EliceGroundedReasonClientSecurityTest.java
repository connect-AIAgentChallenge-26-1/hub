package com.placepick.recommendation.reason.adapter.out.llm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.reason.application.ReasonStatementPolicy;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationOutcome;
import com.placepick.recommendation.reason.domain.GeneratedReasonBatch;
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
    void strictSchemaClosesEveryObjectAndPinsTheCurrentPlaceAndEvidenceIds() {
        Map<String, Object> schema = EliceGroundedReasonClient.strictReasonSchema(command());

        assertThat(schema).containsEntry("additionalProperties", false);
        @SuppressWarnings("unchecked")
        Map<String, Object> properties = (Map<String, Object>) schema.get("properties");
        @SuppressWarnings("unchecked")
        Map<String, Object> places = (Map<String, Object>) properties.get("places");
        @SuppressWarnings("unchecked")
        Map<String, Object> place = (Map<String, Object>) places.get("items");
        assertThat(place).containsEntry("additionalProperties", false);
        @SuppressWarnings("unchecked")
        Map<String, Object> placeProperties = (Map<String, Object>) place.get("properties");
        @SuppressWarnings("unchecked")
        Map<String, Object> placeId = (Map<String, Object>) placeProperties.get("placeId");
        List<String> actualPlaceIds = ((List<?>) placeId.get("enum")).stream()
            .map(Object::toString)
            .toList();
        assertThat(actualPlaceIds).containsExactly(
            "00000000-0000-4000-8000-000000000001",
            "00000000-0000-4000-8000-000000000002",
            "00000000-0000-4000-8000-000000000003"
        );
        @SuppressWarnings("unchecked")
        Map<String, Object> statements = (Map<String, Object>) placeProperties.get("statements");
        @SuppressWarnings("unchecked")
        Map<String, Object> statement = (Map<String, Object>) statements.get("items");
        @SuppressWarnings("unchecked")
        Map<String, Object> statementProperties =
            (Map<String, Object>) statement.get("properties");
        @SuppressWarnings("unchecked")
        Map<String, Object> text = (Map<String, Object>) statementProperties.get("text");
        assertThat(text.get("enum")).isEqualTo(List.of(
            ReasonStatementPolicy.LOCAL_STATEMENT_TEXT,
            ReasonStatementPolicy.BLOG_STATEMENT_TEXT
        ));
        @SuppressWarnings("unchecked")
        Map<String, Object> evidenceIds =
            (Map<String, Object>) statementProperties.get("evidenceIds");
        assertThat(evidenceIds).containsEntry("minItems", 1).containsEntry("maxItems", 1);
        assertThat(evidenceIds).doesNotContainKey("uniqueItems");
    }

    @Test
    void commandAndOutcomeToStringDoNotExposePromptOrCompletionData() {
        ReasonGenerationCommand command = command();
        GeneratedReasonBatch batch = new GeneratedReasonBatch(
            GeneratedReasonBatch.SCHEMA_VERSION,
            List.of()
        );

        assertThat(command.toString()).doesNotContain("서울", "카페", "local:1");
        assertThat(batch.toString()).doesNotContain("places=[]");
        assertThat(ReasonGenerationOutcome.generated(batch).toString())
            .doesNotContain("places", "서울", "카페");
    }

    private ReasonGenerationCommand command() {
        List<ReasonPlaceContext> places = java.util.stream.IntStream.rangeClosed(1, 3)
            .mapToObj(index -> new ReasonPlaceContext(
                UUID.fromString("00000000-0000-4000-8000-00000000000" + index),
                "카페 " + index,
                "카페",
                List.of(new ReasonEvidence(
                    "local:" + index,
                    ReasonEvidenceType.LOCAL,
                    "카페 " + index,
                    "서울 카페"
                ))
            ))
            .toList();
        return new ReasonGenerationCommand(
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
            places
        );
    }
}
