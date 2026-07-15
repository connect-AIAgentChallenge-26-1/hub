import inspect
from datetime import date

import pytest

from app.schemas.structured_claim import (
    Comparator,
    ComparatorOp,
    ComparisonOperator,
    StructuredClaim,
)
from app.services import deterministic_verifier
from app.services.deterministic_verifier import (
    AmbiguousEvidenceError,
    verify_atomic,
    verify_group,
)
from app.services.verdict_aggregator import Verdict


def _claim(
    op: ComparatorOp,
    comparison_operator: ComparisonOperator = "GTE",
    target_value: float = 2,
    **overrides: object,
) -> StructuredClaim:
    continuity_direction = overrides.pop("continuity_direction", None)
    defaults: dict[str, object] = dict(
        claim_id="claim-1",
        original_span="영업이익이 2배 이상 늘었다",
        corp_code="00126380",
        stock_code="005930",
        claim_type="COMPARISON",
        metric="operating_profit",
        evidence_domain="financial",
        comparator=Comparator(
            op=op,
            comparison_operator=comparison_operator,
            target_value=target_value,
            target_unit="multiple",
            continuity_direction=continuity_direction,  # type: ignore[arg-type]
        ),
        direction="increase",
        current_period="2025Q4",
        comparison_period="2024Q4",
        as_of=date(2026, 7, 12),
        verifiable=True,
        ambiguity_flags=[],
    )
    defaults.update(overrides)
    return StructuredClaim(**defaults)  # type: ignore[arg-type]


def _evidence(value: float, period: str, **overrides: object) -> dict[str, object]:
    base = dict(
        numeric_evidence_id=f"ne-{period}-{value}",
        evidence_domain="financial",
        corp_code="00126380",
        metric="operating_profit",
        value=value,
        unit="KRW",
        target_period=period,
        as_of="2026-07-12",
        source_ids=["fact-1"],
        provenance={},
        integrity_status="VERIFIED",
    )
    base.update(overrides)
    return base


# --------------------------------------------------------------- THRESHOLD/RATIO


def test_threshold_supported_when_value_meets_target() -> None:
    claim = _claim("THRESHOLD", comparison_operator="GTE", target_value=300)
    evidence = [_evidence(350, "2025Q4")]
    result = verify_atomic(claim, evidence)
    assert result.verdict is Verdict.SUPPORTED
    assert result.reason_code == "THRESHOLD_COMPARISON"
    assert result.calculation is not None
    assert result.calculation.inputs["current_period_value"] == 350


def test_threshold_refuted_when_value_misses_target() -> None:
    claim = _claim("THRESHOLD", comparison_operator="GTE", target_value=300)
    evidence = [_evidence(200, "2025Q4")]
    result = verify_atomic(claim, evidence)
    assert result.verdict is Verdict.REFUTED


def test_ratio_op_uses_ratio_comparison_reason_code() -> None:
    claim = _claim("RATIO", comparison_operator="GTE", target_value=15)
    evidence = [_evidence(20, "2025Q4")]
    result = verify_atomic(claim, evidence)
    assert result.verdict is Verdict.SUPPORTED
    assert result.reason_code == "RATIO_COMPARISON"


# --------------------------------------------------------------------- MULTIPLE


def test_multiple_2x_threshold_with_actual_1_38x_is_refuted() -> None:
    # docs/checklist.md C8: "배수 >= 2, 실제 1.38배 → REFUTED 테스트" — 그대로.
    claim = _claim("MULTIPLE", comparison_operator="GTE", target_value=2)
    evidence = [_evidence(138, "2025Q4"), _evidence(100, "2024Q4")]
    result = verify_atomic(claim, evidence)
    assert result.verdict is Verdict.REFUTED
    assert result.reason_code == "MULTIPLE_COMPARISON"
    assert result.calculation is not None
    assert result.calculation.computed_value == pytest.approx(1.38)


def test_multiple_2x_threshold_with_actual_2x_is_supported() -> None:
    claim = _claim("MULTIPLE", comparison_operator="GTE", target_value=2)
    evidence = [_evidence(200, "2025Q4"), _evidence(100, "2024Q4")]
    result = verify_atomic(claim, evidence)
    assert result.verdict is Verdict.SUPPORTED


