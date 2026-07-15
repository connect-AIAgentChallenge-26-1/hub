package com.placepick.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.domain.scoring.EvidenceLevel;
import com.placepick.recommendation.domain.scoring.ScoreBreakdown;
import com.placepick.recommendation.job.RecommendationJobPlace;
import com.placepick.recommendation.reason.domain.ReasonStatement;
import com.placepick.session.SessionAuthenticator;
import com.placepick.session.SessionTokenCodec;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
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
class VotingRoomApiIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
        DockerImageName.parse(
            "postgres:16.14-bookworm@sha256:da788743d2060767375896de4d646f7576f5911461444b372616f19ea61db2ec"
        ).asCompatibleSubstituteFor("postgres")
    )
        .withDatabaseName("placepick_room_test")
        .withUsername("placepick")
        .withPassword("placepick-test");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcClient jdbcClient;

    @Autowired
    private SessionTokenCodec tokenCodec;

    @Autowired
    private VotingRoomService roomService;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("placepick.external.mode", () -> "mock");
        registry.add("placepick.role", () -> "api");
    }

    @BeforeEach
    void clearServiceData() {
        jdbcClient.sql("DELETE FROM idempotency_record").update();
        jdbcClient.sql("DELETE FROM voting_room").update();
        jdbcClient.sql("DELETE FROM recommendation_evidence").update();
        jdbcClient.sql("DELETE FROM recommendation_candidate").update();
        jdbcClient.sql("DELETE FROM processed_event").update();
        jdbcClient.sql("DELETE FROM outbox_event").update();
        jdbcClient.sql("DELETE FROM recommendation_job_event").update();
        jdbcClient.sql("DELETE FROM recommendation_job").update();
        jdbcClient.sql("DELETE FROM recommendation_draft").update();
        jdbcClient.sql("DELETE FROM anonymous_session").update();
    }

    @Test
    void createsHashOnlyRoomAndReplaysTheSameIdempotentResponse() throws Exception {
        SessionClient owner = createSession();
        SeededJob job = seedCompletedJob(owner.sessionId());

        mockMvc.perform(post("/api/v1/recommendations/{jobId}/rooms", job.jobId())
                .cookie(owner.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, owner.csrfToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));

        MvcResult first = createRoom(owner, job.jobId(), "room-key-1", 72);
        JsonNode firstJson = json(first);
        String shareToken = firstJson.path("shareToken").asText();
        Cookie organizer = responseCookie(first, OrganizerCookieFactory.COOKIE_NAME);

        assertThat(shareToken).hasSize(43);
        assertThat(organizer.getValue()).hasSize(43);
        assertThat(first.getResponse().getHeader("Set-Cookie"))
            .contains("HttpOnly")
            .contains("SameSite=Lax")
            .doesNotContain("Secure");
        assertThat(jdbcClient.sql("SELECT share_token_hash FROM voting_room")
            .query(String.class).single())
            .hasSize(64)
            .isNotEqualTo(shareToken);
        assertThat(jdbcClient.sql("SELECT organizer_capability_hash FROM voting_room")
            .query(String.class).single())
            .hasSize(64)
            .isNotEqualTo(organizer.getValue());
        assertThat(jdbcClient.sql("SELECT count(*) FROM voting_room_place")
            .query(Long.class).single()).isEqualTo(3L);
        assertThat(jdbcClient.sql("SELECT response_json::text FROM idempotency_record")
            .query(String.class).single())
            .doesNotContain(shareToken)
            .doesNotContain(organizer.getValue());

        MvcResult replay = mockMvc.perform(post(
                "/api/v1/recommendations/{jobId}/rooms",
                job.jobId()
            )
                .cookie(owner.cookie(), organizer)
                .header(SessionAuthenticator.CSRF_HEADER, owner.csrfToken())
                .header("Idempotency-Key", "room-key-1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"expiresInHours\":72}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.shareToken").value(shareToken))
            .andReturn();
        assertThat(responseCookie(replay, OrganizerCookieFactory.COOKIE_NAME).getValue())
            .isEqualTo(organizer.getValue());
        assertThat(jdbcClient.sql("SELECT count(*) FROM voting_room")
            .query(Long.class).single()).isEqualTo(1L);

        mockMvc.perform(post("/api/v1/recommendations/{jobId}/rooms", job.jobId())
                .cookie(owner.cookie(), organizer)
                .header(SessionAuthenticator.CSRF_HEADER, owner.csrfToken())
                .header("Idempotency-Key", "room-key-1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"expiresInHours\":24}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.errorCode").value("IDEMPOTENCY_KEY_REUSED"));
    }

    @Test
    void rejectsRoomCreationUntilTheOwnedJobIsCompleted() throws Exception {
        SessionClient owner = createSession();
        SeededJob job = seedCompletedJob(owner.sessionId());
        jdbcClient.sql("""
                UPDATE recommendation_job
                SET status = 'PROCESSING', stage = 'SCORING', progress = 70
                WHERE id = :id
                """)
            .param("id", job.jobId())
            .update();

        mockMvc.perform(post("/api/v1/recommendations/{jobId}/rooms", job.jobId())
                .cookie(owner.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, owner.csrfToken())
                .header("Idempotency-Key", "not-completed-room")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.errorCode").value("INVALID_STATE"));
        assertThat(jdbcClient.sql("SELECT count(*) FROM voting_room")
            .query(Long.class).single()).isZero();
    }

    @Test
    void isolatesTwoSessionsAndAtomicallyChangesAndDeletesVotes() throws Exception {
        SessionClient owner = createSession();
        SessionClient participant = createSession();
        SeededJob job = seedCompletedJob(owner.sessionId());
        MvcResult created = createRoom(owner, job.jobId(), "room-key-votes", null);
        String token = json(created).path("shareToken").asText();
        Cookie organizer = responseCookie(created, OrganizerCookieFactory.COOKIE_NAME);
        UUID placeId = job.places().get(0).placeId();

        mockMvc.perform(get("/api/v1/rooms/{shareToken}", token)
                .cookie(owner.cookie(), organizer))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.canFinalize").value(true))
            .andExpect(jsonPath("$.places", hasSize(3)))
            .andExpect(jsonPath("$.myVotes").isEmpty());
        mockMvc.perform(get("/api/v1/rooms/{shareToken}", token)
                .cookie(participant.cookie()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.canFinalize").value(false));

        putVote(participant, token, placeId, "LIKE")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.myVote").value("LIKE"))
            .andExpect(jsonPath("$.aggregate[0].likeCount").value(1));
        long eventsAfterFirstVote = roomEventCount();
        putVote(participant, token, placeId, "LIKE").andExpect(status().isOk());
        assertThat(roomEventCount()).isEqualTo(eventsAfterFirstVote);

        putVote(participant, token, placeId, "DISLIKE")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.aggregate[0].likeCount").value(0))
            .andExpect(jsonPath("$.aggregate[0].dislikeCount").value(1));
        mockMvc.perform(get("/api/v1/rooms/{shareToken}", token)
                .cookie(participant.cookie()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.myVotes['" + placeId + "']").value("DISLIKE"));
        mockMvc.perform(get("/api/v1/rooms/{shareToken}", token)
                .cookie(owner.cookie(), organizer))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.myVotes").isEmpty());

        deleteVote(participant, token, placeId).andExpect(status().isNoContent());
        long eventsAfterDelete = roomEventCount();
        deleteVote(participant, token, placeId).andExpect(status().isNoContent());
        assertThat(roomEventCount()).isEqualTo(eventsAfterDelete);
        assertThat(jdbcClient.sql("SELECT count(*) FROM room_vote")
            .query(Long.class).single()).isZero();
    }

    @Test
    void requiresTheRightOrganizerAndFinalizesOnlyOnce() throws Exception {
        SessionClient owner = createSession();
        SessionClient participant = createSession();
        SeededJob firstJob = seedCompletedJob(owner.sessionId());
        MvcResult firstCreated = createRoom(owner, firstJob.jobId(), "first-room", 72);
        String firstToken = json(firstCreated).path("shareToken").asText();
        Cookie firstOrganizer = responseCookie(
            firstCreated,
            OrganizerCookieFactory.COOKIE_NAME
        );

        SeededJob secondJob = seedCompletedJob(owner.sessionId());
        MvcResult secondCreated = createRoom(owner, secondJob.jobId(), "second-room", 72);
        String secondToken = json(secondCreated).path("shareToken").asText();
        UUID placeId = firstJob.places().get(0).placeId();

        finalizeRoom(
            participant,
            firstToken,
            null,
            placeId,
            "participant-final"
        )
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.errorCode").value("ORGANIZER_REQUIRED"));
        finalizeRoom(
            owner,
            secondToken,
            firstOrganizer,
            secondJob.places().get(0).placeId(),
            "cross-room-final"
        )
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.errorCode").value("ORGANIZER_REQUIRED"));

        finalizeRoom(owner, firstToken, firstOrganizer, placeId, "owner-final")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.place.placeId").value(placeId.toString()))
            .andExpect(jsonPath("$.finalizedAt").isString());
        finalizeRoom(
            owner,
            firstToken,
            firstOrganizer,
            firstJob.places().get(1).placeId(),
            "owner-final"
        )
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.errorCode").value("IDEMPOTENCY_KEY_REUSED"));
        finalizeRoom(owner, firstToken, firstOrganizer, placeId, "owner-final-retry")
            .andExpect(status().isOk());
        finalizeRoom(
            owner,
            firstToken,
            firstOrganizer,
            firstJob.places().get(1).placeId(),
            "owner-final-conflict"
        )
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.errorCode").value("FINAL_RESULT_CONFLICT"));
        putVote(participant, firstToken, placeId, "LIKE")
            .andExpect(status().isConflict());
        mockMvc.perform(get("/api/v1/rooms/{shareToken}/result", firstToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.place.placeId").value(placeId.toString()));
    }

    @Test
    void keepsOrganizerCapabilitiesForTwoRoomsInIndependentCookiePaths()
        throws Exception {
        SessionClient owner = createSession();
        SeededJob firstJob = seedCompletedJob(owner.sessionId());
        SeededJob secondJob = seedCompletedJob(owner.sessionId());

        MvcResult firstCreated = createRoom(
            owner,
            firstJob.jobId(),
            "multi-room-first",
            72
        );
        MvcResult secondCreated = createRoom(
            owner,
            secondJob.jobId(),
            "multi-room-second",
            72
        );
        String firstToken = json(firstCreated).path("shareToken").asText();
        String secondToken = json(secondCreated).path("shareToken").asText();
        Cookie firstOrganizer = responseCookie(
            firstCreated,
            OrganizerCookieFactory.COOKIE_NAME
        );
        Cookie secondOrganizer = responseCookie(
            secondCreated,
            OrganizerCookieFactory.COOKIE_NAME
        );

        assertThat(firstCreated.getResponse().getHeader(HttpHeaders.SET_COOKIE))
            .contains("Path=/api/v1/rooms/" + firstToken);
        assertThat(secondCreated.getResponse().getHeader(HttpHeaders.SET_COOKIE))
            .contains("Path=/api/v1/rooms/" + secondToken);
        assertThat(firstOrganizer.getValue()).isNotEqualTo(secondOrganizer.getValue());

        mockMvc.perform(get("/api/v1/rooms/{shareToken}", firstToken)
                .cookie(owner.cookie(), firstOrganizer))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.canFinalize").value(true));
        mockMvc.perform(get("/api/v1/rooms/{shareToken}", secondToken)
                .cookie(owner.cookie(), secondOrganizer))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.canFinalize").value(true));
        mockMvc.perform(get("/api/v1/rooms/{shareToken}", firstToken)
                .cookie(owner.cookie(), secondOrganizer))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.canFinalize").value(false));

        UUID firstPlace = firstJob.places().get(0).placeId();
        UUID secondPlace = secondJob.places().get(0).placeId();
        finalizeRoom(
            owner,
            firstToken,
            firstOrganizer,
            firstPlace,
            "multi-room-first-final"
        )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.place.placeId").value(firstPlace.toString()));
        finalizeRoom(
            owner,
            secondToken,
            secondOrganizer,
            secondPlace,
            "multi-room-second-final"
        )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.place.placeId").value(secondPlace.toString()));

        assertThat(jdbcClient.sql("""
                SELECT count(*) FROM voting_room WHERE status = 'FINALIZED'
                """)
            .query(Long.class)
            .single()).isEqualTo(2L);
    }

    @Test
    void distinguishesMissingAndExpiredRoomsAndUnfinalizedResult() throws Exception {
        SessionClient owner = createSession();
        SeededJob job = seedCompletedJob(owner.sessionId());
        MvcResult created = createRoom(owner, job.jobId(), "expiry-room", 1);
        String token = json(created).path("shareToken").asText();

        mockMvc.perform(get("/api/v1/rooms/{shareToken}/events", token)
                .header("Last-Event-ID", "-1"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));

        mockMvc.perform(get("/api/v1/rooms/{shareToken}", "not-a-valid-token"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.errorCode").value("RESOURCE_NOT_FOUND"));
        mockMvc.perform(get("/api/v1/rooms/{shareToken}/result", token))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.errorCode").value("RESULT_NOT_FINALIZED"));

        jdbcClient.sql("UPDATE voting_room SET expires_at = :expiredAt")
            .param("expiredAt", OffsetDateTime.ofInstant(
                Instant.now().minusSeconds(1),
                ZoneOffset.UTC
            ))
            .update();
        mockMvc.perform(get("/api/v1/rooms/{shareToken}", token))
            .andExpect(status().isGone())
            .andExpect(jsonPath("$.errorCode").value("ROOM_EXPIRED"));
    }

    @Test
    void serializesConcurrentVoteReplacementToOneDatabaseVote() throws Exception {
        SessionClient owner = createSession();
        SessionClient participant = createSession();
        SeededJob job = seedCompletedJob(owner.sessionId());
        String token = json(createRoom(owner, job.jobId(), "race-room", 72))
            .path("shareToken")
            .asText();
        UUID placeId = job.places().get(0).placeId();
        CountDownLatch start = new CountDownLatch(1);

        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> like = executor.submit(() -> {
                await(start);
                roomService.putVote(token, participant.sessionId(), placeId, VoteValue.LIKE);
            });
            Future<?> dislike = executor.submit(() -> {
                await(start);
                roomService.putVote(token, participant.sessionId(), placeId, VoteValue.DISLIKE);
            });
            start.countDown();
            like.get();
            dislike.get();
        } finally {
            executor.shutdownNow();
        }

        assertThat(jdbcClient.sql("SELECT count(*) FROM room_vote")
            .query(Long.class).single()).isEqualTo(1L);
        VoteAggregate aggregate = roomService.get(token, participant.sessionId(), null)
            .aggregate()
            .get(0);
        assertThat(aggregate.likeCount() + aggregate.dislikeCount()).isEqualTo(1L);
    }

    private MvcResult createRoom(
        SessionClient owner,
        UUID jobId,
        String idempotencyKey,
        Integer expiresInHours
    ) throws Exception {
        String body = expiresInHours == null
            ? "{}"
            : "{\"expiresInHours\":" + expiresInHours + "}";
        return mockMvc.perform(post("/api/v1/recommendations/{jobId}/rooms", jobId)
                .cookie(owner.cookie())
                .header(SessionAuthenticator.CSRF_HEADER, owner.csrfToken())
                .header("Idempotency-Key", idempotencyKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isCreated())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(header().string("Location", org.hamcrest.Matchers.startsWith(
                "/api/v1/rooms/"
            )))
            .andExpect(jsonPath("$.shareToken").isString())
            .andExpect(jsonPath("$.shareUrl").isString())
            .andExpect(jsonPath("$.expiresAt").isString())
            .andReturn();
    }

    private org.springframework.test.web.servlet.ResultActions putVote(
        SessionClient session,
        String shareToken,
        UUID placeId,
        String value
    ) throws Exception {
        return mockMvc.perform(put(
                "/api/v1/rooms/{shareToken}/votes/{placeId}",
                shareToken,
                placeId
            )
            .cookie(session.cookie())
            .header(SessionAuthenticator.CSRF_HEADER, session.csrfToken())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"value\":\"" + value + "\"}"));
    }

    private org.springframework.test.web.servlet.ResultActions deleteVote(
        SessionClient session,
        String shareToken,
        UUID placeId
    ) throws Exception {
        return mockMvc.perform(delete(
                "/api/v1/rooms/{shareToken}/votes/{placeId}",
                shareToken,
                placeId
            )
            .cookie(session.cookie())
            .header(SessionAuthenticator.CSRF_HEADER, session.csrfToken()));
    }

    private org.springframework.test.web.servlet.ResultActions finalizeRoom(
        SessionClient session,
        String shareToken,
        Cookie organizer,
        UUID placeId,
        String idempotencyKey
    ) throws Exception {
        var request = put("/api/v1/rooms/{shareToken}/final-result", shareToken)
            .cookie(session.cookie())
            .header(SessionAuthenticator.CSRF_HEADER, session.csrfToken())
            .header("Idempotency-Key", idempotencyKey)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"placeId\":\"" + placeId + "\"}");
        if (organizer != null) {
            request.cookie(organizer);
        }
        return mockMvc.perform(request);
    }

    private SessionClient createSession() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/anonymous-sessions"))
            .andExpect(status().isCreated())
            .andReturn();
        Cookie cookie = responseCookie(result, SessionAuthenticator.SESSION_COOKIE);
        JsonNode response = json(result);
        UUID sessionId = jdbcClient.sql("""
                SELECT id FROM anonymous_session WHERE token_hash = :tokenHash
                """)
            .param("tokenHash", tokenCodec.hash(cookie.getValue()))
            .query(UUID.class)
            .single();
        return new SessionClient(
            new Cookie(cookie.getName(), cookie.getValue()),
            response.path("csrfToken").asText(),
            sessionId
        );
    }

    private SeededJob seedCompletedJob(UUID sessionId) throws Exception {
        UUID draftId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        Instant now = Instant.now();
        ConfirmedRecommendationCondition condition = new ConfirmedRecommendationCondition(
            "서울",
            PlaceType.CAFE,
            null,
            2,
            null,
            null,
            List.of(),
            List.of()
        );
        List<RecommendationJobPlace> places = List.of(
            place(1),
            place(2),
            place(3)
        );
        jdbcClient.sql("""
                INSERT INTO recommendation_draft (
                    id, session_id, status, request_text, condition_json, warnings_json,
                    created_at, updated_at, expires_at
                ) VALUES (
                    :id, :sessionId, 'CONFIRMED', :requestText,
                    CAST(:condition AS jsonb), '[]'::jsonb, :now, :now, :expiresAt
                )
                """)
            .param("id", draftId)
            .param("sessionId", sessionId)
            .param("requestText", "synthetic integration condition")
            .param("condition", objectMapper.writeValueAsString(condition))
            .param("now", timestamp(now))
            .param("expiresAt", timestamp(now.plusSeconds(1_800)))
            .update();
        jdbcClient.sql("""
                INSERT INTO recommendation_job (
                    id, session_id, draft_id, status, stage, progress, degraded,
                    condition_json, warnings_json, places_json,
                    created_at, updated_at, expires_at
                ) VALUES (
                    :id, :sessionId, :draftId, 'COMPLETED', 'FINISHED', 100, FALSE,
                    CAST(:condition AS jsonb), '[]'::jsonb, CAST(:places AS jsonb),
                    :now, :now, :expiresAt
                )
                """)
            .param("id", jobId)
            .param("sessionId", sessionId)
            .param("draftId", draftId)
            .param("condition", objectMapper.writeValueAsString(condition))
            .param("places", objectMapper.writeValueAsString(places))
            .param("now", timestamp(now))
            .param("expiresAt", timestamp(now.plusSeconds(86_400)))
            .update();
        for (int index = 0; index < places.size(); index++) {
            RecommendationJobPlace place = places.get(index);
            jdbcClient.sql("""
                    INSERT INTO recommendation_candidate (
                        job_id, place_id, ordinal, snapshot_json, score, evidence_level
                    ) VALUES (
                        :jobId, :placeId, :ordinal, CAST(:snapshot AS jsonb),
                        :score, 'LOCAL_AND_BLOG'
                    )
                    """)
                .param("jobId", jobId)
                .param("placeId", place.placeId())
                .param("ordinal", index + 1)
                .param("snapshot", objectMapper.writeValueAsString(place))
                .param("score", place.score())
                .update();
        }
        return new SeededJob(jobId, places);
    }

    private RecommendationJobPlace place(int ordinal) {
        ScoreBreakdown score = new ScoreBreakdown(30, 25, 0, 10, 10);
        return new RecommendationJobPlace(
            UUID.randomUUID(),
            "Synthetic Place " + ordinal,
            "카페",
            "서울 모의로 " + ordinal,
            "서울 모의동 " + ordinal,
            "https://example.invalid/places/" + ordinal,
            score.total(),
            score,
            List.of(new ReasonStatement(
                "검증된 합성 근거를 사용한 추천입니다.",
                List.of("local:synthetic-" + ordinal)
            )),
            List.of("가격 근거 없음"),
            "Synthetic Place " + ordinal,
            EvidenceLevel.LOCAL_AND_BLOG
        );
    }

    private long roomEventCount() {
        return jdbcClient.sql("SELECT count(*) FROM voting_room_event")
            .query(Long.class)
            .single();
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsByteArray());
    }

    private Cookie responseCookie(MvcResult result, String name) {
        Cookie cookie = result.getResponse().getCookie(name);
        assertThat(cookie).isNotNull();
        return new Cookie(cookie.getName(), cookie.getValue());
    }

    private OffsetDateTime timestamp(Instant instant) {
        return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Concurrent vote test was interrupted.", exception);
        }
    }

    private record SessionClient(Cookie cookie, String csrfToken, UUID sessionId) {
    }

    private record SeededJob(UUID jobId, List<RecommendationJobPlace> places) {
        private SeededJob {
            places = List.copyOf(places);
        }
    }
}
