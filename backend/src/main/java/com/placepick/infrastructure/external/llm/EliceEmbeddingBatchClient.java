package com.placepick.infrastructure.external.llm;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.placepick.infrastructure.external.http.DirectProviderRestClientFactory;
import com.placepick.recommendation.embedding.application.port.out.EmbeddingBatchCommand;
import com.placepick.recommendation.embedding.application.port.out.EmbeddingBatchErrorCode;
import com.placepick.recommendation.embedding.application.port.out.EmbeddingBatchOutcome;
import com.placepick.recommendation.embedding.application.port.out.EmbeddingBatchPort;
import com.placepick.recommendation.embedding.domain.EmbeddingVector;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * One-call Elice embedding transport used only by offline shadow evaluation.
 *
 * <p>The adapter is never component-scanned and has no retry. It returns value-encapsulated
 * vectors in memory and never renders the request text, response body, endpoint, or credential.</p>
 */
public final class EliceEmbeddingBatchClient implements EmbeddingBatchPort {

    public static final String MODEL = "openai/text-embedding-3-small";
    public static final int DIMENSIONS = 1_536;

    static final int MAX_BATCH_INPUTS = EmbeddingBatchCommand.MAX_INPUTS;
    static final int MAX_RESPONSE_BYTES = 4 * 1_048_576;
    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    static final Duration RESPONSE_TIMEOUT = Duration.ofSeconds(30);

    private static final String APPROVED_HOST = "mlapi.run";
    private static final String EMBEDDING_SUFFIX = "/embeddings";
    private static final Set<String> APPROVED_RESPONSE_MODELS = Set.of(
        MODEL,
        "text-embedding-3-small"
    );

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final URI endpoint;
    private final int maxResponseBytes;

    private EliceEmbeddingBatchClient(
        RestClient restClient,
        ObjectMapper objectMapper,
        URI endpoint,
        int maxResponseBytes
    ) {
        this.restClient = restClient;
        this.objectMapper = objectMapper;
        this.endpoint = endpoint;
        this.maxResponseBytes = maxResponseBytes;
    }

    public static EliceEmbeddingBatchClient create(
        URI baseUrl,
        String token,
        String model
    ) {
        requireApprovedBaseUrl(baseUrl);
        return createValidated(
            baseUrl,
            token,
            model,
            CONNECT_TIMEOUT,
            RESPONSE_TIMEOUT,
            MAX_RESPONSE_BYTES
        );
    }

    static EliceEmbeddingBatchClient createForTesting(
        URI baseUrl,
        String token,
        String model,
        Duration connectTimeout,
        Duration responseTimeout,
        int maxResponseBytes
    ) {
        requireLoopbackBaseUrl(baseUrl);
        return createValidated(
            baseUrl,
            token,
            model,
            connectTimeout,
            responseTimeout,
            maxResponseBytes
        );
    }

    private static EliceEmbeddingBatchClient createValidated(
        URI baseUrl,
        String token,
        String model,
        Duration connectTimeout,
        Duration responseTimeout,
        int maxResponseBytes
    ) {
        requireCredential(token);
        if (!MODEL.equals(model)) {
            throw new IllegalArgumentException("Embedding model must match the pin.");
        }
        requirePositive(connectTimeout);
        requirePositive(responseTimeout);
        if (maxResponseBytes < 1 || maxResponseBytes > MAX_RESPONSE_BYTES) {
            throw new IllegalArgumentException("Embedding response byte limit is invalid.");
        }
        return new EliceEmbeddingBatchClient(
            DirectProviderRestClientFactory.bearerJson(
                token,
                connectTimeout,
                responseTimeout
            ),
            strictObjectMapper(),
            URI.create(baseUrl.toString() + EMBEDDING_SUFFIX),
            maxResponseBytes
        );
    }

