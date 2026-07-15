package com.placepick.outbox;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcOutboxRepository implements OutboxRepository {

    private final JdbcClient jdbcClient;

    public JdbcOutboxRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    @Override
    public void insert(OutboxEvent event) {
        jdbcClient.sql("""
                INSERT INTO outbox_event (
                    id, aggregate_type, aggregate_id, event_type, payload_json, created_at
                ) VALUES (
                    :id, :aggregateType, :aggregateId, :eventType,
                    CAST(:payloadJson AS jsonb), :createdAt
                )
                """)
            .param("id", event.id())
            .param("aggregateType", event.aggregateType())
            .param("aggregateId", event.aggregateId())
            .param("eventType", event.eventType())
            .param("payloadJson", event.payloadJson())
            .param("createdAt", timestamp(event.createdAt()))
            .update();
    }

    @Override
    public List<OutboxEvent> findUnpublished(int limit) {
        if (limit < 1 || limit > 1_000) {
            throw new IllegalArgumentException("Outbox batch size is invalid.");
        }
        return jdbcClient.sql("""
                SELECT id, aggregate_type, aggregate_id, event_type,
                       payload_json::text AS payload_json, created_at, attempt_count
                FROM outbox_event
                WHERE published_at IS NULL
                ORDER BY created_at, id
                LIMIT :limit
                """)
            .param("limit", limit)
            .query(this::map)
            .list();
    }

    @Override
    public void markPublished(UUID eventId, Instant publishedAt) {
        jdbcClient.sql("""
                UPDATE outbox_event
                SET published_at = :publishedAt,
                    last_error_code = NULL
                WHERE id = :id AND published_at IS NULL
                """)
            .param("id", eventId)
            .param("publishedAt", timestamp(publishedAt))
            .update();
    }

    @Override
    public void recordFailure(UUID eventId, String safeErrorCode) {
        jdbcClient.sql("""
                UPDATE outbox_event
                SET attempt_count = attempt_count + 1,
                    last_error_code = :errorCode
                WHERE id = :id AND published_at IS NULL
                """)
            .param("id", eventId)
            .param("errorCode", safeErrorCode)
            .update();
    }

    private OutboxEvent map(ResultSet resultSet, int rowNumber) throws SQLException {
        return new OutboxEvent(
            resultSet.getObject("id", UUID.class),
            resultSet.getString("aggregate_type"),
            resultSet.getObject("aggregate_id", UUID.class),
            resultSet.getString("event_type"),
            resultSet.getString("payload_json"),
            resultSet.getObject("created_at", OffsetDateTime.class).toInstant(),
            resultSet.getInt("attempt_count")
        );
    }

    private static OffsetDateTime timestamp(Instant instant) {
        return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
}
