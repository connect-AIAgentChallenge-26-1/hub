package com.placepick.analytics;

import static org.assertj.core.api.Assertions.assertThat;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ProductEventMetricsTest {

    @Test
    void recordsOnlyClosedLowCardinalityDiagnosticDimensions() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        ProductEventMetrics metrics = new ProductEventMetrics(registry);

        metrics.accepted(ProductEventName.WEB_VITAL, Map.of(
            "metricName", "LCP",
            "metricRating", "good",
            "metricValueBucket", "fast",
            "viewportClass", "desktop"
        ));

        assertThat(registry.get("placepick.client.events")
            .tags(
                "name", "webVital",
                "detail", "LCP:good:fast",
                "viewport", "desktop"
            )
            .counter()
            .count()).isEqualTo(1.0d);
    }
}
