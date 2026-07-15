"""S20 인용 무결성 테스트 (docs/checklist.md C9): exact/fuzzy/offset 검사,
checksum 확인, 공식·허용 URL 검증, 인용 실패 시 확정 verdict 차단."""

from __future__ import annotations

from app.services.citation_integrity import (
    CitationInput,
    check_citation,
    check_citations,
    verdict_gate_ok,
    verify_source_url,
)

_SOURCE = "삼성전자 2025년 3분기 영업이익이 크게 증가하며 사상 최대를 기록했다."


def _item(quote: str, offset: int = 0, **kw: object) -> CitationInput:
    base: dict[str, object] = dict(
        evidence_id="e1",
        quote=quote,
        source_text=_SOURCE,
        chunk_offset=offset,
        source="disclosure",
        source_url="https://opendart.fss.or.kr/api/document.xml?rcept_no=rc1",
        rcept_no="rc1",
    )
    base.update(kw)
    return CitationInput(**base)  # type: ignore[arg-type]


def test_exact_match_verified() -> None:
    result = check_citation(_item("영업이익이 크게 증가", offset=999))
    assert result.method == "EXACT"
    assert result.verified is True


def test_offset_match_verified() -> None:
    quote = _SOURCE[0:10]
    result = check_citation(_item(quote, offset=0))
    assert result.method == "OFFSET"
    assert result.verified is True


def test_fuzzy_match_on_whitespace_variation() -> None:
    result = check_citation(_item("영업이익이   크게   증가"))
    assert result.method == "FUZZY"
    assert result.verified is True


def test_hallucinated_quote_is_rejected() -> None:
    result = check_citation(_item("영업이익이 반토막 났고 적자로 돌아섰다"))
    assert result.method == "NONE"
    assert result.verified is False
    assert "환각" in result.reason


def test_checksum_mismatch_rejected() -> None:
    result = check_citation(
        _item("영업이익이 크게 증가", stored_checksum="aaa", recomputed_checksum="bbb")
    )
    assert result.checksum_ok is False
    assert result.verified is False


def test_dart_url_must_match_canonical() -> None:
    ok, canonical = verify_source_url("disclosure", "https://evil.example/doc", "rc1")
    assert ok is False
    ok2, canonical2 = verify_source_url(
        "disclosure", "https://opendart.fss.or.kr/api/document.xml?rcept_no=rc1", "rc1"
    )
    assert ok2 is True
    assert canonical2 == canonical


def test_external_allowed_host_accepted_disallowed_rejected() -> None:
    ok, _ = verify_source_url("external_news", "https://n.news.naver.com/article/1", "")
    assert ok is True
    bad, _ = verify_source_url("external_news", "https://random-blog.example/post", "")
    assert bad is False


def test_wrong_url_blocks_verification_even_with_exact_quote() -> None:
    result = check_citation(_item("영업이익이 크게 증가", source_url="https://evil.example/x"))
    assert result.url_ok is False
    assert result.verified is False


def test_checks_both_a_side_presentation_and_c_side_claim_evidence() -> None:
    # S20은 기능 A용(S2 document_evidence, presentation_item_id)과 기능 C용
    # (S18/S19 검색 근거, claim_id) 인용을 동일한 게이트로 모두 검사한다
    # (docs/checklist.md C9). CitationInput은 owner에 무관하게 quote·checksum·
    # URL만 보므로 두 출처 모두 검증 대상이 된다.
    a_side = _item("영업이익이 크게 증가", evidence_id="A-presentation-1")
    c_side = _item("사상 최대를 기록", evidence_id="C-claim-1")
    report = check_citations([a_side, c_side])
    assert verdict_gate_ok(report, "A-presentation-1") is True
    assert verdict_gate_ok(report, "C-claim-1") is True


def test_verdict_gate_only_passes_verified_citations() -> None:
    report = check_citations(
        [
            _item("영업이익이 크게 증가"),  # verified
            _item("완전히 지어낸 인용문입니다", evidence_id="e2"),  # rejected
        ]
    )
    assert verdict_gate_ok(report, "e1") is True
    assert verdict_gate_ok(report, "e2") is False
    assert len(report.verified_citations) == 1
    assert len(report.rejected_citations) == 1
