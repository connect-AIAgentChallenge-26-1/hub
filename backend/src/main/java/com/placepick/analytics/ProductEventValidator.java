package com.placepick.analytics;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.web.ApiErrorCode;
import com.placepick.web.ApiException;
import com.placepick.web.ApiException.FieldViolation;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
final class ProductEventValidator {

    static final int MAX_DECODED_JSON_BYTES = 4 * 1024;
    private static final Set<String> RESOURCE_CONTEXT_KEYS = Set.of(
        "draftId",
        "jobId",
        "roomId",
        "placeId",
        "viewportClass"
    );
    private static final Set<String> VIEWPORT_CLASSES = Set.of("mobile", "tablet", "desktop");
    private static final Set<String> SURFACES = Set.of(
        "home", "draft", "progress", "result", "place", "room", "roomResult"
    );
    private static final Map<String, Set<String>> CLOSED_VALUES = Map.ofEntries(
        Map.entry("viewportClass", VIEWPORT_CLASSES),
        Map.entry("metricName", Set.of("LCP", "INP", "CLS", "TTFB")),
        Map.entry("metricRating", Set.of("good", "needs-improvement", "poor")),
        Map.entry("metricValueBucket", Set.of("fast", "moderate", "slow")),
        Map.entry("streamType", Set.of("recommendation", "room")),
        Map.entry("recoveryMode", Set.of("snapshot", "stream")),
        Map.entry("resultCount", Set.of("1", "2")),
        Map.entry("explorationRound", Set.of("initial", "alternative")),
        Map.entry("fieldName", Set.of(
            "locationQuery", "placeType", "placeTypeDetail", "partySize",
            "budgetRange", "preferences", "exclusions"
        )),
        Map.entry("surface", SURFACES),
        Map.entry("durationBucket", Set.of("under10s", "10to30s", "30to90s")),
        Map.entry("errorCategory", Set.of("api", "contract", "network", "sse", "unknown")),
        Map.entry("recoverable", Set.of("true", "false"))
    );

    private final ObjectMapper objectMapper;

