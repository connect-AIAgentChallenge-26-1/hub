package com.placepick.infrastructure.observability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.placepick.outbox.RecommendationRequestedEnvelope;
import com.placepick.stream.RecommendationStreamRecord;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.context.Scope;
import io.opentelemetry.context.propagation.ContextPropagators;
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.testing.exporter.InMemorySpanExporter;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.export.SimpleSpanProcessor;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class OpenTelemetryRecommendationTraceContextTest {

    @Test
    void restoresTheW3cParentAndCreatesAConsumerChildSpan() {
        InMemorySpanExporter exporter = InMemorySpanExporter.create();
        SdkTracerProvider provider = SdkTracerProvider.builder()
            .addSpanProcessor(SimpleSpanProcessor.create(exporter))
            .build();
        OpenTelemetrySdk telemetry = OpenTelemetrySdk.builder()
            .setTracerProvider(provider)
            .setPropagators(ContextPropagators.create(W3CTraceContextPropagator.getInstance()))
            .build();
        Span parent = telemetry.getTracer("test").spanBuilder("api").startSpan();
        AtomicReference<String> activeTraceId = new AtomicReference<>();

        var context = new OpenTelemetryRecommendationTraceContext(
            telemetry,
            new SafeTelemetryLogger("0123456789abcdef0123456789abcdef01234567", "worker")
        );
        Scope scope = parent.makeCurrent();
        try {
            context.within(record(parent), () ->
                activeTraceId.set(Span.current().getSpanContext().getTraceId())
            );
        } finally {
            scope.close();
            parent.end();
        }
        provider.forceFlush().join(5, java.util.concurrent.TimeUnit.SECONDS);

        try {
            var consumer = exporter.getFinishedSpanItems().stream()
                .filter(span -> "placepick.recommendation.consume".equals(span.getName()))
                .findFirst()
                .orElseThrow();
            assertThat(activeTraceId.get()).isEqualTo(parent.getSpanContext().getTraceId());
            assertThat(consumer.getParentSpanContext().getSpanId())
                .isEqualTo(parent.getSpanContext().getSpanId());
            assertThat(consumer.getAttributes().get(
                AttributeKey.longKey("placepick.envelope.version")
            )).isEqualTo(2L);
        } finally {
            provider.close();
        }
    }

    @Test
    void recordsAndRethrowsUnexpectedWorkerDefects() {
        OpenTelemetrySdk telemetry = OpenTelemetrySdk.builder().build();
        var context = new OpenTelemetryRecommendationTraceContext(
            telemetry,
            new SafeTelemetryLogger("local", "worker")
        );
        RecommendationStreamRecord record = legacyRecord();

        assertThatThrownBy(() -> context.within(record, () -> {
            throw new IllegalStateException("synthetic defect");
        })).isInstanceOf(IllegalStateException.class)
            .hasMessage("synthetic defect");
    }

    private static RecommendationStreamRecord record(Span parent) {
        UUID jobId = UUID.randomUUID();
        String traceparent = "00-" + parent.getSpanContext().getTraceId() + "-"
            + parent.getSpanContext().getSpanId() + "-01";
        return new RecommendationStreamRecord(
            "1-0",
            new RecommendationRequestedEnvelope(
                UUID.randomUUID(),
                RecommendationRequestedEnvelope.EVENT_TYPE,
                2,
                jobId,
                "key",
                Instant.now(),
                parent.getSpanContext().getTraceId(),
                traceparent,
                null,
                new RecommendationRequestedEnvelope.Payload(jobId)
            ),
            0
        );
    }

    private static RecommendationStreamRecord legacyRecord() {
        UUID jobId = UUID.randomUUID();
        return new RecommendationStreamRecord(
            "2-0",
            new RecommendationRequestedEnvelope(
                UUID.randomUUID(),
                RecommendationRequestedEnvelope.EVENT_TYPE,
                1,
                jobId,
                "key",
                Instant.now(),
                "legacy",
                new RecommendationRequestedEnvelope.Payload(jobId)
            ),
            1
        );
    }
}
