"""Structured Claim — Python mirror of contracts/schemas.js STRUCTURED_CLAIM_SPEC
(docs/skills.md "Structured Claim"). T03에서 S14 입력 계약을 위해 typed 계약만
먼저 도입했고, S7(T06)이 이 스키마로 실제 Claim을 만든다(계약 변경은 문서 먼저
원칙에 따라 contracts/schemas.js·docs/skills.md가 여전히 단일 진실 소스).

`extra="forbid"`(Comparator·StructuredClaim 양쪽)가 docs/checklist.md C7
"schema allowlist, 허용 필드 밖 출력 차단"의 Python 쪽 강제 지점이다 — LLM
응답에 선언되지 않은 필드가 섞여 있으면 파싱 단계에서 즉시 거부된다.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict

EvidenceDomain = Literal["financial", "market", "flow", "valuation", "peer"]

# docs/checklist.md C7 "의견·미래 예측·수치·비교·부정·조건문 분류".
ClaimType = Literal[
    "OPINION", "FUTURE_PREDICTION", "NUMERIC", "COMPARISON", "NEGATION", "CONDITIONAL"
]

# docs/checklist.md C8 "증가·감소·배수·비율·연속성 comparator".
ComparatorOp = Literal["THRESHOLD", "INCREASE", "DECREASE", "MULTIPLE", "RATIO", "CONTINUITY"]

ComparisonOperator = Literal["GTE", "LTE", "GT", "LT", "EQ"]

ContinuityDirection = Literal["INCREASE", "DECREASE"]


class Comparator(BaseModel):
    model_config = ConfigDict(extra="forbid")

    op: ComparatorOp
    comparison_operator: ComparisonOperator
    target_value: float
    target_unit: str
    # op=CONTINUITY(예: "3분기 연속 증가")에서만 쓴다 — 그 외 op에는 무관.
    continuity_direction: ContinuityDirection | None = None
    tolerance_value: float | None = None
    tolerance_unit: str | None = None


class StructuredClaim(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claim_id: str
    claim_group_id: str | None = None
    original_span: str
    corp_code: str
    stock_code: str
    claim_type: ClaimType
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
