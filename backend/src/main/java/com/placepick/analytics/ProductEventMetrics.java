package com.placepick.analytics;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.Objects;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Low-cardinality count of accepted, de-duplicated client events. */
@Component
public final class ProductEventMetrics {

    private final MeterRegistry registry;

    public ProductEventMetrics(MeterRegistry registry) {
        this.registry = Objects.requireNonNull(registry, "registry");
    }

    public void accepted(ProductEventName name, Map<String, String> context) {
        String viewport = context.getOrDefault("viewportClass", "unknown");
        registry.counter(
            "placepick.client.events",
            "name", name.wireName(),
            "detail", detail(name, context),
            "viewport", viewport
        ).increment();
    }

    private static String detail(ProductEventName name, Map<String, String> context) {
        return switch (name) {
            case WEB_VITAL -> joined(context, "metricName", "metricRating", "metricValueBucket");
            case SSE_RECOVERED -> joined(context, "streamType", "recoveryMode");
            case PARTIAL_RECOMMENDATION_SHOWN -> joined(
                context,
                "resultCount",
                "explorationRound"
            );
            case ALTERNATIVE_RECOMMENDATION_REQUESTED -> context.get("explorationRound");
            case CONDITION_FIELD_CHANGED -> context.get("fieldName");
            case COLD_START_RECOVERED -> joined(context, "surface", "durationBucket");
            case CLIENT_ERROR -> joined(context, "errorCategory", "recoverable");
            default -> "none";
        };
    }

    private static String joined(Map<String, String> context, String... keys) {
        return java.util.Arrays.stream(keys)
            .map(context::get)
            .collect(java.util.stream.Collectors.joining(":"));
    }
}
