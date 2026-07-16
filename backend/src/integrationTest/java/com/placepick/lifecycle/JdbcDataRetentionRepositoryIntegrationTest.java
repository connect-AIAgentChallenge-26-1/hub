package com.placepick.lifecycle;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(JdbcDataRetentionRepository.class)
class JdbcDataRetentionRepositoryIntegrationTest {

    private static final Instant NOW = Instant.parse("2026-07-16T03:04:05Z");

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
        DockerImageName.parse(
            "postgres:16.14-bookworm@sha256:da788743d2060767375896de4d646f7576f5911461444b372616f19ea61db2ec"
        ).asCompatibleSubstituteFor("postgres")
    )
        .withDatabaseName("placepick_retention_test")
        .withUsername("placepick")
        .withPassword("placepick-test");

    @Autowired
    private JdbcDataRetentionRepository repository;

    @Autowired
    private JdbcClient jdbcClient;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Test
    void deletesAnExpiredAggregateInForeignKeySafeOrderAndKeepsNoOrphans() {
        Fixture fixture = insertExpiredAggregate(true);

        RetentionCleanupReport report = repository.deleteExpired(
            NOW,
            NOW.minusSeconds(86_400),
            NOW.minusSeconds(86_400)
        );

        assertThat(report).isEqualTo(new RetentionCleanupReport(1, 1, 1, 1, 1, 1, 1));
        assertThat(count("anonymous_session", "id", fixture.sessionId())).isZero();
        assertThat(count("recommendation_draft", "id", fixture.draftId())).isZero();
        assertThat(count("recommendation_job", "id", fixture.jobId())).isZero();
        assertThat(count("voting_room", "id", fixture.roomId())).isZero();
        assertThat(count("room_vote", "room_id", fixture.roomId())).isZero();
        assertThat(count("recommendation_candidate", "job_id", fixture.jobId())).isZero();
        assertThat(count("recommendation_evidence", "job_id", fixture.jobId())).isZero();
    }

    @Test
    void preservesAnExpiredJobDraftAndSessionWhileALiveRoomStillReferencesTheJob() {
        Fixture fixture = insertExpiredAggregate(false);

        RetentionCleanupReport report = repository.deleteExpired(
            NOW,
            NOW.minusSeconds(86_400),
            NOW.minusSeconds(86_400)
        );

        assertThat(report).isEqualTo(new RetentionCleanupReport(0, 0, 0, 1, 1, 1, 0));
        assertThat(count("anonymous_session", "id", fixture.sessionId())).isOne();
        assertThat(count("recommendation_draft", "id", fixture.draftId())).isOne();
        assertThat(count("recommendation_job", "id", fixture.jobId())).isOne();
        assertThat(count("voting_room", "id", fixture.roomId())).isOne();
    }

    private Fixture insertExpiredAggregate(boolean expiredRoom) {
        UUID sessionId = UUID.randomUUID();
        UUID draftId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        UUID placeId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        OffsetDateTime expired = timestamp(NOW.minusSeconds(60));
        OffsetDateTime oldOperational = timestamp(NOW.minusSeconds(172_800));

        jdbcClient.sql("""
                INSERT INTO anonymous_session (
                    id, token_hash, csrf_token_hash, created_at, updated_at, expires_at
                ) VALUES (:id, :tokenHash, :csrfHash, :createdAt, :updatedAt, :expiresAt)
                """)
            .param("id", sessionId)
            .param("tokenHash", "a".repeat(64))
            .param("csrfHash", "b".repeat(64))
            .param("createdAt", oldOperational)
            .param("updatedAt", oldOperational)
            .param("expiresAt", expired)
            .update();
        jdbcClient.sql("""
                INSERT INTO recommendation_draft (
                    id, session_id, status, request_text, condition_json, warnings_json,
                    created_at, updated_at, expires_at
                ) VALUES (
                    :id, :sessionId, 'CONSUMED', 'synthetic retention fixture',
                    '{}'::jsonb, '[]'::jsonb, :createdAt, :updatedAt, :expiresAt
                )
                """)
            .param("id", draftId)
            .param("sessionId", sessionId)
            .param("createdAt", oldOperational)
            .param("updatedAt", oldOperational)
            .param("expiresAt", expired)
            .update();
        jdbcClient.sql("""
                INSERT INTO recommendation_job (
                    id, session_id, draft_id, status, stage, progress, degraded,
                    condition_json, warnings_json, places_json,
                    created_at, updated_at, expires_at
                ) VALUES (
                    :id, :sessionId, :draftId, 'COMPLETED', 'FINISHED', 100, FALSE,
                    '{}'::jsonb, '[]'::jsonb, '[]'::jsonb,
                    :createdAt, :updatedAt, :expiresAt
                )
                """)
            .param("id", jobId)
            .param("sessionId", sessionId)
            .param("draftId", draftId)
            .param("createdAt", oldOperational)
            .param("updatedAt", oldOperational)
            .param("expiresAt", expired)
            .update();
        jdbcClient.sql("""
                UPDATE recommendation_draft SET consumed_job_id = :jobId WHERE id = :draftId
                """)
            .param("jobId", jobId)
            .param("draftId", draftId)
            .update();
        jdbcClient.sql("""
                INSERT INTO recommendation_candidate (
                    job_id, place_id, ordinal, snapshot_json, score, evidence_level
                ) VALUES (:jobId, :placeId, 1, '{}'::jsonb, 60, 'LOCAL_AND_BLOG')
                """)
            .param("jobId", jobId)
            .param("placeId", placeId)
            .update();
        jdbcClient.sql("""
                INSERT INTO recommendation_evidence (
                    job_id, place_id, evidence_id, evidence_type, snapshot_json
                ) VALUES (:jobId, :placeId, 'e1', 'LOCAL', '{}'::jsonb)
                """)
            .param("jobId", jobId)
            .param("placeId", placeId)
            .update();
        jdbcClient.sql("""
                INSERT INTO voting_room (
                    id, recommendation_job_id, share_token_hash, organizer_capability_hash,
                    status, created_at, updated_at, expires_at
                ) VALUES (
                    :id, :jobId, :shareHash, :capabilityHash, 'OPEN',
                    :createdAt, :updatedAt, :expiresAt
                )
                """)
            .param("id", roomId)
            .param("jobId", jobId)
            .param("shareHash", "c".repeat(64))
            .param("capabilityHash", "d".repeat(64))
            .param("createdAt", oldOperational)
            .param("updatedAt", oldOperational)
            .param(
                "expiresAt",
                expiredRoom ? expired : timestamp(NOW.plusSeconds(3_600))
            )
            .update();
        jdbcClient.sql("""
                INSERT INTO voting_room_place (room_id, place_id, ordinal, snapshot_json)
                VALUES (:roomId, :placeId, 1, '{}'::jsonb)
                """)
            .param("roomId", roomId)
            .param("placeId", placeId)
            .update();
        jdbcClient.sql("""
                INSERT INTO room_vote (
                    room_id, place_id, session_id, vote_value, created_at, updated_at
                ) VALUES (:roomId, :placeId, :sessionId, 'LIKE', :createdAt, :updatedAt)
                """)
            .param("roomId", roomId)
            .param("placeId", placeId)
            .param("sessionId", sessionId)
            .param("createdAt", oldOperational)
            .param("updatedAt", oldOperational)
            .update();
        insertOperationalRows(sessionId, jobId, oldOperational, expired);
        return new Fixture(sessionId, draftId, jobId, roomId);
    }

    private void insertOperationalRows(
        UUID sessionId,
        UUID jobId,
        OffsetDateTime oldOperational,
        OffsetDateTime expired
    ) {
        jdbcClient.sql("""
                INSERT INTO idempotency_record (
                    id, session_id, method, resource_path, key_hash, request_hash,
                    response_status, response_json, created_at, expires_at
                ) VALUES (
                    :id, :sessionId, 'POST', '/fixture', :keyHash, :requestHash,
                    202, '{}'::jsonb, :createdAt, :expiresAt
                )
                """)
            .param("id", UUID.randomUUID())
            .param("sessionId", sessionId)
            .param("keyHash", "e".repeat(64))
            .param("requestHash", "f".repeat(64))
            .param("createdAt", oldOperational)
            .param("expiresAt", expired)
            .update();
        jdbcClient.sql("""
                INSERT INTO outbox_event (
                    id, aggregate_type, aggregate_id, event_type, payload_json,
                    created_at, published_at
                ) VALUES (
                    :id, 'recommendation_job', :jobId, 'fixture', '{}'::jsonb,
                    :createdAt, :publishedAt
                )
                """)
            .param("id", UUID.randomUUID())
            .param("jobId", jobId)
            .param("createdAt", oldOperational)
            .param("publishedAt", oldOperational)
            .update();
        jdbcClient.sql("""
                INSERT INTO processed_event (event_id, consumer_name, processed_at)
                VALUES (:id, 'fixture-consumer', :processedAt)
                """)
            .param("id", UUID.randomUUID())
            .param("processedAt", oldOperational)
            .update();
    }

    private int count(String table, String column, UUID value) {
        if (!java.util.Set.of(
            "anonymous_session",
            "recommendation_draft",
            "recommendation_job",
            "voting_room",
            "room_vote",
            "recommendation_candidate",
            "recommendation_evidence"
        ).contains(table)) {
            throw new IllegalArgumentException("Unknown fixture table.");
        }
        if (!java.util.Set.of("id", "room_id", "job_id").contains(column)) {
            throw new IllegalArgumentException("Unknown fixture column.");
        }
        return jdbcClient.sql("SELECT COUNT(*) FROM " + table + " WHERE " + column + " = :id")
            .param("id", value)
            .query(Integer.class)
            .single();
    }

    private static OffsetDateTime timestamp(Instant value) {
        return OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
    }

    private record Fixture(UUID sessionId, UUID draftId, UUID jobId, UUID roomId) {
    }
}
