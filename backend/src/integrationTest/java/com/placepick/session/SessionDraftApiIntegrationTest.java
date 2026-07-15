package com.placepick.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.web.TraceIdFilter;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
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
class SessionDraftApiIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
        DockerImageName.parse(
            "postgres:16.14-bookworm@sha256:da788743d2060767375896de4d646f7576f5911461444b372616f19ea61db2ec"
        ).asCompatibleSubstituteFor("postgres")
    )
        .withDatabaseName("placepick_session_draft_test")
        .withUsername("placepick")
        .withPassword("placepick-test");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcClient jdbcClient;

    @DynamicPropertySource
    static void dataSourceProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("placepick.external.mode", () -> "mock");
        registry.add("placepick.role", () -> "api");
    }

    @BeforeEach
    void clearServiceData() {
        jdbcClient.sql("DELETE FROM recommendation_draft").update();
        jdbcClient.sql("DELETE FROM anonymous_session").update();
    }

    @Test
    void issuesHashedSessionAndRefreshesTheSameIdentity() throws Exception {
        SessionClient first = createSession();

        String storedTokenHash = jdbcClient.sql("""
                SELECT token_hash FROM anonymous_session
                """)
            .query(String.class)
            .single();
        String storedCsrfHash = jdbcClient.sql("""
                SELECT csrf_token_hash FROM anonymous_session
                """)
            .query(String.class)
            .single();

        assertThat(storedTokenHash)
            .hasSize(64)
            .doesNotContain(first.cookie().getValue());
        assertThat(storedCsrfHash)
            .hasSize(64)
            .doesNotContain(first.csrfToken());

        MvcResult refreshedResult = mockMvc.perform(post("/api/v1/anonymous-sessions")
                .cookie(first.cookie()))
            .andExpect(status().isCreated())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(header().exists(TraceIdFilter.RESPONSE_HEADER))
            .andReturn();
        SessionClient refreshed = sessionClient(refreshedResult);

        assertThat(refreshed.cookie().getValue()).isEqualTo(first.cookie().getValue());
        assertThat(refreshed.csrfToken()).isNotEqualTo(first.csrfToken());
        assertThat(jdbcClient.sql("SELECT count(*) FROM anonymous_session")
            .query(Long.class)
            .single()).isEqualTo(1L);
    }

    @Test
    void enforcesCsrfAndReturnsRfc9457ProblemDetails() throws Exception {
        SessionClient session = createSession();

        mockMvc.perform(post("/api/v1/recommendation-drafts")
                .cookie(session.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, "invalid")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestText\":\"서울에서 카페\"}"))
            .andExpect(status().isForbidden())
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.type").value(
                "https://placepick.dev/problems/csrf-invalid"
            ))
            .andExpect(jsonPath("$.title").value("Forbidden"))
            .andExpect(jsonPath("$.status").value(403))
            .andExpect(jsonPath("$.errorCode").value("CSRF_INVALID"))
            .andExpect(jsonPath("$.traceId").isString())
            .andExpect(jsonPath("$.instance").value("/api/v1/recommendation-drafts"));

        mockMvc.perform(post("/api/v1/recommendation-drafts")
                .cookie(session.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, session.csrfToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"requestText":"서울에서 카페","unexpected":true}
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));
    }

    @Test
    void createsRestoresAndConfirmsOwnedThirtyMinuteDraft() throws Exception {
        SessionClient owner = createSession();
        Instant beforeCreate = Instant.now();

        MvcResult created = mockMvc.perform(post("/api/v1/recommendation-drafts")
                .cookie(owner.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, owner.csrfToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"requestText":"서울에서 조용한 카페 2명 2만원 이하 흡연 제외"}
                    """))
            .andExpect(status().isCreated())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(header().string("Location", org.hamcrest.Matchers.startsWith(
                "/api/v1/recommendation-drafts/"
            )))
            .andExpect(jsonPath("$.status").value("EXTRACTED"))
            .andExpect(jsonPath("$.extractedCondition.locationQuery").value("서울"))
            .andExpect(jsonPath("$.extractedCondition.placeType").value("CAFE"))
            .andReturn();

        JsonNode createdJson = objectMapper.readTree(created.getResponse().getContentAsByteArray());
        UUID draftId = UUID.fromString(createdJson.path("draftId").asText());
        Instant expiresAt = Instant.parse(createdJson.path("expiresAt").asText());
        assertThat(draftId.version()).isEqualTo(4);
        assertThat(expiresAt).isBetween(
            beforeCreate.plusSeconds(29 * 60L),
            beforeCreate.plusSeconds(31 * 60L)
        );

        mockMvc.perform(get("/api/v1/recommendation-drafts/{draftId}", draftId)
                .cookie(owner.cookie()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.draftId").value(draftId.toString()))
            .andExpect(jsonPath("$.status").value("EXTRACTED"));

        mockMvc.perform(put("/api/v1/recommendation-drafts/{draftId}", draftId)
                .cookie(owner.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, owner.csrfToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "condition": {
                        "locationQuery": "서울 강남",
                        "placeType": "RESTAURANT",
                        "placeTypeDetail": null,
                        "partySize": 4,
                        "budgetPerPersonMin": 10000,
                        "budgetPerPersonMax": 30000,
                        "preferences": [{"value":"룸","priority":8}],
                        "exclusions": ["흡연"]
                      }
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CONFIRMED"))
            .andExpect(jsonPath("$.extractedCondition.locationQuery").value("서울 강남"))
            .andExpect(jsonPath("$.extractedCondition.preferences", hasSize(1)))
            .andExpect(jsonPath("$.expiresAt").value(expiresAt.toString()));
    }

    @Test
    void hidesAnotherSessionsDraftAndReturnsGoneToItsOwnerAfterExpiry() throws Exception {
        SessionClient owner = createSession();
        SessionClient stranger = createSession();
        UUID draftId = createDraft(owner);

        mockMvc.perform(get("/api/v1/recommendation-drafts/{draftId}", draftId)
                .cookie(stranger.cookie()))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.errorCode").value("RESOURCE_NOT_FOUND"));

        jdbcClient.sql("""
                UPDATE recommendation_draft
                SET expires_at = :expiresAt
                WHERE id = :id
                """)
            .param("id", draftId)
            .param("expiresAt", OffsetDateTime.ofInstant(
                Instant.now().minusSeconds(1),
                ZoneOffset.UTC
            ))
            .update();

        mockMvc.perform(get("/api/v1/recommendation-drafts/{draftId}", draftId)
                .cookie(owner.cookie()))
            .andExpect(status().isGone())
            .andExpect(jsonPath("$.errorCode").value("DRAFT_EXPIRED"));
    }

    private SessionClient createSession() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/anonymous-sessions"))
            .andExpect(status().isCreated())
            .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.allOf(
                org.hamcrest.Matchers.containsString("HttpOnly"),
                org.hamcrest.Matchers.containsString("SameSite=Lax"),
                org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("Secure"))
            )))
            .andExpect(jsonPath("$.csrfToken").isString())
            .andExpect(jsonPath("$.expiresAt").isString())
            .andReturn();
        return sessionClient(result);
    }

    private SessionClient sessionClient(MvcResult result) throws Exception {
        Cookie responseCookie = result.getResponse().getCookie(SessionAuthenticator.SESSION_COOKIE);
        assertThat(responseCookie).isNotNull();
        Cookie requestCookie = new Cookie(responseCookie.getName(), responseCookie.getValue());
        JsonNode json = objectMapper.readTree(result.getResponse().getContentAsByteArray());
        return new SessionClient(requestCookie, json.path("csrfToken").asText());
    }

    private UUID createDraft(SessionClient owner) throws Exception {
        MvcResult created = mockMvc.perform(post("/api/v1/recommendation-drafts")
                .cookie(owner.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, owner.csrfToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestText\":\"서울에서 카페\"}"))
            .andExpect(status().isCreated())
            .andReturn();
        return UUID.fromString(objectMapper.readTree(created.getResponse().getContentAsByteArray())
            .path("draftId")
            .asText());
    }

    private record SessionClient(Cookie cookie, String csrfToken) {
    }
}
