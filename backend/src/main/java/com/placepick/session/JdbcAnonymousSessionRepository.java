package com.placepick.session;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcAnonymousSessionRepository implements AnonymousSessionRepository {

    private final JdbcClient jdbcClient;

    public JdbcAnonymousSessionRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    @Override
    public Optional<AnonymousSession> findByTokenHash(String tokenHash) {
        return jdbcClient.sql("""
                SELECT id, token_hash, csrf_token_hash, created_at, updated_at, expires_at
                FROM anonymous_session
                WHERE token_hash = :tokenHash
                """)
            .param("tokenHash", tokenHash)
            .query(this::map)
            .optional();
    }

    @Override
    public void insert(AnonymousSession session) {
        jdbcClient.sql("""
                INSERT INTO anonymous_session (
                    id, token_hash, csrf_token_hash, created_at, updated_at, expires_at
                ) VALUES (
                    :id, :tokenHash, :csrfTokenHash, :createdAt, :updatedAt, :expiresAt
                )
                """)
            .param("id", session.id())
            .param("tokenHash", session.tokenHash())
            .param("csrfTokenHash", session.csrfTokenHash())
            .param("createdAt", timestamp(session.createdAt()))
            .param("updatedAt", timestamp(session.updatedAt()))
            .param("expiresAt", timestamp(session.expiresAt()))
            .update();
    }

    @Override
    public void refresh(
        UUID sessionId,
        String csrfTokenHash,
        Instant updatedAt,
        Instant expiresAt
    ) {
        jdbcClient.sql("""
                UPDATE anonymous_session
                SET csrf_token_hash = :csrfTokenHash,
                    updated_at = :updatedAt,
                    expires_at = :expiresAt
                WHERE id = :id
                """)
            .param("id", sessionId)
            .param("csrfTokenHash", csrfTokenHash)
            .param("updatedAt", timestamp(updatedAt))
            .param("expiresAt", timestamp(expiresAt))
            .update();
    }

    private AnonymousSession map(ResultSet resultSet, int rowNumber) throws SQLException {
        return new AnonymousSession(
            resultSet.getObject("id", UUID.class),
            resultSet.getString("token_hash"),
            resultSet.getString("csrf_token_hash"),
            resultSet.getObject("created_at", OffsetDateTime.class).toInstant(),
            resultSet.getObject("updated_at", OffsetDateTime.class).toInstant(),
            resultSet.getObject("expires_at", OffsetDateTime.class).toInstant()
        );
    }

    private OffsetDateTime timestamp(Instant instant) {
        return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
}
