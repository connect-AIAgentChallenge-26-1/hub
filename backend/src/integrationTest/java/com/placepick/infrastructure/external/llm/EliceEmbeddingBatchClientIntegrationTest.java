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
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.placepick.recommendation.embedding.application.port.out.EmbeddingBatchCommand;
import com.placepick.recommendation.embedding.application.port.out.EmbeddingBatchErrorCode;
import com.placepick.recommendation.application.scoring.EmbeddingShadowEvaluationService;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;

class EliceEmbeddingBatchClientIntegrationTest {

    private static final String TOKEN = "synthetic-embedding-token";
    private static final String PATH = "/embedding-deployment/v1/embeddings";
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final WireMockServer WIRE_MOCK = new WireMockServer(
        WireMockConfiguration.options().dynamicPort()
    );

    private EliceEmbeddingBatchClient client;

    @BeforeAll
    static void start() {
        WIRE_MOCK.start();
    }

    @AfterAll
    static void stop() {
        WIRE_MOCK.stop();
    }

    @BeforeEach
    void setUp() {
        WIRE_MOCK.resetAll();
        client = newClient(Duration.ofSeconds(2), EliceEmbeddingBatchClient.MAX_RESPONSE_BYTES);
    }

    @Test
    void sendsOneBoundedBatchAndReturnsOrderedEncapsulatedVectors() throws Exception {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(PATH))
            .willReturn(json(200, validResponse(2))));

        var result = client.embed(command());

        assertThat(result.embedded()).isTrue();
        assertThat(result.vectors()).hasSize(2);
        assertThat(result.vectors()).allSatisfy(vector ->
            assertThat(vector.dimensions()).isEqualTo(EliceEmbeddingBatchClient.DIMENSIONS)
        );
        assertThat(result.toString()).contains("vectors=<redacted>")
            .doesNotContain("0.125");

        JsonNode request = OBJECT_MAPPER.readTree(
            WIRE_MOCK.getAllServeEvents().get(0).getRequest().getBody()
        );
        assertThat(request.path("model").asText()).isEqualTo(EliceEmbeddingBatchClient.MODEL);
        assertThat(request.path("input")).hasSize(2);
        assertThat(request.path("input").get(0).asText()).isEqualTo("조용한");
        assertThat(request.path("input").get(1).asText()).isEqualTo("차분한 좌석");
        assertThat(request.path("encoding_format").asText()).isEqualTo("float");
        verifyOneRequest();
    }

    @Test
    void evaluatesTheCompleteVersionedShadowCorpusThroughOneRealAdapterBatch()
        throws Exception {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(PATH))
            .willReturn(json(200, validResponse(40))));

        var result = new EmbeddingShadowEvaluationService(client).evaluate();

        assertThat(result.status())
            .isEqualTo(
                com.placepick.recommendation.embedding.domain
                    .EmbeddingShadowEvaluationResult.Status.SUCCEEDED
            );
        assertThat(result.providerCalls()).isEqualTo(1);
        assertThat(result.metrics()).isPresent();
        JsonNode request = OBJECT_MAPPER.readTree(
            WIRE_MOCK.getAllServeEvents().get(0).getRequest().getBody()
        );
        assertThat(request.path("input")).hasSize(40);
        verifyOneRequest();
    }

    @ParameterizedTest
    @CsvSource({
        "400, INVALID_REQUEST",
        "401, AUTHENTICATION_FAILED",
        "403, AUTHENTICATION_FAILED",
        "429, RATE_LIMITED",
        "503, PROVIDER_UNAVAILABLE"
    })
    void normalizesHttpFailuresWithoutRetry(
        int status,
        EmbeddingBatchErrorCode expected
    ) {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(PATH)).willReturn(aResponse()
            .withStatus(status)
            .withHeader("Content-Type", "application/json")
            .withBody("{\"secret\":\"must-not-escape\"}")));

        var result = client.embed(command());

        assertThat(result.errorCode()).isEqualTo(expected);
        assertThat(result.vectors()).isEmpty();
        assertThat(result.toString()).doesNotContain("must-not-escape", TOKEN);
        verifyOneRequest();
    }

    @ParameterizedTest(name = "[{index}] rejects {0}")
    @MethodSource("invalidResponses")
    void rejectsInvalidSchemaWithoutReturningPartialVectors(String name, String response) {
        WIRE_MOCK.stubFor(post(urlPathEqualTo(PATH)).willReturn(json(200, response)));

        var result = client.embed(command());

        assertThat(result.errorCode()).as(name)
            .isEqualTo(EmbeddingBatchErrorCode.INVALID_RESPONSE);
        assertThat(result.vectors()).isEmpty();
        verifyOneRequest();
    }

    @Test
    void rejectsOversizedAndTimedOutResponsesWithoutRetry() {
        EliceEmbeddingBatchClient small = newClient(Duration.ofMillis(100), 128);
        WIRE_MOCK.stubFor(post(urlPathEqualTo(PATH)).willReturn(aResponse()
            .withStatus(200)
            .withHeader("Content-Type", "application/json")
            .withBody("x".repeat(129))));

        assertThat(small.embed(command()).errorCode())
            .isEqualTo(EmbeddingBatchErrorCode.INVALID_RESPONSE);
        verifyOneRequest();

        WIRE_MOCK.resetAll();
        WIRE_MOCK.stubFor(post(urlPathEqualTo(PATH)).willReturn(aResponse()
            .withStatus(200)
            .withFixedDelay(500)
            .withHeader("Content-Type", "application/json")
            .withBody(validResponse(2))));

        assertThat(small.embed(command()).errorCode())
            .isEqualTo(EmbeddingBatchErrorCode.PROVIDER_UNAVAILABLE);
        verifyOneRequest();
    }

    private EliceEmbeddingBatchClient newClient(Duration responseTimeout, int maxBytes) {
        return EliceEmbeddingBatchClient.createForTesting(
            URI.create(WIRE_MOCK.baseUrl() + "/embedding-deployment/v1"),
            TOKEN,
            EliceEmbeddingBatchClient.MODEL,
            Duration.ofSeconds(1),
            responseTimeout,
            maxBytes
        );
    }

    private static EmbeddingBatchCommand command() {
        return new EmbeddingBatchCommand(List.of("조용한", "차분한 좌석"));
    }

    private static void verifyOneRequest() {
        WIRE_MOCK.verify(exactly(1), postRequestedFor(urlPathEqualTo(PATH))
            .withHeader("Authorization", equalTo("Bearer " + TOKEN))
            .withHeader("Accept", equalTo("application/json"))
            .withHeader("Content-Type", equalTo("application/json")));
    }

    private static Stream<Arguments> invalidResponses() {
        return Stream.of(
            Arguments.of("malformed json", "{not-json"),
            Arguments.of(
                "wrong model",
                validResponse(2).replace(
                    "\"model\":\"openai/text-embedding-3-small\"",
                    "\"model\":\"unapproved-model\""
                )
            ),
            Arguments.of(
                "duplicate index",
                validResponse(2).replace("\"index\":1", "\"index\":0")
            ),
            Arguments.of(
                "wrong vector size",
                validResponse(2).replace(vector(), "0.1,0.2")
            ),
            Arguments.of(
                "usage mismatch",
                validResponse(2).replace("\"total_tokens\":4", "\"total_tokens\":5")
            )
        );
    }

    private static String validResponse(int count) {
        StringBuilder data = new StringBuilder();
        for (int index = 0; index < count; index++) {
            if (index > 0) {
                data.append(',');
            }
            data.append("""
                {"object":"embedding","index":%d,"embedding":[%s]}
                """.formatted(index, vector()).strip());
        }
        return """
            {
              "object":"list",
              "model":"openai/text-embedding-3-small",
              "data":[%s],
              "usage":{"prompt_tokens":4,"total_tokens":4}
            }
            """.formatted(data);
    }

    private static String vector() {
        return "0.125,".repeat(EliceEmbeddingBatchClient.DIMENSIONS - 1) + "0.125";
    }

    private static com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder json(
        int status,
        String body
    ) {
        return aResponse()
            .withStatus(status)
            .withHeader("Content-Type", "application/json; charset=UTF-8")
            .withBody(body);
    }
}
