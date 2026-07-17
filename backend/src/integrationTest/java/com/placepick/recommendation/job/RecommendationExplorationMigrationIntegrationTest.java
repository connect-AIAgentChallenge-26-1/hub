package com.placepick.recommendation.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
class RecommendationExplorationMigrationIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
        DockerImageName.parse(
            "postgres:16.14-bookworm@sha256:da788743d2060767375896de4d646f7576f5911461444b372616f19ea61db2ec"
        ).asCompatibleSubstituteFor("postgres")
    )
        .withDatabaseName("placepick_exploration_migration_test")
        .withUsername("placepick")
        .withPassword("placepick-test");

    @Test
    void upgradesLegacyRowsWithoutLocalEvidenceAndEnforcesExplorationConstraints()
        throws Exception {
        Flyway.configure()
            .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
            .target(MigrationVersion.fromVersion("2"))
            .load()
            .migrate();

        UUID sessionId = UUID.randomUUID();
        UUID draftId = UUID.randomUUID();
        UUID rootJobId = UUID.randomUUID();
        UUID placeId = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.parse("2026-07-17T00:00:00Z");
        try (var connection = DriverManager.getConnection(
            POSTGRES.getJdbcUrl(),
            POSTGRES.getUsername(),
            POSTGRES.getPassword()
        )) {
            try (var statement = connection.createStatement()) {
                statement.executeUpdate("""
                    INSERT INTO anonymous_session (
                        id, token_hash, csrf_token_hash, created_at, updated_at, expires_at
                    ) VALUES (
                        '%s', '%s', '%s', '%s', '%s', '%s'
                    )
                    """.formatted(
                    sessionId,
                    "a".repeat(64),
                    "b".repeat(64),
                    now,
                    now,
                    now.plusDays(2)
                ));
                statement.executeUpdate("""
                    INSERT INTO recommendation_draft (
                        id, session_id, status, request_text, condition_json,
                        warnings_json, created_at, updated_at, expires_at
                    ) VALUES (
                        '%s', '%s', 'CONSUMED', 'legacy fixture', '{}'::jsonb,
                        '[]'::jsonb, '%s', '%s', '%s'
                    )
                    """.formatted(draftId, sessionId, now, now, now.plusDays(1)));
                statement.executeUpdate("""
                    INSERT INTO recommendation_job (
                        id, session_id, draft_id, status, stage, progress, degraded,
                        condition_json, warnings_json, places_json,
                        created_at, updated_at, expires_at
                    ) VALUES (
                        '%s', '%s', '%s', 'COMPLETED', 'FINISHED', 100, FALSE,
                        '{}'::jsonb, '[]'::jsonb, '[]'::jsonb,
                        '%s', '%s', '%s'
                    )
                    """.formatted(
                    rootJobId,
                    sessionId,
                    draftId,
                    now,
                    now,
                    now.plusDays(1)
                ));
                statement.executeUpdate("""
                    INSERT INTO recommendation_candidate (
                        job_id, place_id, ordinal, snapshot_json, score, evidence_level
                    ) VALUES (
                        '%s', '%s', 1, '{}'::jsonb, 65, 'LOCAL_ONLY'
                    )
                    """.formatted(rootJobId, placeId));
            }
        }

        Flyway.configure()
            .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
            .load()
            .migrate();

        try (var connection = DriverManager.getConnection(
            POSTGRES.getJdbcUrl(),
            POSTGRES.getUsername(),
            POSTGRES.getPassword()
        )) {
            try (var statement = connection.createStatement()) {
                try (var result = statement.executeQuery("""
                    SELECT root_job_id, parent_job_id, exploration_round,
                           excluded_candidate_keys_json::text,
                           used_variant_ids_json::text, search_exhausted
                    FROM recommendation_job
                    WHERE id = '%s'
                    """.formatted(rootJobId))) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getObject("root_job_id", UUID.class)).isEqualTo(rootJobId);
                    assertThat(result.getObject("parent_job_id", UUID.class)).isNull();
                    assertThat(result.getInt("exploration_round")).isZero();
                    assertThat(result.getString("excluded_candidate_keys_json"))
                        .matches("\\[\"[0-9a-f]{64}\"\\]");
                    assertThat(result.getString("used_variant_ids_json")).isEqualTo("[]");
                    assertThat(result.getBoolean("search_exhausted")).isTrue();
                }
                try (var result = statement.executeQuery("""
                    SELECT candidate_fingerprint
                    FROM recommendation_candidate
                    WHERE job_id = '%s' AND place_id = '%s'
                    """.formatted(rootJobId, placeId))) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getString("candidate_fingerprint"))
                        .matches("[0-9a-f]{64}");
                }

                statement.executeUpdate("""
                    UPDATE recommendation_candidate SET score = 100
                    WHERE job_id = '%s' AND place_id = '%s'
                    """.formatted(rootJobId, placeId));
                assertThatThrownBy(() -> statement.executeUpdate("""
                    UPDATE recommendation_candidate SET score = 101
                    WHERE job_id = '%s' AND place_id = '%s'
                    """.formatted(rootJobId, placeId)))
                    .isInstanceOf(SQLException.class);

                assertThatThrownBy(() -> statement.executeUpdate(initialInsert(
                    UUID.randomUUID(),
                    sessionId,
                    draftId,
                    now
                ))).isInstanceOf(SQLException.class);

                UUID childJobId = UUID.randomUUID();
                statement.executeUpdate(childInsert(
                    childJobId,
                    sessionId,
                    draftId,
                    rootJobId,
                    rootJobId,
                    now
                ));
                assertThatThrownBy(() -> statement.executeUpdate(childInsert(
                    UUID.randomUUID(),
                    sessionId,
                    draftId,
                    rootJobId,
                    rootJobId,
                    now
                ))).isInstanceOf(SQLException.class);
            }
        }
    }

    private static String childInsert(
        UUID childJobId,
        UUID sessionId,
        UUID draftId,
        UUID rootJobId,
        UUID parentJobId,
        OffsetDateTime now
    ) {
        return """
            INSERT INTO recommendation_job (
                id, session_id, draft_id, root_job_id, parent_job_id,
                exploration_round, status, stage, progress, degraded,
                condition_json, warnings_json, created_at, updated_at, expires_at
            ) VALUES (
                '%s', '%s', '%s', '%s', '%s',
                1, 'ACCEPTED', 'QUEUED', 0, FALSE,
                '{}'::jsonb, '[]'::jsonb, '%s', '%s', '%s'
            )
            """.formatted(
            childJobId,
            sessionId,
            draftId,
            rootJobId,
            parentJobId,
            now,
            now,
            now.plusDays(1)
        );
    }

    private static String initialInsert(
        UUID jobId,
        UUID sessionId,
        UUID draftId,
        OffsetDateTime now
    ) {
        return """
            INSERT INTO recommendation_job (
                id, session_id, draft_id, root_job_id, exploration_round,
                status, stage, progress, degraded, condition_json, warnings_json,
                created_at, updated_at, expires_at
            ) VALUES (
                '%s', '%s', '%s', '%s', 0,
                'ACCEPTED', 'QUEUED', 0, FALSE, '{}'::jsonb, '[]'::jsonb,
                '%s', '%s', '%s'
            )
            """.formatted(
            jobId,
            sessionId,
            draftId,
            jobId,
            now,
            now,
            now.plusDays(1)
        );
    }
}
