from datetime import date

from app.schemas.structured_claim import Comparator, StructuredClaim
from app.services.evidence_planner import coverage, plan


def _claim(
    claim_type: str = "COMPARISON",
    comparator: Comparator | None = None,
    **overrides: object,
) -> StructuredClaim:
    defaults: dict[str, object] = dict(
        claim_id="claim-1",
        original_span="영업이익이 2배 이상 늘었다",
        corp_code="00126380",
        stock_code="005930",
        claim_type=claim_type,
        metric="operating_profit",
        evidence_domain="financial",
        comparator=comparator
        or Comparator(
            op="MULTIPLE", comparison_operator="GTE", target_value=2, target_unit="multiple"
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


def test_opinion_claim_requires_no_evidence_and_is_auto_unverifiable() -> None:
    result = plan(_claim(claim_type="OPINION"))
    assert result.required_items == ()
    assert result.auto_unverifiable is True


def test_future_prediction_claim_requires_no_evidence_and_is_auto_unverifiable() -> None:
    result = plan(_claim(claim_type="FUTURE_PREDICTION"))
    assert result.auto_unverifiable is True


def test_threshold_op_requires_only_current_period_value() -> None:
    comparator = Comparator(
        op="THRESHOLD", comparison_operator="GTE", target_value=300, target_unit="KRW"
    )
    result = plan(_claim(claim_type="NUMERIC", comparator=comparator))
    assert [r.key for r in result.required_items] == ["current_period_value"]
    assert result.auto_unverifiable is False


def test_ratio_op_requires_only_current_period_value() -> None:
    comparator = Comparator(
        op="RATIO", comparison_operator="GTE", target_value=15, target_unit="percent"
    )
    result = plan(_claim(claim_type="NUMERIC", comparator=comparator))
    assert [r.key for r in result.required_items] == ["current_period_value"]


def test_multiple_op_requires_both_periods() -> None:
    result = plan(_claim(claim_type="COMPARISON"))  # default comparator op=MULTIPLE
    assert [r.key for r in result.required_items] == [
        "current_period_value",
        "comparison_period_value",
    ]


def test_increase_op_requires_both_periods() -> None:
    comparator = Comparator(
        op="INCREASE", comparison_operator="GTE", target_value=10, target_unit="percent"
    )
    result = plan(_claim(claim_type="COMPARISON", comparator=comparator))
    assert [r.key for r in result.required_items] == [
        "current_period_value",
        "comparison_period_value",
    ]


def test_continuity_op_requires_period_sequence() -> None:
    comparator = Comparator(
        op="CONTINUITY",
        comparison_operator="GTE",
        target_value=3,
        target_unit="quarters",
        continuity_direction="INCREASE",
    )
    result = plan(_claim(claim_type="COMPARISON", comparator=comparator))
    assert [r.key for r in result.required_items] == ["period_sequence"]


def test_conditional_claim_requires_unsupported_condition_evaluation() -> None:
    result = plan(_claim(claim_type="CONDITIONAL"))
    assert [r.key for r in result.required_items] == ["condition_evaluation"]


def test_coverage_rate_reflects_only_available_keys() -> None:
    evidence_plan = plan(_claim(claim_type="COMPARISON"))
    result = coverage(evidence_plan, available_keys={"current_period_value"})
    assert result.satisfied == ("current_period_value",)
    assert result.missing == ("comparison_period_value",)
    assert result.coverage_rate == 0.5


def test_coverage_rate_is_full_when_all_required_keys_available() -> None:
    evidence_plan = plan(_claim(claim_type="COMPARISON"))
    result = coverage(
        evidence_plan, available_keys={"current_period_value", "comparison_period_value"}
    )
    assert result.coverage_rate == 1.0
    assert result.missing == ()


def test_coverage_for_a_claim_with_no_required_items_is_zero_not_undefined() -> None:
    evidence_plan = plan(_claim(claim_type="OPINION"))
    result = coverage(evidence_plan, available_keys=set())
    assert result.coverage_rate == 0.0
    assert result.satisfied == ()
    assert result.missing == ()
