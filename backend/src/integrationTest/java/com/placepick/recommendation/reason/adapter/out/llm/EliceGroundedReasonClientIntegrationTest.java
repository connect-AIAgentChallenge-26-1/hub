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
import com.placepick.recommendation.application.port.out.LlmFailureStage;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationDiagnosticCode;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationErrorCode;
import com.placepick.recommendation.reason.domain.ReasonEvidence;
import com.placepick.recommendation.reason.domain.ReasonEvidenceType;
import com.placepick.recommendation.reason.domain.ReasonPlaceContext;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Set;
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
    void generatesOneCandidateResultAndSendsOnlyOpaqueSlotAndAllowlistedClaims()
        throws Exception {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH))
            .willReturn(jsonResponse(200, validChatResponse(validContent()))));

        var outcome = client.generate(command());

        assertThat(outcome.generated()).isTrue();
        assertThat(outcome.result().schemaVersion())
            .isEqualTo("placepick.reason-statements.v3");
        assertThat(outcome.result().slot()).isEqualTo("p1");
        assertThat(outcome.result().statements()).singleElement().satisfies(statement -> {
            assertThat(statement.text()).contains("블로그 검색 결과", "조용한 공간");
            assertThat(statement.claimIds()).containsExactly("p1-c2");
        });
        verifyOneRequest();
        verifyRequestBody();
        WIRE_MOCK.verify(0, postRequestedFor(urlPathEqualTo(RESPONSES_PATH)));
    }

    @Test
    void acceptsAStatementGroundedByTwoClaimsFromTheSameCandidate() {
        String content = validContent().replace(
            "\"claimIds\":[\"p1-c2\"]",
            "\"claimIds\":[\"p1-c1\",\"p1-c2\"]"
        );
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH))
            .willReturn(jsonResponse(200, validChatResponse(content))));

        var outcome = client.generate(command());

        assertThat(outcome.generated()).isTrue();
        assertThat(outcome.result().statements().get(0).claimIds())
            .containsExactly("p1-c1", "p1-c2");
        verifyOneRequest();
    }

    @ParameterizedTest
    @CsvSource({
        "400, PROVIDER_INVALID_REQUEST, UPSTREAM_INVALID_REQUEST",
        "401, PROVIDER_AUTHENTICATION_FAILED, UPSTREAM_AUTHENTICATION_FAILED",
        "403, PROVIDER_AUTHENTICATION_FAILED, UPSTREAM_AUTHENTICATION_FAILED",
        "429, PROVIDER_RATE_LIMITED, UPSTREAM_RATE_LIMITED",
        "503, PROVIDER_UNAVAILABLE, UPSTREAM_UNAVAILABLE"
    })
    void normalizesHttpFailuresWithoutRetry(
        int status,
        ReasonGenerationErrorCode expected,
        ReasonGenerationDiagnosticCode expectedDiagnostic
    ) {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH)).willReturn(aResponse()
            .withStatus(status)
            .withHeader("Content-Type", "application/json")
            .withBody("{\"secret\":\"must-not-escape\"}")));

        var outcome = client.generate(command());

        assertThat(outcome.errorCode()).isEqualTo(expected);
        assertThat(outcome.result()).isNull();
        assertThat(outcome.diagnosticCode()).isEqualTo(expectedDiagnostic);
        assertThat(outcome.failureStage()).isEqualTo(LlmFailureStage.HTTP_STATUS);
        assertThat(outcome.retryAfter()).isEmpty();
        assertThat(outcome.toString()).doesNotContain("must-not-escape");
        verifyOneRequest();
    }

    @ParameterizedTest
    @CsvSource({"429,7", "503,13"})
    void preservesSafeRetryAfterForRetryableProviderStatuses(int status, long seconds) {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH)).willReturn(aResponse()
            .withStatus(status)
            .withHeader("Content-Type", "application/json")
            .withHeader("Retry-After", Long.toString(seconds))));

        var outcome = client.generate(command());

        assertThat(outcome.retryAfter()).contains(Duration.ofSeconds(seconds));
        verifyOneRequest();
    }

    @ParameterizedTest
    @CsvSource({"400,9", "429,-1", "429,86401", "503,not-a-duration"})
    void ignoresRetryAfterOnNonRetryableOrUnsafeValues(int status, String value) {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH)).willReturn(aResponse()
            .withStatus(status)
            .withHeader("Content-Type", "application/json")
            .withHeader("Retry-After", value)));

        var outcome = client.generate(command());

        assertThat(outcome.retryAfter()).isEmpty();
        verifyOneRequest();
    }

    @ParameterizedTest(name = "[{index}] {0}")
    @MethodSource("diagnosticResponses")
    void distinguishesEnvelopeRootSlotAndCandidateClaimDiagnostics(
        String name,
        String response,
        ReasonGenerationDiagnosticCode expected,
        LlmFailureStage expectedStage
    ) {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH))
            .willReturn(jsonResponse(200, response)));

        var outcome = client.generate(command());

        assertThat(outcome.errorCode()).as(name)
            .isEqualTo(ReasonGenerationErrorCode.PROVIDER_INVALID_RESPONSE);
        assertThat(outcome.diagnosticCode()).as(name).isEqualTo(expected);
        assertThat(outcome.failureStage()).as(name).isEqualTo(expectedStage);
        assertThat(outcome.toString())
            .doesNotContain("p1-c1", "p1-c2", "카페 1", "조용한 공간");
        verifyOneRequest();
    }

    @ParameterizedTest(name = "[{index}] rejects {0}")
    @MethodSource("invalidResponses")
    void rejectsMalformedIncompleteOrClosedSchemaViolations(String name, String response) {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH))
            .willReturn(jsonResponse(200, response)));

        var outcome = client.generate(command());

        assertThat(outcome.errorCode()).as(name)
            .isEqualTo(ReasonGenerationErrorCode.PROVIDER_INVALID_RESPONSE);
        assertThat(outcome.result()).isNull();
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
    void enforcesResponseSizeAndTimeoutWithoutTransportRetry() {
        EliceGroundedReasonClient smallClient = newClient(Duration.ofMillis(100), 128);
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH)).willReturn(aResponse()
            .withStatus(200)
            .withHeader("Content-Type", "application/json")
            .withBody("x".repeat(129))));

        var oversized = smallClient.generate(command());
        assertThat(oversized.errorCode())
            .isEqualTo(ReasonGenerationErrorCode.PROVIDER_INVALID_RESPONSE);
        assertThat(oversized.diagnosticCode())
            .isEqualTo(ReasonGenerationDiagnosticCode.REASON_HTTP_RESPONSE_TOO_LARGE);
        assertThat(oversized.failureStage()).isEqualTo(LlmFailureStage.RESPONSE_SIZE);
        verifyOneRequest();

        WIRE_MOCK.resetAll();
        WIRE_MOCK.stubFor(post(urlPathEqualTo(CHAT_PATH)).willReturn(aResponse()
            .withStatus(200)
            .withFixedDelay(500)
            .withHeader("Content-Type", "application/json")
            .withBody(validChatResponse(validContent()))));

        var timedOut = smallClient.generate(command());
        assertThat(timedOut.errorCode())
            .isEqualTo(ReasonGenerationErrorCode.PROVIDER_UNAVAILABLE);
        assertThat(timedOut.failureStage()).isEqualTo(LlmFailureStage.TRANSPORT);
        verifyOneRequest();
    }

    private void verifyRequestBody() throws Exception {
        JsonNode request = OBJECT_MAPPER.readTree(WIRE_MOCK.getAllServeEvents().get(0)
            .getRequest().getBody());
        assertThat(request.path("model").asText()).isEqualTo(EliceGroundedReasonClient.MODEL);
        assertThat(request.path("stream").asBoolean()).isFalse();
        assertThat(request.path("store").asBoolean()).isFalse();
        assertThat(request.path("temperature").asInt()).isZero();
        assertThat(request.path("max_completion_tokens").asInt())
            .isEqualTo(EliceGroundedReasonClient.MAX_COMPLETION_TOKENS);
        assertThat(request.path("tools").isMissingNode()).isTrue();
        assertThat(request.path("messages")).hasSize(2);

        JsonNode data = OBJECT_MAPPER.readTree(
            request.path("messages").get(1).path("content").asText()
        );
        assertThat(fieldNames(data))
            .containsExactlyInAnyOrder("condition", "slot", "name", "category", "claims");
        assertThat(data.path("slot").asText()).isEqualTo("p1");
        assertThat(fieldNames(data.path("condition"))).containsExactlyInAnyOrder(
            "locationQuery",
            "placeType",
            "placeTypeDetail",
            "preferences",
            "exclusions"
        );
        assertThat(data.path("condition").path("locationQuery").asText())
            .isEqualTo("서울 강남구");
        assertThat(data.path("condition").path("placeType").asText()).isEqualTo("CAFE");
        assertThat(data.path("condition").path("preferences")).hasSize(1);
        assertThat(data.path("claims")).hasSize(2);
        assertThat(fieldNames(data.path("claims").get(0)))
            .containsExactlyInAnyOrder("claimId", "type", "title", "summary");
        assertThat(data.toString())
            .doesNotContain(
                "00000000-0000-4000-8000-000000000001",
                "local-sensitive",
                "blog-sensitive",
                "placeId",
                "evidenceId",
                "score",
                "rank",
                "requestText",
                "partySize",
                "budgetPerPersonMin",
                "budgetPerPersonMax",
                TOKEN
            );

        JsonNode format = request.path("response_format");
        assertThat(format.path("type").asText()).isEqualTo("json_schema");
        assertThat(format.path("json_schema").path("strict").asBoolean()).isTrue();
        assertThat(format.path("json_schema").path("name").asText())
            .isEqualTo("placepick_reason_statements_v3");
        JsonNode schema = format.path("json_schema").path("schema");
        assertThat(schema.path("additionalProperties").asBoolean()).isFalse();
        assertThat(fieldNames(schema.path("properties")))
            .containsExactlyInAnyOrder("schemaVersion", "slot", "statements");
        JsonNode statement = schema.path("properties").path("statements").path("items");
        assertThat(statement.path("additionalProperties").asBoolean()).isFalse();
        JsonNode claimIds = statement.path("properties").path("claimIds");
        assertThat(claimIds.path("items").path("enum"))
            .extracting(JsonNode::asText)
            .containsExactly("p1-c1", "p1-c2");
        assertThat(claimIds.path("minItems").asInt()).isOne();
        assertThat(claimIds.path("maxItems").asInt()).isEqualTo(3);
    }

    private static Set<String> fieldNames(JsonNode node) {
        Set<String> fields = new java.util.LinkedHashSet<>();
        node.fieldNames().forEachRemaining(fields::add);
        return fields;
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
                "서울 강남구",
                PlaceType.CAFE,
                null,
                4,
                10_000,
                30_000,
                List.of(new Preference("조용한", 8)),
                List.of("흡연")
            ),
            1,
            place
        );
    }

    private static Stream<Arguments> diagnosticResponses() {
        return Stream.of(
            Arguments.of(
                "malformed envelope",
                "{not-json",
                ReasonGenerationDiagnosticCode.REASON_ENVELOPE_JSON,
                LlmFailureStage.JSON
            ),
            Arguments.of(
                "root schema",
                validChatResponse(validContent().replace(
                    "\"slot\":\"p1\"",
                    "\"extra\":true,\"slot\":\"p1\""
                )),
                ReasonGenerationDiagnosticCode.REASON_CONTENT_ROOT_SCHEMA,
                LlmFailureStage.CHAT_CONTENT_SCHEMA
            ),
            Arguments.of(
                "slot reference",
                validChatResponse(validContent().replace("\"slot\":\"p1\"", "\"slot\":\"p2\"")),
                ReasonGenerationDiagnosticCode.REASON_CONTENT_SLOT_REFERENCE,
                LlmFailureStage.CHAT_CONTENT_SCHEMA
            ),
            Arguments.of(
                "claim ownership",
                validChatResponse(validContent().replace("p1-c2", "p2-c1")),
                ReasonGenerationDiagnosticCode.REASON_CONTENT_CLAIM_OWNERSHIP,
                LlmFailureStage.CHAT_CONTENT_SCHEMA
            )
        );
    }

    private static Stream<Arguments> invalidResponses() {
        String content = validContent();
        return Stream.of(
            Arguments.of("free text", validChatResponse("not-json")),
            Arguments.of(
                "wrong schema version",
                validChatResponse(content.replace(
                    "placepick.reason-statements.v3",
                    "placepick.reason-statements.v2"
                ))
            ),
            Arguments.of(
                "missing statements",
                validChatResponse("""
                    {
                      "schemaVersion":"placepick.reason-statements.v3",
                      "slot":"p1",
                      "statements":[]
                    }
                    """)
            ),
            Arguments.of(
                "duplicate claim IDs",
                validChatResponse(content.replace(
                    "\"claimIds\":[\"p1-c2\"]",
                    "\"claimIds\":[\"p1-c2\",\"p1-c2\"]"
                ))
            ),
            Arguments.of(
                "oversized statement",
                validChatResponse(content.replace(naturalText(), "카페 ".repeat(60)))
            ),
            Arguments.of(
                "additional statement field",
                validChatResponse(content.replace(
                    "\"claimIds\":[\"p1-c2\"]",
                    "\"claimIds\":[\"p1-c2\"],\"score\":100"
                ))
            ),
            Arguments.of("refusal", chatResponse("stop", content, "blocked")),
            Arguments.of("incomplete", chatResponse("length", content, null)),
            Arguments.of(
                "duplicate key",
                validChatResponse(content.replace(
                    "\"schemaVersion\":\"placepick.reason-statements.v3\"",
                    "\"schemaVersion\":\"wrong\"," +
                        "\"schemaVersion\":\"placepick.reason-statements.v3\""
                ))
            ),
            Arguments.of("trailing token", validChatResponse(content) + " trailing")
        );
    }

    private static String validContent() {
        return """
            {
              "schemaVersion":"placepick.reason-statements.v3",
              "slot":"p1",
              "statements":[{
                "text":"%s",
                "claimIds":["p1-c2"]
              }]
            }
            """.formatted(naturalText());
    }

    private static String naturalText() {
        return "블로그 검색 결과에서 카페 1은 조용한 공간으로 소개되었습니다.";
    }

    private static String validChatResponse(String content) {
        return chatResponse("stop", content, null);
    }

    private static String chatResponse(String finishReason, String content, String refusal) {
        String refusalField = refusal == null
            ? "null"
            : OBJECT_MAPPER.valueToTree(refusal).toString();
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
              "usage":{"prompt_tokens":90,"completion_tokens":40,"total_tokens":130}
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
