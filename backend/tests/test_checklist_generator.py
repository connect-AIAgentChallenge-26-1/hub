"""S9 확인 체크리스트 테스트 (docs/checklist.md C10): reason/missing/conflict를
확인 항목으로 변환, 충족 항목을 미충족으로 표시하지 않음, 주문·매수 유도 금지."""

from __future__ import annotations

from app.services.checklist_generator import generate_checklist
from app.services.evidence_orchestrator import ClaimResult

_ORDER_WORDS = ("매수", "매도", "관망", "분할매수", "보류", "주문")


def _result(claim_id: str, verdict: str, **kw: object) -> ClaimResult:
    base: dict[str, object] = dict(claim_id=claim_id, verdict=verdict, reason_code="")
    base.update(kw)
    return ClaimResult(**base)  # type: ignore[arg-type]


def test_supported_without_conflict_makes_no_item() -> None:
    items = generate_checklist([_result("c1", "SUPPORTED")])
    assert items == []


def test_insufficient_becomes_needs_more_evidence() -> None:
    items = generate_checklist(
        [_result("c1", "INSUFFICIENT_EVIDENCE", reason_code="MISSING_REQUIRED_EVIDENCE",
                 missing_fields=("comparison_period_value",))]
    )
    assert len(items) == 1
    assert items[0].status == "NEEDS_MORE_EVIDENCE"
    assert "comparison_period_value" in items[0].item
    assert items[0].related_claim_ids == ("c1",)


def test_refuted_and_unverifiable_and_partial_make_items() -> None:
    items = generate_checklist(
        [
            _result("c1", "REFUTED"),
            _result("c2", "UNVERIFIABLE"),
            _result("c3", "PARTIALLY_SUPPORTED"),
        ]
    )
    statuses = {i.status for i in items}
    assert statuses == {"REVIEW_REFUTED", "CANNOT_VERIFY", "REVIEW_PARTIAL"}


def test_conflict_always_makes_review_item_even_when_supported() -> None:
    items = generate_checklist(
        [_result("c1", "SUPPORTED", conflicts=({"supporting": "a", "refuting": "b",
                                                "reason": "공존"},))]
    )
    assert any(i.status == "REVIEW_CONFLICT" for i in items)


def test_source_links_attached_from_verified_citations() -> None:
    items = generate_checklist(
        [_result("c1", "REFUTED", verified_citation_ids=("e1",))],
        citation_urls={"e1": "https://opendart.fss.or.kr/api/document.xml?rcept_no=rc1"},
    )
    assert items[0].source_links == (
        "https://opendart.fss.or.kr/api/document.xml?rcept_no=rc1",
    )


def test_no_order_or_buy_phrases_in_any_item() -> None:
    items = generate_checklist(
        [
            _result("c1", "REFUTED", reason_code="MULTIPLE_COMPARISON"),
            _result("c2", "INSUFFICIENT_EVIDENCE", missing_fields=("current_period_value",)),
            _result("c3", "UNVERIFIABLE"),
        ]
    )
    for item in items:
        for word in _ORDER_WORDS:
            assert word not in item.item
