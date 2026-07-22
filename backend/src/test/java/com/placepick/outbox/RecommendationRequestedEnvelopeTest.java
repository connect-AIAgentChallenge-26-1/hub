package com.placepick.outbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RecommendationRequestedEnvelopeTest {

    @Test
    void acceptsLegacyV1AndW3cV2WithoutChangingTheSemanticEventType() {
        UUID eventId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        var legacy = new RecommendationRequestedEnvelope(
            eventId,
            RecommendationRequestedEnvelope.EVENT_TYPE,
            1,
            jobId,
            "key",
            Instant.parse("2026-07-22T00:00:00Z"),
            "legacy-correlation",
            new RecommendationRequestedEnvelope.Payload(jobId)
        );
        var current = new RecommendationRequestedEnvelope(
            eventId,
            RecommendationRequestedEnvelope.EVENT_TYPE,
            2,
            jobId,
            "key",
            Instant.parse("2026-07-22T00:00:00Z"),
            "0123456789abcdef0123456789abcdef",
            "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
            "vendor=value",
            new RecommendationRequestedEnvelope.Payload(jobId)
        );

        assertThat(legacy.traceparent()).isNull();
        assertThat(current.version()).isEqualTo(2);
        assertThat(current.eventType()).isEqualTo(RecommendationRequestedEnvelope.EVENT_TYPE);
    }

    @Test
    void rejectsMalformedTraceContextBeforeRedisDelivery() {
        UUID jobId = UUID.randomUUID();
        assertThatThrownBy(() -> new RecommendationRequestedEnvelope(
            UUID.randomUUID(),
            RecommendationRequestedEnvelope.EVENT_TYPE,
            2,
            jobId,
            "key",
            Instant.now(),
            "trace",
            "not-a-traceparent",
            null,
            new RecommendationRequestedEnvelope.Payload(jobId)
        )).isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("traceparent");
    }
}
