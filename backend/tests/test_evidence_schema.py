"""Evidence typed 계약 테스트 (docs/checklist.md C9): relation enum·rule
version, claim_id/presentation_item_id 배타(둘 다 또는 둘 다 없음 거부),
허용 필드 밖 출력 차단."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.evidence import Evidence


def _base(**kw: object) -> dict[str, object]:
    data: dict[str, object] = dict(
        evidence_id="e1",
        corp_code="00126380",
        evidence_type="DISCLOSURE_DOCUMENT_CHUNK",
        document_id="rc1",
        rcept_no="rc1",
        filed_at="2025-11-14",
        target_period="2025Q3",
        source_url="https://opendart.fss.or.kr/api/document.xml?rcept_no=rc1",
        quote="영업이익 증가",
        chunk_offset=0,
        retrieval_score=0.9,
        relation="SUPPORTS",
        relation_reason="같은 방향",
        relation_rule_version="s19-relation-rule-1.0.0",
        integrity_status="VERIFIED",
        as_of="2026-07-15",
    )
    data.update(kw)
    return data


def test_claim_id_only_is_valid() -> None:
    ev = Evidence.model_validate(_base(claim_id="c1"))
    assert ev.claim_id == "c1"
    assert ev.presentation_item_id is None


def test_presentation_item_id_only_is_valid() -> None:
    ev = Evidence.model_validate(_base(presentation_item_id="p1", relation="NEUTRAL"))
    assert ev.presentation_item_id == "p1"


def test_both_owners_rejected() -> None:
    with pytest.raises(ValidationError, match="exactly one"):
        Evidence.model_validate(_base(claim_id="c1", presentation_item_id="p1"))


def test_neither_owner_rejected() -> None:
    with pytest.raises(ValidationError, match="exactly one"):
        Evidence.model_validate(_base())


def test_relation_enum_enforced() -> None:
    with pytest.raises(ValidationError):
        Evidence.model_validate(_base(claim_id="c1", relation="MAYBE"))


def test_extra_field_forbidden() -> None:
    with pytest.raises(ValidationError):
        Evidence.model_validate(_base(claim_id="c1", injected_field="x"))


def test_as_of_must_be_date() -> None:
    with pytest.raises(ValidationError, match="YYYY-MM-DD"):
        Evidence.model_validate(_base(claim_id="c1", as_of="2026/07/15"))
