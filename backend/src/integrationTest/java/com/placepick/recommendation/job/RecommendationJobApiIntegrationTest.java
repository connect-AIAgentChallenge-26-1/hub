package com.placepick.recommendation.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.recommendation.job.infrastructure.RecommendationWorkerSchedules;
import com.placepick.session.SessionAuthenticator;
import com.placepick.stream.RecommendationStreamGateway;
import jakarta.servlet.http.Cookie;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
@ActiveProfiles("test")
@AutoConfigureMockMvc
@SpringBootTest
class RecommendationJobApiIntegrationTest {

    private static final Pattern SSE_ID = Pattern.compile("(?m)^id:(\\d+)\\s*$");

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
        DockerImageName.parse(
            "postgres:16.14-bookworm@sha256:da788743d2060767375896de4d646f7576f5911461444b372616f19ea61db2ec"
        ).asCompatibleSubstituteFor("postgres")
    )
        .withDatabaseName("placepick_job_api_test")
        .withUsername("placepick")
        .withPassword("placepick-test");

    @Container
    static final GenericContainer<?> REDIS = new GenericContainer<>(
        DockerImageName.parse(
            "redis:7.4.9-bookworm@sha256:b2b95679e3b46fb51864949ed25ea976fc3a6bcc00a40a1bc00d568cb2822e50"
        )
    )
        .withExposedPorts(6379)
        .waitingFor(Wait.forLogMessage(".*Ready to accept connections.*\\n", 1));

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcClient jdbcClient;

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired
    private RecommendationWorkerSchedules workerSchedules;

    @DynamicPropertySource
    static void infrastructureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", REDIS::getFirstMappedPort);
        registry.add("placepick.external.mode", () -> "mock");
        registry.add("placepick.role", () -> "all");
        registry.add("placepick.worker.poll-delay", () -> "100");
        registry.add("placepick.sse.poll-delay-ms", () -> "100");
    }

    @BeforeEach
    void cleanState() {
        jdbcClient.sql("TRUNCATE TABLE outbox_event, processed_event, anonymous_session CASCADE")
            .update();
        var connectionFactory = redisTemplate.getConnectionFactory();
        if (connectionFactory == null) {
            throw new IllegalStateException("Redis connection factory is unavailable.");
        }
        try (var connection = connectionFactory.getConnection()) {
            connection.serverCommands().flushAll();
        }
        redisTemplate.opsForStream().add(MapRecord.create(
            RecommendationStreamGateway.STREAM,
            Map.of("_bootstrap", "1")
        ));
        redisTemplate.opsForStream().createGroup(
            RecommendationStreamGateway.STREAM,
            ReadOffset.from("0-0"),
            RecommendationStreamGateway.GROUP
        );
    }

    @Test
    void formalMockFlowReturns202CompletesThroughWorkerAndConvergesSseAtLatestSnapshot()
        throws Exception {
        SessionClient session = createSession();
        UUID draftId = createAndConfirmDraft(session);

        MvcResult accepted = mockMvc.perform(post("/api/v1/recommendations")
                .cookie(session.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, session.csrfToken())
                .header("Idempotency-Key", "formal-flow-key-0001")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"draftId\":\"" + draftId + "\"}"))
            .andExpect(status().isAccepted())
            .andExpect(header().string(
                "Location",
                org.hamcrest.Matchers.startsWith("/api/v1/recommendations/")
            ))
            .andExpect(jsonPath("$.status").value("ACCEPTED"))
            .andReturn();
        JsonNode acceptedJson = objectMapper.readTree(
            accepted.getResponse().getContentAsByteArray()
        );
        UUID jobId = UUID.fromString(acceptedJson.path("jobId").asText());
        assertThat(accepted.getResponse().getHeader("Location"))
            .isEqualTo("/api/v1/recommendations/" + jobId);

        JsonNode completed = awaitCompleted(jobId, session);
        assertThat(completed.path("status").asText()).isEqualTo("COMPLETED");
        assertThat(completed.path("stage").asText()).isEqualTo("FINISHED");
        assertThat(completed.path("progress").asInt()).isEqualTo(100);
        assertThat(completed.path("places")).hasSize(3);
        assertThat(completed.path("partial").asBoolean()).isFalse();
        assertThat(completed.path("resultCount").asInt()).isEqualTo(3);
        assertThat(completed.path("explorationRound").asInt()).isZero();

        MvcResult subscription = mockMvc.perform(get(
                "/api/v1/recommendations/{jobId}/events",
                jobId
            )
                .cookie(session.cookie())
                .header("Last-Event-ID", "0"))
            .andExpect(request().asyncStarted())
            .andReturn();
        MvcResult terminalStream = mockMvc.perform(asyncDispatch(subscription))
            .andExpect(status().isOk())
            .andReturn();
        String sse = terminalStream.getResponse().getContentAsString();
        assertThat(occurrences(sse, "event:snapshot")).isEqualTo(1);
        assertThat(sse).doesNotContain("event:progress", "event:completed");
        Matcher id = SSE_ID.matcher(sse);
        assertThat(id.find()).isTrue();
        assertThat(sse).contains("\"eventId\":\"" + id.group(1) + "\"");
        assertThat(sse).contains("\"status\":\"COMPLETED\"");
    }

    @Test
    void completedOwnerCanCreateOneIdempotentAlternativeWith202Location() throws Exception {
        SessionClient owner = createSession();
        UUID draftId = createAndConfirmDraft(owner);
        UUID sourceJobId = createJob(owner, draftId, "alternative-source-key");
        awaitCompleted(sourceJobId, owner);

        MvcResult accepted = mockMvc.perform(post(
                "/api/v1/recommendations/{jobId}/alternatives",
                sourceJobId
            )
                .cookie(owner.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, owner.csrfToken())
                .header("Idempotency-Key", "alternative-create-key")
                .contentType(MediaType.APPLICATION_JSON))
            .andExpect(status().isAccepted())
            .andExpect(header().string(
                "Location",
                org.hamcrest.Matchers.startsWith("/api/v1/recommendations/")
            ))
            .andExpect(jsonPath("$.status").value("ACCEPTED"))
            .andReturn();
        JsonNode body = objectMapper.readTree(accepted.getResponse().getContentAsByteArray());
        UUID alternativeJobId = UUID.fromString(body.path("jobId").asText());

        mockMvc.perform(post(
                "/api/v1/recommendations/{jobId}/alternatives",
                sourceJobId
            )
                .cookie(owner.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, owner.csrfToken())
                .header("Idempotency-Key", "alternative-create-key")
                .contentType(MediaType.APPLICATION_JSON))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.jobId").value(alternativeJobId.toString()));

        mockMvc.perform(get("/api/v1/recommendations/{jobId}", alternativeJobId)
                .cookie(owner.cookie()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.explorationRound").value(1))
            .andExpect(jsonPath("$.partial").value(false))
            .andExpect(jsonPath("$.resultCount").value(0));
        assertThat(jdbcClient.sql("SELECT COUNT(*) FROM recommendation_job")
            .query(Long.class).single()).isEqualTo(2L);
        assertThat(jdbcClient.sql("SELECT COUNT(*) FROM outbox_event")
            .query(Long.class).single()).isEqualTo(2L);
    }

    @Test
    void alternativeHidesOwnershipAndRejectsExhaustedSearch() throws Exception {
        SessionClient owner = createSession();
        SessionClient other = createSession();
        UUID sourceJobId = createJob(
            owner,
            createAndConfirmDraft(owner),
            "alternative-guard-source"
        );
        awaitCompleted(sourceJobId, owner);

        mockMvc.perform(post(
                "/api/v1/recommendations/{jobId}/alternatives",
                sourceJobId
            )
                .cookie(other.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, other.csrfToken())
                .header("Idempotency-Key", "alternative-other-owner"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.errorCode").value("RESOURCE_NOT_FOUND"));

        jdbcClient.sql("""
                UPDATE recommendation_job
                SET search_exhausted = TRUE
                WHERE id = :jobId
                """)
            .param("jobId", sourceJobId)
            .update();
        mockMvc.perform(post(
                "/api/v1/recommendations/{jobId}/alternatives",
                sourceJobId
            )
                .cookie(owner.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, owner.csrfToken())
                .header("Idempotency-Key", "alternative-exhausted"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.errorCode").value("NO_ALTERNATIVE_CANDIDATES"));
    }

    @Test
    void alternativeRequiresACompletedUnexpiredSource() throws Exception {
        SessionClient owner = createSession();
        UUID sourceJobId = createJob(
            owner,
            createAndConfirmDraft(owner),
            "alternative-state-source"
        );

        mockMvc.perform(post(
                "/api/v1/recommendations/{jobId}/alternatives",
                sourceJobId
            )
                .cookie(owner.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, owner.csrfToken())
                .header("Idempotency-Key", "alternative-before-complete"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.errorCode").value("INVALID_STATE"));

        jdbcClient.sql("""
                UPDATE recommendation_job
                SET status = 'COMPLETED',
                    stage = 'FINISHED',
                    progress = 100,
                    expires_at = NOW() + INTERVAL '4 minutes'
                WHERE id = :jobId
                """)
            .param("jobId", sourceJobId)
            .update();
        mockMvc.perform(post(
                "/api/v1/recommendations/{jobId}/alternatives",
                sourceJobId
            )
                .cookie(owner.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, owner.csrfToken())
                .header("Idempotency-Key", "alternative-near-expiry"))
            .andExpect(status().isGone())
            .andExpect(jsonPath("$.errorCode").value("JOB_EXPIRED"));
    }

    private SessionClient createSession() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/anonymous-sessions"))
            .andExpect(status().isCreated())
            .andReturn();
        Cookie responseCookie = result.getResponse().getCookie(
            SessionAuthenticator.SESSION_COOKIE
        );
        assertThat(responseCookie).isNotNull();
        JsonNode json = objectMapper.readTree(result.getResponse().getContentAsByteArray());
        return new SessionClient(
            new Cookie(responseCookie.getName(), responseCookie.getValue()),
            json.path("csrfToken").asText()
        );
    }

    private UUID createAndConfirmDraft(SessionClient session) throws Exception {
        MvcResult created = mockMvc.perform(post("/api/v1/recommendation-drafts")
                .cookie(session.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, session.csrfToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestText\":\"서울 성수동에서 조용한 디저트 카페\"}"))
            .andExpect(status().isCreated())
            .andReturn();
        UUID draftId = UUID.fromString(objectMapper.readTree(
            created.getResponse().getContentAsByteArray()
        ).path("draftId").asText());
        mockMvc.perform(put("/api/v1/recommendation-drafts/{draftId}", draftId)
                .cookie(session.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, session.csrfToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "condition": {
                        "locationQuery": "서울 성수동",
                        "placeType": "CAFE",
                        "placeTypeDetail": null,
                        "partySize": 4,
                        "budgetPerPersonMin": 10000,
                        "budgetPerPersonMax": 20000,
                        "preferences": [
                          {"value":"조용한","priority":8},
                          {"value":"디저트","priority":7}
                        ],
                        "exclusions": ["흡연"]
                      }
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CONFIRMED"));
        return draftId;
    }

    private UUID createJob(SessionClient session, UUID draftId, String key) throws Exception {
        MvcResult accepted = mockMvc.perform(post("/api/v1/recommendations")
                .cookie(session.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, session.csrfToken())
                .header("Idempotency-Key", key)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"draftId\":\"" + draftId + "\"}"))
            .andExpect(status().isAccepted())
            .andReturn();
        return UUID.fromString(objectMapper.readTree(
            accepted.getResponse().getContentAsByteArray()
        ).path("jobId").asText());
    }

    private JsonNode awaitCompleted(UUID jobId, SessionClient session) throws Exception {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(20));
        JsonNode latest = objectMapper.createObjectNode();
        while (Instant.now().isBefore(deadline)) {
            workerSchedules.relayAndConsume();
            MvcResult result = mockMvc.perform(get(
                    "/api/v1/recommendations/{jobId}",
                    jobId
                ).cookie(session.cookie()))
                .andExpect(status().isOk())
                .andReturn();
            latest = objectMapper.readTree(result.getResponse().getContentAsByteArray());
            if ("COMPLETED".equals(latest.path("status").asText()) ||
                "FAILED".equals(latest.path("status").asText())) {
                return latest;
            }
            Thread.sleep(100L);
        }
        throw new AssertionError("Recommendation job did not reach a terminal state: " + latest);
    }

    private static int occurrences(String value, String token) {
        return (value.length() - value.replace(token, "").length()) / token.length();
    }

    private record SessionClient(Cookie cookie, String csrfToken) {
    }
}
