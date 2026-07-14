"""Structured Claim — Python mirror of contracts/schemas.js STRUCTURED_CLAIM_SPEC
(docs/skills.md "Structured Claim"). S7(T06)이 아직 구현되지 않았지만 S14(T03)의
COLLECT 입력 계약(`{operation: COLLECT, claim: StructuredClaim}`)이 이 타입을
요구하므로 typed 계약만 먼저 도입한다 — S7 구현 시 이 스키마를 그대로 재사용한다
(계약 변경은 문서 먼저 원칙에 따라 contracts/schemas.js가 여전히 단일 진실 소스).
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel

EvidenceDomain = Literal["financial", "market", "flow", "valuation", "peer"]


class Comparator(BaseModel):
    op: str
    target_value: float
    target_unit: str
    tolerance_value: float | None = None
    tolerance_unit: str | None = None


class StructuredClaim(BaseModel):
    claim_id: str
    claim_group_id: str | None = None
    original_span: str
    corp_code: str
    stock_code: str
    claim_type: str
    metric: str
    evidence_domain: EvidenceDomain
    comparison_entity_ref: str | None = None
    peer_universe_ref: str | None = None
    comparator: Comparator
    direction: str
    current_period: str
    comparison_period: str
    as_of: date
    verifiable: bool
    ambiguity_flags: list[str] = []
    condition: str | None = None
