package com.placepick.recommendation.reason.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.recommendation.reason.domain.ReasonEvidence;
import com.placepick.recommendation.reason.domain.ReasonEvidenceType;
import com.placepick.recommendation.reason.domain.ReasonPlaceContext;
import com.placepick.recommendation.reason.domain.ReasonStatement;
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

    @Test
    void evaluatesGroundingInjectionAndUnsupportedClaimFixtures() throws Exception {
        ReasonStatementPolicy policy = new ReasonStatementPolicy();
        List<JsonNode> cases = fixtures();

        assertThat(cases).hasSizeGreaterThanOrEqualTo(9);
        for (JsonNode fixture : cases) {
            ReasonEvidenceType evidenceType = ReasonEvidenceType.valueOf(
                fixture.path("evidenceType").asText()
            );
            ReasonPlaceContext place = new ReasonPlaceContext(
                UUID.fromString("00000000-0000-4000-8000-000000000001"),
                "성수 카페",
                "카페",
                List.of(new ReasonEvidence(
                    evidenceType == ReasonEvidenceType.LOCAL ? "local:1" : "blog:1",
                    evidenceType,
                    fixture.path("evidenceTitle").asText(),
                    fixture.path("evidenceSummary").asText()
                ))
            );
            List<String> evidenceIds = new ArrayList<>();
            fixture.path("evidenceIds").forEach(value -> evidenceIds.add(value.asText()));
            ReasonStatementPolicy.ValidationResult validation = policy.validate(
                new ReasonStatement(fixture.path("text").asText(), evidenceIds),
                place
            );
            boolean actual = validation == ReasonStatementPolicy.ValidationResult.SUPPORTED;
            assertThat(actual)
                .as(fixture.path("id").asText())
                .isEqualTo(fixture.path("expectedValid").asBoolean());
            if (!actual) {
                assertThat(ReasonBatchValidator.validationCode(validation).name())
                    .as(fixture.path("id").asText() + " diagnostic")
                    .isEqualTo(validation.name());
            }
        }
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