    @Override
    public EmbeddingBatchOutcome embed(EmbeddingBatchCommand command) {
        Objects.requireNonNull(command, "command");
        if (command.inputs().size() > MAX_BATCH_INPUTS) {
            return EmbeddingBatchOutcome.failed(EmbeddingBatchErrorCode.INVALID_REQUEST);
        }
        try {
            ProviderResponse response = execute(Map.of(
                "model", MODEL,
                "input", command.inputs(),
                "encoding_format", "float"
            ));
            return EmbeddingBatchOutcome.embedded(
                parseAndValidate(response.body(), response.status(), command.inputs().size())
            );
        } catch (EmbeddingProviderException exception) {
            return EmbeddingBatchOutcome.failed(exception.errorCode());
        }
    }

    private ProviderResponse execute(Map<String, Object> request) {
        try {
            return restClient.post()
                .uri(endpoint)
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .exchange((ignored, response) -> readResponse(response));
        } catch (EmbeddingProviderException exception) {
            throw exception;
        } catch (ResourceAccessException exception) {
            throw failure(EmbeddingBatchErrorCode.PROVIDER_UNAVAILABLE);
        } catch (RestClientException exception) {
            throw failure(EmbeddingBatchErrorCode.INVALID_RESPONSE);
        }
    }

    private ProviderResponse readResponse(ClientHttpResponse response) throws IOException {
        HttpStatusCode status = response.getStatusCode();
        if (!status.is2xxSuccessful()) {
            throw failure(classifyStatus(status.value()));
        }
        MediaType contentType = response.getHeaders().getContentType();
        if (contentType == null || !MediaType.APPLICATION_JSON.isCompatibleWith(contentType)) {
            throw failure(EmbeddingBatchErrorCode.INVALID_RESPONSE);
        }
        try (InputStream input = response.getBody()) {
            byte[] body = input.readNBytes(maxResponseBytes + 1);
            if (body.length > maxResponseBytes) {
                throw failure(EmbeddingBatchErrorCode.INVALID_RESPONSE);
            }
            return new ProviderResponse(status.value(), body);
        }
    }

    private List<EmbeddingVector> parseAndValidate(
        byte[] body,
        int status,
        int expectedCount
    ) {
        try {
            JsonNode root = objectMapper.readTree(body);
            if (root == null || !root.isObject() ||
                !"list".equals(text(root, "object")) ||
                !APPROVED_RESPONSE_MODELS.contains(text(root, "model"))) {
                throw invalidResponse();
            }
            JsonNode data = root.get("data");
            if (data == null || !data.isArray() || data.size() != expectedCount) {
                throw invalidResponse();
            }

            List<EmbeddingVector> ordered = new ArrayList<>(
                java.util.Collections.nCopies(expectedCount, null)
            );
            Set<Integer> indexes = new HashSet<>();
            for (JsonNode item : data) {
                if (item == null || !item.isObject() ||
                    !"embedding".equals(text(item, "object")) ||
                    !item.path("index").canConvertToInt()) {
                    throw invalidResponse();
                }
                int index = item.path("index").intValue();
                if (index < 0 || index >= expectedCount || !indexes.add(index)) {
                    throw invalidResponse();
                }
                JsonNode vector = item.get("embedding");
                if (vector == null || !vector.isArray() || vector.size() != DIMENSIONS) {
                    throw invalidResponse();
                }
                double[] values = new double[DIMENSIONS];
                for (int dimension = 0; dimension < DIMENSIONS; dimension++) {
                    JsonNode value = vector.get(dimension);
                    if (value == null || !value.isNumber()) {
                        throw invalidResponse();
                    }
                    values[dimension] = value.doubleValue();
                    if (!Double.isFinite(values[dimension])) {
                        throw invalidResponse();
                    }
                }
                ordered.set(index, new EmbeddingVector(values));
            }
            if (ordered.stream().anyMatch(Objects::isNull)) {
                throw invalidResponse();
            }
            validateUsage(root.get("usage"), status);
            return List.copyOf(ordered);
        } catch (JsonProcessingException exception) {
            throw invalidResponse();
        } catch (IOException exception) {
            throw invalidResponse();
        } catch (IllegalArgumentException exception) {
            throw invalidResponse();
        }
    }

