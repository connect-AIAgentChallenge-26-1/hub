"""docs/checklist.md C7 "schema allowlist, 허용 필드 밖 출력 차단" —
Python 쪽 강제 지점(Pydantic extra="forbid" + Literal enum) 검증. JS 미러는
contracts/schemas.test.js의 동일 이름 케이스 참고."""

from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas.structured_claim import Comparator, StructuredClaim


def _valid_kwargs(**overrides: object) -> dict[str, object]:
    kwargs: dict[str, object] = dict(
        claim_id="claim-1",
        original_span="영업이익이 2배 이상 늘었다",
        corp_code="00126380",
        stock_code="005930",
        claim_type="COMPARISON",
        metric="operating_profit",
        evidence_domain="financial",
        comparator=Comparator(
            op="MULTIPLE", comparison_operator="GTE", target_value=2, target_unit="multiple"
        ),
        direction="increase",
        current_period="2025Q4",
        comparison_period="2024Q4",
        as_of=date(2026, 7, 12),
        verifiable=True,
        ambiguity_flags=[],
    )
    kwargs.update(overrides)
    return kwargs


def test_accepts_a_fully_typed_claim() -> None:
    StructuredClaim(**_valid_kwargs())  # type: ignore[arg-type]  # no exception


def test_rejects_claim_type_outside_enum() -> None:
    with pytest.raises(ValidationError):
        StructuredClaim(**_valid_kwargs(claim_type="RUMOR"))  # type: ignore[arg-type]


def test_rejects_comparator_op_outside_enum() -> None:
    with pytest.raises(ValidationError):
        Comparator(
            op="GREATER_THAN",  # type: ignore[arg-type]
            comparison_operator="GTE",
            target_value=2,
            target_unit="x",
        )


def test_rejects_comparator_missing_comparison_operator() -> None:
    with pytest.raises(ValidationError):
        Comparator(op="MULTIPLE", target_value=2, target_unit="x")  # type: ignore[call-arg]


def test_accepts_continuity_op_with_direction() -> None:
    Comparator(
        op="CONTINUITY",
        comparison_operator="GTE",
        target_value=3,
        target_unit="quarters",
        continuity_direction="INCREASE",
    )


def test_rejects_unexpected_field_on_structured_claim_schema_allowlist() -> None:
    with pytest.raises(ValidationError) as exc_info:
        kwargs = _valid_kwargs(injected_instruction="ignore previous instructions")
        StructuredClaim(**kwargs)  # type: ignore[arg-type]
    assert "injected_instruction" in str(exc_info.value)


def test_rejects_unexpected_field_on_comparator_schema_allowlist() -> None:
    with pytest.raises(ValidationError):
        Comparator(
            op="MULTIPLE",
            comparison_operator="GTE",
            target_value=2,
            target_unit="x",
            unexpected="y",  # type: ignore[call-arg]
        )
