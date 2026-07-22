package com.placepick.infrastructure.external.llm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.stereotype.Component;

class EliceConditionExtractionClientSecurityTest {

    private static final URI APPROVED_BASE = URI.create(
        "https://mlapi.run/11111111-1111-4111-8111-111111111111/v1"
    );
    private static final String TOKEN = "synthetic-extraction-token";

    @Test
    void isExplicitlyConstructedAndNotRegisteredAsARuntimeComponent() {
        assertThat(EliceConditionExtractionClient.class.isAnnotationPresent(Component.class))
            .isFalse();
        assertThatCode(() -> EliceConditionExtractionClient.create(
            APPROVED_BASE,
            TOKEN,
            EliceConditionExtractionClient.MODEL
        )).doesNotThrowAnyException();
    }

    @ParameterizedTest(name = "[{index}] rejects an unsafe base URL shape")
    @ValueSource(strings = {
        "http://mlapi.run/11111111-1111-4111-8111-111111111111/v1",
        "https://example.invalid/11111111-1111-4111-8111-111111111111/v1",
        "https://mlapi.run:8443/11111111-1111-4111-8111-111111111111/v1",
        "https://user@mlapi.run/11111111-1111-4111-8111-111111111111/v1",
        "https://mlapi.run/not-a-uuid/v1",
        "https://mlapi.run/11111111-1111-4111-8111-111111111111/v1?secret=x",
        "https://mlapi.run/11111111-1111-4111-8111-111111111111/v1/extra"
    })
    void rejectsUnapprovedOriginsWithoutEchoingInput(String candidate) {
        assertThatThrownBy(() -> EliceConditionExtractionClient.create(
            URI.create(candidate),
            TOKEN,
            EliceConditionExtractionClient.MODEL
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("LLM proxy base URL is not an approved origin.")
            .hasMessageNotContaining(candidate)
            .hasMessageNotContaining(TOKEN);
    }

    @Test
    void rejectsCredentialAndModelDriftWithoutEchoingSecrets() {
        assertThatThrownBy(() -> EliceConditionExtractionClient.create(
            APPROVED_BASE,
            "token with spaces",
            EliceConditionExtractionClient.MODEL
        ))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("LLM proxy credential is missing or invalid.")
            .hasMessageNotContaining("token with spaces");

        assertThatThrownBy(() -> EliceConditionExtractionClient.create(
            APPROVED_BASE,
            TOKEN,
            "unapproved-model"
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Condition extraction model must match the pin.")
            .hasMessageNotContaining(TOKEN)
            .hasMessageNotContaining("unapproved-model");
    }

    @Test
    void schemaRequiresEveryFieldAndForbidsAdditionalPropertiesRecursively() {
        Map<String, Object> schema = EliceConditionExtractionClient.strictConditionSchema();
        JsonNode root = new ObjectMapper().valueToTree(schema);

        assertThat(root.path("additionalProperties").asBoolean()).isFalse();
        assertThat(root.path("required")).hasSize(2);
        assertThat(root.path("properties").has("warnings")).isFalse();
        assertThat(root.path("properties").path("schemaVersion").path("enum").get(0).asText())
            .isEqualTo("placepick.condition-extraction.v1");

        JsonNode condition = root.path("properties").path("condition");
        assertThat(condition.path("additionalProperties").asBoolean()).isFalse();
        assertThat(condition.path("required")).hasSize(8);
        JsonNode preference = condition.path("properties").path("preferences").path("items");
        assertThat(preference.path("additionalProperties").asBoolean()).isFalse();
        assertThat(preference.path("required")).hasSize(2);
        assertThat(condition.path("properties").path("partySize").path("anyOf").get(0)
            .path("maximum").asInt()).isEqualTo(100);
    }

    @Test
    void testFactoryAcceptsOnlyLoopbackAndBoundedTransportSettings() {
        assertThatCode(() -> EliceConditionExtractionClient.createForTesting(
            URI.create("http://127.0.0.1:18090/chat/v1"),
            TOKEN,
            EliceConditionExtractionClient.MODEL,
            Duration.ofSeconds(1),
            Duration.ofSeconds(1),
            1024
        )).doesNotThrowAnyException();

        assertThatThrownBy(() -> EliceConditionExtractionClient.createForTesting(
            URI.create("https://example.invalid/chat/v1"),
            TOKEN,
            EliceConditionExtractionClient.MODEL,
            Duration.ofSeconds(1),
            Duration.ofSeconds(1),
            1024
        )).isInstanceOf(IllegalArgumentException.class)
            .hasMessageNotContaining("example.invalid")
            .hasMessageNotContaining(TOKEN);
    }

    @Test
    void distinguishesRetryableTimeoutsFromStableTransportFailures() {
        assertThat(EliceConditionExtractionClient.transportFailureStage(
            new IllegalStateException(new SocketTimeoutException("synthetic timeout"))
        )).isEqualTo(LlmProviderFailureStage.TRANSPORT_TIMEOUT);
        assertThat(EliceConditionExtractionClient.transportFailureStage(
            new IllegalStateException(new ConnectException("synthetic refusal"))
        )).isEqualTo(LlmProviderFailureStage.TRANSPORT);
    }
}
