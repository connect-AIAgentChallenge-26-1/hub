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
    private static final Set<String> CONTEXT_KEYS = Set.of(
        "draftId",
        "jobId",
        "roomId",
        "placeId",
        "viewportClass"
    );
    private static final Set<String> VIEWPORT_CLASSES = Set.of("mobile", "tablet", "desktop");

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
        Map<String, String> context = validatedContext(request.context());
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

    private Map<String, String> validatedContext(JsonNode context) {
        if (context == null || !context.isObject()) {
            throw invalid("context", "OBJECT_REQUIRED", "Context must be a JSON object.");
        }

        Map<String, String> validated = new LinkedHashMap<>();
        context.properties().forEach(entry -> {
            String key = entry.getKey();
            if (!CONTEXT_KEYS.contains(key)) {
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
            if ("viewportClass".equals(key)) {
                if (!VIEWPORT_CLASSES.contains(text)) {
                    throw invalid(
                        "context.viewportClass",
                        "NOT_ALLOWED",
                        "The viewport class is not allowed."
                    );
                }
                validated.put(key, text);
            } else {
                validated.put(key, canonicalUuidV4(text, "context." + key).toString());
            }
        });
        return Map.copyOf(validated);
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
