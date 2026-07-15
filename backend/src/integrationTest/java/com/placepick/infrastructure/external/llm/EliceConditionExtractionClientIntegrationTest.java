package com.placepick.infrastructure.external.llm;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.exactly;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionErrorCode;
import com.placepick.recommendation.condition.application.port.out.ConditionWarning;
import com.placepick.recommendation.condition.application.port.out.ExtractionCommand;
import com.placepick.recommendation.condition.domain.PlaceType;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;

class EliceConditionExtractionClientIntegrationTest {

    private static final String TOKEN = "synthetic-condition-token";
    private static final String CHAT_PATH = "/condition-deployment/v1/chat/completions";
    private static final String RESPONSES_PATH = "/condition-deployment/v1/responses";
    private static final String SAFETY_IDENTIFIER = "synthetic-session-0001";
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final WireMockServer WIRE_MOCK = new WireMockServer(
        WireMockConfiguration.options().dynamicPort()
    );

    private EliceConditionExtractionClient client;

    @BeforeAll
    static void startWireMock() {
        WIRE_MOCK.start();
    }

    @AfterAll
    static void stopWireMock() {
        WIRE_MOCK.stop();
    }

    @BeforeEach
    void setUp() {
        WIRE_MOCK.resetAll();
        client = newClient(Duration.ofSeconds(2));
    }

