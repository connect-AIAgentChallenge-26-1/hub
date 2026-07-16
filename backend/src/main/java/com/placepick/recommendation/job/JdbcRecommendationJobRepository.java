package com.placepick.recommendation.job;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.domain.candidate.CandidateEvidence;
import com.placepick.recommendation.workflow.application.RecommendationCorePlace;
import com.placepick.recommendation.workflow.application.RecommendationCoreResult;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcRecommendationJobRepository implements RecommendationJobRepository {

    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() { };
    private static final TypeReference<List<RecommendationJobPlace>> PLACE_LIST =
        new TypeReference<>() { };

    private final JdbcClient jdbcClient;
    private final ObjectMapper objectMapper;

    public JdbcRecommendationJobRepository(JdbcClient jdbcClient, ObjectMapper objectMapper) {
        this.jdbcClient = jdbcClient;
        this.objectMapper = objectMapper;
    }

    @Override
    public void lockIdempotencyScope(UUID sessionId, String keyHash) {
        String scope = sessionId + ":POST:/api/v1/recommendations:" + keyHash;
        jdbcClient.sql("""
                SELECT 1 AS locked
                FROM (SELECT pg_advisory_xact_lock(hashtextextended(:scope, 0))) lock_scope
                """)
            .param("scope", scope)
            .query(Integer.class)
            .single();
    }

    @Override
    public Optional<IdempotencyReplay> findIdempotency(UUID sessionId, String keyHash) {
        return jdbcClient.sql("""
                SELECT request_hash, response_status,
                       response_json ->> 'jobId' AS job_id
                FROM idempotency_record
                WHERE session_id = :sessionId
                  AND method = 'POST'
                  AND resource_path = '/api/v1/recommendations'
                  AND key_hash = :keyHash
                """)
            .param("sessionId", sessionId)
            .param("keyHash", keyHash)
            .query((resultSet, rowNumber) -> new IdempotencyReplay(
                resultSet.getString("request_hash"),
                UUID.fromString(resultSet.getString("job_id")),
                resultSet.getInt("response_status")
            ))
            .optional();
    }

    @Override
    public void insertJob(
        UUID jobId,
        UUID sessionId,
        UUID draftId,
        ConfirmedRecommendationCondition condition,
        Instant createdAt,
        Instant expiresAt
    ) {
        jdbcClient.sql("""
                INSERT INTO recommendation_job (
                    id, session_id, draft_id, status, stage, progress, degraded,
                    condition_json, warnings_json, created_at, updated_at, expires_at
                ) VALUES (
                    :id, :sessionId, :draftId, 'ACCEPTED', 'QUEUED', 0, FALSE,
                    CAST(:conditionJson AS jsonb), '[]'::jsonb,
                    :createdAt, :createdAt, :expiresAt
                )
                """)
            .param("id", jobId)
            .param("sessionId", sessionId)
            .param("draftId", draftId)
            .param("conditionJson", writeJson(condition))
            .param("createdAt", timestamp(createdAt))
            .param("expiresAt", timestamp(expiresAt))
            .update();
    }

    @Override
    public void insertIdempotency(
        UUID recordId,
        UUID sessionId,
        String keyHash,
        String requestHash,
        UUID jobId,
        Instant createdAt,
        Instant expiresAt
    ) {
        String responseJson = writeJson(new StoredSubmission(jobId, "ACCEPTED"));
        jdbcClient.sql("""
                INSERT INTO idempotency_record (
                    id, session_id, method, resource_path, key_hash, request_hash,
                    response_status, response_json, response_location, created_at, expires_at
                ) VALUES (
                    :id, :sessionId, 'POST', '/api/v1/recommendations', :keyHash,
                    :requestHash, 202, CAST(:responseJson AS jsonb), :location,
                    :createdAt, :expiresAt
                )
                """)
            .param("id", recordId)
            .param("sessionId", sessionId)
            .param("keyHash", keyHash)
            .param("requestHash", requestHash)
            .param("responseJson", responseJson)
            .param("location", "/api/v1/recommendations/" + jobId)
            .param("createdAt", timestamp(createdAt))
            .param("expiresAt", timestamp(expiresAt))
            .update();
    }

    @Override
    public Optional<RecommendationJobSnapshot> findOwned(UUID jobId, UUID sessionId) {
        return querySnapshot("WHERE id = :id AND session_id = :sessionId", false)
            .param("id", jobId)
            .param("sessionId", sessionId)
            .query(this::mapSnapshot)
            .optional();
    }

    @Override
    public Optional<RecommendationJobSubscriptionState> findSubscriptionState(
        UUID jobId,
        UUID sessionId
    ) {
        return jdbcClient.sql("""
                SELECT job.id, job.session_id, job.draft_id, job.status, job.stage,
                       job.progress, job.degraded,
                       job.condition_json::text AS condition_json,
                       job.warnings_json::text AS warnings_json,
                       job.places_json::text AS places_json,
                       job.failure_code, job.failure_message,
                       job.created_at, job.updated_at, job.expires_at, job.version,
                       COALESCE((
                           SELECT MAX(event.sequence_id)
                           FROM recommendation_job_event event
                           WHERE event.job_id = job.id
                       ), 0) AS latest_sequence_id
                FROM recommendation_job job
                WHERE job.id = :id AND job.session_id = :sessionId
                """)
            .param("id", jobId)
            .param("sessionId", sessionId)
            .query((resultSet, rowNumber) -> new RecommendationJobSubscriptionState(
                mapSnapshot(resultSet, rowNumber),
                resultSet.getLong("latest_sequence_id")
            ))
            .optional();
    }

    @Override
    public Optional<RecommendationJobSnapshot> lockJob(UUID jobId) {
        return querySnapshot("WHERE id = :id", true)
            .param("id", jobId)
            .query(this::mapSnapshot)
            .optional();
    }

    @Override
    public void markProcessing(UUID jobId, Instant updatedAt) {
        jdbcClient.sql("""
                UPDATE recommendation_job
                SET status = 'PROCESSING',
                    stage = 'LOCAL_SEARCH',
                    progress = GREATEST(progress, 5),
                    updated_at = :updatedAt,
                    version = version + 1
                WHERE id = :id AND status IN ('ACCEPTED', 'PROCESSING')
                """)
            .param("id", jobId)
            .param("updatedAt", timestamp(updatedAt))
            .update();
    }

    @Override
    public void updateProgress(
        UUID jobId,
        RecommendationJobStage stage,
        int progress,
        Instant updatedAt
    ) {
        if (progress < 0 || progress > 99 || stage == RecommendationJobStage.FINISHED) {
            throw new IllegalArgumentException("Non-terminal progress update is invalid.");
        }
        jdbcClient.sql("""
                UPDATE recommendation_job
                SET stage = :stage,
                    progress = GREATEST(progress, :progress),
                    updated_at = :updatedAt,
                    version = version + 1
                WHERE id = :id AND status = 'PROCESSING'
                """)
            .param("id", jobId)
            .param("stage", stage.name())
            .param("progress", progress)
            .param("updatedAt", timestamp(updatedAt))
            .update();
    }

    @Override
    public void complete(UUID jobId, RecommendationCoreResult result, Instant updatedAt) {
        jdbcClient.sql("""
                UPDATE recommendation_job
                SET status = 'COMPLETED',
                    stage = 'FINISHED',
                    progress = 100,
                    degraded = :degraded,
                    warnings_json = CAST(:warningsJson AS jsonb),
                    places_json = CAST(:placesJson AS jsonb),
                    failure_code = NULL,
                    failure_message = NULL,
                    updated_at = :updatedAt,
                    version = version + 1
                WHERE id = :id AND status IN ('ACCEPTED', 'PROCESSING')
                """)
            .param("id", jobId)
            .param("degraded", result.degraded())
            .param("warningsJson", writeJson(result.warnings()))
            .param(
                "placesJson",
                writeJson(result.places().stream()
                    .map(place -> RecommendationJobPlace.from(place, result.warnings()))
                    .toList())
            )
            .param("updatedAt", timestamp(updatedAt))
            .update();
        persistPlaces(jobId, result.places(), result.warnings());
    }

    @Override
    public void fail(UUID jobId, String failureCode, String safeMessage, Instant updatedAt) {
        jdbcClient.sql("""
                UPDATE recommendation_job
                SET status = 'FAILED',
                    stage = 'FINISHED',
                    progress = 100,
                    failure_code = :failureCode,
                    failure_message = :failureMessage,
                    updated_at = :updatedAt,
                    version = version + 1
                WHERE id = :id AND status IN ('ACCEPTED', 'PROCESSING')
                """)
            .param("id", jobId)
            .param("failureCode", failureCode)
            .param("failureMessage", safeMessage)
            .param("updatedAt", timestamp(updatedAt))
            .update();
    }

    @Override
    public boolean isProcessed(UUID eventId, String consumerName) {
        return jdbcClient.sql("""
                SELECT EXISTS (
                    SELECT 1 FROM processed_event
                    WHERE event_id = :eventId AND consumer_name = :consumerName
                )
                """)
            .param("eventId", eventId)
            .param("consumerName", consumerName)
            .query(Boolean.class)
            .single();
    }

    @Override
    public void markProcessed(UUID eventId, String consumerName, Instant processedAt) {
        jdbcClient.sql("""
                INSERT INTO processed_event (event_id, consumer_name, processed_at)
                VALUES (:eventId, :consumerName, :processedAt)
                ON CONFLICT (event_id, consumer_name) DO NOTHING
                """)
            .param("eventId", eventId)
            .param("consumerName", consumerName)
            .param("processedAt", timestamp(processedAt))
            .update();
    }

    @Override
    public RecommendationJobEvent appendEvent(
        UUID eventId,
        UUID jobId,
        String eventType,
        String payloadJson,
        Instant occurredAt
    ) {
        return jdbcClient.sql("""
                INSERT INTO recommendation_job_event (
                    event_id, job_id, event_type, payload_json, occurred_at
                ) VALUES (
                    :eventId, :jobId, :eventType, CAST(:payloadJson AS jsonb), :occurredAt
                )
                RETURNING sequence_id, event_id, job_id, event_type,
                          payload_json::text AS payload_json, occurred_at
                """)
            .param("eventId", eventId)
            .param("jobId", jobId)
            .param("eventType", eventType)
            .param("payloadJson", payloadJson)
            .param("occurredAt", timestamp(occurredAt))
            .query(this::mapEvent)
            .single();
    }

    @Override
    public List<RecommendationJobEvent> findEventsAfter(
        UUID jobId,
        long sequenceId,
        int limit
    ) {
        if (limit < 1 || limit > 1_000) {
            throw new IllegalArgumentException("Event replay limit is invalid.");
        }
        return jdbcClient.sql("""
                SELECT sequence_id, event_id, job_id, event_type,
                       payload_json::text AS payload_json, occurred_at
                FROM recommendation_job_event
                WHERE job_id = :jobId AND sequence_id > :sequenceId
                ORDER BY sequence_id
                LIMIT :limit
                """)
            .param("jobId", jobId)
            .param("sequenceId", sequenceId)
            .param("limit", limit)
            .query(this::mapEvent)
            .list();
    }

    @Override
    public long latestEventSequence(UUID jobId) {
        Long value = jdbcClient.sql("""
                SELECT COALESCE(MAX(sequence_id), 0)
                FROM recommendation_job_event
                WHERE job_id = :jobId
                """)
            .param("jobId", jobId)
            .query(Long.class)
            .single();
        return value;
    }

    private JdbcClient.StatementSpec querySnapshot(String where, boolean forUpdate) {
        return jdbcClient.sql("""
                SELECT id, session_id, draft_id, status, stage, progress, degraded,
                       condition_json::text AS condition_json,
                       warnings_json::text AS warnings_json,
                       places_json::text AS places_json,
                       failure_code, failure_message,
                       created_at, updated_at, expires_at, version
                FROM recommendation_job
                """ + where + (forUpdate ? " FOR UPDATE" : ""));
    }

    private RecommendationJobSnapshot mapSnapshot(ResultSet resultSet, int rowNumber)
        throws SQLException {
        String placesJson = resultSet.getString("places_json");
        String failureCode = resultSet.getString("failure_code");
        return new RecommendationJobSnapshot(
            resultSet.getObject("id", UUID.class),
            resultSet.getObject("session_id", UUID.class),
            resultSet.getObject("draft_id", UUID.class),
            RecommendationJobStatus.valueOf(resultSet.getString("status")),
            RecommendationJobStage.valueOf(resultSet.getString("stage")),
            resultSet.getInt("progress"),
            resultSet.getBoolean("degraded"),
            readJson(resultSet.getString("warnings_json"), STRING_LIST),
            readJson(
                resultSet.getString("condition_json"),
                ConfirmedRecommendationCondition.class
            ),
            placesJson == null ? List.of() : readJson(placesJson, PLACE_LIST),
            failureCode == null
                ? null
                : new RecommendationJobFailure(
                    failureCode,
                    resultSet.getString("failure_message")
                ),
            resultSet.getObject("created_at", OffsetDateTime.class).toInstant(),
            resultSet.getObject("updated_at", OffsetDateTime.class).toInstant(),
            resultSet.getObject("expires_at", OffsetDateTime.class).toInstant(),
            resultSet.getLong("version")
        );
    }

    private RecommendationJobEvent mapEvent(ResultSet resultSet, int rowNumber)
        throws SQLException {
        return new RecommendationJobEvent(
            resultSet.getLong("sequence_id"),
            resultSet.getObject("event_id", UUID.class),
            resultSet.getObject("job_id", UUID.class),
            resultSet.getString("event_type"),
            resultSet.getString("payload_json"),
            resultSet.getObject("occurred_at", OffsetDateTime.class).toInstant()
        );
    }

    private void persistPlaces(
        UUID jobId,
        List<RecommendationCorePlace> places,
        List<String> warnings
    ) {
        for (int index = 0; index < places.size(); index++) {
            RecommendationCorePlace place = places.get(index);
            jdbcClient.sql("""
                    INSERT INTO recommendation_candidate (
                        job_id, place_id, ordinal, snapshot_json, score, evidence_level
                    ) VALUES (
                        :jobId, :placeId, :ordinal, CAST(:snapshotJson AS jsonb),
                        :score, :evidenceLevel
                    )
                    """)
                .param("jobId", jobId)
                .param("placeId", place.rankedPlace().placeId())
                .param("ordinal", index + 1)
                .param("snapshotJson", writeJson(RecommendationJobPlace.from(place, warnings)))
                .param("score", place.rankedPlace().scoreBreakdown().total())
                .param("evidenceLevel", place.evidenceLevel().name())
                .update();
            insertLocalEvidence(jobId, place);
            for (CandidateEvidence evidence : place.rankedPlace().evidence()) {
                insertBlogEvidence(jobId, place, evidence);
            }
        }
    }

    private void insertLocalEvidence(UUID jobId, RecommendationCorePlace place) {
        jdbcClient.sql("""
                INSERT INTO recommendation_evidence (
                    job_id, place_id, evidence_id, evidence_type, snapshot_json
                ) VALUES (
                    :jobId, :placeId, :evidenceId, 'LOCAL', CAST(:snapshotJson AS jsonb)
                )
                """)
            .param("jobId", jobId)
            .param("placeId", place.rankedPlace().placeId())
            .param("evidenceId", "local:" + place.rankedPlace().placeId())
            .param("snapshotJson", writeJson(place.rankedPlace().candidate()))
            .update();
    }

    private void insertBlogEvidence(
        UUID jobId,
        RecommendationCorePlace place,
        CandidateEvidence evidence
    ) {
        jdbcClient.sql("""
                INSERT INTO recommendation_evidence (
                    job_id, place_id, evidence_id, evidence_type, snapshot_json
                ) VALUES (
                    :jobId, :placeId, :evidenceId, 'BLOG', CAST(:snapshotJson AS jsonb)
                )
                """)
            .param("jobId", jobId)
            .param("placeId", place.rankedPlace().placeId())
            .param("evidenceId", evidence.evidenceId())
            .param("snapshotJson", writeJson(evidence))
            .update();
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Recommendation job JSON could not be encoded.", exception);
        }
    }

    private <T> T readJson(String json, Class<T> type) {
        try {
            return objectMapper.readValue(json, type);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored recommendation job JSON is invalid.", exception);
        }
    }

    private <T> T readJson(String json, TypeReference<T> type) {
        try {
            return objectMapper.readValue(json, type);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored recommendation job JSON is invalid.", exception);
        }
    }

    private static OffsetDateTime timestamp(Instant instant) {
        return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    private record StoredSubmission(UUID jobId, String status) {
    }
}
