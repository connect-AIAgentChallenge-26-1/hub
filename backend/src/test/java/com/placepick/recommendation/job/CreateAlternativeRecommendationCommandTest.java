package com.placepick.recommendation.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class CreateAlternativeRecommendationCommandTest {

    @Test
    void normalizesBoundedOpaqueValues() {
        UUID sessionId = UUID.randomUUID();
        UUID sourceJobId = UUID.randomUUID();

        var command = new CreateAlternativeRecommendationCommand(
            sessionId,
            sourceJobId,
            "  alternative-key  ",
            "  trace-id  "
        );

        assertThat(command.idempotencyKey()).isEqualTo("alternative-key");
        assertThat(command.traceId()).isEqualTo("trace-id");
    }

    @Test
    void rejectsBlankControlAndOversizedValues() {
        UUID sessionId = UUID.randomUUID();
        UUID sourceJobId = UUID.randomUUID();

        assertThatThrownBy(() -> new CreateAlternativeRecommendationCommand(
            sessionId,
            sourceJobId,
            " ",
            "trace"
        )).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new CreateAlternativeRecommendationCommand(
            sessionId,
            sourceJobId,
            "key\nvalue",
            "trace"
        )).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new CreateAlternativeRecommendationCommand(
            sessionId,
            sourceJobId,
            "k".repeat(129),
            "trace"
        )).isInstanceOf(IllegalArgumentException.class);
    }
}
