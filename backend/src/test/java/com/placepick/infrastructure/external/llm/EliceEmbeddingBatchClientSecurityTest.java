package com.placepick.infrastructure.external.llm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.placepick.recommendation.embedding.application.port.out.EmbeddingBatchCommand;
import java.net.URI;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.stereotype.Component;

class EliceEmbeddingBatchClientSecurityTest {

    private static final URI APPROVED_BASE = URI.create(
        "https://mlapi.run/11111111-1111-4111-8111-111111111111/v1"
    );
    private static final String TOKEN = "synthetic-embedding-token";

    @Test
    void remainsExplicitlyConstructedAndOutsideRuntimeRankingWiring() {
        assertThat(EliceEmbeddingBatchClient.class.isAnnotationPresent(Component.class)).isFalse();
        assertThatCode(() -> EliceEmbeddingBatchClient.create(
            APPROVED_BASE,
            TOKEN,
            EliceEmbeddingBatchClient.MODEL
        )).doesNotThrowAnyException();
    }

    @ParameterizedTest(name = "[{index}] rejects unsafe origin")
    @ValueSource(strings = {
        "http://mlapi.run/11111111-1111-4111-8111-111111111111/v1",
        "https://example.invalid/11111111-1111-4111-8111-111111111111/v1",
        "https://user@mlapi.run/11111111-1111-4111-8111-111111111111/v1",
        "https://mlapi.run/not-a-uuid/v1",
        "https://mlapi.run/11111111-1111-4111-8111-111111111111/v1?secret=x"
    })
    void rejectsUnsafeOriginsWithoutEchoingThem(String candidate) {
        assertThatThrownBy(() -> EliceEmbeddingBatchClient.create(
            URI.create(candidate),
            TOKEN,
            EliceEmbeddingBatchClient.MODEL
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Embedding proxy base URL is not an approved origin.")
            .hasMessageNotContaining(candidate)
            .hasMessageNotContaining(TOKEN);
    }

    @Test
    void rejectsCredentialModelAndBatchDriftWithoutEchoingValues() {
        assertThatThrownBy(() -> EliceEmbeddingBatchClient.create(
            APPROVED_BASE,
            "token with spaces",
            EliceEmbeddingBatchClient.MODEL
        ))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("Embedding proxy credential is missing or invalid.")
            .hasMessageNotContaining("token with spaces");

        assertThatThrownBy(() -> EliceEmbeddingBatchClient.create(
            APPROVED_BASE,
            TOKEN,
            "unapproved-model"
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Embedding model must match the pin.")
            .hasMessageNotContaining("unapproved-model")
            .hasMessageNotContaining(TOKEN);

        assertThatThrownBy(() -> new EmbeddingBatchCommand(
            Collections.nCopies(EmbeddingBatchCommand.MAX_INPUTS + 1, "synthetic")
        )).hasMessage("Embedding batch inputs are outside the contract.");
        assertThatThrownBy(() -> new EmbeddingBatchCommand(List.of("secret\u0000value")))
            .hasMessage("Embedding batch inputs are outside the contract.")
            .hasMessageNotContaining("secret");
    }
}
