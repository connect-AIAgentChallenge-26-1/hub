ALTER TABLE recommendation_job
    DROP CONSTRAINT recommendation_job_draft_id_key;

ALTER TABLE recommendation_job
    ADD COLUMN root_job_id UUID,
    ADD COLUMN parent_job_id UUID,
    ADD COLUMN exploration_round INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN excluded_candidate_keys_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN used_variant_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN search_exhausted BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE recommendation_job
SET root_job_id = id
WHERE root_job_id IS NULL;

ALTER TABLE recommendation_job
    ALTER COLUMN root_job_id SET NOT NULL,
    ADD CONSTRAINT chk_recommendation_job_exploration_round
        CHECK (exploration_round >= 0),
    ADD CONSTRAINT chk_recommendation_job_lineage
        CHECK (
            (exploration_round = 0 AND parent_job_id IS NULL AND root_job_id = id)
            OR
            (exploration_round > 0 AND parent_job_id IS NOT NULL AND root_job_id <> id)
        ),
    ADD CONSTRAINT chk_recommendation_job_excluded_candidate_keys
        CHECK (jsonb_typeof(excluded_candidate_keys_json) = 'array'),
    ADD CONSTRAINT chk_recommendation_job_used_variant_ids
        CHECK (jsonb_typeof(used_variant_ids_json) = 'array'),
    ADD CONSTRAINT fk_recommendation_job_root
        FOREIGN KEY (root_job_id) REFERENCES recommendation_job (id),
    ADD CONSTRAINT fk_recommendation_job_parent
        FOREIGN KEY (parent_job_id) REFERENCES recommendation_job (id),
    ADD CONSTRAINT uq_recommendation_job_parent UNIQUE (parent_job_id);

CREATE INDEX idx_recommendation_job_exploration
    ON recommendation_job (root_job_id, exploration_round);

CREATE UNIQUE INDEX uq_recommendation_job_initial_draft
    ON recommendation_job (draft_id)
    WHERE exploration_round = 0;

ALTER TABLE recommendation_candidate
    ADD COLUMN candidate_fingerprint CHAR(64);

UPDATE recommendation_candidate AS candidate
SET candidate_fingerprint = evidence.snapshot_json #>> '{candidateKey,value}'
FROM recommendation_evidence AS evidence
WHERE evidence.job_id = candidate.job_id
  AND evidence.place_id = candidate.place_id
  AND evidence.evidence_type = 'LOCAL'
  AND candidate.candidate_fingerprint IS NULL;

-- A legacy candidate without its original CandidateKey cannot be excluded reliably from a
-- future adaptive search. Keep the historical result readable, but conservatively disable its
-- alternative chain instead of risking that the same place is shown again.
UPDATE recommendation_job AS job
SET search_exhausted = TRUE
WHERE job.status = 'COMPLETED'
  AND EXISTS (
      SELECT 1
      FROM recommendation_candidate AS candidate
      WHERE candidate.job_id = job.id
        AND candidate.candidate_fingerprint IS NULL
  );

UPDATE recommendation_candidate
SET candidate_fingerprint =
    md5(job_id::text || place_id::text) || md5(place_id::text || job_id::text)
WHERE candidate_fingerprint IS NULL;

ALTER TABLE recommendation_candidate
    ALTER COLUMN candidate_fingerprint SET NOT NULL,
    ADD CONSTRAINT chk_recommendation_candidate_fingerprint
        CHECK (candidate_fingerprint ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT uq_recommendation_candidate_fingerprint
        UNIQUE (job_id, candidate_fingerprint),
    DROP CONSTRAINT recommendation_candidate_score_check,
    ADD CONSTRAINT recommendation_candidate_score_check
        CHECK (score BETWEEN 0 AND 100);

CREATE INDEX idx_recommendation_candidate_fingerprint
    ON recommendation_candidate (candidate_fingerprint);

UPDATE recommendation_job AS job
SET excluded_candidate_keys_json = COALESCE((
        SELECT jsonb_agg(candidate.candidate_fingerprint ORDER BY candidate.ordinal)
        FROM recommendation_candidate AS candidate
        WHERE candidate.job_id = job.id
    ), '[]'::jsonb)
WHERE job.status = 'COMPLETED';

CREATE FUNCTION validate_recommendation_job_lineage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    parent_root UUID;
    parent_round INTEGER;
BEGIN
    IF NEW.parent_job_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT root_job_id, exploration_round
    INTO parent_root, parent_round
    FROM recommendation_job
    WHERE id = NEW.parent_job_id;

    IF parent_root IS NULL
       OR NEW.root_job_id <> parent_root
       OR NEW.exploration_round <> parent_round + 1 THEN
        RAISE EXCEPTION 'recommendation job lineage is inconsistent';
    END IF;
    RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_validate_recommendation_job_lineage
AFTER INSERT OR UPDATE OF root_job_id, parent_job_id, exploration_round
ON recommendation_job
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION validate_recommendation_job_lineage();
