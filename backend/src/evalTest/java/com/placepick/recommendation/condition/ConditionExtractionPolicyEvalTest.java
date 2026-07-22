package com.placepick.recommendation.condition;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionErrorCode;
import com.placepick.recommendation.condition.application.port.out.ExtractionCommand;
import com.placepick.recommendation.condition.infrastructure.mock.DeterministicConditionExtractionAdapter;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;

class ConditionExtractionPolicyEvalTest {

    private static final String FIXTURE = "/evals/condition-extraction/cases.jsonl";
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Test
    void evaluatesRequiredFactsBoundariesAndInjectionWithoutNetworkOrInference() throws Exception {
        DeterministicConditionExtractionAdapter adapter =
            new DeterministicConditionExtractionAdapter();

        List<JsonNode> cases = readCases();

        assertThat(cases).hasSizeGreaterThanOrEqualTo(5);
        for (JsonNode fixture : cases) {
            String caseId = fixture.path("caseId").asText();
            var outcome = adapter.extract(new ExtractionCommand(
                fixture.path("requestText").asText(),
                "eval-session-0000001"
            ));
            ConditionExtractionErrorCode expected = ConditionExtractionErrorCode.valueOf(
                fixture.path("expectedErrorCode").asText()
            );

            assertThat(outcome.errorCode()).as(caseId).isEqualTo(expected);
            if (expected == ConditionExtractionErrorCode.NONE) {
                assertThat(outcome.condition()).as(caseId).isNotNull();
                assertThat(outcome.condition().locationQuery())
                    .as(caseId)
                    .isEqualTo(nullableText(fixture.get("expectedLocation")));
                assertThat(outcome.condition().placeType().name())
                    .as(caseId)
                    .isEqualTo(nullableText(fixture.get("expectedPlaceType")));
                assertThat(outcome.condition().partySize())
                    .as(caseId)
                    .isEqualTo(nullableInteger(fixture.get("expectedPartySize")));
                assertThat(outcome.condition().budgetPerPersonMin())
                    .as(caseId)
                    .isEqualTo(nullableInteger(fixture.get("expectedBudgetMin")));
                assertThat(outcome.condition().budgetPerPersonMax())
                    .as(caseId)
                    .isEqualTo(nullableInteger(fixture.get("expectedBudgetMax")));
            } else if (outcome.condition() == null) {
                assertThat(outcome.condition()).as(caseId).isNull();
            } else {
                assertThat(outcome.condition().isProcessable()).as(caseId).isFalse();
                assertThat(outcome.condition().locationQuery())
                    .as(caseId)
                    .isEqualTo(nullableText(fixture.get("expectedLocation")));
                assertThat(outcome.condition().placeType() == null
                    ? null
                    : outcome.condition().placeType().name())
                    .as(caseId)
                    .isEqualTo(nullableText(fixture.get("expectedPlaceType")));
            }
        }
    }

    private static List<JsonNode> readCases() throws IOException {
        InputStream input = ConditionExtractionPolicyEvalTest.class.getResourceAsStream(FIXTURE);
        if (input == null) {
            throw new IllegalStateException("Condition extraction fixture is missing.");
        }
        try (input;
             BufferedReader reader = new BufferedReader(
                 new InputStreamReader(input, StandardCharsets.UTF_8)
             )) {
            return reader.lines()
                .filter(line -> !line.isBlank())
                .map(ConditionExtractionPolicyEvalTest::parse)
                .toList();
        }
    }

    private static JsonNode parse(String value) {
        try {
            return OBJECT_MAPPER.readTree(value);
        } catch (IOException exception) {
            throw new IllegalArgumentException("Condition extraction fixture JSON is invalid.");
        }
    }

    private static String nullableText(JsonNode value) {
        return value == null || value.isNull() ? null : value.asText();
    }

    private static Integer nullableInteger(JsonNode value) {
        return value == null || value.isNull() ? null : value.intValue();
    }
}
