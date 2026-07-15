package com.placepick.lifecycle;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcDataRetentionRepository implements DataRetentionRepository {

    private final JdbcClient jdbcClient;

    public JdbcDataRetentionRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    @Override
    public RetentionCleanupReport deleteExpired(
        Instant now,
        Instant processedBefore,
        Instant publishedOutboxBefore
    ) {
        OffsetDateTime current = timestamp(now);
        int rooms = jdbcClient.sql("""
                DELETE FROM voting_room WHERE expires_at <= :now
                """)
            .param("now", current)
            .update();

        jdbcClient.sql("""
                UPDATE recommendation_draft AS draft
                SET consumed_job_id = NULL
                WHERE consumed_job_id IN (
                    SELECT job.id
                    FROM recommendation_job AS job
                    WHERE job.expires_at <= :now
                      AND NOT EXISTS (
                          SELECT 1 FROM voting_room AS room
                          WHERE room.recommendation_job_id = job.id
                      )
                )
                """)
            .param("now", current)
            .update();

        int jobs = jdbcClient.sql("""
                DELETE FROM recommendation_job AS job
                WHERE job.expires_at <= :now
                  AND NOT EXISTS (
                      SELECT 1 FROM voting_room AS room
                      WHERE room.recommendation_job_id = job.id
                  )
                """)
            .param("now", current)
            .update();

        int drafts = jdbcClient.sql("""
                DELETE FROM recommendation_draft AS draft
                WHERE draft.expires_at <= :now
                  AND NOT EXISTS (
                      SELECT 1 FROM recommendation_job AS job
                      WHERE job.draft_id = draft.id
                  )
                """)
            .param("now", current)
            .update();

        int idempotency = jdbcClient.sql("""
                DELETE FROM idempotency_record WHERE expires_at <= :now
                """)
            .param("now", current)
            .update();
        int processed = jdbcClient.sql("""
                DELETE FROM processed_event WHERE processed_at <= :before
                """)
            .param("before", timestamp(processedBefore))
            .update();
        int outbox = jdbcClient.sql("""
                DELETE FROM outbox_event
                WHERE published_at IS NOT NULL AND published_at <= :before
                """)
            .param("before", timestamp(publishedOutboxBefore))
            .update();

        int sessions = jdbcClient.sql("""
                DELETE FROM anonymous_session AS session
                WHERE session.expires_at <= :now
                  AND NOT EXISTS (
                      SELECT 1 FROM recommendation_draft AS draft
                      WHERE draft.session_id = session.id
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM recommendation_job AS job
                      WHERE job.session_id = session.id
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM idempotency_record AS record
                      WHERE record.session_id = session.id
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM product_event AS event
                      WHERE event.session_id = session.id
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM room_vote AS vote
                      WHERE vote.session_id = session.id
                  )
                """)
            .param("now", current)
            .update();

        return new RetentionCleanupReport(
            rooms,
            jobs,
            drafts,
            idempotency,
            processed,
            outbox,
            sessions
        );
    }

    private static OffsetDateTime timestamp(Instant value) {
        return OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
    }
}
