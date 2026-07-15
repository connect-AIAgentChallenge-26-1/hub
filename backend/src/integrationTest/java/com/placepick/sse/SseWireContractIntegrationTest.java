package com.placepick.sse;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.recommendation.domain.candidate.CandidateEvidence;
import com.placepick.recommendation.domain.candidate.CandidateKey;
import com.placepick.recommendation.domain.candidate.NormalizedCandidate;
import com.placepick.recommendation.domain.scoring.EvidenceLevel;
import com.placepick.recommendation.domain.scoring.RankedPlace;
import com.placepick.recommendation.domain.scoring.ScoreBreakdown;
import com.placepick.recommendation.job.RecommendationJobEmitterRegistry;
import com.placepick.recommendation.job.RecommendationJobPlace;
import com.placepick.recommendation.job.RecommendationJobStage;
import com.placepick.recommendation.job.RecommendationJobTransactionCoordinator;
import com.placepick.recommendation.reason.domain.ReasonStatement;
import com.placepick.recommendation.workflow.application.RecommendationCorePlace;
import com.placepick.recommendation.workflow.application.RecommendationCoreResult;
import com.placepick.room.VotingRoomEmitterRegistry;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/** Positive, real HTTP wire contract for both public SSE resources. */
@Testcontainers
@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SseWireContractIntegrationTest {

    private static final Duration HTTP_TIMEOUT = Duration.ofSeconds(10);
    private static final Duration EVENT_TIMEOUT = Duration.ofSeconds(10);

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
        DockerImageName.parse(
            "postgres:16.14-bookworm@sha256:da788743d2060767375896de4d646f7576f5911461444b372616f19ea61db2ec"
        ).asCompatibleSubstituteFor("postgres")
    )
        .withDatabaseName("placepick_sse_wire_test")
        .withUsername("placepick")
        .withPassword("placepick-test");

    @LocalServerPort
    private int port;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcClient jdbcClient;

    @Autowired
    private RecommendationJobTransactionCoordinator jobTransactions;

    @Autowired
    private RecommendationJobEmitterRegistry jobEmitters;

    @Autowired
    private VotingRoomEmitterRegistry roomEmitters;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("placepick.external.mode", () -> "mock");
        registry.add("placepick.role", () -> "api");
        registry.add("placepick.sse.poll-delay-ms", () -> "60000");
    }

    @BeforeEach
    void clearState() {
        assertThat(jobEmitters.activeConnectionCount()).isZero();
        assertThat(roomEmitters.activeConnectionCount()).isZero();
        jdbcClient.sql(
            "TRUNCATE TABLE outbox_event, processed_event, anonymous_session CASCADE"
        ).update();
    }

    @Test
    void recommendationStreamIsSnapshotFirstMonotonicReconnectableAndClosesAtFailure()
        throws Exception {
        ApiClient owner = createSession();
        UUID draftId = createAndConfirmDraft(owner);
        UUID jobId = createRecommendation(owner, draftId, "sse-job-create-1");

        try (SseConnection stream = openSse(
            owner,
            "/api/v1/recommendations/" + jobId + "/events",
            null
        )) {
            assertSseHeaders(stream.response());
            SseEvent snapshot = stream.await("snapshot");
            assertThat(stream.events()).extracting(SseEvent::name)
                .containsExactly("snapshot");
            assertEnvelope(snapshot, jobId, "ACCEPTED");
            assertThat(jobEmitters.activeConnectionCount()).isEqualTo(1);

            jobEmitters.heartbeat();
            SseEvent heartbeat = stream.await("heartbeat");
            JsonNode heartbeatEnvelope = objectMapper.readTree(heartbeat.data());
            assertThat(heartbeatEnvelope.path("eventId").asText()).isEqualTo(snapshot.id());
            assertThat(heartbeatEnvelope.path("aggregateId").asText())
                .isEqualTo(jobId.toString());

            UUID workerEventId = UUID.randomUUID();
            jobTransactions.claim(workerEventId, jobId);
            SseEvent processing = stream.await("progress");
            jobTransactions.progress(jobId, RecommendationJobStage.SCORING, 70);
            SseEvent scoring = stream.await("progress");
            jobTransactions.fail(
                workerEventId,
                jobId,
                "PROVIDER_UNAVAILABLE",
                "The synthetic provider is unavailable."
            );
            SseEvent failed = stream.await("failed");

            assertStrictlyIncreasing(snapshot, processing, scoring, failed);
            assertEnvelope(processing, jobId, "PROCESSING");
            assertEnvelope(scoring, jobId, "PROCESSING");
            assertEnvelope(failed, jobId, "FAILED");
            assertThat(objectMapper.readTree(failed.data()).path("snapshot")
                .path("failure").path("errorCode").asText())
                .isEqualTo("PROVIDER_UNAVAILABLE");
            assertThat(stream.events()).extracting(SseEvent::name).containsExactly(
                "snapshot",
                "heartbeat",
                "progress",
                "progress",
                "failed"
            );
            stream.awaitClosed();
        }
        awaitNoConnections(jobEmitters::activeConnectionCount);

        long staleCursor = jdbcClient.sql("""
                SELECT MIN(sequence_id) FROM recommendation_job_event WHERE job_id = :jobId
                """)
            .param("jobId", jobId)
            .query(Long.class)
            .single();
        try (SseConnection reconnect = openSse(
            owner,
            "/api/v1/recommendations/" + jobId + "/events",
            staleCursor
        )) {
            SseEvent converged = reconnect.await("snapshot");
            assertThat(Long.parseLong(converged.id())).isGreaterThan(staleCursor);
            assertEnvelope(converged, jobId, "FAILED");
            reconnect.awaitClosed();
            assertThat(reconnect.events()).extracting(SseEvent::name)
                .containsExactly("snapshot");
        }
        awaitNoConnections(jobEmitters::activeConnectionCount);
    }

    @Test
    void recommendationStreamDeliversCompletedSnapshotAndClosesTheConnection()
        throws Exception {
        ApiClient owner = createSession();
        UUID draftId = createAndConfirmDraft(owner);
        UUID jobId = createRecommendation(owner, draftId, "sse-job-completed-1");

        try (SseConnection stream = openSse(
            owner,
            "/api/v1/recommendations/" + jobId + "/events",
            null
        )) {
            SseEvent snapshot = stream.await("snapshot");
            UUID workerEventId = UUID.randomUUID();
            jobTransactions.claim(workerEventId, jobId);
            SseEvent progress = stream.await("progress");
            jobTransactions.complete(workerEventId, jobId, successfulCoreResult());
            SseEvent completed = stream.await("completed");

            assertStrictlyIncreasing(snapshot, progress, completed);
            JsonNode envelope = assertEnvelope(completed, jobId, "COMPLETED");
            assertThat(envelope.path("snapshot").path("places")).hasSize(3);
            assertThat(envelope.path("snapshot").path("progress").asInt()).isEqualTo(100);
            assertThat(stream.events()).extracting(SseEvent::name)
                .containsExactly("snapshot", "progress", "completed");
            stream.awaitClosed();
        }
        awaitNoConnections(jobEmitters::activeConnectionCount);
    }

    @Test
    void roomStreamPublishesVoteChangesHeartbeatAndFinalizationThenReconnects()
        throws Exception {
        ApiClient owner = createSession();
        ApiClient participant = createSession();
        UUID draftId = createAndConfirmDraft(owner);
        UUID jobId = createRecommendation(owner, draftId, "sse-room-job-create-1");
        List<RecommendationJobPlace> places = promoteToCompleted(jobId);
        JsonNode room = sendJson(
            owner,
            "POST",
            "/api/v1/recommendations/" + jobId + "/rooms",
            "{}",
            "room-sse-create-1",
            201
        );
        String shareToken = room.path("shareToken").asText();
        UUID placeId = places.get(0).placeId();

        long finalizedId;
        try (SseConnection stream = openSse(
            participant,
            "/api/v1/rooms/" + shareToken + "/events",
            null
        )) {
            assertSseHeaders(stream.response());
            SseEvent snapshot = stream.await("snapshot");
            assertThat(stream.events()).extracting(SseEvent::name)
                .containsExactly("snapshot");
            JsonNode initial = assertEnvelope(snapshot, null, "OPEN");
            UUID roomId = UUID.fromString(initial.path("aggregateId").asText());
            assertThat(roomEmitters.activeConnectionCount()).isEqualTo(1);

            roomEmitters.heartbeat();
            SseEvent heartbeat = stream.await("heartbeat");
            assertThat(heartbeat.id()).isEqualTo(snapshot.id());
            assertThat(objectMapper.readTree(heartbeat.data()).path("aggregateId").asText())
                .isEqualTo(roomId.toString());

            sendJson(
                participant,
                "PUT",
                "/api/v1/rooms/" + shareToken + "/votes/" + placeId,
                "{\"value\":\"LIKE\"}",
                null,
                200
            );
            SseEvent liked = stream.await("voteUpdated");
            JsonNode likedEnvelope = assertEnvelope(liked, roomId, "OPEN");
            assertThat(likedEnvelope.path("snapshot").path("myVotes")
                .path(placeId.toString()).asText()).isEqualTo("LIKE");

            sendNoContent(
                participant,
                "DELETE",
                "/api/v1/rooms/" + shareToken + "/votes/" + placeId
            );
            SseEvent removed = stream.await("voteRemoved");
            JsonNode removedEnvelope = assertEnvelope(removed, roomId, "OPEN");
            assertThat(removedEnvelope.path("snapshot").path("myVotes")
                .has(placeId.toString())).isFalse();

            sendJson(
                owner,
                "PUT",
                "/api/v1/rooms/" + shareToken + "/final-result",
                "{\"placeId\":\"" + placeId + "\"}",
                "room-sse-finalize-1",
                200
            );
            SseEvent finalized = stream.await("finalized");
            JsonNode finalizedEnvelope = assertEnvelope(finalized, roomId, "FINALIZED");
            assertThat(finalizedEnvelope.path("snapshot").path("finalizedPlaceId").asText())
                .isEqualTo(placeId.toString());
            assertStrictlyIncreasing(snapshot, liked, removed, finalized);
            assertThat(stream.events()).extracting(SseEvent::name).containsExactly(
                "snapshot",
                "heartbeat",
                "voteUpdated",
                "voteRemoved",
                "finalized"
            );
            finalizedId = Long.parseLong(finalized.id());
            stream.awaitClosed();
        }
        awaitNoConnections(roomEmitters::activeConnectionCount);

        try (SseConnection reconnect = openSse(
            participant,
            "/api/v1/rooms/" + shareToken + "/events",
            finalizedId - 1
        )) {
            SseEvent converged = reconnect.await("snapshot");
            assertThat(Long.parseLong(converged.id())).isEqualTo(finalizedId);
            assertEnvelope(converged, null, "FINALIZED");
            reconnect.awaitClosed();
            assertThat(reconnect.events()).extracting(SseEvent::name)
                .containsExactly("snapshot");
        }
        awaitNoConnections(roomEmitters::activeConnectionCount);
    }

    private ApiClient createSession() throws Exception {
        CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        HttpClient http = HttpClient.newBuilder()
            .cookieHandler(cookies)
            .connectTimeout(HTTP_TIMEOUT)
            .version(HttpClient.Version.HTTP_1_1)
            .build();
        HttpResponse<String> response = http.send(
            request("POST", "/api/v1/anonymous-sessions", null, null, null)
                .build(),
            HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
        );
        assertThat(response.statusCode()).isEqualTo(201);
        String csrfToken = objectMapper.readTree(response.body()).path("csrfToken").asText();
        assertThat(csrfToken).isNotBlank();
        assertThat(cookies.getCookieStore().getCookies()).isNotEmpty();
        return new ApiClient(http, csrfToken);
    }

    private UUID createAndConfirmDraft(ApiClient client) throws Exception {
        JsonNode draft = sendJson(
            client,
            "POST",
            "/api/v1/recommendation-drafts",
            "{\"requestText\":\"서울 성수동에서 조용한 디저트 카페\"}",
            null,
            201
        );
        UUID draftId = UUID.fromString(draft.path("draftId").asText());
        sendJson(
            client,
            "PUT",
            "/api/v1/recommendation-drafts/" + draftId,
            """
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
                """,
            null,
            200
        );
        return draftId;
    }

    private UUID createRecommendation(ApiClient client, UUID draftId, String key)
        throws Exception {
        JsonNode accepted = sendJson(
            client,
            "POST",
            "/api/v1/recommendations",
            "{\"draftId\":\"" + draftId + "\"}",
            key,
            202
        );
        return UUID.fromString(accepted.path("jobId").asText());
    }

    private List<RecommendationJobPlace> promoteToCompleted(UUID jobId) throws Exception {
        List<RecommendationJobPlace> places = List.of(place(1), place(2), place(3));
        Instant now = Instant.now();
        jdbcClient.sql("""
                UPDATE recommendation_job
                SET status = 'COMPLETED', stage = 'FINISHED', progress = 100,
                    places_json = CAST(:places AS jsonb), updated_at = :updatedAt
                WHERE id = :jobId
                """)
            .param("jobId", jobId)
            .param("places", objectMapper.writeValueAsString(places))
            .param("updatedAt", OffsetDateTime.ofInstant(now, ZoneOffset.UTC))
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
        return places;
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

    private RecommendationCoreResult successfulCoreResult() {
        List<RecommendationCorePlace> places = new ArrayList<>();
        for (int ordinal = 1; ordinal <= 3; ordinal++) {
            String evidenceId = "blog:synthetic-" + ordinal;
            NormalizedCandidate candidate = new NormalizedCandidate(
                CandidateKey.fromIdentity("synthetic-candidate-" + ordinal),
                "Synthetic Place " + ordinal,
                "카페",
                "검증된 합성 후보",
                "서울 모의동 " + ordinal,
                "서울 모의로 " + ordinal,
                "https://example.invalid/places/" + ordinal,
                "synthetic place cafe seoul"
            );
            RankedPlace ranked = new RankedPlace(
                UUID.randomUUID(),
                candidate,
                List.of(new CandidateEvidence(
                    evidenceId,
                    "합성 근거",
                    "계약 검증을 위한 근거입니다.",
                    "https://example.invalid/evidence/" + ordinal
                )),
                new ScoreBreakdown(30, 25, 0, 10, 3)
            );
            places.add(new RecommendationCorePlace(
                ranked,
                List.of(new ReasonStatement(
                    "검증된 합성 근거를 사용한 추천입니다.",
                    List.of(evidenceId)
                )),
                List.of("가격 근거 없음"),
                "Synthetic Place " + ordinal + " 추천",
                EvidenceLevel.LOCAL_AND_BLOG
            ));
        }
        return new RecommendationCoreResult(
            places,
            false,
            List.of(),
            false,
            false,
            1,
            3,
            1
        );
    }

    private JsonNode sendJson(
        ApiClient client,
        String method,
        String path,
        String body,
        String idempotencyKey,
        int expectedStatus
    ) throws Exception {
        HttpRequest.Builder request = request(
            method,
            path,
            body,
            client.csrfToken(),
            idempotencyKey
        );
        HttpResponse<String> response = client.http().send(
            request.build(),
            HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
        );
        assertThat(response.statusCode()).isEqualTo(expectedStatus);
        assertThat(response.headers().firstValue(HttpHeaders.CACHE_CONTROL))
            .contains("no-store");
        return objectMapper.readTree(response.body());
    }

    private void sendNoContent(ApiClient client, String method, String path)
        throws Exception {
        HttpResponse<String> response = client.http().send(
            request(method, path, null, client.csrfToken(), null).build(),
            HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
        );
        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(response.body()).isEmpty();
    }

    private HttpRequest.Builder request(
        String method,
        String path,
        String body,
        String csrfToken,
        String idempotencyKey
    ) {
        HttpRequest.BodyPublisher publisher = body == null
            ? HttpRequest.BodyPublishers.noBody()
            : HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8);
        HttpRequest.Builder request = HttpRequest.newBuilder(uri(path))
            .timeout(HTTP_TIMEOUT)
            .method(method, publisher)
            .header(HttpHeaders.ACCEPT, "application/json");
        if (body != null) {
            request.header(HttpHeaders.CONTENT_TYPE, "application/json");
        }
        if (csrfToken != null) {
            request.header("X-CSRF-Token", csrfToken);
        }
        if (idempotencyKey != null) {
            request.header("Idempotency-Key", idempotencyKey);
        }
        return request;
    }

    private SseConnection openSse(ApiClient client, String path, Long lastEventId)
        throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(uri(path))
            .GET()
            .timeout(Duration.ofSeconds(30))
            .header(HttpHeaders.ACCEPT, "text/event-stream");
        if (lastEventId != null) {
            request.header("Last-Event-ID", Long.toString(lastEventId));
        }
        HttpResponse<InputStream> response = client.http().sendAsync(
                request.build(),
                HttpResponse.BodyHandlers.ofInputStream()
            )
            .get(HTTP_TIMEOUT.toSeconds(), TimeUnit.SECONDS);
        assertThat(response.statusCode()).isEqualTo(200);
        return new SseConnection(response);
    }

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }

    private void assertSseHeaders(HttpResponse<?> response) {
        assertThat(response.headers().firstValue(HttpHeaders.CONTENT_TYPE))
            .hasValueSatisfying(value -> assertThat(value).startsWith("text/event-stream"));
        assertThat(response.headers().firstValue(HttpHeaders.CACHE_CONTROL))
            .contains("no-store");
        assertThat(response.headers().firstValue("X-Accel-Buffering")).contains("no");
        assertThat(response.headers().firstValue("X-Content-Type-Options"))
            .contains("nosniff");
    }

    private JsonNode assertEnvelope(SseEvent event, UUID aggregateId, String status)
        throws Exception {
        assertThat(event.id()).isNotBlank();
        JsonNode envelope = objectMapper.readTree(event.data());
        assertThat(envelope.path("eventId").asText()).isEqualTo(event.id());
        assertThat(envelope.path("occurredAt").asText()).isNotBlank();
        assertThat(envelope.path("aggregateId").asText()).isNotBlank();
        if (aggregateId != null) {
            assertThat(envelope.path("aggregateId").asText())
                .isEqualTo(aggregateId.toString());
        }
        assertThat(envelope.path("snapshot").path("status").asText()).isEqualTo(status);
        return envelope;
    }

    private static void assertStrictlyIncreasing(SseEvent... events) {
        long previous = -1;
        for (SseEvent event : events) {
            long current = Long.parseLong(event.id());
            assertThat(current).isGreaterThan(previous);
            previous = current;
        }
    }

    private static void awaitNoConnections(ConnectionCount count) throws Exception {
        Instant deadline = Instant.now().plusSeconds(5);
        while (Instant.now().isBefore(deadline) && count.get() != 0) {
            Thread.sleep(25L);
        }
        assertThat(count.get()).isZero();
    }

    private record ApiClient(HttpClient http, String csrfToken) {
    }

    private record SseEvent(String name, String id, String data) {
    }

    @FunctionalInterface
    private interface ConnectionCount {
        int get();
    }

    private static final class SseConnection implements AutoCloseable {
        private final HttpResponse<InputStream> response;
        private final BlockingQueue<SseEvent> unread = new LinkedBlockingQueue<>();
        private final List<SseEvent> events = new CopyOnWriteArrayList<>();
        private final CompletableFuture<Void> reader;

        private SseConnection(HttpResponse<InputStream> response) {
            this.response = response;
            reader = CompletableFuture.runAsync(() -> read(response.body()));
        }

        private HttpResponse<InputStream> response() {
            return response;
        }

        private List<SseEvent> events() {
            return List.copyOf(events);
        }

        private SseEvent await(String expectedName) throws Exception {
            Instant deadline = Instant.now().plus(EVENT_TIMEOUT);
            List<String> observed = new ArrayList<>();
            while (Instant.now().isBefore(deadline)) {
                SseEvent event = unread.poll(100, TimeUnit.MILLISECONDS);
                if (event == null) {
                    if (reader.isCompletedExceptionally()) {
                        reader.get();
                    }
                    continue;
                }
                observed.add(event.name());
                if (expectedName.equals(event.name())) {
                    return event;
                }
            }
            throw new AssertionError(
                "SSE event was not observed: expected=" + expectedName + ", observed=" + observed
            );
        }

        private void awaitClosed() throws Exception {
            reader.get(EVENT_TIMEOUT.toSeconds(), TimeUnit.SECONDS);
        }

        private void read(InputStream input) {
            try (BufferedReader lines = new BufferedReader(new InputStreamReader(
                input,
                StandardCharsets.UTF_8
            ))) {
                String eventName = null;
                String eventId = null;
                StringBuilder data = new StringBuilder();
                String line;
                while ((line = lines.readLine()) != null) {
                    if (line.isEmpty()) {
                        if (eventName != null || eventId != null || data.length() > 0) {
                            SseEvent event = new SseEvent(
                                eventName,
                                eventId,
                                data.toString()
                            );
                            events.add(event);
                            unread.add(event);
                        }
                        eventName = null;
                        eventId = null;
                        data.setLength(0);
                    } else if (line.startsWith("event:")) {
                        eventName = line.substring("event:".length()).trim();
                    } else if (line.startsWith("id:")) {
                        eventId = line.substring("id:".length()).trim();
                    } else if (line.startsWith("data:")) {
                        if (data.length() > 0) {
                            data.append('\n');
                        }
                        data.append(line.substring("data:".length()).trim());
                    }
                }
            } catch (IOException exception) {
                throw new IllegalStateException("SSE response could not be read.", exception);
            }
        }

        @Override
        public void close() throws IOException {
            response.body().close();
            if (!reader.isDone()) {
                reader.cancel(true);
            }
        }
    }
}
