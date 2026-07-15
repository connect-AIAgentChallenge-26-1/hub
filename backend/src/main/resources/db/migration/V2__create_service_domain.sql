CREATE TABLE anonymous_session (
    id UUID PRIMARY KEY,
    token_hash CHAR(64) NOT NULL UNIQUE,
    csrf_token_hash CHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_anonymous_session_expiry ON anonymous_session (expires_at);

CREATE TABLE recommendation_draft (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES anonymous_session (id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL CHECK (status IN ('EXTRACTED', 'CONFIRMED', 'CONSUMED')),
    request_text VARCHAR(1000) NOT NULL,
    condition_json JSONB NOT NULL,
    warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    consumed_job_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_recommendation_draft_owner ON recommendation_draft (session_id, id);
CREATE INDEX idx_recommendation_draft_expiry ON recommendation_draft (expires_at);

CREATE TABLE recommendation_job (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES anonymous_session (id) ON DELETE CASCADE,
    draft_id UUID NOT NULL UNIQUE REFERENCES recommendation_draft (id),
    status VARCHAR(16) NOT NULL CHECK (status IN ('ACCEPTED', 'PROCESSING', 'COMPLETED', 'FAILED')),
    stage VARCHAR(24) NOT NULL CHECK (stage IN (
        'QUEUED', 'LOCAL_SEARCH', 'BLOG_SEARCH', 'SCORING',
        'REASON_GENERATION', 'PERSISTING', 'FINISHED'
    )),
    progress SMALLINT NOT NULL CHECK (progress BETWEEN 0 AND 100),
    degraded BOOLEAN NOT NULL DEFAULT FALSE,
    condition_json JSONB NOT NULL,
    warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    places_json JSONB,
    failure_code VARCHAR(64),
    failure_message VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0
);

ALTER TABLE recommendation_draft
    ADD CONSTRAINT fk_recommendation_draft_consumed_job
    FOREIGN KEY (consumed_job_id) REFERENCES recommendation_job (id);

CREATE INDEX idx_recommendation_job_owner ON recommendation_job (session_id, id);
CREATE INDEX idx_recommendation_job_work ON recommendation_job (status, created_at);
CREATE INDEX idx_recommendation_job_expiry ON recommendation_job (expires_at);

CREATE TABLE recommendation_candidate (
    job_id UUID NOT NULL REFERENCES recommendation_job (id) ON DELETE CASCADE,
    place_id UUID NOT NULL,
    ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 5),
    snapshot_json JSONB NOT NULL,
    score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 80),
    evidence_level VARCHAR(24) NOT NULL CHECK (evidence_level IN ('LOCAL_AND_BLOG', 'LOCAL_ONLY')),
    PRIMARY KEY (job_id, place_id),
    UNIQUE (job_id, ordinal)
);

CREATE TABLE recommendation_evidence (
    job_id UUID NOT NULL,
    place_id UUID NOT NULL,
    evidence_id VARCHAR(64) NOT NULL,
    evidence_type VARCHAR(16) NOT NULL CHECK (evidence_type IN ('LOCAL', 'BLOG')),
    snapshot_json JSONB NOT NULL,
    PRIMARY KEY (job_id, place_id, evidence_id),
    FOREIGN KEY (job_id, place_id)
        REFERENCES recommendation_candidate (job_id, place_id) ON DELETE CASCADE
);

CREATE TABLE idempotency_record (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES anonymous_session (id) ON DELETE CASCADE,
    method VARCHAR(8) NOT NULL,
    resource_path VARCHAR(300) NOT NULL,
    key_hash CHAR(64) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    response_status INTEGER NOT NULL,
    response_json JSONB NOT NULL,
    response_location VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE (session_id, method, resource_path, key_hash)
);

CREATE INDEX idx_idempotency_expiry ON idempotency_record (expires_at);

CREATE TABLE outbox_event (
    id UUID PRIMARY KEY,
    aggregate_type VARCHAR(40) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error_code VARCHAR(64)
);

CREATE INDEX idx_outbox_unpublished ON outbox_event (created_at) WHERE published_at IS NULL;

CREATE TABLE processed_event (
    event_id UUID NOT NULL,
    consumer_name VARCHAR(80) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (event_id, consumer_name)
);

CREATE TABLE recommendation_job_event (
    sequence_id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    job_id UUID NOT NULL REFERENCES recommendation_job (id) ON DELETE CASCADE,
    event_type VARCHAR(24) NOT NULL,
    payload_json JSONB NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_recommendation_job_event_stream
    ON recommendation_job_event (job_id, sequence_id);

CREATE TABLE voting_room (
    id UUID PRIMARY KEY,
    recommendation_job_id UUID NOT NULL UNIQUE REFERENCES recommendation_job (id),
    share_token_hash CHAR(64) NOT NULL UNIQUE,
    organizer_capability_hash CHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('OPEN', 'FINALIZED')),
    final_place_id UUID,
    finalized_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CHECK (
        (status = 'OPEN' AND final_place_id IS NULL AND finalized_at IS NULL)
        OR
        (status = 'FINALIZED' AND final_place_id IS NOT NULL AND finalized_at IS NOT NULL)
    )
);

CREATE INDEX idx_voting_room_expiry ON voting_room (expires_at);

CREATE TABLE voting_room_place (
    room_id UUID NOT NULL REFERENCES voting_room (id) ON DELETE CASCADE,
    place_id UUID NOT NULL,
    ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 3),
    snapshot_json JSONB NOT NULL,
    PRIMARY KEY (room_id, place_id),
    UNIQUE (room_id, ordinal)
);

ALTER TABLE voting_room
    ADD CONSTRAINT fk_voting_room_final_place
    FOREIGN KEY (id, final_place_id)
    REFERENCES voting_room_place (room_id, place_id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE room_vote (
    room_id UUID NOT NULL,
    place_id UUID NOT NULL,
    session_id UUID NOT NULL REFERENCES anonymous_session (id) ON DELETE CASCADE,
    vote_value VARCHAR(8) NOT NULL CHECK (vote_value IN ('LIKE', 'DISLIKE')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (room_id, place_id, session_id),
    FOREIGN KEY (room_id, place_id)
        REFERENCES voting_room_place (room_id, place_id) ON DELETE CASCADE
);

CREATE INDEX idx_room_vote_aggregate ON room_vote (room_id, place_id, vote_value);

CREATE TABLE voting_room_event (
    sequence_id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    room_id UUID NOT NULL REFERENCES voting_room (id) ON DELETE CASCADE,
    event_type VARCHAR(24) NOT NULL,
    payload_json JSONB NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_voting_room_event_stream ON voting_room_event (room_id, sequence_id);

CREATE TABLE product_event (
    event_id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES anonymous_session (id) ON DELETE CASCADE,
    event_name VARCHAR(40) NOT NULL CHECK (event_name IN (
        'draftCreated', 'recommendationViewed', 'roomShared',
        'voteChanged', 'finalResultViewed'
    )),
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    context_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_product_event_expiry ON product_event (expires_at);
