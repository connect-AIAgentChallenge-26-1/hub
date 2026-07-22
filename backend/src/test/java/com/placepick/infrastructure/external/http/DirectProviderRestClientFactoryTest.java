package com.placepick.infrastructure.external.http;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import io.opentelemetry.api.trace.Span;
import io.opentelemetry.context.Scope;
import io.opentelemetry.context.propagation.ContextPropagators;
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;

class DirectProviderRestClientFactoryTest {

    @Test
    void injectsOnlyTheActiveW3cCarrierIntoObservedProviderTransport() {
        SdkTracerProvider provider = SdkTracerProvider.builder().build();
        OpenTelemetrySdk telemetry = OpenTelemetrySdk.builder()
            .setTracerProvider(provider)
            .setPropagators(ContextPropagators.create(W3CTraceContextPropagator.getInstance()))
            .build();
        var builder = DirectProviderRestClientFactory.jsonBuilder(
            Duration.ofSeconds(1),
            Duration.ofSeconds(1),
            telemetry
        );
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        var client = builder.build();
        Span span = telemetry.getTracer("test").spanBuilder("provider-parent").startSpan();
        String traceparent = "00-" + span.getSpanContext().getTraceId() + "-"
            + span.getSpanContext().getSpanId() + "-01";
        server.expect(requestTo("https://provider.invalid/v1/check"))
            .andExpect(header("traceparent", traceparent))
            .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        Scope scope = span.makeCurrent();
        try {
            String body = client.get()
                .uri("https://provider.invalid/v1/check")
                .retrieve()
                .body(String.class);
            assertThat(body).isEqualTo("{}");
        } finally {
            scope.close();
            span.end();
            provider.close();
        }
        server.verify();
    }
}