    @Test
    void extractsStrictDraftAndSendsBoundedProductRequest() throws Exception {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH))
            .willReturn(jsonResponse(200, validChatResponse(validContent()))));

        var outcome = client.extract(command());

        assertThat(outcome.extracted()).isTrue();
        assertThat(outcome.errorCode()).isEqualTo(ConditionExtractionErrorCode.NONE);
        assertThat(outcome.condition().locationQuery()).isEqualTo("서울 성수동");
        assertThat(outcome.condition().placeType()).isEqualTo(PlaceType.CAFE);
        assertThat(outcome.condition().partySize()).isEqualTo(4);
        assertThat(outcome.condition().budgetPerPersonMin()).isEqualTo(10_000);
        assertThat(outcome.condition().budgetPerPersonMax()).isEqualTo(20_000);
        assertThat(outcome.condition().preferences()).singleElement()
            .satisfies(preference -> {
                assertThat(preference.value()).isEqualTo("조용한");
                assertThat(preference.priority()).isEqualTo(8);
            });
        assertThat(outcome.condition().exclusions()).containsExactly("흡연");
        assertThat(outcome.warnings()).isEmpty();

        verifyOneRequest();
        verifyRequestBody();
        WIRE_MOCK.verify(0, postRequestedFor(urlPathEqualTo(RESPONSES_PATH)));
    }

    @Test
    void mapsMissingLocationOrTypeToUnprocessableWithoutInventingValues() {
        String content = validContent()
            .replace("\"locationQuery\":\"서울 성수동\"", "\"locationQuery\":null")
            .replace("\"partySize\":4", "\"partySize\":null")
            .replace("\"budgetPerPersonMin\":10000", "\"budgetPerPersonMin\":null")
            .replace("\"budgetPerPersonMax\":20000", "\"budgetPerPersonMax\":null")
            .replace(
                "\"warnings\":[]",
                "\"warnings\":[\"PARTY_SIZE_NOT_PROVIDED\",\"BUDGET_NOT_PROVIDED\"]"
            );
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH))
            .willReturn(jsonResponse(200, validChatResponse(content))));

        var outcome = client.extract(command());

        assertThat(outcome.errorCode())
            .isEqualTo(ConditionExtractionErrorCode.UNPROCESSABLE_CONDITION);
        assertThat(outcome.condition()).isNull();
        assertThat(outcome.warnings()).containsExactly(
            ConditionWarning.PARTY_SIZE_NOT_PROVIDED,
            ConditionWarning.BUDGET_NOT_PROVIDED
        );
        verifyOneRequest();
    }

    @ParameterizedTest
    @CsvSource({
        "400, PROVIDER_INVALID_REQUEST",
        "401, PROVIDER_AUTHENTICATION_FAILED",
        "403, PROVIDER_AUTHENTICATION_FAILED",
        "429, PROVIDER_RATE_LIMITED",
        "503, PROVIDER_UNAVAILABLE"
    })
    void normalizesHttpFailuresAndNeverRetries(
        int status,
        ConditionExtractionErrorCode expected
    ) {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH)).willReturn(aResponse()
            .withStatus(status)
            .withHeader("Content-Type", "application/json")
            .withBody("{\"secret\":\"must-not-escape\"}")));

        var outcome = client.extract(command());

        assertThat(outcome.errorCode()).isEqualTo(expected);
        assertThat(outcome.condition()).isNull();
        verifyOneRequest();
    }

    @Test
    void preservesAllowlistedLoopbackGatewayFailureWithoutReadingProviderPayload() {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH)).willReturn(aResponse()
            .withStatus(502)
            .withHeader("Content-Type", "application/problem+json")
            .withHeader("X-PlacePick-Linked-Error-Code", "INVALID_RESPONSE")
            .withBody("{\"secret\":\"must-not-escape\"}")));

        var outcome = client.extract(command());

        assertThat(outcome.errorCode())
            .isEqualTo(ConditionExtractionErrorCode.PROVIDER_INVALID_RESPONSE);
        assertThat(outcome.condition()).isNull();
        verifyOneRequest();
    }

    @Test
    void ignoresUnknownLoopbackGatewayFailureCodeAndUsesHttpStatus() {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH)).willReturn(aResponse()
            .withStatus(502)
            .withHeader("Content-Type", "application/problem+json")
            .withHeader("X-PlacePick-Linked-Error-Code", "UNTRUSTED_VALUE")
            .withBody("{\"secret\":\"must-not-escape\"}")));

        var outcome = client.extract(command());

        assertThat(outcome.errorCode())
            .isEqualTo(ConditionExtractionErrorCode.PROVIDER_UNAVAILABLE);
        assertThat(outcome.condition()).isNull();
        verifyOneRequest();
    }

    @ParameterizedTest(name = "[{index}] rejects {0}")
    @MethodSource("invalidResponses")
    void rejectsMalformedRefusedIncompleteOrSchemaDrift(String name, String response) {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH))
            .willReturn(jsonResponse(200, response)));

        var outcome = client.extract(command());

        assertThat(outcome.errorCode())
            .as(name)
            .isEqualTo(ConditionExtractionErrorCode.PROVIDER_INVALID_RESPONSE);
        assertThat(outcome.condition()).isNull();
        verifyOneRequest();
    }

    @Test
    void doesNotFollowRedirectOrFallBackToResponses() {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH)).willReturn(aResponse()
            .withStatus(302)
            .withHeader("Location", WIRE_MOCK.baseUrl() + RESPONSES_PATH)));
        WIRE_MOCK.stubFor(post(urlPathEqualTo(RESPONSES_PATH))
            .willReturn(jsonResponse(200, validChatResponse(validContent()))));

        var outcome = client.extract(command());

        assertThat(outcome.errorCode())
            .isEqualTo(ConditionExtractionErrorCode.PROVIDER_INVALID_REQUEST);
        verifyOneRequest();
        WIRE_MOCK.verify(0, postRequestedFor(urlPathEqualTo(RESPONSES_PATH)));
    }

    @Test
    void enforcesResponseSizeAndTimeoutWithoutLeakingProviderData() {
        EliceConditionExtractionClient smallClient = EliceConditionExtractionClient.createForTesting(
            URI.create(WIRE_MOCK.baseUrl() + "/condition-deployment/v1"),
            TOKEN,
            EliceConditionExtractionClient.MODEL,
            Duration.ofSeconds(1),
            Duration.ofMillis(100),
            128
        );
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH)).willReturn(aResponse()
            .withStatus(200)
            .withHeader("Content-Type", "application/json")
            .withBody("x".repeat(129))));

        assertThat(smallClient.extract(command()).errorCode())
            .isEqualTo(ConditionExtractionErrorCode.PROVIDER_INVALID_RESPONSE);
        verifyOneRequest();

        WIRE_MOCK.resetAll();
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH)).willReturn(aResponse()
            .withStatus(200)
            .withFixedDelay(500)
            .withHeader("Content-Type", "application/json")
            .withBody(validChatResponse(validContent()))));

        assertThat(smallClient.extract(command()).errorCode())
            .isEqualTo(ConditionExtractionErrorCode.PROVIDER_UNAVAILABLE);
        verifyOneRequest();
    }

    private void verifyRequestBody() throws Exception {
        JsonNode request = OBJECT_MAPPER.readTree(WIRE_MOCK.getAllServeEvents().get(0)
            .getRequest().getBody());
        assertThat(request.path("model").asText()).isEqualTo(EliceConditionExtractionClient.MODEL);
        assertThat(request.path("stream").asBoolean()).isFalse();
        assertThat(request.path("store").asBoolean()).isFalse();
        assertThat(request.path("temperature").asInt()).isZero();
        assertThat(request.path("max_completion_tokens").asInt()).isEqualTo(600);
        assertThat(request.path("safety_identifier").asText()).isEqualTo(SAFETY_IDENTIFIER);
        assertThat(request.path("tools").isMissingNode()).isTrue();
        assertThat(request.path("messages")).hasSize(2);
        assertThat(request.path("messages").get(0).path("role").asText()).isEqualTo("system");
        assertThat(request.path("messages").get(1).path("role").asText()).isEqualTo("user");
        assertThat(request.path("messages").get(1).path("content").asText())
            .isEqualTo(command().requestText());
        JsonNode format = request.path("response_format");
        assertThat(format.path("type").asText()).isEqualTo("json_schema");
        assertThat(format.path("json_schema").path("strict").asBoolean()).isTrue();
        assertThat(format.path("json_schema").path("schema")
            .path("additionalProperties").asBoolean()).isFalse();
    }

    private static void verifyOneRequest() {
        WIRE_MOCK.verify(exactly(1), postRequestedFor(urlPathEqualTo(CHAT_PATH))
            .withHeader("Authorization", equalTo("Bearer " + TOKEN))
            .withHeader("Accept", equalTo("application/json"))
            .withHeader("Content-Type", equalTo("application/json")));
    }

    private EliceConditionExtractionClient newClient(Duration responseTimeout) {
        return EliceConditionExtractionClient.createForTesting(
            URI.create(WIRE_MOCK.baseUrl() + "/condition-deployment/v1"),
            TOKEN,
            EliceConditionExtractionClient.MODEL,
            Duration.ofSeconds(1),
            responseTimeout,
            EliceConditionExtractionClient.MAX_RESPONSE_BYTES
        );
    }

    private static ExtractionCommand command() {
        return new ExtractionCommand(
            "서울 성수동에서 4명이 조용한 카페를 찾고 흡연은 제외해줘",
            SAFETY_IDENTIFIER
        );
    }

    private static Stream<Arguments> invalidResponses() {
        String content = validContent();
        return Stream.of(
            Arguments.of("malformed envelope", "{not-json"),
            Arguments.of("free text", validChatResponse("not-json")),
            Arguments.of(
                "additional content field",
                validChatResponse(content.replace(
                    "\"warnings\":[]",
                    "\"warnings\":[],\"extra\":true"
                ))
            ),
            Arguments.of(
                "missing required condition field",
                validChatResponse(content.replace("\"partySize\":4,", ""))
            ),
            Arguments.of(
                "out of range party size",
                validChatResponse(content.replace("\"partySize\":4", "\"partySize\":101"))
            ),
            Arguments.of(
                "warning mismatch",
                validChatResponse(content.replace(
                    "\"warnings\":[]",
                    "\"warnings\":[\"BUDGET_NOT_PROVIDED\"]"
                ))
            ),
            Arguments.of("refusal", chatResponse("stop", content, "blocked")),
            Arguments.of("incomplete", chatResponse("length", content, null)),
            Arguments.of(
                "duplicate key",
                validChatResponse(content.replace(
                    "\"locationQuery\":\"서울 성수동\"",
                    "\"locationQuery\":\"부산\",\"locationQuery\":\"서울 성수동\""
                ))
            ),
            Arguments.of("trailing token", validChatResponse(content) + " trailing")
        );
    }

    private static String validContent() {
        return """
            {
              "schemaVersion":"placepick.condition-extraction.v1",
              "condition":{
                "locationQuery":"서울 성수동",
                "placeType":"CAFE",
                "placeTypeDetail":null,
                "partySize":4,
                "budgetPerPersonMin":10000,
                "budgetPerPersonMax":20000,
                "preferences":[{"value":"조용한","priority":8}],
                "exclusions":["흡연"]
              },
              "warnings":[]
            }
            """;
    }

    private static String validChatResponse(String content) {
        return chatResponse("stop", content, null);
    }

    private static String chatResponse(String finishReason, String content, String refusal) {
        String refusalField = refusal == null ? "null" : OBJECT_MAPPER.valueToTree(refusal).toString();
        String escapedContent = OBJECT_MAPPER.valueToTree(content).toString();
        return """
            {
              "id":"chatcmpl-synthetic-condition",
              "object":"chat.completion",
              "created":1783987200,
              "model":"openai/gpt-4.1-mini",
              "choices":[{
                "index":0,
                "message":{"role":"assistant","content":%s,"refusal":%s},
                "finish_reason":"%s"
              }],
              "usage":{"prompt_tokens":100,"completion_tokens":80,"total_tokens":180}
            }
            """.formatted(escapedContent, refusalField, finishReason);
    }

    private static ResponseDefinitionBuilder jsonResponse(int status, String body) {
        return aResponse()
            .withStatus(status)
            .withHeader("Content-Type", "application/json; charset=UTF-8")
            .withBody(body.getBytes(StandardCharsets.UTF_8));
    }
}
