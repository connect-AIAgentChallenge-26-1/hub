package com.placepick.analytics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.session.SessionAuthenticator;
import jakarta.servlet.http.Cookie;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
@ActiveProfiles("test")
@AutoConfigureMockMvc
@SpringBootTest
class ProductEventApiIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
        DockerImageName.parse(
            "postgres:16.14-bookworm@sha256:"
                + "da788743d2060767375896de4d646f7576f5911461444b372616f19ea61db2ec"
        ).asCompatibleSubstituteFor("postgres")
    )
        .withDatabaseName("placepick_product_event_test")
        .withUsername("placepick")
        .withPassword("placepick-test");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcClient jdbcClient;

    @Autowired
    private ProductEventService eventService;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("placepick.external.mode", () -> "mock");
        registry.add("placepick.role", () -> "api");
        registry.add("placepick.analytics.retention", () -> "P2D");
        registry.add("placepick.analytics.cleanup-delay", () -> "P1D");
    }

    @BeforeEach
    void clearData() {
        jdbcClient.sql("DELETE FROM product_event").update();
        jdbcClient.sql("DELETE FROM anonymous_session").update();
    }

    @Test
    void storesOnlyTheAllowlistedShapeAndAcceptsDuplicateEventIdsWithoutDuplication()
        throws Exception {
        SessionClient session = createSession();
        UUID eventId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        UUID placeId = UUID.randomUUID();
        String body = """
            {
              "eventId": "%s",
              "name": "voteChanged",
              "occurredAt": "2026-07-16T03:04:05Z",
              "context": {
                "roomId": "%s",
                "placeId": "%s",
                "viewportClass": "desktop"
              }
            }
            """.formatted(eventId, roomId, placeId);

        postEvent(session, body)
            .andExpect(status().isAccepted())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(content().string(""));
        postEvent(session, body).andExpect(status().isAccepted());

        assertThat(jdbcClient.sql("SELECT count(*) FROM product_event")
            .query(Long.class)
            .single()).isEqualTo(1L);

        StoredEvent stored = jdbcClient.sql("""
                SELECT event_id, session_id, event_name, occurred_at,
                       context_json::text AS context_json, created_at, expires_at
                FROM product_event
                """)
            .query((resultSet, rowNumber) -> new StoredEvent(
                resultSet.getObject("event_id", UUID.class),
                resultSet.getObject("session_id", UUID.class),
                resultSet.getString("event_name"),
                resultSet.getObject("occurred_at", OffsetDateTime.class).toInstant(),
                resultSet.getString("context_json"),
                resultSet.getObject("created_at", OffsetDateTime.class).toInstant(),
                resultSet.getObject("expires_at", OffsetDateTime.class).toInstant()
            ))
            .single();
        assertThat(stored.eventId()).isEqualTo(eventId);
        assertThat(stored.sessionId()).isEqualTo(session.sessionId());
        assertThat(stored.eventName()).isEqualTo("voteChanged");
        assertThat(stored.occurredAt()).isEqualTo(Instant.parse("2026-07-16T03:04:05Z"));
        assertThat(stored.contextJson())
            .contains(roomId.toString(), placeId.toString(), "desktop")
            .doesNotContain("cookie", "token", "email");
        assertThat(Duration.between(stored.createdAt(), stored.expiresAt()))
            .isEqualTo(Duration.ofDays(2));
    }

    @Test
    void requiresAnAuthenticatedSessionAndCsrfToken() throws Exception {
        String body = validBody();
        mockMvc.perform(post("/api/v1/events")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.errorCode").value("SESSION_REQUIRED"));

        SessionClient session = createSession();
        mockMvc.perform(post("/api/v1/events")
                .cookie(session.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, "invalid")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.errorCode").value("CSRF_INVALID"));
    }

    @Test
    void rejectsAdditionalNestedFreeTextNonUtcAndOversizedInputWithSafeProblems()
        throws Exception {
        SessionClient session = createSession();

        postEvent(session, validBody().replace(
            "\"context\":{",
            "\"unexpected\":true,\"context\":{"
        ))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));

        postEvent(session, """
            {
              "eventId":"%s",
              "name":"voteChanged",
              "occurredAt":"2026-07-16T12:04:05+09:00",
              "context":{"placeId":{"value":"nested"}}
            }
            """.formatted(UUID.randomUUID()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.detail").value("The product event is invalid."))
            .andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));

        postEvent(session, """
            {
              "eventId":"%s",
              "name":"draftCreated",
              "occurredAt":"2026-07-16T03:04:05Z",
              "context":{"viewportClass":"%s"}
            }
            """.formatted(UUID.randomUUID(), "x".repeat(5_000)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fieldErrors[0].field").value("body"))
            .andExpect(jsonPath("$.fieldErrors[0].code").value("SIZE"));

        assertThat(jdbcClient.sql("SELECT count(*) FROM product_event")
            .query(Long.class)
            .single()).isZero();
    }

    @Test
    void removesRowsWhoseConfiguredRetentionHasExpired() throws Exception {
        SessionClient session = createSession();
        postEvent(session, validBody()).andExpect(status().isAccepted());
        jdbcClient.sql("UPDATE product_event SET expires_at = now() - interval '1 second'")
            .update();

        assertThat(eventService.deleteExpired()).isEqualTo(1);
        assertThat(jdbcClient.sql("SELECT count(*) FROM product_event")
            .query(Long.class)
            .single()).isZero();
    }

    private org.springframework.test.web.servlet.ResultActions postEvent(
        SessionClient session,
        String body
    ) throws Exception {
        return mockMvc.perform(post("/api/v1/events")
            .cookie(session.cookie())
            .header(SessionAuthenticator.CSRF_HEADER, session.csrfToken())
            .contentType(MediaType.APPLICATION_JSON)
            .content(body));
    }

    private SessionClient createSession() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/anonymous-sessions"))
            .andExpect(status().isCreated())
            .andReturn();
        Cookie responseCookie = result.getResponse().getCookie(SessionAuthenticator.SESSION_COOKIE);
        assertThat(responseCookie).isNotNull();
        JsonNode response = objectMapper.readTree(result.getResponse().getContentAsByteArray());
        UUID sessionId = jdbcClient.sql("""
                SELECT id FROM anonymous_session WHERE token_hash IS NOT NULL
                """)
            .query(UUID.class)
            .single();
        return new SessionClient(
            sessionId,
            new Cookie(responseCookie.getName(), responseCookie.getValue()),
            response.path("csrfToken").asText()
        );
    }

    private String validBody() {
        return """
            {
              "eventId":"%s",
              "name":"draftCreated",
              "occurredAt":"2026-07-16T03:04:05Z",
              "context":{"draftId":"%s","viewportClass":"mobile"}
            }
            """.formatted(UUID.randomUUID(), UUID.randomUUID());
    }

    private record SessionClient(UUID sessionId, Cookie cookie, String csrfToken) {
    }

    private record StoredEvent(
        UUID eventId,
        UUID sessionId,
        String eventName,
        Instant occurredAt,
        String contextJson,
        Instant createdAt,
        Instant expiresAt
    ) {
    }
}