    private static void validateUsage(JsonNode usage, int status) {
        if (usage == null || !usage.isObject() ||
            !usage.path("prompt_tokens").canConvertToInt() ||
            !usage.path("total_tokens").canConvertToInt()) {
            throw invalidResponse();
        }
        int promptTokens = usage.path("prompt_tokens").intValue();
        int totalTokens = usage.path("total_tokens").intValue();
        if (promptTokens < 0 || totalTokens != promptTokens || status < 200 || status >= 300) {
            throw invalidResponse();
        }
    }

    private static EmbeddingBatchErrorCode classifyStatus(int status) {
        if (status == 401 || status == 403) {
            return EmbeddingBatchErrorCode.AUTHENTICATION_FAILED;
        }
        if (status == 429) {
            return EmbeddingBatchErrorCode.RATE_LIMITED;
        }
        if (status >= 500) {
            return EmbeddingBatchErrorCode.PROVIDER_UNAVAILABLE;
        }
        return EmbeddingBatchErrorCode.INVALID_REQUEST;
    }

    private static EmbeddingProviderException invalidResponse() {
        return failure(EmbeddingBatchErrorCode.INVALID_RESPONSE);
    }

    private static EmbeddingProviderException failure(EmbeddingBatchErrorCode errorCode) {
        return new EmbeddingProviderException(errorCode);
    }

    private static ObjectMapper strictObjectMapper() {
        return JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .build();
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value != null && value.isTextual() ? value.textValue() : null;
    }

    private static void requireApprovedBaseUrl(URI baseUrl) {
        if (!approvedBaseUrl(baseUrl)) {
            throw new IllegalArgumentException(
                "Embedding proxy base URL is not an approved origin."
            );
        }
    }

    private static boolean approvedBaseUrl(URI value) {
        if (value == null || !"https".equals(value.getScheme()) ||
            !APPROVED_HOST.equals(value.getHost()) ||
            value.getPort() != -1 || value.getUserInfo() != null ||
            value.getQuery() != null || value.getFragment() != null) {
            return false;
        }
        String[] segments = value.getPath().split("/", -1);
        if (segments.length != 3 || !"v1".equals(segments[2])) {
            return false;
        }
        try {
            return UUID.fromString(segments[1]).toString().equals(segments[1]);
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static void requireLoopbackBaseUrl(URI value) {
        if (value == null || !"http".equals(value.getScheme()) ||
            !Set.of("127.0.0.1", "localhost").contains(value.getHost()) ||
            value.getPort() < 1 || value.getUserInfo() != null ||
            value.getQuery() != null || value.getFragment() != null ||
            value.getPath() == null || !value.getPath().endsWith("/v1")) {
            throw new IllegalArgumentException(
                "Embedding test base URL is not an approved loopback origin."
            );
        }
    }

    private static void requireCredential(String token) {
        if (token == null || token.isBlank() ||
            token.codePoints().anyMatch(Character::isWhitespace) ||
            token.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalStateException("Embedding proxy credential is missing or invalid.");
        }
    }

    private static void requirePositive(Duration duration) {
        if (duration == null || duration.isZero() || duration.isNegative()) {
            throw new IllegalArgumentException("Embedding transport duration is invalid.");
        }
    }

    private record ProviderResponse(int status, byte[] body) {
    }

    private static final class EmbeddingProviderException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        private final EmbeddingBatchErrorCode errorCode;

        private EmbeddingProviderException(EmbeddingBatchErrorCode errorCode) {
            super("Embedding provider contract failed.");
            this.errorCode = Objects.requireNonNull(errorCode, "errorCode");
        }

        private EmbeddingBatchErrorCode errorCode() {
            return errorCode;
        }
    }
}
