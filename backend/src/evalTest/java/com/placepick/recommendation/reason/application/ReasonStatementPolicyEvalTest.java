package com.placepick.recommendation.reason.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.domain.GeneratedReasonStatement;
import com.placepick.recommendation.reason.domain.ReasonEvidence;
import com.placepick.recommendation.reason.domain.ReasonEvidenceType;
import com.placepick.recommendation.reason.domain.ReasonPlaceContext;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ReasonStatementPolicyEvalTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final List<String> TEXT_VARIANTS = List.of(
        "%s",
        "검토 결과, %s",
        "검증 문장: %s",
        "참고 문장: %s",
        "[%s]",
        "%s — 근거 범위 내",
        "  %s  ",
        "요약: %s"
    );

    @Test
    void evaluatesAtLeastTwoHundredV3ClaimGroundingAdversarialCases() throws Exception {
        ReasonStatementPolicy policy = new ReasonStatementPolicy();
        List<JsonNode> fixtures = fixtures();
        int evaluated = 0;

        assertThat(fixtures).hasSizeGreaterThanOrEqualTo(25);
        for (JsonNode fixture : fixtures) {
            ReasonGenerationCommand command = command(fixture);
            List<String> claimIds = strings(fixture.path("claimIds"));
            ReasonStatementPolicy.ValidationResult expected =
                ReasonStatementPolicy.ValidationResult.valueOf(
                    fixture.path("expected").asText()
                );
            for (String template : TEXT_VARIANTS) {
                String text = template.formatted(fixture.path("text").asText());
                ReasonStatementPolicy.ValidationResult actual = policy.validate(
                    new GeneratedReasonStatement(text, claimIds),
                    command
                );
                assertThat(actual)
                    .as(fixture.path("id").asText() + " / " + template)
                    .isEqualTo(expected);
                if (actual != ReasonStatementPolicy.ValidationResult.SUPPORTED) {
                    assertThat(ReasonBatchValidator.validationCode(actual).name())
                        .as(fixture.path("id").asText() + " diagnostic")
                        .isEqualTo(actual.name());
                }
                evaluated++;
            }
        }

        assertThat(evaluated).isGreaterThanOrEqualTo(200);
    }

    private ReasonGenerationCommand command(JsonNode fixture) {
        ReasonEvidenceType type = ReasonEvidenceType.valueOf(
            fixture.path("claimType").asText()
        );
        return ReasonGenerationCommand.forPlace(
            new ConfirmedRecommendationCondition(
                "서울 성동구",
                PlaceType.CAFE,
                null,
                null,
                null,
                null,
                List.of(),
                List.of()
            ),
            1,
            new ReasonPlaceContext(
                UUID.fromString("00000000-0000-4000-8000-000000000001"),
                "성수 정원",
                "카페",
                List.of(new ReasonEvidence(
                    "evidence:1",
                    type,
                    fixture.path("claimTitle").asText(),
                    fixture.path("claimSummary").asText()
                ))
            )
        );
    }

    private List<String> strings(JsonNode array) {
        List<String> result = new ArrayList<>();
        array.forEach(value -> result.add(value.asText()));
        return List.copyOf(result);
    }

    private List<JsonNode> fixtures() throws Exception {
        InputStream input = getClass().getResourceAsStream(
            "/evals/recommendation-reason/cases.jsonl"
        );
        if (input == null) {
            throw new IllegalStateException("Reason evaluation fixture is missing.");
        }
        List<JsonNode> result = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
            input,
            StandardCharsets.UTF_8
        ))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.isBlank()) {
                    result.add(OBJECT_MAPPER.readTree(line));
                }
            }
        }
        return List.copyOf(result);
    }
}
