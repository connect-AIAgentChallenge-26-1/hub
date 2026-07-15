from datetime import date

from app.schemas.structured_claim import Comparator, StructuredClaim
from app.services.claim_disclosure import DisclosureMode, classify_disclosure, resolved_claim_ids


def _claim(claim_id: str, ambiguity_flags: list[str]) -> StructuredClaim:
    return StructuredClaim(
        claim_id=claim_id,
        original_span="영업이익이 늘었다",
        corp_code="00126380",
        stock_code="005930",
        claim_type="COMPARISON",
        metric="operating_profit",
        evidence_domain="financial",
        comparator=Comparator(
            op="INCREASE", comparison_operator="GTE", target_value=0, target_unit="percent"
        ),
        direction="increase",
        current_period="2025Q4",
        comparison_period="2024Q4",
        as_of=date(2026, 7, 12),
        verifiable=True,
        ambiguity_flags=ambiguity_flags,
    )


def test_claim_without_ambiguity_flags_auto_proceeds_to_summary() -> None:
    items = classify_disclosure([_claim("c1", [])])
    assert items[0].mode is DisclosureMode.AUTO_SUMMARY


def test_claim_with_ambiguity_flags_requires_confirm_question() -> None:
    items = classify_disclosure([_claim("c1", ["comparison_period_unclear"])])
    assert items[0].mode is DisclosureMode.CONFIRM_QUESTION
    assert items[0].ambiguity_flags == ("comparison_period_unclear",)


def test_mixed_batch_classifies_each_claim_independently() -> None:
    claims = [_claim("c1", []), _claim("c2", ["metric_unclear"])]
    items = classify_disclosure(claims)
    modes = {item.claim_id: item.mode for item in items}
    assert modes["c1"] is DisclosureMode.AUTO_SUMMARY
    assert modes["c2"] is DisclosureMode.CONFIRM_QUESTION


def test_resolved_claim_ids_includes_auto_summary_claims_without_asking() -> None:
    claims = [_claim("c1", [])]
    resolved = resolved_claim_ids(claims, answers={})
    assert resolved == {"c1"}


def test_resolved_claim_ids_includes_ambiguous_claim_the_user_answered() -> None:
    claims = [_claim("c1", ["metric_unclear"])]
    resolved = resolved_claim_ids(claims, answers={"c1": True})
    assert resolved == {"c1"}


def test_resolved_claim_ids_excludes_ambiguous_claim_the_user_did_not_answer() -> None:
    # docs/skills.md S7: "사용자가 질문에 답하지 않으면 해당 Claim은
    # UNVERIFIABLE로 처리한다" — 이 함수는 그 대상을 resolved 집합 밖에 둔다.
    claims = [_claim("c1", ["metric_unclear"])]
    resolved = resolved_claim_ids(claims, answers={})
    assert resolved == set()


def test_resolved_claim_ids_excludes_claim_the_user_explicitly_declined() -> None:
    claims = [_claim("c1", ["metric_unclear"])]
    resolved = resolved_claim_ids(claims, answers={"c1": False})
    assert resolved == set()