def test_multiple_with_sign_change_is_ratio_undefined_sign_change() -> None:
    # 적자(-10) -> 흑자(5)는 "배수"가 일상적 의미를 갖지 않는다.
    claim = _claim("MULTIPLE", comparison_operator="GTE", target_value=2)
    evidence = [_evidence(5, "2025Q4"), _evidence(-10, "2024Q4")]
    result = verify_atomic(claim, evidence)
    assert result.verdict is Verdict.INSUFFICIENT_EVIDENCE
    assert result.reason_code == "RATIO_UNDEFINED_SIGN_CHANGE"


def test_multiple_with_zero_denominator_is_insufficient_not_a_crash() -> None:
    claim = _claim("MULTIPLE", comparison_operator="GTE", target_value=2)
    evidence = [_evidence(100, "2025Q4"), _evidence(0, "2024Q4")]
    result = verify_atomic(claim, evidence)
    assert result.verdict is Verdict.INSUFFICIENT_EVIDENCE
    assert result.reason_code == "ZERO_DENOMINATOR"


# ------------------------------------------------------------- INCREASE/DECREASE


def test_increase_supported_when_pct_change_meets_threshold() -> None:
    claim = _claim("INCREASE", comparison_operator="GTE", target_value=10)
    evidence = [_evidence(110, "2025Q4"), _evidence(100, "2024Q4")]
    result = verify_atomic(claim, evidence)
    assert result.verdict is Verdict.SUPPORTED
    assert result.calculation is not None
    assert result.calculation.computed_value == pytest.approx(10.0)


def test_decrease_supported_when_decline_meets_threshold() -> None:
    claim = _claim("DECREASE", comparison_operator="GTE", target_value=10)
    evidence = [_evidence(80, "2025Q4"), _evidence(100, "2024Q4")]
    result = verify_atomic(claim, evidence)
    assert result.verdict is Verdict.SUPPORTED  # 20% decline satisfies >= 10%


def test_increase_refuted_when_actual_change_is_a_decrease() -> None:
    claim = _claim("INCREASE", comparison_operator="GTE", target_value=10)
    evidence = [_evidence(90, "2025Q4"), _evidence(100, "2024Q4")]
    result = verify_atomic(claim, evidence)
    assert result.verdict is Verdict.REFUTED


# --------------------------------------------------------------- 근거 부족·모호


def test_missing_comparison_period_is_insufficient_evidence_with_missing_fields() -> None:
    claim = _claim("MULTIPLE")
    evidence = [_evidence(200, "2025Q4")]  # comparison_period 없음
    result = verify_atomic(claim, evidence)
    assert result.verdict is Verdict.INSUFFICIENT_EVIDENCE
    assert result.reason_code == "MISSING_REQUIRED_EVIDENCE"
    assert result.missing_fields == ("comparison_period_value",)


def test_unverified_evidence_is_treated_as_missing() -> None:
    claim = _claim("THRESHOLD", target_value=100)
    evidence = [_evidence(200, "2025Q4", integrity_status="REJECTED")]
    result = verify_atomic(claim, evidence)
    assert result.verdict is Verdict.INSUFFICIENT_EVIDENCE


def test_ambiguous_evidence_candidates_are_rejected_not_arbitrarily_chosen() -> None:
    claim = _claim("THRESHOLD", target_value=100)
    evidence = [_evidence(200, "2025Q4"), _evidence(250, "2025Q4")]
    with pytest.raises(AmbiguousEvidenceError):
        verify_atomic(claim, evidence)


# -------------------------------------------------------------- OPINION/CONDITIONAL


def test_opinion_claim_is_unverifiable_without_consulting_evidence() -> None:
    claim = _claim("THRESHOLD", target_value=100, claim_type="OPINION")
    result = verify_atomic(claim, [])
    assert result.verdict is Verdict.UNVERIFIABLE
    assert result.reason_code == "OPINION_OR_PREDICTION"


def test_future_prediction_claim_is_unverifiable() -> None:
    claim = _claim("THRESHOLD", target_value=100, claim_type="FUTURE_PREDICTION")
    result = verify_atomic(claim, [])
    assert result.verdict is Verdict.UNVERIFIABLE


