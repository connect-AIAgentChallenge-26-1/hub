"""S19 반증 근거 검색 테스트 (docs/checklist.md C9): 방향 반전 query, 결정론
relation 판정(SUPPORTS/REFUTES/NEUTRAL), 상충 감지, 노이즈 기록."""

from __future__ import annotations

from datetime import date

from app.schemas.structured_claim import Comparator, ComparatorOp, StructuredClaim
from app.services.counter_evidence_retriever import (
    RELATION_RULE_VERSION,
    CounterEvidenceRetriever,
    asserted_direction,
    build_counter_query,
    classify_relation,
)
from app.services.evidence_retriever import EvidenceRetriever, SourceDocument


def _claim(op: ComparatorOp = "MULTIPLE", direction: str = "증가") -> StructuredClaim:
    return StructuredClaim(
        claim_id="c1",
        original_span="삼성전자 영업이익이 증가했다",
        corp_code="00126380",
        stock_code="005930",
        claim_type="COMPARISON",
        metric="OPERATING_INCOME",
        evidence_domain="financial",
        comparator=Comparator(op=op, comparison_operator="GTE", target_value=2.0, target_unit="x"),
        direction=direction,
        current_period="2025Q3",
        comparison_period="2024Q3",
        as_of=date(2026, 7, 15),
        verifiable=True,
    )


def _doc(document_id: str, text: str) -> SourceDocument:
    return SourceDocument(
        document_id, 0, text, "00126380", "disclosure",
        f"https://opendart.fss.or.kr/api/document.xml?rcept_no={document_id}",
        "2025-11-14", "2025Q3", 0, "DISCLOSURE_DOCUMENT_CHUNK", document_id,
    )


def test_asserted_direction_from_op() -> None:
    # comparator.op이 방향을 확정하면 direction 문자열보다 우선한다.
    assert asserted_direction(_claim(op="INCREASE")) == "up"
    assert asserted_direction(_claim(op="MULTIPLE")) == "up"
    assert asserted_direction(_claim(op="DECREASE", direction="증가")) == "down"


def test_asserted_direction_from_text_when_op_undirected() -> None:
    # op이 방향을 정하지 못하면(RATIO) direction·span 키워드로 판정.
    down = _claim(op="RATIO", direction="감소").model_copy(
        update={"original_span": "삼성전자 영업이익이 감소했다"}
    )
    assert asserted_direction(down) == "down"
    # 방향 키워드가 상충하면(span=증가, direction=감소) 안전하게 미확정(None).
    conflicting = _claim(op="RATIO", direction="감소")
    assert asserted_direction(conflicting) is None


def test_counter_query_appends_opposite_keywords() -> None:
    q = build_counter_query(_claim(op="INCREASE"))
    # 증가 주장 → 반대 방향(감소/하락 등) 키워드가 붙는다.
    assert "감소" in q or "하락" in q


def test_relation_classification_is_deterministic() -> None:
    claim = _claim(op="INCREASE")
    rel_sup, _ = classify_relation(claim, "영업이익이 크게 증가했다.")
    rel_ref, _ = classify_relation(claim, "영업이익이 감소하며 부진했다.")
    rel_neu, _ = classify_relation(claim, "본사 주소가 변경되었습니다.")
    assert rel_sup == "SUPPORTS"
    assert rel_ref == "REFUTES"
    assert rel_neu == "NEUTRAL"


def test_conflict_detected_when_support_and_refute_coexist() -> None:
    retriever = EvidenceRetriever()
    retriever.index(
        [
            _doc("sup", "삼성전자 영업이익이 크게 증가했다."),
            _doc("ref", "삼성전자 영업이익이 감소하며 부진했다는 분석."),
        ]
    )
    claim = _claim(op="INCREASE")
    supporting = retriever.retrieve(claim, score_threshold=0.0).ranked_evidence
    counter = CounterEvidenceRetriever(retriever)
    result = counter.retrieve(claim, supporting, score_threshold=0.0)
    assert len(result.counter_evidence) >= 1
    assert len(result.conflicts) >= 1
    assert result.conflicts[0].claim_id == "c1"


def test_noise_is_recorded_not_hidden() -> None:
    retriever = EvidenceRetriever()
    retriever.index([_doc("neu", "삼성전자 신규 채용 공고 안내입니다.")])
    claim = _claim(op="INCREASE")
    supporting = retriever.retrieve(claim, score_threshold=0.0).ranked_evidence
    counter = CounterEvidenceRetriever(retriever)
    result = counter.retrieve(claim, supporting, score_threshold=0.0)
    # 반박이 아닌 결과는 노이즈로 남는다(숨기지 않음).
    assert (
        any("NEUTRAL" in n or "SUPPORTS" in n for n in result.noise)
        or result.counter_evidence == ()
    )


def test_relation_rule_version_is_stable() -> None:
    assert RELATION_RULE_VERSION == "s19-relation-rule-1.0.0"
