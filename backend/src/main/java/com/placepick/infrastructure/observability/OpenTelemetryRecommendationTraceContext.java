package com.placepick.infrastructure.observability;

import com.placepick.outbox.RecommendationRequestedEnvelope;
import com.placepick.stream.RecommendationStreamRecord;
import com.placepick.stream.RecommendationTraceContext;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.Scope;
import io.opentelemetry.context.propagation.TextMapGetter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.time.Duration;
import java.util.Objects;

/** W3C carrier extraction and consumer-span boundary for at-least-once Worker delivery. */
public final class OpenTelemetryRecommendationTraceContext
    implements RecommendationTraceContext {

    private static final String INSTRUMENTATION_SCOPE = "com.placepick.worker";
    private static final TextMapGetter<Map<String, String>> GETTER = new TextMapGetter<>() {
        @Override
        public Iterable<String> keys(Map<String, String> carrier) {
            return carrier.keySet();
        }

        @Override
        public String get(Map<String, String> carrier, String key) {
            return carrier.get(key);
        }
    };

    private final OpenTelemetry openTelemetry;
    private final SafeTelemetryLogger logger;
    private final PlacePickMetrics metrics;

    public OpenTelemetryRecommendationTraceContext(
        OpenTelemetry openTelemetry,
        SafeTelemetryLogger logger
    ) {
        this(openTelemetry, logger, null);
    }

    public OpenTelemetryRecommendationTraceContext(
        OpenTelemetry openTelemetry,
        SafeTelemetryLogger logger,
        PlacePickMetrics metrics
    ) {
        this.openTelemetry = Objects.requireNonNull(openTelemetry, "openTelemetry");
        this.logger = Objects.requireNonNull(logger, "logger");
        this.metrics = metrics;
    }

    @Override
    public void within(RecommendationStreamRecord record, Runnable operation) {
        Objects.requireNonNull(record, "record");
        Objects.requireNonNull(operation, "operation");
        RecommendationRequestedEnvelope envelope = record.envelope();
        Map<String, String> carrier = carrier(envelope);
        Context parent = openTelemetry.getPropagators().getTextMapPropagator()
            .extract(Context.root(), carrier, GETTER);

        Span span = openTelemetry.getTracer(INSTRUMENTATION_SCOPE)
            .spanBuilder("placepick.recommendation.consume")
            .setSpanKind(SpanKind.CONSUMER)
            .setParent(parent)
            .setAttribute("messaging.system", "redis")
            .setAttribute("messaging.operation", "process")
            .setAttribute("placepick.envelope.version", envelope.version())
            .setAttribute("placepick.delivery.attempt", record.attempt())
            .setAttribute("placepick.legacy_context", envelope.traceparent() == null)
            .setAttribute(AttributeKey.stringKey("placepick.job.id"), envelope.aggregateId().toString())
            .setAttribute(AttributeKey.stringKey("placepick.event.id"), envelope.eventId().toString())
            .startSpan();
        long started = System.nanoTime();
        String outcome = "failure";
        Scope scope = span.makeCurrent();
        try {
            logger.event(
                SafeTelemetryEventCode.WORKER_STARTED,
                envelope.aggregateId(),
                envelope.eventId()
            );
            operation.run();
            outcome = "success";
            span.setStatus(StatusCode.OK);
            logger.event(
                SafeTelemetryEventCode.WORKER_COMPLETED,
                envelope.aggregateId(),
                envelope.eventId()
            );
        } catch (RuntimeException exception) {
            span.setStatus(StatusCode.ERROR, "worker operation failed");
            span.setAttribute("placepick.failure.type", "worker_failure");
            logger.event(
                SafeTelemetryEventCode.WORKER_FAILED,
                envelope.aggregateId(),
                envelope.eventId()
            );
            throw exception;
        } finally {
            scope.close();
            span.end();
            if (metrics != null) {
                metrics.workerProcessing(
                    Duration.ofNanos(System.nanoTime() - started),
                    outcome
                );
            }
        }
    }

    private static Map<String, String> carrier(RecommendationRequestedEnvelope envelope) {
        Map<String, String> carrier = new LinkedHashMap<>();
        if (envelope.traceparent() != null) {
            carrier.put("traceparent", envelope.traceparent());
        }
        if (envelope.tracestate() != null) {
            carrier.put("tracestate", envelope.tracestate());
        }
        return Map.copyOf(carrier);
    }
}
