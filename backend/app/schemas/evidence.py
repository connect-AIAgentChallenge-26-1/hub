"""Evidence Pydantic 미러 (docs/skills.md "Evidence", contracts/schemas.js
`EVIDENCE_SPEC`·`validateEvidence`의 Python 미러).

`claim_id`와 `presentation_item_id` 중 **정확히 하나**가 필수다 — 기능 A
provenance는 presentation_item_id + relation=NEUTRAL, 기능 C 검증 근거는
claim_id + 판정된 relation을 쓴다. contracts/schemas.js와 동일하게 이 배타
규칙을 model validator로 강제한다.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator

EVIDENCE_SCHEMA_VERSION = "1.0.0"

EvidenceRelation = Literal["SUPPORTS", "REFUTES", "NEUTRAL", "CONFLICTS"]

_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class Evidence(BaseModel):
    """docs/skills.md Evidence typed 계약. `extra="forbid"`로 허용 필드 밖
    출력을 차단한다(contracts/schemas.js strict allowlist와 동일 계약)."""

    model_config = ConfigDict(extra="forbid")

    evidence_id: str
    corp_code: str
    claim_id: str | None = None
    presentation_item_id: str | None = None
    evidence_type: str
    document_id: str
    rcept_no: str
    filed_at: str
    target_period: str
    source_url: str
    quote: str
    chunk_offset: int
    retrieval_score: float
    relation: EvidenceRelation
    relation_reason: str
    relation_rule_version: str
    integrity_status: str
    as_of: str

    @model_validator(mode="after")
    def _exactly_one_owner(self) -> Evidence:
        has_claim = self.claim_id is not None
        has_presentation = self.presentation_item_id is not None
        if has_claim == has_presentation:
            raise ValueError(
                "exactly one of claim_id or presentation_item_id is required, "
                "not both or neither"
            )
        return self

    @model_validator(mode="after")
    def _as_of_is_date(self) -> Evidence:
        if not _DATE_PATTERN.match(self.as_of):
            raise ValueError("as_of must be YYYY-MM-DD")
        return self