def test_conditional_claim_is_insufficient_evidence_not_fabricated() -> None:
    claim = _claim("THRESHOLD", target_value=100, claim_type="CONDITIONAL")
    result = verify_atomic(claim, [])
    assert result.verdict is Verdict.INSUFFICIENT_EVIDENCE
    assert result.reason_code == "CONDITION_EVALUATION_UNSUPPORTED"


# ----------------------------------------------------------------------- CONTINUITY


def test_continuity_supported_for_strictly_increasing_sequence() -> None:
    claim = _claim(
        "CONTINUITY", comparison_operator="GTE", target_value=3, continuity_direction="INCREASE"
    )
    evidence = [_evidence(100, "2025Q2"), _evidence(110, "2025Q3"), _evidence(120, "2025Q4")]
    result = verify_atomic(claim, evidence, period_sequence=["2025Q2", "2025Q3", "2025Q4"])
    assert result.verdict is Verdict.SUPPORTED
    assert result.reason_code == "CONTINUITY_COMPARISON"


def test_continuity_refuted_when_sequence_is_not_monotonic() -> None:
    claim = _claim(
        "CONTINUITY", comparison_operator="GTE", target_value=3, continuity_direction="INCREASE"
    )
    evidence = [_evidence(100, "2025Q2"), _evidence(90, "2025Q3"), _evidence(120, "2025Q4")]
    result = verify_atomic(claim, evidence, period_sequence=["2025Q2", "2025Q3", "2025Q4"])
    assert result.verdict is Verdict.REFUTED


def test_continuity_without_period_sequence_is_insufficient_evidence() -> None:
    claim = _claim(
        "CONTINUITY", comparison_operator="GTE", target_value=3, continuity_direction="INCREASE"
    )
    result = verify_atomic(claim, [], period_sequence=None)
    assert result.verdict is Verdict.INSUFFICIENT_EVIDENCE
    assert result.missing_fields == ("period_sequence",)


# ------------------------------------------------------------ valuation/peer 도메인


def test_valuation_domain_claim_without_provider_is_insufficient_not_a_crash() -> None:
    # S5·S21 미구현(T09) — 항상 근거가 없어 INSUFFICIENT_EVIDENCE다.
    claim = _claim("THRESHOLD", target_value=10, evidence_domain="valuation")
    result = verify_atomic(claim, [])
    assert result.verdict is Verdict.INSUFFICIENT_EVIDENCE


def test_peer_domain_claim_without_provider_is_insufficient_not_a_crash() -> None:
    claim = _claim("THRESHOLD", target_value=10, evidence_domain="peer")
    result = verify_atomic(claim, [])
    assert result.verdict is Verdict.INSUFFICIENT_EVIDENCE


# --------------------------------------------------------------------- 결정론·그룹


def test_same_claim_and_facts_always_yield_the_same_verdict() -> None:
    claim = _claim("MULTIPLE", comparison_operator="GTE", target_value=2)
    evidence = [_evidence(138, "2025Q4"), _evidence(100, "2024Q4")]
    first = verify_atomic(claim, evidence)
    second = verify_atomic(claim, evidence)
    assert first == second


def test_verify_group_reuses_verdict_aggregator_group_verdict() -> None:
    supported = _claim("THRESHOLD", target_value=100)
    refuted = _claim("THRESHOLD", target_value=1000)
    ev = [_evidence(200, "2025Q4")]
    results = [verify_atomic(supported, ev), verify_atomic(refuted, ev)]
    assert verify_group(results) is Verdict.PARTIALLY_SUPPORTED


# ------------------------------------------------------- LLM이 verdict를 바꿀 수 없음


def test_module_has_no_llm_or_network_dependency() -> None:
    source = inspect.getsource(deterministic_verifier)
    for banned_token in ("solar", "Solar", "llm", "Llm", "openai", "httpx", "requests"):
        message = f"deterministic_verifier.py must not depend on {banned_token}"
        assert banned_token not in source, message


def test_verify_atomic_signature_has_no_llm_supplied_verdict_backdoor() -> None:
    with pytest.raises(TypeError):
        verify_atomic(  # type: ignore[call-arg]
            _claim("THRESHOLD", target_value=100),
            [_evidence(200, "2025Q4")],
            llm_suggested_verdict="SUPPORTED",
        )
