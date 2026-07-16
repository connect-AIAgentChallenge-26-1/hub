package com.placepick.analytics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.web.ApiErrorCode;
import com.placepick.web.ApiException;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ProductEventValidatorTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ProductEventValidator validator = new ProductEventValidator(objectMapper);

    @ParameterizedTest
    @ValueSource(strings = {
        "draftCreated",
        "recommendationViewed",
        "roomShared",
        "voteChanged",
        "finalResultViewed"
    })
    void acceptsOnlyTheClosedEventAndContextShapes(String name) throws Exception {
        UUID eventId = UUID.randomUUID();
        UUID draftId = UUID.randomUUID();
        JsonNode context = objectMapper.readTree("""
            {
              "draftId": "%s",
              "viewportClass": "mobile"
            }
            """.formatted(draftId));

        ProductEventValidator.ValidatedProductEvent result = validator.validate(
            new ProductEventRequest(
                eventId.toString(),
                name,
                "2026-07-16T03:04:05Z",
                context
            )
        );

        assertThat(result.eventId()).isEqualTo(eventId);
        assertThat(result.name().wireName()).isEqualTo(name);
        assertThat(result.occurredAt()).isEqualTo(Instant.parse("2026-07-16T03:04:05Z"));
        assertThat(result.context()).containsExactlyInAnyOrderEntriesOf(java.util.Map.of(
            "draftId", draftId.toString(),
            "viewportClass", "mobile"
        ));
    }

    @Test
    void rejectsUnknownNestedAndFreeTextContextInsteadOfPersistingIt() throws Exception {
        assertInvalid(
            request("voteChanged", objectMapper.readTree("{" +
                "\"email\":\"person@example.com\"}")),
            "context.email",
            "NOT_ALLOWED"
        );
        assertInvalid(
            request("voteChanged", objectMapper.readTree("{" +
                "\"placeId\":{\"value\":\"nested\"}}")),
            "context.placeId",
            "STRING_REQUIRED"
        );
        assertInvalid(
            request("voteChanged", objectMapper.readTree("{" +
                "\"placeId\":\"free text\"}")),
            "context.placeId",
            "UUID_V4_REQUIRED"
        );
    }

    @Test
    void rejectsUnknownNameNonV4IdentifiersAndNonUtcTime() throws Exception {
        assertInvalid(
            request("arbitraryEvent", objectMapper.createObjectNode()),
            "name",
            "NOT_ALLOWED"
        );
        assertInvalid(
            new ProductEventRequest(
                "00000000-0000-1000-8000-000000000000",
                "draftCreated",
                "2026-07-16T03:04:05Z",
                objectMapper.createObjectNode()
            ),
            "eventId",
            "UUID_V4_REQUIRED"
        );
        assertInvalid(
            new ProductEventRequest(
                UUID.randomUUID().toString(),
                "draftCreated",
                "2026-07-16T12:04:05+09:00",
                objectMapper.createObjectNode()
            ),
            "occurredAt",
            "UTC_REQUIRED"
        );
    }

    @Test
    void enforcesTheFourKibibyteLimitAfterJsonDecoding() throws Exception {
        JsonNode context = objectMapper.createObjectNode()
            .put("viewportClass", "x".repeat(ProductEventValidator.MAX_DECODED_JSON_BYTES));

        assertInvalid(request("draftCreated", context), "body", "SIZE");
    }

    private ProductEventRequest request(String name, JsonNode context) {
        return new ProductEventRequest(
            UUID.randomUUID().toString(),
            name,
            "2026-07-16T03:04:05Z",
            context
        );
    }

    private void assertInvalid(ProductEventRequest request, String field, String code) {
        assertThatThrownBy(() -> validator.validate(request))
            .isInstanceOfSatisfying(ApiException.class, exception -> {
                assertThat(exception.status().value()).isEqualTo(400);
                assertThat(exception.errorCode()).isEqualTo(ApiErrorCode.INVALID_REQUEST);
                assertThat(exception.getMessage()).isEqualTo("The product event is invalid.");
                assertThat(exception.fieldErrors()).singleElement().satisfies(violation -> {
                    assertThat(violation.field()).isEqualTo(field);
                    assertThat(violation.code()).isEqualTo(code);
                });
            });
    }
}