    ProductEventValidator(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    ValidatedProductEvent validate(ProductEventRequest request) {
        requireWithinSizeLimit(request);
        if (request == null) {
            throw invalid("body", "REQUIRED", "A request body is required.");
        }

        UUID eventId = canonicalUuidV4(request.eventId(), "eventId");
        ProductEventName eventName = ProductEventName.fromWireName(request.name())
            .orElseThrow(() -> invalid(
                "name",
                "NOT_ALLOWED",
                "The product event name is not allowed."
            ));
        OffsetDateTime occurredAt = utcTimestamp(request.occurredAt());
        Map<String, String> context = validatedContext(eventName, request.context());
        return new ValidatedProductEvent(eventId, eventName, occurredAt.toInstant(), context);
    }

    private void requireWithinSizeLimit(ProductEventRequest request) {
        if (request == null) {
            return;
        }
        try {
            byte[] decodedJson = objectMapper.writeValueAsString(request)
                .getBytes(StandardCharsets.UTF_8);
            if (decodedJson.length > MAX_DECODED_JSON_BYTES) {
                throw invalid(
                    "body",
                    "SIZE",
                    "The decoded product event must not exceed 4096 bytes."
                );
            }
        } catch (JsonProcessingException exception) {
            throw invalid("body", "INVALID", "The product event could not be read.");
        }
    }

    private Map<String, String> validatedContext(
        ProductEventName eventName,
        JsonNode context
    ) {
        if (context == null || !context.isObject()) {
            throw invalid("context", "OBJECT_REQUIRED", "Context must be a JSON object.");
        }

        Map<String, String> validated = new LinkedHashMap<>();
        Set<String> allowedKeys = allowedContextKeys(eventName);
        context.properties().forEach(entry -> {
            String key = entry.getKey();
            if (!allowedKeys.contains(key)) {
                throw invalid(
                    "context." + key,
                    "NOT_ALLOWED",
                    "The context field is not allowed."
                );
            }
            JsonNode value = entry.getValue();
            if (value == null || !value.isTextual()) {
                throw invalid(
                    "context." + key,
                    "STRING_REQUIRED",
                    "The context value must use its closed string format."
                );
            }
            String text = value.textValue();
            Set<String> values = CLOSED_VALUES.get(key);
            if (values != null) {
                if (!values.contains(text)) {
                    throw invalid(
                        "context." + key,
                        "NOT_ALLOWED",
                        "The context value is not allowed."
                    );
                }
                validated.put(key, text);
            } else {
                validated.put(key, canonicalUuidV4(text, "context." + key).toString());
            }
        });
        if (isDiagnosticEvent(eventName) && !validated.keySet().equals(allowedKeys)) {
            throw invalid(
                "context",
                "REQUIRED_FIELDS",
                "All closed diagnostic context fields are required."
            );
        }
        return Map.copyOf(validated);
    }

    private static Set<String> allowedContextKeys(ProductEventName eventName) {
        return switch (eventName) {
            case WEB_VITAL -> Set.of(
                "metricName", "metricRating", "metricValueBucket", "viewportClass"
            );
            case SSE_RECOVERED -> Set.of("streamType", "recoveryMode", "viewportClass");
            case PARTIAL_RECOMMENDATION_SHOWN -> Set.of(
                "resultCount", "explorationRound", "viewportClass"
            );
            case ALTERNATIVE_RECOMMENDATION_REQUESTED -> Set.of(
                "explorationRound", "viewportClass"
            );
            case CONDITION_FIELD_CHANGED -> Set.of("fieldName", "viewportClass");
            case COLD_START_RECOVERED -> Set.of(
                "surface", "durationBucket", "viewportClass"
            );
            case CLIENT_ERROR -> Set.of(
                "surface", "errorCategory", "recoverable", "viewportClass"
            );
            default -> RESOURCE_CONTEXT_KEYS;
        };
    }

    private static boolean isDiagnosticEvent(ProductEventName eventName) {
        return switch (eventName) {
            case WEB_VITAL, SSE_RECOVERED, PARTIAL_RECOMMENDATION_SHOWN,
                 ALTERNATIVE_RECOMMENDATION_REQUESTED, CONDITION_FIELD_CHANGED,
                 COLD_START_RECOVERED, CLIENT_ERROR -> true;
            default -> false;
        };
    }

    private OffsetDateTime utcTimestamp(String value) {
        if (value == null) {
            throw invalid("occurredAt", "REQUIRED", "occurredAt is required.");
        }
        try {
            OffsetDateTime timestamp = OffsetDateTime.parse(value);
            if (!ZoneOffset.UTC.equals(timestamp.getOffset())) {
                throw invalid("occurredAt", "UTC_REQUIRED", "occurredAt must use UTC.");
            }
            return timestamp;
        } catch (DateTimeParseException exception) {
            throw invalid("occurredAt", "INVALID", "occurredAt must be an ISO-8601 timestamp.");
        }
    }

    private UUID canonicalUuidV4(String value, String field) {
        if (value == null) {
            throw invalid(field, "REQUIRED", "The identifier is required.");
        }
        try {
            UUID id = UUID.fromString(value);
            boolean canonical = id.toString().equals(value.toLowerCase(Locale.ROOT));
            if (!canonical || id.version() != 4 || id.variant() != 2) {
                throw invalid(field, "UUID_V4_REQUIRED", "The identifier must be UUID v4.");
            }
            return id;
        } catch (IllegalArgumentException exception) {
            throw invalid(field, "UUID_V4_REQUIRED", "The identifier must be UUID v4.");
        }
    }

    private ApiException invalid(String field, String code, String message) {
        return new ApiException(
            HttpStatus.BAD_REQUEST,
            ApiErrorCode.INVALID_REQUEST,
            "The product event is invalid.",
            java.util.List.of(new FieldViolation(field, code, message))
        );
    }

    record ValidatedProductEvent(
        UUID eventId,
        ProductEventName name,
        java.time.Instant occurredAt,
        Map<String, String> context
    ) {
    }
}
