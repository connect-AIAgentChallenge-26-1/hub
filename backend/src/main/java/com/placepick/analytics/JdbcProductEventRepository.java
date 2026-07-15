package com.placepick.analytics;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcProductEventRepository implements ProductEventRepository {

    private final JdbcClient jdbcClient;
    private final ObjectMapper objectMapper;

    public JdbcProductEventRepository(JdbcClient jdbcClient, ObjectMapper objectMapper) {
        this.jdbcClient = jdbcClient;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean insertIfAbsent(ProductEvent event) {
        int changed = jdbcClient.sql("""
                INSERT INTO product_event (
                    event_id, session_id, event_name, occurred_at, context_json,
                    created_at, expires_at
                ) VALUES (
                    :eventId, :sessionId, :eventName, :occurredAt,
                    CAST(:contextJson AS jsonb), :createdAt, :expiresAt
                )
                ON CONFLICT (event_id) DO NOTHING
                """)
            .param("eventId", event.eventId())
            .param("sessionId", event.sessionId())
            .param("eventName", event.name().wireName())
            .param("occurredAt", timestamp(event.occurredAt()))
            .param("contextJson", writeJson(event.context()))
            .param("createdAt", timestamp(event.receivedAt()))
            .param("expiresAt", timestamp(event.expiresAt()))
            .update();
        return changed == 1;
    }

    @Override
    public int deleteExpired(Instant now) {
        return jdbcClient.sql("""
                DELETE FROM product_event
                WHERE expires_at <= :now
                """)
            .param("now", timestamp(now))
            .update();
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException(
                "Product event context could not be encoded.",
                exception
            );
        }
    }

    private static OffsetDateTime timestamp(Instant value) {
        return OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
    }
}
