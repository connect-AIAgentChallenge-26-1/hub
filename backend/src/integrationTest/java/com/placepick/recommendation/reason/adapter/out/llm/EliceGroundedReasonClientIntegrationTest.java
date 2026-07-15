package com.placepick.recommendation.reason.adapter.out.llm;

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
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import com.placepick.recommendation.reason.application.ReasonStatementPolicy;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationErrorCode;
import com.placepick.recommendation.reason.domain.ReasonEvidence;
import com.placepick.recommendation.reason.domain.ReasonEvidenceType;
import com.placepick.recommendation.reason.domain.ReasonPlaceContext;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;

class EliceGroundedReasonClientIntegrationTest {

    private static final String TOKEN = "synthetic-reason-token";
    private static final String CHAT_PATH = "/reason-deployment/v1/chat/completions";
    private static final String RESPONSES_PATH = "/reason-deployment/v1/responses";
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final WireMockServer WIRE_MOCK = new WireMockServer(
        WireMockConfiguration.options().dynamicPort()
    );

    private EliceGroundedReasonClient client;

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
        client = newClient(Duration.ofSeconds(2), EliceGroundedReasonClient.MAX_RESPONSE_BYTES);
    }

    @Test
    void generatesAnExactTopThreeBatchAndSendsOnlyBoundedGroundingData() throws Exception {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH))
            .willReturn(jsonResponse(200, validChatResponse(validContent()))));

        var outcome = client.generate(command());

        assertThat(outcome.generated()).isTrue();
        assertThat(outcome.batch().places()).hasSize(3);
        assertThat(outcome.batch().places()).allSatisfy(place ->
            assertThat(place.statements()).singleElement().satisfies(statement -> {
                assertThat(statement.text()).contains("조용한 공간");
                assertThat(statement.evidenceIds()).singleElement().asString()
                    .startsWith("e-blog-");
            })
        );
        verifyOneRequest();
        verifyRequestBody();
        WIRE_MOCK.verify(0, postRequestedFor(urlPathEqualTo(RESPONSES_PATH)));
    }

    @Test
    void acceptsANaturalStatementGroundedByTwoEvidenceItems() {
        String content = validContent().replace(
            "\"evidenceIds\":[\"e-blog-1\"]",
            "\"evidenceIds\":[\"local:1\",\"e-blog-1\"]"
        );
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH))
            .willReturn(jsonResponse(200, validChatResponse(content))));

        var outcome = client.generate(command());

        assertThat(outcome.generated()).isTrue();
        assertThat(outcome.batch().places().get(0).statements().get(0).evidenceIds())
            .containsExactly("local:1", "e-blog-1");
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
    void normalizesHttpFailuresWithoutRetry(
        int status,
        ReasonGenerationErrorCode expected
    ) {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH)).willReturn(aResponse()
            .withStatus(status)
            .withHeader("Content-Type", "application/json")
            .withBody("{\"secret\":\"must-not-escape\"}")));

        var outcome = client.generate(command());

        assertThat(outcome.errorCode()).isEqualTo(expected);
        assertThat(outcome.batch()).isNull();
        verifyOneRequest();
    }

    @ParameterizedTest(name = "[{index}] rejects {0}")
    @MethodSource("invalidResponses")
    void rejectsMalformedIncompleteSchemaOrReferenceDrift(String name, String response) {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH))
            .willReturn(jsonResponse(200, response)));

        var outcome = client.generate(command());

        assertThat(outcome.errorCode()).as(name)
            .isEqualTo(ReasonGenerationErrorCode.PROVIDER_INVALID_RESPONSE);
        assertThat(outcome.batch()).isNull();
        verifyOneRequest();
    }

    @Test
    void doesNotFollowRedirectOrFallBackToResponses() {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH)).willReturn(aResponse()
            .withStatus(302)
            .withHeader("Location", WIRE_MOCK.baseUrl() + RESPONSES_PATH)));
        WIRE_MOCK.stubFor(post(urlPathEqualTo(RESPONSES_PATH))
            .willReturn(jsonResponse(200, validChatResponse(validContent()))));

        var outcome = client.generate(command());

        assertThat(outcome.errorCode())
            .isEqualTo(ReasonGenerationErrorCode.PROVIDER_INVALID_REQUEST);
        verifyOneRequest();
        WIRE_MOCK.verify(0, postRequestedFor(urlPathEqualTo(RESPONSES_PATH)));
    }

    @Test
    void enforcesResponseSizeAndTimeout() {
        EliceGroundedReasonClient smallClient = newClient(Duration.ofMillis(100), 128);
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH)).willReturn(aResponse()
            .withStatus(200)
            .withHeader("Content-Type", "application/json")
            .withBody("x".repeat(129))));

        assertThat(smallClient.generate(command()).errorCode())
            .isEqualTo(ReasonGenerationErrorCode.PROVIDER_INVALID_RESPONSE);
        verifyOneRequest();

        WIRE_MOCK.resetAll();
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH)).willReturn(aResponse()
            .withStatus(200)
            .withFixedDelay(500)
            .withHeader("Content-Type", "application/json")
            .withBody(validChatResponse(validContent()))));

        assertThat(smallClient.generate(command()).errorCode())
            .isEqualTo(ReasonGenerationErrorCode.PROVIDER_UNAVAILABLE);
        verifyOneRequest();
    }

    private void verifyRequestBody() throws Exception {
        JsonNode request = OBJECT_MAPPER.readTree(WIRE_MOCK.getAllServeEvents().get(0)
            .getRequest().getBody());
        assertThat(request.path("model").asText()).isEqualTo(EliceGroundedReasonClient.MODEL);
        assertThat(request.path("stream").asBoolean()).isFalse();
        assertThat(request.path("store").asBoolean()).isFalse();
        assertThat(request.path("temperature").asInt()).isZero();
        assertThat(request.path("max_completion_tokens").asInt()).isEqualTo(800);
        assertThat(request.path("tools").isMissingNode()).isTrue();
        assertThat(request.path("messages")).hasSize(2);
        JsonNode data = OBJECT_MAPPER.readTree(
            request.path("messages").get(1).path("content").asText()
        );
        assertThat(data.path("places")).hasSize(3);
        assertThat(data.toString())
            .doesNotContain("sourceUrl", "score", "rank", "cautions", "shareText")
            .doesNotContain(TOKEN);
        JsonNode format = request.path("response_format");
        assertThat(format.path("type").asText()).isEqualTo("json_schema");
        assertThat(format.path("json_schema").path("strict").asBoolean()).isTrue();
        assertThat(format.path("json_schema").path("schema")
            .path("additionalProperties").asBoolean()).isFalse();
        JsonNode statementProperties = format.path("json_schema").path("schema")
            .path("properties").path("places").path("items")
            .path("properties").path("statements").path("items").path("properties");
        assertThat(statementProperties.path("text").path("type").asText())
            .isEqualTo("string");
        assertThat(statementProperties.path("text").path("enum").isMissingNode()).isTrue();
        assertThat(statementProperties.path("evidenceIds").path("minItems").asInt()).isOne();
        assertThat(statementProperties.path("evidenceIds").path("maxItems").asInt()).isEqualTo(3);
        assertThat(statementProperties.path("evidenceIds").path("uniqueItems").isMissingNode())
            .isTrue();
    }

    private static void verifyOneRequest() {
        WIRE_MOCK.verify(exactly(1), postRequestedFor(urlPathEqualTo(CHAT_PATH))
            .withHeader("Authorization", equalTo("Bearer " + TOKEN))
            .withHeader("Accept", equalTo("application/json"))
            .withHeader("Content-Type", equalTo("application/json")));
    }

    private EliceGroundedReasonClient newClient(Duration responseTimeout, int maximumBytes) {
        return EliceGroundedReasonClient.createForTesting(
            URI.create(WIRE_MOCK.baseUrl() + "/reason-deployment/v1"),
            TOKEN,
            EliceGroundedReasonClient.MODEL,
            Duration.ofSeconds(1),
            responseTimeout,
            maximumBytes
        );
    }

    private static ReasonGenerationCommand command() {
        List<ReasonPlaceContext> places = java.util.stream.IntStream.rangeClosed(1, 3)
            .mapToObj(index -> new ReasonPlaceContext(
                placeId(index),
                "카페 " + index,
                "카페>디저트",
                List.of(
                    new ReasonEvidence(
                        "local:" + index,
                        ReasonEvidenceType.LOCAL,
                        "카페 " + index,
                        "서울 강남구 카페"
                    ),
                    new ReasonEvidence(
                        "e-blog-" + index,
                        ReasonEvidenceType.BLOG,
                        "카페 " + index + " 방문 기록",
                        "카페 " + index + " 조용한 공간"
                    )
                )
            )).toList();
        return new ReasonGenerationCommand(
            new ConfirmedRecommendationCondition(
                "서울 강남구",
                PlaceType.CAFE,
                null,
                4,
                10_000,
                30_000,
                List.of(new Preference("조용한", 8)),
                List.of("흡연")
            ),
            places
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
                    "\"places\":[",
                    "\"extra\":true,\"places\":["
                ))
            ),
            Arguments.of(
                "missing place",
                validChatResponse(content.replace(placeJson(3), ""))
            ),
            Arguments.of(
                "duplicate place",
                validChatResponse(content.replace(placeId(3).toString(), placeId(2).toString()))
            ),
            Arguments.of(
                "cross-place evidence",
                validChatResponse(content.replaceFirst("e-blog-1", "e-blog-2"))
            ),
            Arguments.of(
                "free claim sharing only the place name",
                validChatResponse(content.replace(
                    naturalText(1),
                    "카페 1에는 루프탑이 있습니다"
                ))
            ),
            Arguments.of(
                "unsupported price claim",
                validChatResponse(content.replace(
                    naturalText(1),
                    "카페 1의 가격은 10000원입니다"
                ))
            ),
            Arguments.of(
                "oversized statement",
                validChatResponse(content.replace(
                    naturalText(1),
                    "카페 ".repeat(60)
                ))
            ),
            Arguments.of(
                "local text citing blog evidence",
                validChatResponse(content.replace(
                    naturalText(1),
                    ReasonStatementPolicy.LOCAL_STATEMENT_TEXT
                ))
            ),
            Arguments.of(
                "duplicate evidence IDs",
                validChatResponse(content.replace(
                    "\"evidenceIds\":[\"e-blog-1\"]",
                    "\"evidenceIds\":[\"e-blog-1\",\"e-blog-1\"]"
                ))
            ),
            Arguments.of(
                "additional statement field",
                validChatResponse(content.replace(
                    "\"evidenceIds\":[\"e-blog-1\"]",
                    "\"evidenceIds\":[\"e-blog-1\"],\"score\":100"
                ))
            ),
            Arguments.of("refusal", chatResponse("stop", content, "blocked")),
            Arguments.of("incomplete", chatResponse("length", content, null)),
            Arguments.of(
                "duplicate key",
                validChatResponse(content.replace(
                    "\"schemaVersion\":\"placepick.reason-statements.v2\"",
                    "\"schemaVersion\":\"wrong\",\"schemaVersion\":\"placepick.reason-statements.v2\""
                ))
            ),
            Arguments.of("trailing token", validChatResponse(content) + " trailing")
        );
    }

    private static String validContent() {
        return """
            {
              "schemaVersion":"placepick.reason-statements.v2",
              "places":[
            %s%s%s  ]
            }
            """.formatted(placeJson(1), placeJson(2), placeJson(3));
    }

    private static String placeJson(int index) {
        String suffix = index < 3 ? ",\n" : "\n";
        return """
                {"placeId":"%s","statements":[
                  {"text":"%s","evidenceIds":["e-blog-%d"]}
                ]}%s""".formatted(
            placeId(index),
            naturalText(index),
            index,
            suffix
        );
    }

    private static String naturalText(int index) {
        return "카페 " + index + "은 블로그에서 조용한 공간으로 소개되었습니다.";
    }

    private static UUID placeId(int index) {
        return UUID.fromString("00000000-0000-4000-8000-00000000000" + index);
    }

    private static String validChatResponse(String content) {
        return chatResponse("stop", content, null);
    }

    private static String chatResponse(String finishReason, String content, String refusal) {
        String refusalField = refusal == null ? "null" : OBJECT_MAPPER.valueToTree(refusal).toString();
        String escapedContent = OBJECT_MAPPER.valueToTree(content).toString();
        return """
            {
              "id":"chatcmpl-synthetic-reason",
              "object":"chat.completion",
              "created":1783987200,
              "model":"openai/gpt-4.1-mini",
              "choices":[{
                "index":0,
                "message":{"role":"assistant","content":%s,"refusal":%s},
                "finish_reason":"%s"
              }],
              "usage":{"prompt_tokens":160,"completion_tokens":90,"total_tokens":250}
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
