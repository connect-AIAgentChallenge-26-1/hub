package com.placepick.analytics;

import com.fasterxml.jackson.databind.JsonNode;

/** Raw API request. Validation converts it to a closed, provider-neutral stored model. */
public record ProductEventRequest(
    String eventId,
    String name,
    String occurredAt,
    JsonNode context
) {
}
