"""S17 필수 근거 계획 (docs/skills.md S17, I5). Claim 유형별로 검증에 필요한
데이터를 사전 정의하고, 확보된 항목만으로 충족률을 계산한다. LLM 자기확신도는
쓰지 않는다(docs/skills.md S17 제약) — 이 모듈은 StructuredClaim.claim_type·
comparator.op와 versioned registry만 본다.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.schemas.structured_claim import ClaimType, ComparatorOp, StructuredClaim

EVIDENCE_PLANNER_VERSION = "s17-evidence-planner-1.0.0"

# 사실 주장이 아닌 유형은 근거를 요구하지 않는다 — S16이 evidence_plan 없이
# 바로 UNVERIFIABLE로 판정한다(docs/skills.md "Structured Claim" claim_type 설명).
NO_EVIDENCE_REQUIRED_CLAIM_TYPES: frozenset[ClaimType] = frozenset(
    {"OPINION", "FUTURE_PREDICTION"}
)

# CONDITIONAL은 조건 자체를 평가하는 스킬이 아직 없어 항상 충족 불가능한 단일
# 항목만 등록한다 — 임의로 조건을 평가하지 않는다(CLAUDE.md 절대 원칙 2).
CONDITIONAL_UNSUPPORTED_KEY = "condition_evaluation"


@dataclass(frozen=True)
class EvidenceRequirement:
    key: str
    description: str


# 필요한 데이터 포인트 수는 claim_type이 아니라 comparator.op이 결정한다 — 값
# 하나만 대상 기준과 비교하는지(THRESHOLD/RATIO), 두 기간을 비교하는지
# (INCREASE/DECREASE/MULTIPLE), 연속 구간 전체가 필요한지(CONTINUITY)는 op에
# 달려 있다(docs/checklist.md C8 comparator 5종 + THRESHOLD).
_SINGLE_VALUE_OPS: frozenset[ComparatorOp] = frozenset({"THRESHOLD", "RATIO"})
_TWO_PERIOD_OPS: frozenset[ComparatorOp] = frozenset({"INCREASE", "DECREASE", "MULTIPLE"})
_CONTINUITY_OPS: frozenset[ComparatorOp] = frozenset({"CONTINUITY"})

_SINGLE_VALUE_REQUIREMENT: tuple[EvidenceRequirement, ...] = (
    EvidenceRequirement("current_period_value", "대상 기간의 실제 수치 근거"),
)
_TWO_PERIOD_REQUIREMENT: tuple[EvidenceRequirement, ...] = (
    EvidenceRequirement("current_period_value", "대상 기간의 실제 수치 근거"),
    EvidenceRequirement("comparison_period_value", "비교 기간(또는 비교 대상)의 실제 수치 근거"),
)
_CONTINUITY_REQUIREMENT: tuple[EvidenceRequirement, ...] = (
    EvidenceRequirement("period_sequence", "연속 구간 전체 기간의 실제 수치 근거"),
)


@dataclass(frozen=True)
class EvidencePlan:
    claim_id: str
    required_items: tuple[EvidenceRequirement, ...] = field(default_factory=tuple)
    coverage_formula: str = "N/A"
    planner_version: str = EVIDENCE_PLANNER_VERSION
    # True면 S16이 근거 충족률과 무관하게 곧장 UNVERIFIABLE로 판정한다
    # (의견·미래 예측은 사실 주장이 아니므로 검증 대상 자체가 아님).
    auto_unverifiable: bool = False


def plan(claim: StructuredClaim) -> EvidencePlan:
    if claim.claim_type in NO_EVIDENCE_REQUIRED_CLAIM_TYPES:
        return EvidencePlan(
            claim_id=claim.claim_id,
            required_items=(),
            coverage_formula="N/A — 사실 주장이 아니므로 근거를 요구하지 않음",
            auto_unverifiable=True,
        )
    if claim.claim_type == "CONDITIONAL":
        return EvidencePlan(
            claim_id=claim.claim_id,
            required_items=(
                EvidenceRequirement(
                    CONDITIONAL_UNSUPPORTED_KEY, "조건 충족 여부를 판정할 근거 — 현재 미지원"
                ),
            ),
            coverage_formula="충족 항목 수 / 필수 항목 수(1)",
        )

    op = claim.comparator.op
    if op in _SINGLE_VALUE_OPS:
        required = _SINGLE_VALUE_REQUIREMENT
    elif op in _TWO_PERIOD_OPS:
        required = _TWO_PERIOD_REQUIREMENT
    elif op in _CONTINUITY_OPS:
        required = _CONTINUITY_REQUIREMENT
    else:  # pragma: no cover — comparator.op is a Literal, unreachable via typed input
        raise ValueError(f"unknown comparator op: {op}")

    return EvidencePlan(
        claim_id=claim.claim_id,
        required_items=required,
        coverage_formula=f"충족 항목 수 / 필수 항목 수({len(required)})",
    )


@dataclass(frozen=True)
class CoverageResult:
    satisfied: tuple[str, ...] = field(default_factory=tuple)
    missing: tuple[str, ...] = field(default_factory=tuple)
    coverage_rate: float = 0.0


def coverage(evidence_plan: EvidencePlan, available_keys: set[str]) -> CoverageResult:
    """`available_keys`는 호출자가 실제로 확보한 근거 항목 key 집합이다(예:
    NumericEvidence를 만들 수 있었던 기간들). 확보된 필수 항목으로만 충족률을
    계산한다 — 항목이 아예 없으면(OPINION 등) 충족률은 0으로 취급한다(정의되지
    않음을 조용히 1.0으로 오인시키지 않는다)."""
    if not evidence_plan.required_items:
        return CoverageResult(satisfied=(), missing=(), coverage_rate=0.0)
    satisfied = tuple(r.key for r in evidence_plan.required_items if r.key in available_keys)
    missing = tuple(r.key for r in evidence_plan.required_items if r.key not in available_keys)
    rate = len(satisfied) / len(evidence_plan.required_items)
    return CoverageResult(satisfied=satisfied, missing=missing, coverage_rate=rate)
