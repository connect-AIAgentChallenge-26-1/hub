package com.placepick.recommendation.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.draft.DraftStatus;
import com.placepick.draft.RecommendationDraft;
import com.placepick.draft.RecommendationDraftRepository;
import com.placepick.outbox.OutboxEvent;
import com.placepick.outbox.OutboxRelay;
import com.placepick.outbox.OutboxRepository;
import com.placepick.recommendation.application.candidate.CandidateNormalizer;
import com.placepick.recommendation.application.candidate.CandidateQueryPlanner;
import com.placepick.recommendation.application.candidate.CategoryTaxonomy;
import com.placepick.recommendation.application.candidate.LocationMatcher;
import com.placepick.recommendation.application.port.out.PlaceSearchPort;
import com.placepick.recommendation.application.port.out.SearchProviderException;
import com.placepick.recommendation.application.port.out.SearchProviderFailure;
import com.placepick.recommendation.application.port.out.SearchProviderFailureStage;
import com.placepick.recommendation.application.scoring.CandidateRanker;
import com.placepick.recommendation.application.scoring.CandidateRankingService;
import com.placepick.recommendation.application.scoring.CandidateScoringPolicy;
import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import com.placepick.recommendation.job.infrastructure.DeterministicRecommendationProvider;
import com.placepick.recommendation.reason.application.GroundedReasonService;
import com.placepick.recommendation.workflow.application.RecommendationCoreUseCase;
import com.placepick.session.AnonymousSession;
import com.placepick.session.AnonymousSessionRepository;
import com.placepick.stream.RecommendationStreamConsumer;
import com.placepick.stream.RecommendationStreamGateway;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
@ActiveProfiles("test")
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.NONE,
    properties = "placepick.role=api"
)
class RecommendationJobPipelineIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
        DockerImageName.parse(
            "postgres:16.14-bookworm@sha256:da788743d2060767375896de4d646f7576f5911461444b372616f19ea61db2ec"
        ).asCompatibleSubstituteFor("postgres")
    )
        .withDatabaseName("placepick_job_test")
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
    private RecommendationJobService jobService;

    @Autowired
    private RecommendationJobTransactionCoordinator coordinator;

    @Autowired
    private RecommendationJobRepository jobRepository;

    @Autowired
    private RecommendationDraftRepository draftRepository;

    @Autowired
    private AnonymousSessionRepository sessionRepository;

    @Autowired
    private OutboxRepository outboxRepository;

    @Autowired
    private JdbcClient jdbcClient;

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private Clock clock;

    @DynamicPropertySource
    static void infrastructureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", REDIS::getFirstMappedPort);
        registry.add("placepick.external.mode", () -> "mock");
        registry.add("placepick.external.naver-base-url", () -> "http://127.0.0.1:8089");
        registry.add("placepick.external.llm-base-url", () -> "http://127.0.0.1:8090");
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
    }

    @Test
    void createsJobDraftConsumptionAndOutboxAtomicallyWithIdempotentReplay() {
        UUID sessionId = insertSession();
        UUID firstDraft = insertConfirmedDraft(sessionId);

        RecommendationJobSubmission created = jobService.create(new CreateRecommendationJobCommand(
            sessionId,
            firstDraft,
            "job-create-key-0001",
            "integration-trace"
        ));
        RecommendationJobSubmission replayed = jobService.create(new CreateRecommendationJobCommand(
            sessionId,
            firstDraft,
            "job-create-key-0001",
            "integration-trace"
        ));

        assertThat(created.status()).isEqualTo(RecommendationJobStatus.ACCEPTED);
        assertThat(created.replayed()).isFalse();
        assertThat(replayed.jobId()).isEqualTo(created.jobId());
        assertThat(replayed.replayed()).isTrue();
        assertThat(count("recommendation_job")).isEqualTo(1);
        assertThat(count("outbox_event")).isEqualTo(1);
        assertThat(count("idempotency_record")).isEqualTo(1);
        assertThat(draftRepository.findOwned(firstDraft, sessionId).orElseThrow().status())
            .isEqualTo(DraftStatus.CONSUMED);

        UUID secondDraft = insertConfirmedDraft(sessionId);
        assertThatThrownBy(() -> jobService.create(new CreateRecommendationJobCommand(
            sessionId,
            secondDraft,
            "job-create-key-0001",
            "integration-trace"
        )))
            .isInstanceOfSatisfying(RecommendationJobException.class, exception ->
                assertThat(exception.errorCode())
                    .isEqualTo(RecommendationJobErrorCode.IDEMPOTENCY_KEY_REUSED)
            );
        assertThat(count("recommendation_job")).isEqualTo(1);
        assertThat(draftRepository.findOwned(secondDraft, sessionId).orElseThrow().status())
            .isEqualTo(DraftStatus.CONFIRMED);
    }

    @Test
    void relayRecoversPendingDeliveryAndWorkerCompletesOnlyOnceBeforeAck() {
        UUID sessionId = insertSession();
        RecommendationJobSubmission submission = createJob(sessionId, "pipeline-key-0001");
        RecommendationStreamGateway gateway = new RecommendationStreamGateway(
            redisTemplate,
            objectMapper
        );
        OutboxRelay relay = new OutboxRelay(outboxRepository, gateway, clock, 10);
        RecommendationJobWorker worker = new RecommendationJobWorker(
            coordinator,
            deterministicCoreFactory()
        );
        RecommendationStreamConsumer consumer = new RecommendationStreamConsumer(
            gateway,
            worker,
            "recovery-worker",
            10,
            3,
            Duration.ZERO
        );

        assertThat(relay.relayBatch()).isEqualTo(1);
        List<com.placepick.stream.RecommendationStreamRecord> abandoned = gateway.readNew(
            "crashed-worker",
            10,
            Duration.ofMillis(50)
        );
        assertThat(abandoned).hasSize(1);
        assertThat(consumer.pollOnce()).isGreaterThanOrEqualTo(1);

        RecommendationJobSnapshot completed = jobService.get(submission.jobId(), sessionId);
        assertThat(completed.status()).isEqualTo(RecommendationJobStatus.COMPLETED);
        assertThat(completed.stage()).isEqualTo(RecommendationJobStage.FINISHED);
        assertThat(completed.progress()).isEqualTo(100);
        assertThat(completed.places()).hasSize(3);
        assertThat(count("processed_event")).isEqualTo(1);
        assertThat(countWhere("recommendation_job_event", "event_type = 'completed'"))
            .isEqualTo(1);
        List<RecommendationJobEvent> events = jobRepository.findEventsAfter(
            submission.jobId(),
            0,
            1_000
        );
        assertThat(events).isNotEmpty();
        assertThat(events.get(0).eventType()).isEqualTo("snapshot");
        assertThat(events.get(events.size() - 1).eventType()).isEqualTo("completed");
        for (RecommendationJobEvent event : events) {
            RecommendationJobStreamPayload payload = readPayload(event);
            assertThat(payload.eventId()).isEqualTo(event.eventId().toString());
            assertThat(payload.aggregateId()).isEqualTo(submission.jobId());
            assertThat(payload.snapshot().jobId()).isEqualTo(submission.jobId());
            assertThat(payload.snapshot().status()).isNotNull();
        }
        assertThat(redisTemplate.opsForStream()
            .pending(RecommendationStreamGateway.STREAM, RecommendationStreamGateway.GROUP)
            .getTotalPendingMessages()).isZero();

        OutboxEvent original = storedOutbox(submission.jobId());
        gateway.publish(original);
        assertThat(consumer.pollOnce()).isGreaterThanOrEqualTo(1);
        assertThat(countWhere("recommendation_job_event", "event_type = 'completed'"))
            .isEqualTo(1);
        assertThat(count("recommendation_candidate")).isEqualTo(3);
    }

    @Test
    void retriesTransientProviderFailureThenMovesOriginalEventToDlq() {
        UUID sessionId = insertSession();
        RecommendationJobSubmission submission = createJob(sessionId, "pipeline-key-0002");
        RecommendationStreamGateway gateway = new RecommendationStreamGateway(
            redisTemplate,
            objectMapper
        );
        OutboxRelay relay = new OutboxRelay(outboxRepository, gateway, clock, 10);
        RecommendationJobWorker worker = new RecommendationJobWorker(
            coordinator,
            failingCoreFactory()
        );
        RecommendationStreamConsumer consumer = new RecommendationStreamConsumer(
            gateway,
            worker,
            "retry-worker",
            10,
            2,
            Duration.ZERO
        );

        assertThat(relay.relayBatch()).isEqualTo(1);
        assertThat(consumer.pollOnce()).isGreaterThanOrEqualTo(1);
        assertThat(consumer.pollOnce()).isGreaterThanOrEqualTo(1);

        RecommendationJobSnapshot failed = jobService.get(submission.jobId(), sessionId);
        assertThat(failed.status()).isEqualTo(RecommendationJobStatus.FAILED);
        assertThat(failed.failure().errorCode()).isEqualTo("PROVIDER_UNAVAILABLE");
        assertThat(redisTemplate.opsForStream().size(RecommendationStreamGateway.DLQ))
            .isEqualTo(1);
        assertThat(count("processed_event")).isEqualTo(1);
    }

    private RecommendationWorkerCoreFactory failingCoreFactory() {
        DeterministicRecommendationProvider provider = new DeterministicRecommendationProvider();
        PlaceSearchPort unavailable = query -> {
            throw new SearchProviderException(
                SearchProviderFailure.PROVIDER_UNAVAILABLE,
                null,
                SearchProviderFailureStage.TRANSPORT,
                "Safe synthetic provider failure.",
                null
            );
        };
        CategoryTaxonomy taxonomy = new CategoryTaxonomy();
        return trace -> new RecommendationCoreUseCase(
            new CandidateRankingService(
                unavailable,
                provider,
                new CandidateQueryPlanner(taxonomy),
                new CandidateNormalizer(taxonomy, new LocationMatcher()),
                new CandidateRanker(new CandidateScoringPolicy()),
                trace
            ),
            new GroundedReasonService(provider, trace)
        );
    }

    private RecommendationWorkerCoreFactory deterministicCoreFactory() {
        DeterministicRecommendationProvider provider = new DeterministicRecommendationProvider();
        CategoryTaxonomy taxonomy = new CategoryTaxonomy();
        return trace -> new RecommendationCoreUseCase(
            new CandidateRankingService(
                provider,
                provider,
                new CandidateQueryPlanner(taxonomy),
                new CandidateNormalizer(taxonomy, new LocationMatcher()),
                new CandidateRanker(new CandidateScoringPolicy()),
                trace
            ),
            new GroundedReasonService(provider, trace)
        );
    }

    private RecommendationJobSubmission createJob(UUID sessionId, String key) {
        return jobService.create(new CreateRecommendationJobCommand(
            sessionId,
            insertConfirmedDraft(sessionId),
            key,
            "integration-trace"
        ));
    }

    private UUID insertSession() {
        Instant now = clock.instant();
        UUID id = UUID.randomUUID();
        sessionRepository.insert(new AnonymousSession(
            id,
            "a".repeat(64),
            "b".repeat(64),
            now,
            now,
            now.plus(Duration.ofDays(1))
        ));
        return id;
    }

    private UUID insertConfirmedDraft(UUID sessionId) {
        Instant now = clock.instant();
        UUID id = UUID.randomUUID();
        draftRepository.insert(new RecommendationDraft(
            id,
            sessionId,
            DraftStatus.CONFIRMED,
            "서울 성수동에서 조용한 디저트 카페",
            new DraftRecommendationCondition(
                "서울 성수동",
                PlaceType.CAFE,
                null,
                4,
                10_000,
                20_000,
                List.of(new Preference("조용한", 8), new Preference("디저트", 7)),
                List.of("흡연")
            ),
            List.of(),
            null,
            now,
            now,
            now.plus(Duration.ofMinutes(30))
        ));
        return id;
    }

    private long count(String table) {
        return countWhere(table, "TRUE");
    }

    private long countWhere(String table, String predicate) {
        return jdbcClient.sql("SELECT COUNT(*) FROM " + table + " WHERE " + predicate)
            .query(Long.class)
            .single();
    }

    private OutboxEvent storedOutbox(UUID jobId) {
        return jdbcClient.sql("""
                SELECT id, aggregate_type, aggregate_id, event_type,
                       payload_json::text AS payload_json, created_at, attempt_count
                FROM outbox_event
                WHERE aggregate_id = :jobId
                """)
            .param("jobId", jobId)
            .query((resultSet, rowNumber) -> new OutboxEvent(
                resultSet.getObject("id", UUID.class),
                resultSet.getString("aggregate_type"),
                resultSet.getObject("aggregate_id", UUID.class),
                resultSet.getString("event_type"),
                resultSet.getString("payload_json"),
                resultSet.getObject("created_at", java.time.OffsetDateTime.class).toInstant(),
                resultSet.getInt("attempt_count")
            ))
            .single();
    }

    private RecommendationJobStreamPayload readPayload(RecommendationJobEvent event) {
        try {
            return objectMapper.readValue(
                event.payloadJson(),
                RecommendationJobStreamPayload.class
            );
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw new AssertionError("Persisted stream payload is not valid JSON.", exception);
        }
    }
}
