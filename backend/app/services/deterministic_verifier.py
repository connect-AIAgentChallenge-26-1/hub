"""S16 결정론 검산·판정 집계 (docs/skills.md S16, I2·I3).순수 Python 함수만
쓴다 — 이 모듈은 LLM·network provider를 import하지 않으며, 계산값이나 verdict를
바꿀 수 있는 어떤 LLM 입력도 받지 않는다(CLAUDE.md 절대 원칙 5, "LLM이 수치·
verdict를 변경할 수 없는 계약 테스트"는 backend/tests/test_deterministic_verifier.py
참고).

**S15 POST_DERIVED gate 경계**: `NumericEvidence`는 계산에 쓰인 원본 Fact의
corp_code·unit·period를 다시 담고 있지 않다(docs/skills.md NumericEvidence
필드 참고, `source_ids`는 opaque id일 뿐이다). 그래서 원천 재검증
(`app/services/temporal_integrity.py post_derived`)은 원본 Fact 객체가 아직
있는 생성 시점(S3/S13/S14 NORMALIZE + 그 라우터, 예: `financial_facts.py`가
이미 수행)에만 가능하고, 이 모듈이 사후에 재구성할 수 없다. 대신 이 모듈은
`integrity_status != "VERIFIED"`인 근거를 방어적으로 걸러내는 하위 gate를 두고,
그 경계를 넘는 재검증 책임은 각 도메인 어댑터(생성 시점)에 있다고 명시한다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from app.schemas.structured_claim import ComparisonOperator, StructuredClaim
from app.services.evidence_planner import coverage, plan
from app.services.verdict_aggregator import Verdict, group_verdict

DETERMINISTIC_VERIFIER_VERSION = "s16-deterministic-verifier-1.0.0"

_SINGLE_VALUE_OPS = frozenset({"THRESHOLD", "RATIO"})
_TWO_PERIOD_OPS = frozenset({"INCREASE", "DECREASE", "MULTIPLE"})


@dataclass(frozen=True)
class Calculation:
    formula: str
    inputs: dict[str, float]
    computed_value: float | None
    formula_version: str = DETERMINISTIC_VERIFIER_VERSION


@dataclass(frozen=True)
class AtomicVerdictResult:
    claim_id: str
    verdict: Verdict
    reason_code: str
    calculation: Calculation | None = None
    used_evidence_ids: tuple[str, ...] = field(default_factory=tuple)
    missing_fields: tuple[str, ...] = field(default_factory=tuple)


# --------------------------------------------------------------- 도메인 어댑터


def select_financial_evidence(numeric_evidence: list[dict[str, object]]) -> list[dict[str, object]]:
    return [e for e in numeric_evidence if e.get("evidence_domain") == "financial"]


def select_market_evidence(numeric_evidence: list[dict[str, object]]) -> list[dict[str, object]]:
    return [e for e in numeric_evidence if e.get("evidence_domain") == "market"]


def select_flow_evidence(numeric_evidence: list[dict[str, object]]) -> list[dict[str, object]]:
    return [e for e in numeric_evidence if e.get("evidence_domain") == "flow"]


def select_valuation_evidence(numeric_evidence: list[dict[str, object]]) -> list[dict[str, object]]:
    # S5(가치 시나리오)·S21(비교군)이 아직 미구현(T09)이라 valuation 도메인
    # NumericEvidence를 만드는 provider 자체가 없다 — 항상 빈 목록을 반환해
    # 호출자가 MISSING_REQUIRED_EVIDENCE로 정직하게 처리하게 한다(임의 대입
    # 금지, docs/checklist.md C4의 "S5·S21은 아직 미구현" 선례와 동일 판단).
    return [e for e in numeric_evidence if e.get("evidence_domain") == "valuation"]


def select_peer_evidence(numeric_evidence: list[dict[str, object]]) -> list[dict[str, object]]:
    # 위와 동일 — S21 미구현.
    return [e for e in numeric_evidence if e.get("evidence_domain") == "peer"]


_DOMAIN_ADAPTERS = {
    "financial": select_financial_evidence,
    "market": select_market_evidence,
    "flow": select_flow_evidence,
    "valuation": select_valuation_evidence,
    "peer": select_peer_evidence,
}


def _gate_verified(numeric_evidence: list[dict[str, object]]) -> list[dict[str, object]]:
    """S15 POST_DERIVED 경계 — `integrity_status`가 `VERIFIED`가 아닌 근거는
    쓰지 않는다. 원천 재검증 자체는 생성 시점(S3/S13/S14 라우터)의 책임이며,
    이 함수는 그 결과를 신뢰 경계에서 다시 한번 강제하는 방어 계층이다."""
    return [e for e in numeric_evidence if e.get("integrity_status") == "VERIFIED"]


class AmbiguousEvidenceError(ValueError):
    """같은 (corp_code, metric, evidence_domain, target_period)에 근거 후보가
    2개 이상이면 임의로 하나를 고르지 않는다(docs/skills.md S3 "매핑 후보가
    복수면 임의 선택하지 않고 부족 상태를 반환한다"와 동일 원칙)."""


def _select_one(
    evidence: list[dict[str, object]], claim: StructuredClaim, period: str
) -> dict[str, object] | None:
    matches = [
        e
        for e in evidence
        if e.get("corp_code") == claim.corp_code
        and e.get("metric") == claim.metric
        and e.get("evidence_domain") == claim.evidence_domain
        and e.get("target_period") == period
    ]
    if len(matches) > 1:
        raise AmbiguousEvidenceError(
            f"{len(matches)} candidates for corp_code={claim.corp_code} metric={claim.metric} "
            f"evidence_domain={claim.evidence_domain} target_period={period}"
        )
    return matches[0] if matches else None


def _to_decimal(value: object) -> Decimal:
    try:
        return Decimal(str(value))
    except InvalidOperation as exc:
        raise ValueError(f"NumericEvidence.value is not numeric: {value!r}") from exc


def _apply_comparison_operator(value: Decimal, target: Decimal, op: ComparisonOperator) -> bool:
    if op == "GTE":
        return value >= target
    if op == "LTE":
        return value <= target
    if op == "GT":
        return value > target
    if op == "LT":
        return value < target
    if op == "EQ":
        return value == target
    raise ValueError(f"unknown comparison_operator: {op}")  # pragma: no cover — Literal enforced


def _insufficient(
    claim: StructuredClaim, reason_code: str, missing_fields: tuple[str, ...] = ()
) -> AtomicVerdictResult:
    return AtomicVerdictResult(
        claim_id=claim.claim_id,
        verdict=Verdict.INSUFFICIENT_EVIDENCE,
        reason_code=reason_code,
        missing_fields=missing_fields,
    )


def verify_atomic(
    claim: StructuredClaim,
    numeric_evidence: list[dict[str, object]],
    period_sequence: list[str] | None = None,
) -> AtomicVerdictResult:
    """원자 Claim 하나를 검산한다. `numeric_evidence`는 S3/S13/S14 NORMALIZE가
    만들고 S15 POST_DERIVED를 통과한 도메인별 `NumericEvidence` dict 목록이다
    (모듈 docstring의 gate 경계 참고). `period_sequence`는 `op=CONTINUITY`일
    때만 쓰는, 검사할 연속 기간의 순서 있는 목록이다(기간 산술은 이 모듈
    책임이 아니다 — 호출자가 도메인 지식으로 채운다)."""
    evidence_plan = plan(claim)
    if evidence_plan.auto_unverifiable:
        return AtomicVerdictResult(
            claim_id=claim.claim_id,
            verdict=Verdict.UNVERIFIABLE,
            reason_code="OPINION_OR_PREDICTION",
        )
    if claim.claim_type == "CONDITIONAL":
        return _insufficient(claim, "CONDITION_EVALUATION_UNSUPPORTED", ("condition_evaluation",))

    domain_adapter = _DOMAIN_ADAPTERS.get(claim.evidence_domain)
    domain_evidence = _gate_verified(domain_adapter(numeric_evidence) if domain_adapter else [])

    op = claim.comparator.op

    if op in _SINGLE_VALUE_OPS:
        current = _select_one(domain_evidence, claim, claim.current_period)
        cov = coverage(evidence_plan, {"current_period_value"} if current else set())
        if cov.coverage_rate < 1.0:
            return _insufficient(claim, "MISSING_REQUIRED_EVIDENCE", cov.missing)
        assert current is not None
        value = _to_decimal(current["value"])
        target = _to_decimal(claim.comparator.target_value)
        passed = _apply_comparison_operator(value, target, claim.comparator.comparison_operator)
        reason = "THRESHOLD_COMPARISON" if op == "THRESHOLD" else "RATIO_COMPARISON"
        return AtomicVerdictResult(
            claim_id=claim.claim_id,
            verdict=Verdict.SUPPORTED if passed else Verdict.REFUTED,
            reason_code=reason,
            calculation=Calculation(
                formula=(
                    f"{claim.metric} {claim.comparator.comparison_operator} "
                    f"{claim.comparator.target_value}"
                ),
                inputs={"current_period_value": float(value)},
                computed_value=float(value),
            ),
            used_evidence_ids=(str(current["numeric_evidence_id"]),),
        )

    if op in _TWO_PERIOD_OPS:
        current = _select_one(domain_evidence, claim, claim.current_period)
        comparison = _select_one(domain_evidence, claim, claim.comparison_period)
        available: set[str] = set()
        if current is not None:
            available.add("current_period_value")
        if comparison is not None:
            available.add("comparison_period_value")
        cov = coverage(evidence_plan, available)
        if cov.coverage_rate < 1.0:
            return _insufficient(claim, "MISSING_REQUIRED_EVIDENCE", cov.missing)
        assert current is not None and comparison is not None

        cur_v = _to_decimal(current["value"])
        cmp_v = _to_decimal(comparison["value"])
        used_ids = (str(current["numeric_evidence_id"]), str(comparison["numeric_evidence_id"]))

        if cmp_v == 0:
            return _insufficient(claim, "ZERO_DENOMINATOR")

        if op == "MULTIPLE":
            # 부호가 바뀌는 두 기간(예: 적자 -> 흑자) 사이의 "배수"는 일상적
            # 의미가 없다 — REFUTED로 단정하지 않고 계산 불가로 처리한다
            # (docs/checklist.md C8 "부호 전환 배수 RATIO_UNDEFINED_SIGN_CHANGE").
            if (cmp_v < 0) != (cur_v < 0):
                return _insufficient(claim, "RATIO_UNDEFINED_SIGN_CHANGE")
            multiple = cur_v / cmp_v
            target = _to_decimal(claim.comparator.target_value)
            comparison_operator = claim.comparator.comparison_operator
            passed = _apply_comparison_operator(multiple, target, comparison_operator)
            return AtomicVerdictResult(
                claim_id=claim.claim_id,
                verdict=Verdict.SUPPORTED if passed else Verdict.REFUTED,
                reason_code="MULTIPLE_COMPARISON",
                calculation=Calculation(
                    formula=f"{claim.current_period}/{claim.comparison_period} multiple "
                    f"{claim.comparator.comparison_operator} {claim.comparator.target_value}",
                    inputs={
                        "current_period_value": float(cur_v),
                        "comparison_period_value": float(cmp_v),
                    },
                    computed_value=float(multiple),
                ),
                used_evidence_ids=used_ids,
            )

        # INCREASE/DECREASE — 부호 전환이면 통상적 증감률(%) 의미가 없으므로
        # MULTIPLE과 동일하게 계산 불가 처리한다.
        if (cmp_v < 0) != (cur_v < 0):
            return _insufficient(claim, "RATIO_UNDEFINED_SIGN_CHANGE")
        pct_change = (cur_v - cmp_v) / abs(cmp_v) * 100
        signed_change = pct_change if op == "INCREASE" else -pct_change
        target = _to_decimal(claim.comparator.target_value)
        comparison_operator = claim.comparator.comparison_operator
        passed = _apply_comparison_operator(signed_change, target, comparison_operator)
        return AtomicVerdictResult(
            claim_id=claim.claim_id,
            verdict=Verdict.SUPPORTED if passed else Verdict.REFUTED,
            reason_code=f"{op}_COMPARISON",
            calculation=Calculation(
                formula=f"({claim.current_period} - {claim.comparison_period}) / "
                f"|{claim.comparison_period}| * 100",
                inputs={
                    "current_period_value": float(cur_v),
                    "comparison_period_value": float(cmp_v),
                },
                computed_value=float(signed_change),
            ),
            used_evidence_ids=used_ids,
        )

    # op == "CONTINUITY"
    if not period_sequence:
        return _insufficient(claim, "MISSING_REQUIRED_EVIDENCE", ("period_sequence",))
    values: list[Decimal] = []
    sequence_evidence_ids: list[str] = []
    for period in period_sequence:
        found = _select_one(domain_evidence, claim, period)
        if found is None:
            return _insufficient(claim, "MISSING_REQUIRED_EVIDENCE", ("period_sequence",))
        values.append(_to_decimal(found["value"]))
        sequence_evidence_ids.append(str(found["numeric_evidence_id"]))

    direction = claim.comparator.continuity_direction
    if direction is None:
        raise ValueError("op=CONTINUITY requires comparator.continuity_direction")
    consecutive_ok = all(
        (values[i] > values[i - 1]) if direction == "INCREASE" else (values[i] < values[i - 1])
        for i in range(1, len(values))
    )
    return AtomicVerdictResult(
        claim_id=claim.claim_id,
        verdict=Verdict.SUPPORTED if consecutive_ok else Verdict.REFUTED,
        reason_code="CONTINUITY_COMPARISON",
        calculation=Calculation(
            formula=f"consecutive {direction.lower()} across {period_sequence}",
            inputs={f"period_{i}": float(v) for i, v in enumerate(values)},
            computed_value=None,
        ),
        used_evidence_ids=tuple(sequence_evidence_ids),
    )


def verify_group(atomic_results: list[AtomicVerdictResult]) -> Verdict:
    """그룹 집계는 verdict_aggregator.group_verdict를 그대로 재사용한다 —
    로직 중복 없음(계약 위치는 여기 하나)."""
    return group_verdict([r.verdict for r in atomic_results])
