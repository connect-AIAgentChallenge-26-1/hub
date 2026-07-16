package com.placepick.room;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.infrastructure.observability.PlacePickMetrics;
import com.placepick.recommendation.job.RecommendationJobPlace;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcVotingRoomRepository implements VotingRoomRepository {

    private final JdbcClient jdbcClient;
    private final ObjectMapper objectMapper;
    private final PlacePickMetrics metrics;
    private final Duration contentionThreshold;

    public JdbcVotingRoomRepository(JdbcClient jdbcClient, ObjectMapper objectMapper) {
        this(jdbcClient, objectMapper, null, Duration.ofMillis(100));
    }

    @Autowired
    public JdbcVotingRoomRepository(
        JdbcClient jdbcClient,
        ObjectMapper objectMapper,
        PlacePickMetrics metrics,
        @Value("${placepick.metrics.vote-contention-threshold:PT0.1S}")
        String contentionThreshold
    ) {
        this(jdbcClient, objectMapper, metrics, Duration.parse(contentionThreshold));
    }

    JdbcVotingRoomRepository(
        JdbcClient jdbcClient,
        ObjectMapper objectMapper,
        PlacePickMetrics metrics,
        Duration contentionThreshold
    ) {
        this.jdbcClient = jdbcClient;
        this.objectMapper = objectMapper;
        this.metrics = metrics;
        if (contentionThreshold == null || contentionThreshold.isZero()
            || contentionThreshold.isNegative()) {
            throw new IllegalArgumentException("Vote contention threshold must be positive.");
        }
        this.contentionThreshold = contentionThreshold;
    }

    @Override
    public void lockScope(String scope) {
        jdbcClient.sql("""
                SELECT 1 AS locked
                FROM (SELECT pg_advisory_xact_lock(hashtextextended(:scope, 0))) lock_scope
                """)
            .param("scope", scope)
            .query(Integer.class)
            .single();
    }

    @Override
    public Optional<RoomIdempotencyReplay> findIdempotency(
        UUID sessionId,
        String resourcePath,
        String keyHash
    ) {
        return jdbcClient.sql("""
                SELECT request_hash, response_status,
                       response_json ->> 'roomId' AS room_id,
                       response_json ->> 'placeId' AS place_id,
                       response_json ->> 'expiresAt' AS response_expires_at
                FROM idempotency_record
                WHERE session_id = :sessionId
                  AND method IN ('POST', 'PUT')
                  AND resource_path = :resourcePath
                  AND key_hash = :keyHash
                """)
            .param("sessionId", sessionId)
            .param("resourcePath", resourcePath)
            .param("keyHash", keyHash)
            .query((resultSet, rowNumber) -> {
                String placeId = resultSet.getString("place_id");
                return new RoomIdempotencyReplay(
                    resultSet.getString("request_hash"),
                    UUID.fromString(resultSet.getString("room_id")),
                    placeId == null ? null : UUID.fromString(placeId),
                    Instant.parse(resultSet.getString("response_expires_at")),
                    resultSet.getInt("response_status")
                );
            })
            .optional();
    }

    @Override
    public void insertIdempotency(
        UUID recordId,
        UUID sessionId,
        String resourcePath,
        String keyHash,
        String requestHash,
        UUID roomId,
        UUID placeId,
        int responseStatus,
        Instant responseExpiresAt,
        Instant createdAt,
        Instant expiresAt
    ) {
        String method = resourcePath.endsWith("/final-result") ? "PUT" : "POST";
        String responseJson = writeJson(new StoredRoomResponse(
            roomId,
            placeId,
            responseExpiresAt
        ));
        jdbcClient.sql("""
                INSERT INTO idempotency_record (
                    id, session_id, method, resource_path, key_hash, request_hash,
                    response_status, response_json, created_at, expires_at
                ) VALUES (
                    :id, :sessionId, :method, :resourcePath, :keyHash, :requestHash,
                    :responseStatus, CAST(:responseJson AS jsonb), :createdAt, :expiresAt
                )
                """)
            .param("id", recordId)
            .param("sessionId", sessionId)
            .param("method", method)
            .param("resourcePath", resourcePath)
            .param("keyHash", keyHash)
            .param("requestHash", requestHash)
            .param("responseStatus", responseStatus)
            .param("responseJson", responseJson)
            .param("createdAt", timestamp(createdAt))
            .param("expiresAt", timestamp(expiresAt))
            .update();
    }

    @Override
    public Optional<VotingRoom> findByJobId(UUID jobId) {
        return roomQuery("WHERE recommendation_job_id = :jobId", false)
            .param("jobId", jobId)
            .query(this::mapRoom)
            .optional();
    }

    @Override
    public Optional<VotingRoom> findByShareTokenHash(
        String shareTokenHash,
        boolean forUpdate
    ) {
        return roomQuery("WHERE share_token_hash = :shareTokenHash", forUpdate)
            .param("shareTokenHash", shareTokenHash)
            .query(this::mapRoom)
            .optional();
    }

    @Override
    public Optional<VotingRoom> findById(UUID roomId) {
        return roomQuery("WHERE id = :id", false)
            .param("id", roomId)
            .query(this::mapRoom)
            .optional();
    }

    @Override
    public void insertRoom(VotingRoom room, List<RecommendationJobPlace> places) {
        jdbcClient.sql("""
                INSERT INTO voting_room (
                    id, recommendation_job_id, share_token_hash,
                    organizer_capability_hash, status, created_at, updated_at, expires_at
                ) VALUES (
                    :id, :jobId, :shareTokenHash, :organizerHash,
                    'OPEN', :createdAt, :updatedAt, :expiresAt
                )
                """)
            .param("id", room.id())
            .param("jobId", room.recommendationJobId())
            .param("shareTokenHash", room.shareTokenHash())
            .param("organizerHash", room.organizerCapabilityHash())
            .param("createdAt", timestamp(room.createdAt()))
            .param("updatedAt", timestamp(room.updatedAt()))
            .param("expiresAt", timestamp(room.expiresAt()))
            .update();

        for (int index = 0; index < places.size(); index++) {
            RecommendationJobPlace place = places.get(index);
            jdbcClient.sql("""
                    INSERT INTO voting_room_place (room_id, place_id, ordinal, snapshot_json)
                    VALUES (:roomId, :placeId, :ordinal, CAST(:snapshotJson AS jsonb))
                    """)
                .param("roomId", room.id())
                .param("placeId", place.placeId())
                .param("ordinal", index + 1)
                .param("snapshotJson", writeJson(place))
                .update();
        }
    }

    @Override
    public List<VotingRoomPlace> findPlaces(UUID roomId) {
        return jdbcClient.sql("""
                SELECT room_id, place_id, ordinal, snapshot_json::text AS snapshot_json
                FROM voting_room_place
                WHERE room_id = :roomId
                ORDER BY ordinal
                """)
            .param("roomId", roomId)
            .query((resultSet, rowNumber) -> new VotingRoomPlace(
                resultSet.getObject("room_id", UUID.class),
                resultSet.getObject("place_id", UUID.class),
                resultSet.getInt("ordinal"),
                readPlace(resultSet.getString("snapshot_json"))
            ))
            .list();
    }

    @Override
    public boolean hasPlace(UUID roomId, UUID placeId) {
        return jdbcClient.sql("""
                SELECT EXISTS (
                    SELECT 1 FROM voting_room_place
                    WHERE room_id = :roomId AND place_id = :placeId
                )
                """)
            .param("roomId", roomId)
            .param("placeId", placeId)
            .query(Boolean.class)
            .single();
    }

    @Override
    public List<VoteAggregate> findAggregate(UUID roomId) {
        return jdbcClient.sql("""
                SELECT place.place_id,
                       COUNT(vote.*) FILTER (WHERE vote.vote_value = 'LIKE') AS like_count,
                       COUNT(vote.*) FILTER (WHERE vote.vote_value = 'DISLIKE') AS dislike_count
                FROM voting_room_place place
                LEFT JOIN room_vote vote
                  ON vote.room_id = place.room_id AND vote.place_id = place.place_id
                WHERE place.room_id = :roomId
                GROUP BY place.place_id, place.ordinal
                ORDER BY place.ordinal
                """)
            .param("roomId", roomId)
            .query((resultSet, rowNumber) -> new VoteAggregate(
                resultSet.getObject("place_id", UUID.class),
                resultSet.getLong("like_count"),
                resultSet.getLong("dislike_count")
            ))
            .list();
    }

    @Override
    public Map<UUID, VoteValue> findVotes(UUID roomId, UUID sessionId) {
        if (sessionId == null) {
            return Map.of();
        }
        Map<UUID, VoteValue> votes = new LinkedHashMap<>();
        jdbcClient.sql("""
                SELECT place_id, vote_value
                FROM room_vote
                WHERE room_id = :roomId AND session_id = :sessionId
                ORDER BY place_id
                """)
            .param("roomId", roomId)
            .param("sessionId", sessionId)
            .query((resultSet, rowNumber) -> Map.entry(
                resultSet.getObject("place_id", UUID.class),
                VoteValue.valueOf(resultSet.getString("vote_value"))
            ))
            .list()
            .forEach(entry -> votes.put(entry.getKey(), entry.getValue()));
        return Map.copyOf(votes);
    }

    @Override
    public VoteWriteResult putVote(
        UUID roomId,
        UUID placeId,
        UUID sessionId,
        VoteValue value,
        Instant updatedAt
    ) {
        long started = System.nanoTime();
        try {
            return putVoteMeasured(roomId, placeId, sessionId, value, updatedAt);
        } finally {
            recordVoteWrite(started);
        }
    }

    private VoteWriteResult putVoteMeasured(
        UUID roomId,
        UUID placeId,
        UUID sessionId,
        VoteValue value,
        Instant updatedAt
    ) {
        Optional<Instant> written = jdbcClient.sql("""
                INSERT INTO room_vote (
                    room_id, place_id, session_id, vote_value, created_at, updated_at
                ) VALUES (
                    :roomId, :placeId, :sessionId, :voteValue, :updatedAt, :updatedAt
                )
                ON CONFLICT (room_id, place_id, session_id) DO UPDATE
                SET vote_value = EXCLUDED.vote_value,
                    updated_at = EXCLUDED.updated_at
                WHERE room_vote.vote_value <> EXCLUDED.vote_value
                RETURNING updated_at
                """)
            .param("roomId", roomId)
            .param("placeId", placeId)
            .param("sessionId", sessionId)
            .param("voteValue", value.name())
            .param("updatedAt", timestamp(updatedAt))
            .query((resultSet, rowNumber) -> resultSet
                .getObject("updated_at", OffsetDateTime.class)
                .toInstant())
            .optional();

        if (written.isPresent()) {
            touchRoom(roomId, updatedAt);
            return new VoteWriteResult(true, written.orElseThrow());
        }
        Instant existingUpdatedAt = jdbcClient.sql("""
                SELECT updated_at FROM room_vote
                WHERE room_id = :roomId AND place_id = :placeId AND session_id = :sessionId
                """)
            .param("roomId", roomId)
            .param("placeId", placeId)
            .param("sessionId", sessionId)
            .query((resultSet, rowNumber) -> resultSet
                .getObject("updated_at", OffsetDateTime.class)
                .toInstant())
            .single();
        return new VoteWriteResult(false, existingUpdatedAt);
    }

    @Override
    public boolean deleteVote(
        UUID roomId,
        UUID placeId,
        UUID sessionId,
        Instant updatedAt
    ) {
        long started = System.nanoTime();
        try {
            int deleted = jdbcClient.sql("""
                    DELETE FROM room_vote
                    WHERE room_id = :roomId AND place_id = :placeId AND session_id = :sessionId
                    """)
                .param("roomId", roomId)
                .param("placeId", placeId)
                .param("sessionId", sessionId)
                .update();
            if (deleted == 1) {
                touchRoom(roomId, updatedAt);
                return true;
            }
            return false;
        } finally {
            recordVoteWrite(started);
        }
    }

    @Override
    public void finalizeRoom(UUID roomId, UUID placeId, Instant finalizedAt) {
        int updated = jdbcClient.sql("""
                UPDATE voting_room
                SET status = 'FINALIZED',
                    final_place_id = :placeId,
                    finalized_at = :finalizedAt,
                    updated_at = :finalizedAt,
                    version = version + 1
                WHERE id = :roomId AND status = 'OPEN'
                """)
            .param("roomId", roomId)
            .param("placeId", placeId)
            .param("finalizedAt", timestamp(finalizedAt))
            .update();
        if (updated != 1) {
            throw new IllegalStateException("Room finalization state changed concurrently.");
        }
    }

    @Override
    public VotingRoomEvent appendEvent(
        UUID eventId,
        UUID roomId,
        String eventType,
        Instant occurredAt
    ) {
        return jdbcClient.sql("""
                INSERT INTO voting_room_event (
                    event_id, room_id, event_type, payload_json, occurred_at
                ) VALUES (
                    :eventId, :roomId, :eventType, '{}'::jsonb, :occurredAt
                )
                RETURNING sequence_id, event_id, room_id, event_type, occurred_at
                """)
            .param("eventId", eventId)
            .param("roomId", roomId)
            .param("eventType", eventType)
            .param("occurredAt", timestamp(occurredAt))
            .query(this::mapEvent)
            .single();
    }

    @Override
    public List<VotingRoomEvent> findEventsAfter(UUID roomId, long sequenceId, int limit) {
        if (limit < 1 || limit > 1_000) {
            throw new IllegalArgumentException("Room event replay limit is invalid.");
        }
        return jdbcClient.sql("""
                SELECT sequence_id, event_id, room_id, event_type, occurred_at
                FROM voting_room_event
                WHERE room_id = :roomId AND sequence_id > :sequenceId
                ORDER BY sequence_id
                LIMIT :limit
                """)
            .param("roomId", roomId)
            .param("sequenceId", sequenceId)
            .param("limit", limit)
            .query(this::mapEvent)
            .list();
    }

    @Override
    public long latestEventSequence(UUID roomId) {
        return jdbcClient.sql("""
                SELECT COALESCE(MAX(sequence_id), 0)
                FROM voting_room_event
                WHERE room_id = :roomId
                """)
            .param("roomId", roomId)
            .query(Long.class)
            .single();
    }

    private JdbcClient.StatementSpec roomQuery(String where, boolean forUpdate) {
        return jdbcClient.sql("""
                SELECT id, recommendation_job_id, share_token_hash,
                       organizer_capability_hash, status, final_place_id, finalized_at,
                       created_at, updated_at, expires_at, version
                FROM voting_room
                """ + where + (forUpdate ? " FOR UPDATE" : ""));
    }

    private VotingRoom mapRoom(ResultSet resultSet, int rowNumber) throws SQLException {
        OffsetDateTime finalizedAt = resultSet.getObject("finalized_at", OffsetDateTime.class);
        return new VotingRoom(
            resultSet.getObject("id", UUID.class),
            resultSet.getObject("recommendation_job_id", UUID.class),
            resultSet.getString("share_token_hash"),
            resultSet.getString("organizer_capability_hash"),
            RoomStatus.valueOf(resultSet.getString("status")),
            resultSet.getObject("final_place_id", UUID.class),
            finalizedAt == null ? null : finalizedAt.toInstant(),
            resultSet.getObject("created_at", OffsetDateTime.class).toInstant(),
            resultSet.getObject("updated_at", OffsetDateTime.class).toInstant(),
            resultSet.getObject("expires_at", OffsetDateTime.class).toInstant(),
            resultSet.getLong("version")
        );
    }

    private VotingRoomEvent mapEvent(ResultSet resultSet, int rowNumber) throws SQLException {
        return new VotingRoomEvent(
            resultSet.getLong("sequence_id"),
            resultSet.getObject("event_id", UUID.class),
            resultSet.getObject("room_id", UUID.class),
            resultSet.getString("event_type"),
            resultSet.getObject("occurred_at", OffsetDateTime.class).toInstant()
        );
    }

    private RecommendationJobPlace readPlace(String json) {
        try {
            return objectMapper.readValue(json, RecommendationJobPlace.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored room place JSON is invalid.", exception);
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Room JSON could not be encoded.", exception);
        }
    }

    private void touchRoom(UUID roomId, Instant updatedAt) {
        jdbcClient.sql("""
                UPDATE voting_room
                SET updated_at = :updatedAt, version = version + 1
                WHERE id = :roomId
                """)
            .param("roomId", roomId)
            .param("updatedAt", timestamp(updatedAt))
            .update();
    }

    private void recordVoteWrite(long started) {
        if (metrics == null) {
            return;
        }
        Duration elapsed = Duration.ofNanos(System.nanoTime() - started);
        metrics.voteWrite(elapsed, elapsed.compareTo(contentionThreshold) >= 0);
    }

    private static OffsetDateTime timestamp(Instant instant) {
        return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    private record StoredRoomResponse(UUID roomId, UUID placeId, Instant expiresAt) {
    }
}
