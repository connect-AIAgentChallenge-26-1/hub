package com.placepick.draft;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.recommendation.condition.application.port.out.ConditionWarning;
import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
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
public class JdbcRecommendationDraftRepository implements RecommendationDraftRepository {

    private static final TypeReference<List<ConditionWarning>> WARNING_LIST =
        new TypeReference<>() { };

    private final JdbcClient jdbcClient;
    private final ObjectMapper objectMapper;

    public JdbcRecommendationDraftRepository(JdbcClient jdbcClient, ObjectMapper objectMapper) {
        this.jdbcClient = jdbcClient;
        this.objectMapper = objectMapper;
    }

    @Override
    public void insert(RecommendationDraft draft) {
        jdbcClient.sql("""
                INSERT INTO recommendation_draft (
                    id, session_id, status, request_text, condition_json, warnings_json,
                    created_at, updated_at, expires_at
                ) VALUES (
                    :id, :sessionId, :status, :requestText,
                    CAST(:conditionJson AS jsonb), CAST(:warningsJson AS jsonb),
                    :createdAt, :updatedAt, :expiresAt
                )
                """)
            .param("id", draft.id())
            .param("sessionId", draft.sessionId())
            .param("status", draft.status().name())
            .param("requestText", draft.requestText())
            .param("conditionJson", writeJson(draft.condition()))
            .param("warningsJson", writeJson(draft.warnings()))
            .param("createdAt", timestamp(draft.createdAt()))
            .param("updatedAt", timestamp(draft.updatedAt()))
            .param("expiresAt", timestamp(draft.expiresAt()))
            .update();
    }

    @Override
    public Optional<RecommendationDraft> findOwned(UUID draftId, UUID sessionId) {
        return findOwned(draftId, sessionId, false);
    }

    @Override
    public Optional<RecommendationDraft> findOwnedForUpdate(UUID draftId, UUID sessionId) {
        return findOwned(draftId, sessionId, true);
    }

    private Optional<RecommendationDraft> findOwned(
        UUID draftId,
        UUID sessionId,
        boolean forUpdate
    ) {
        return jdbcClient.sql("""
                SELECT id, session_id, status, request_text, condition_json, warnings_json,
                       consumed_job_id, created_at, updated_at, expires_at
                FROM recommendation_draft
                WHERE id = :id AND session_id = :sessionId
                """ + (forUpdate ? " FOR UPDATE" : ""))
            .param("id", draftId)
            .param("sessionId", sessionId)
            .query(this::map)
            .optional();
    }

    @Override
    public boolean consume(
        UUID draftId,
        UUID sessionId,
        UUID jobId,
        Instant updatedAt
    ) {
        int changed = jdbcClient.sql("""
                UPDATE recommendation_draft
                SET status = 'CONSUMED',
                    consumed_job_id = :jobId,
                    updated_at = :updatedAt
                WHERE id = :id
                  AND session_id = :sessionId
                  AND status = 'CONFIRMED'
                """)
            .param("id", draftId)
            .param("sessionId", sessionId)
            .param("jobId", jobId)
            .param("updatedAt", timestamp(updatedAt))
            .update();
        return changed == 1;
    }

    @Override
    public boolean confirm(
        UUID draftId,
        UUID sessionId,
        DraftRecommendationCondition condition,
        Instant updatedAt
    ) {
        int changed = jdbcClient.sql("""
                UPDATE recommendation_draft
                SET status = 'CONFIRMED',
                    condition_json = CAST(:conditionJson AS jsonb),
                    updated_at = :updatedAt
                WHERE id = :id
                  AND session_id = :sessionId
                  AND status <> 'CONSUMED'
                """)
            .param("id", draftId)
            .param("sessionId", sessionId)
            .param("conditionJson", writeJson(condition))
            .param("updatedAt", timestamp(updatedAt))
            .update();
        return changed == 1;
    }

    private RecommendationDraft map(ResultSet resultSet, int rowNumber) throws SQLException {
        return new RecommendationDraft(
            resultSet.getObject("id", UUID.class),
            resultSet.getObject("session_id", UUID.class),
            DraftStatus.valueOf(resultSet.getString("status")),
            resultSet.getString("request_text"),
            readCondition(resultSet.getString("condition_json")),
            readWarnings(resultSet.getString("warnings_json")),
            resultSet.getObject("consumed_job_id", UUID.class),
            resultSet.getObject("created_at", OffsetDateTime.class).toInstant(),
            resultSet.getObject("updated_at", OffsetDateTime.class).toInstant(),
            resultSet.getObject("expires_at", OffsetDateTime.class).toInstant()
        );
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Draft JSON could not be encoded.", exception);
        }
    }

    private DraftRecommendationCondition readCondition(String json) {
        try {
            return objectMapper.readValue(json, DraftRecommendationCondition.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored draft condition is invalid.", exception);
        }
    }

    private List<ConditionWarning> readWarnings(String json) {
        try {
            return objectMapper.readValue(json, WARNING_LIST);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored draft warnings are invalid.", exception);
        }
    }

    private OffsetDateTime timestamp(Instant instant) {
        return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
}
