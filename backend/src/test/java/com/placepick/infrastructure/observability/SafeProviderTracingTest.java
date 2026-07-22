package com.placepick.infrastructure.observability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.testing.exporter.InMemorySpanExporter;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.export.SimpleSpanProcessor;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;

class SafeProviderTracingTest {

    @Test
    void exportsOnlyClosedProviderAttributesAndNoExceptionPayload() {
        InMemorySpanExporter exporter = InMemorySpanExporter.create();
        SdkTracerProvider provider = SdkTracerProvider.builder()
            .addSpanProcessor(SimpleSpanProcessor.create(exporter))
            .build();
        SafeProviderTracing tracing = new SafeProviderTracing(
            OpenTelemetrySdk.builder().setTracerProvider(provider).build()
        );

        assertThatThrownBy(() -> tracing.within("elice", "reason", () -> {
            throw new IllegalStateException("provider URL and response must stay private");
        })).isInstanceOf(IllegalStateException.class);

        var span = exporter.getFinishedSpanItems().get(0);
        assertThat(span.getName()).isEqualTo("placepick.provider.reason");
        assertThat(span.getAttributes().asMap()).containsEntry(
            io.opentelemetry.api.common.AttributeKey.stringKey("placepick.provider"),
            "elice"
        );
        assertThat(span.getAttributes().asMap().values())
            .doesNotContain("provider URL and response must stay private");
        assertThat(span.getEvents()).isEmpty();
        provider.close();
    }

    @Test
    void recordsClosedFailureOutcomeWithoutPayloadAndKeepsAsyncParent() throws Exception {
        InMemorySpanExporter exporter = InMemorySpanExporter.create();
        SdkTracerProvider provider = SdkTracerProvider.builder()
            .addSpanProcessor(SimpleSpanProcessor.create(exporter))
            .build();
        OpenTelemetrySdk telemetry = OpenTelemetrySdk.builder()
            .setTracerProvider(provider)
            .build();
        SafeProviderTracing tracing = new SafeProviderTracing(telemetry);
        OpenTelemetryAsyncExecutionContext propagation =
            new OpenTelemetryAsyncExecutionContext();
        var parent = telemetry.getTracer("test").spanBuilder("worker").startSpan();
        var executor = Executors.newSingleThreadExecutor();
        var scope = parent.makeCurrent();
        try {
            var result = executor.submit(propagation.wrap(() -> tracing.within(
                "elice",
                "reason",
                () -> "private provider response",
                value -> "authentication_failed"
            ))).get();
            assertThat(result).isEqualTo("private provider response");
        } finally {
            scope.close();
            executor.shutdownNow();
            parent.end();
        }

        var providerSpan = exporter.getFinishedSpanItems().stream()
            .filter(span -> span.getName().equals("placepick.provider.reason"))
            .findFirst()
            .orElseThrow();
        assertThat(providerSpan.getParentSpanId()).isEqualTo(parent.getSpanContext().getSpanId());
        assertThat(providerSpan.getAttributes().asMap()).containsEntry(
            io.opentelemetry.api.common.AttributeKey.stringKey("placepick.outcome"),
            "authentication_failed"
        );
        assertThat(providerSpan.getAttributes().asMap().values())
            .doesNotContain("private provider response");
        provider.close();
    }
}
