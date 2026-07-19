BEGIN;

CREATE SCHEMA IF NOT EXISTS noticepilot;

CREATE TABLE IF NOT EXISTS noticepilot.schema_migration (
  version text PRIMARY KEY,
  checksum_sha256 char(64) NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE noticepilot.source_notice (
  source_notice_id text PRIMARY KEY,
  institution_id text NOT NULL,
  canonical_board_category text NOT NULL,
  source_post_id text NOT NULL,
  source_identity_key text NOT NULL UNIQUE,
  title text NOT NULL,
  source_url text,
  canonical_source_url text,
  published_at date,
  fetched_at timestamptz,
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  semantic_content_hash char(64),
  status text NOT NULL CHECK (status IN ('active','missing','deleted','fetch_failed')),
  source_revision integer NOT NULL DEFAULT 1 CHECK (source_revision >= 1),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (institution_id, canonical_board_category, source_post_id)
);

CREATE INDEX source_notice_content_hash_idx ON noticepilot.source_notice(content_hash);
CREATE INDEX source_notice_status_idx ON noticepilot.source_notice(institution_id, status);

CREATE TABLE noticepilot.extraction_run (
  extraction_run_id text PRIMARY KEY,
  source_notice_id text NOT NULL REFERENCES noticepilot.source_notice(source_notice_id),
  source_content_hash char(64) NOT NULL CHECK (source_content_hash ~ '^[0-9a-f]{64}$'),
  extractor_version text NOT NULL,
  policy_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','running','completed','failed','superseded')),
  result_hash char(64) NOT NULL CHECK (result_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL,
  UNIQUE (source_notice_id, source_content_hash, extractor_version, policy_version)
);

CREATE TABLE noticepilot.calendar_event_candidate (
  candidate_id text PRIMARY KEY,
  source_notice_id text NOT NULL REFERENCES noticepilot.source_notice(source_notice_id),
  extraction_run_id text NOT NULL REFERENCES noticepilot.extraction_run(extraction_run_id),
  candidate_hash char(64) NOT NULL CHECK (candidate_hash ~ '^[0-9a-f]{64}$'),
  publishability_status text NOT NULL CHECK (publishability_status IN ('auto_confirmed','needs_review','suppressed')),
  include_in_calendar_feed boolean NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX calendar_event_candidate_notice_idx ON noticepilot.calendar_event_candidate(source_notice_id);
CREATE INDEX calendar_event_candidate_feed_idx ON noticepilot.calendar_event_candidate(include_in_calendar_feed, publishability_status);

CREATE TABLE noticepilot.calendar_event (
  calendar_event_id text PRIMARY KEY,
  canonical_candidate_id text NOT NULL REFERENCES noticepilot.calendar_event_candidate(candidate_id),
  canonical_source_notice_id text NOT NULL REFERENCES noticepilot.source_notice(source_notice_id),
  active_revision_id text,
  status text NOT NULL CHECK (status IN ('published','updated','cancelled','suppressed')),
  sequence integer NOT NULL CHECK (sequence >= 0),
  version integer NOT NULL CHECK (version >= 0),
  relation_basis text NOT NULL,
  projection jsonb NOT NULL CHECK (jsonb_typeof(projection) = 'object'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE noticepilot.calendar_event_revision (
  revision_id text PRIMARY KEY,
  calendar_event_id text NOT NULL REFERENCES noticepilot.calendar_event(calendar_event_id) ON DELETE CASCADE,
  source_candidate_id text NOT NULL REFERENCES noticepilot.calendar_event_candidate(candidate_id),
  previous_revision_id text REFERENCES noticepilot.calendar_event_revision(revision_id),
  revision_number integer NOT NULL CHECK (revision_number >= 1),
  sequence integer NOT NULL CHECK (sequence >= 0),
  kind text NOT NULL CHECK (kind IN ('created','updated','extended','cancelled','replaced')),
  active boolean NOT NULL,
  projection jsonb NOT NULL CHECK (jsonb_typeof(projection) = 'object'),
  evidence_pair_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_pair_ids) = 'array'),
  recorded_at timestamptz NOT NULL,
  UNIQUE (calendar_event_id, revision_number)
);

CREATE UNIQUE INDEX calendar_event_one_active_revision_idx
  ON noticepilot.calendar_event_revision(calendar_event_id) WHERE active;

ALTER TABLE noticepilot.calendar_event
  ADD CONSTRAINT calendar_event_active_revision_fk
  FOREIGN KEY (active_revision_id)
  REFERENCES noticepilot.calendar_event_revision(revision_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE noticepilot.calendar_event_source_link (
  calendar_event_id text NOT NULL REFERENCES noticepilot.calendar_event(calendar_event_id) ON DELETE CASCADE,
  source_candidate_id text NOT NULL REFERENCES noticepilot.calendar_event_candidate(candidate_id),
  source_notice_id text NOT NULL REFERENCES noticepilot.source_notice(source_notice_id),
  canonical boolean NOT NULL,
  active_source boolean NOT NULL,
  relation_role text NOT NULL CHECK (relation_role IN ('canonical','duplicate_source','extension_source','revision_source','replacement_source')),
  source_identity jsonb NOT NULL CHECK (jsonb_typeof(source_identity) = 'object'),
  observed_source_url text,
  canonical_source_url text,
  published_at date,
  decision_rule_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(decision_rule_ids) = 'array'),
  evidence_pair_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_pair_ids) = 'array'),
  first_observed_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (calendar_event_id, source_candidate_id)
);

CREATE UNIQUE INDEX calendar_event_one_canonical_source_idx
  ON noticepilot.calendar_event_source_link(calendar_event_id) WHERE canonical AND active_source;

CREATE TABLE noticepilot.candidate_event_assignment (
  candidate_id text PRIMARY KEY REFERENCES noticepilot.calendar_event_candidate(candidate_id),
  calendar_event_id text NOT NULL REFERENCES noticepilot.calendar_event(calendar_event_id),
  assignment_kind text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  assigned_at timestamptz NOT NULL
);

CREATE INDEX candidate_event_assignment_event_idx ON noticepilot.candidate_event_assignment(calendar_event_id);

CREATE TABLE noticepilot.cross_notice_relation_decision (
  relation_decision_id text PRIMARY KEY,
  pair_id text NOT NULL UNIQUE,
  relation text NOT NULL CHECK (relation IN ('distinct','duplicate','revision','extension','replacement','needs_review')),
  decision_status text NOT NULL CHECK (decision_status IN ('approved','needs_review')),
  merge_allowed boolean NOT NULL,
  merge_applied boolean NOT NULL,
  canonical_candidate_id text REFERENCES noticepilot.calendar_event_candidate(candidate_id),
  candidate_ids jsonb NOT NULL CHECK (jsonb_typeof(candidate_ids) = 'array'),
  calendar_event_ids jsonb NOT NULL CHECK (jsonb_typeof(calendar_event_ids) = 'array'),
  rule_ids jsonb NOT NULL CHECK (jsonb_typeof(rule_ids) = 'array'),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  persisted_at timestamptz NOT NULL
);

CREATE TABLE noticepilot.subscription_profile_revision (
  profile_id text NOT NULL,
  profile_revision integer NOT NULL CHECK (profile_revision >= 1),
  institution_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','paused','revoked')),
  profile_fingerprint_sha256 char(64) NOT NULL CHECK (profile_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (profile_id, profile_revision)
);

CREATE TABLE noticepilot.subscription_profile_head (
  profile_id text PRIMARY KEY,
  current_revision integer NOT NULL CHECK (current_revision >= 1),
  status text NOT NULL CHECK (status IN ('active','paused','revoked')),
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (profile_id, current_revision)
    REFERENCES noticepilot.subscription_profile_revision(profile_id, profile_revision)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE noticepilot.feed_snapshot (
  snapshot_id text PRIMARY KEY,
  snapshot_hash char(64) NOT NULL UNIQUE CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  profile_id text NOT NULL,
  profile_revision integer NOT NULL,
  registry_id text NOT NULL,
  projection_id text NOT NULL,
  event_count integer NOT NULL CHECK (event_count >= 0),
  excluded_event_count integer NOT NULL CHECK (excluded_event_count >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  first_materialized_at timestamptz NOT NULL,
  FOREIGN KEY (profile_id, profile_revision)
    REFERENCES noticepilot.subscription_profile_revision(profile_id, profile_revision)
);

CREATE TABLE noticepilot.feed_snapshot_event (
  snapshot_id text NOT NULL REFERENCES noticepilot.feed_snapshot(snapshot_id) ON DELETE CASCADE,
  calendar_event_id text NOT NULL REFERENCES noticepilot.calendar_event(calendar_event_id),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (snapshot_id, calendar_event_id),
  UNIQUE (snapshot_id, position)
);

CREATE TABLE noticepilot.subscription_feed (
  feed_id text PRIMARY KEY,
  profile_id text NOT NULL REFERENCES noticepilot.subscription_profile_head(profile_id),
  current_snapshot_id text REFERENCES noticepilot.feed_snapshot(snapshot_id),
  calendar_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('provisioning','active','paused','revoked')),
  token_hash_sha256 char(64) CHECK (token_hash_sha256 IS NULL OR token_hash_sha256 ~ '^[0-9a-f]{64}$'),
  token_prefix text,
  token_rotated_at timestamptz,
  etag text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK ((status = 'provisioning' AND token_hash_sha256 IS NULL) OR (status IN ('active','paused','revoked') AND token_hash_sha256 IS NOT NULL))
);

CREATE TABLE noticepilot.subscription_feed_snapshot_history (
  feed_id text NOT NULL REFERENCES noticepilot.subscription_feed(feed_id) ON DELETE CASCADE,
  snapshot_id text NOT NULL REFERENCES noticepilot.feed_snapshot(snapshot_id),
  activated_at timestamptz NOT NULL,
  superseded_at timestamptz,
  PRIMARY KEY (feed_id, snapshot_id, activated_at)
);

CREATE TABLE noticepilot.runtime_outbox (
  outbox_id text PRIMARY KEY,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL CHECK (status IN ('pending','processing','delivered','failed','dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL,
  claimed_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX runtime_outbox_pending_idx
  ON noticepilot.runtime_outbox(status, available_at, created_at)
  WHERE status IN ('pending','failed');

CREATE TABLE noticepilot.crawler_checkpoint (
  source_key text PRIMARY KEY,
  cursor_value text,
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  last_error text,
  consecutive_failure_count integer NOT NULL DEFAULT 0 CHECK (consecutive_failure_count >= 0),
  updated_at timestamptz NOT NULL
);

CREATE TABLE noticepilot.source_processing_state (
  source_notice_id text PRIMARY KEY REFERENCES noticepilot.source_notice(source_notice_id) ON DELETE CASCADE,
  last_processed_content_hash char(64) CHECK (last_processed_content_hash IS NULL OR last_processed_content_hash ~ '^[0-9a-f]{64}$'),
  last_extraction_run_id text REFERENCES noticepilot.extraction_run(extraction_run_id),
  processing_status text NOT NULL CHECK (processing_status IN ('pending','processing','completed','failed','deleted')),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  last_error text,
  updated_at timestamptz NOT NULL
);

COMMIT;
