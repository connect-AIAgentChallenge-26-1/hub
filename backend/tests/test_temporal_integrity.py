from datetime import date

from app.services.temporal_integrity import (
    DerivedCheckInput,
    TemporalCandidate,
    pre_normalize,
    resolve_provisional_confirmed,
)
from app.services.temporal_integrity import post_derived as run_post_derived


def test_pre_normalize_blocks_future_effective_date():
    candidates = [
        TemporalCandidate("a", date(2026, 7, 1), "disclosure"),
        TemporalCandidate("b", date(2026, 7, 15), "disclosure"),
    ]
    result = pre_normalize(candidates, as_of=date(2026, 7, 13))
    assert [c.record_id for c in result.eligible] == ["a"]
    assert [c.record_id for c in result.rejected] == ["b"]
    assert any("excluded" in line for line in result.integrity_log)


def test_pre_normalize_allows_effective_date_equal_to_as_of():
    candidates = [TemporalCandidate("a", date(2026, 7, 13), "market")]
    result = pre_normalize(candidates, as_of=date(2026, 7, 13))
    assert [c.record_id for c in result.eligible] == ["a"]
    assert result.rejected == []


def test_pre_normalize_works_across_all_three_source_types():
    candidates = [
        TemporalCandidate("d", date(2026, 1, 1), "disclosure"),
        TemporalCandidate("m", date(2026, 1, 1), "market"),
        TemporalCandidate("e", date(2026, 1, 1), "external"),
    ]
    result = pre_normalize(candidates, as_of=date(2026, 7, 13))
    assert len(result.eligible) == 3


def test_resolve_provisional_confirmed_flags_conflict():
    by_period = {
        "2025-Q3": [
            TemporalCandidate("prov", date(2025, 11, 1), "disclosure", is_provisional=True),
            TemporalCandidate("conf", date(2025, 11, 15), "disclosure", is_provisional=False),
        ],
        "2025-Q4": [
            TemporalCandidate("only-prov", date(2026, 2, 1), "disclosure", is_provisional=True),
        ],
    }
    warnings = resolve_provisional_confirmed(by_period)
    assert len(warnings) == 1
    assert "2025-Q3" in warnings[0]
    assert "확정" in warnings[0]


def test_resolve_provisional_confirmed_no_warning_when_only_one_kind():
    by_period = {
        "2025-Q4": [
            TemporalCandidate("only-prov", date(2026, 2, 1), "disclosure", is_provisional=True),
        ],
    }
    assert resolve_provisional_confirmed(by_period) == []


def test_post_derived_accepts_consistent_input():
    checks = [
        DerivedCheckInput(
            record_id="ev-1",
            corp_code="00126380",
            source_ids=["fact-1", "fact-2"],
            source_corp_codes=["00126380", "00126380"],
            unit="RATIO",
            source_units=["KRW", "KRW"],
            as_of=date(2026, 7, 13),
            source_as_of=[date(2026, 7, 1), date(2026, 7, 1)],
            formula_version="s3-financial-calculator-1.0.0",
            target_period="2025-ANNUAL",
            source_periods=["2025-ANNUAL", "2025-ANNUAL"],
        )
    ]
    result = run_post_derived(checks, as_of=date(2026, 7, 13))
    assert result.verified == ["ev-1"]
    assert result.rejected == []


def test_post_derived_rejects_mixed_corp_code():
    checks = [
        DerivedCheckInput(
            record_id="ev-bad",
            corp_code="00126380",
            source_ids=["fact-1", "fact-2"],
            source_corp_codes=["00126380", "00164779"],  # a second, different company
            unit="RATIO",
            source_units=["KRW", "KRW"],
            as_of=date(2026, 7, 13),
            source_as_of=[date(2026, 7, 1), date(2026, 7, 1)],
            formula_version="s3-financial-calculator-1.0.0",
            target_period="2025-ANNUAL",
            source_periods=["2025-ANNUAL", "2025-ANNUAL"],
        )
    ]
    result = run_post_derived(checks, as_of=date(2026, 7, 13))
    assert result.rejected == ["ev-bad"]
    assert "corp_code" in result.integrity_log[0]


def test_post_derived_rejects_mixed_source_units():
    checks = [
        DerivedCheckInput(
            record_id="ev-bad-unit",
            corp_code="00126380",
            source_ids=["fact-1", "fact-2"],
            source_corp_codes=["00126380", "00126380"],
            unit="RATIO",
            source_units=["KRW", "천원"],  # inputs mixed scale, never normalized
            as_of=date(2026, 7, 13),
            source_as_of=[date(2026, 7, 1), date(2026, 7, 1)],
            formula_version="s3-financial-calculator-1.0.0",
            target_period="2025-ANNUAL",
            source_periods=["2025-ANNUAL", "2025-ANNUAL"],
        )
    ]
    result = run_post_derived(checks, as_of=date(2026, 7, 13))
    assert result.rejected == ["ev-bad-unit"]
    assert "unit" in result.integrity_log[0]


def test_post_derived_allows_output_unit_to_differ_from_input_units():
    # ROE = 순이익(KRW) / 자본총계(KRW) -> RATIO. 결과 unit이 입력 unit과 달라도
    # 정상이다 — 입력끼리만 일관되면 된다.
    checks = [
        DerivedCheckInput(
            record_id="roe",
            corp_code="00126380",
            source_ids=["net_income", "equity"],
            source_corp_codes=["00126380", "00126380"],
            unit="RATIO",
            source_units=["KRW", "KRW"],
            as_of=date(2026, 7, 13),
            source_as_of=[date(2026, 7, 1), date(2026, 7, 1)],
            formula_version="s3-financial-calculator-1.0.0",
            target_period="2025-ANNUAL",
            source_periods=["2025-ANNUAL", "2025-ANNUAL"],
        )
    ]
    result = run_post_derived(checks, as_of=date(2026, 7, 13))
    assert result.verified == ["roe"]


def test_post_derived_rejects_missing_provenance():
    checks = [
        DerivedCheckInput(
            record_id="ev-no-source",
            corp_code="00126380",
            source_ids=[],
            source_corp_codes=[],
            unit="RATIO",
            source_units=[],
            as_of=date(2026, 7, 13),
            source_as_of=[],
            formula_version="s3-financial-calculator-1.0.0",
            target_period="2025-ANNUAL",
            source_periods=[],
        )
    ]
    result = run_post_derived(checks, as_of=date(2026, 7, 13))
    assert result.rejected == ["ev-no-source"]
    assert "provenance" in result.integrity_log[0]


def test_post_derived_rejects_missing_formula_version():
    checks = [
        DerivedCheckInput(
            record_id="ev-no-formula",
            corp_code="00126380",
            source_ids=["fact-1"],
            source_corp_codes=["00126380"],
            unit="RATIO",
            source_units=["KRW"],
            as_of=date(2026, 7, 13),
            source_as_of=[date(2026, 7, 1)],
            formula_version="",
            target_period="2025-ANNUAL",
            source_periods=["2025-ANNUAL"],
        )
    ]
    result = run_post_derived(checks, as_of=date(2026, 7, 13))
    assert result.rejected == ["ev-no-formula"]


def test_post_derived_rejects_future_source_as_of():
    checks = [
        DerivedCheckInput(
            record_id="ev-future-source",
            corp_code="00126380",
            source_ids=["fact-1"],
            source_corp_codes=["00126380"],
            unit="RATIO",
            source_units=["KRW"],
            as_of=date(2026, 7, 13),
            source_as_of=[date(2026, 7, 20)],  # a source dated after the derived record
            formula_version="s3-financial-calculator-1.0.0",
            target_period="2025-ANNUAL",
            source_periods=["2025-ANNUAL"],
        )
    ]
    result = run_post_derived(checks, as_of=date(2026, 7, 13))
    assert result.rejected == ["ev-future-source"]


def test_post_derived_rejects_record_as_of_after_request_as_of():
    checks = [
        DerivedCheckInput(
            record_id="ev-future-record",
            corp_code="00126380",
            source_ids=["fact-1"],
            source_corp_codes=["00126380"],
            unit="RATIO",
            source_units=["KRW"],
            as_of=date(2026, 8, 1),  # record claims a later as_of than the request
            source_as_of=[date(2026, 7, 1)],
            formula_version="s3-financial-calculator-1.0.0",
            target_period="2025-ANNUAL",
            source_periods=["2025-ANNUAL"],
        )
    ]
    result = run_post_derived(checks, as_of=date(2026, 7, 13))
    assert result.rejected == ["ev-future-record"]


def test_post_derived_rejects_source_metadata_shorter_than_source_ids():
    # source_ids는 채워져 있지만 나머지 원천 메타데이터가 비어 있으면(개수가
    # 안 맞으면) 각 원소가 어느 source를 가리키는지 알 수 없다 — "provenance
    # 없음" 검사(source_ids 자체가 빈 경우)와는 다른 결함이라 별도로 검증한다
    # (GPT 리뷰 2026-07-14 15:56).
    checks = [
        DerivedCheckInput(
            record_id="ev-missing-source-metadata",
            corp_code="00126380",
            source_ids=["fact-1"],
            source_corp_codes=[],
            unit="RATIO",
            source_units=[],
            as_of=date(2026, 7, 13),
            source_as_of=[],
            formula_version="s3-financial-calculator-1.0.0",
            target_period="2025-ANNUAL",
            source_periods=[],
        )
    ]
    result = run_post_derived(checks, as_of=date(2026, 7, 13))
    assert result.rejected == ["ev-missing-source-metadata"]
    assert "맞지 않음" in result.integrity_log[0]


def test_post_derived_allows_source_as_of_longer_than_source_ids():
    # financial_facts.py는 PER/PBR/EPS/BPS의 source_as_of에 fact filed_at 외에
    # 자체 source_id가 없는 시세·발행주식 수 기준일도 더한다(shares_as_of/
    # price_as_of) — source_as_of가 source_ids보다 길다고 거부해서는 안 된다
    # (GPT 리뷰 2026-07-14 15:56 이후 재확인, 회귀 방지).
    checks = [
        DerivedCheckInput(
            record_id="ev-per",
            corp_code="00126380",
            source_ids=["fact-1"],
            source_corp_codes=["00126380"],
            unit="RATIO",
            source_units=["KRW"],
            as_of=date(2026, 7, 13),
            source_as_of=[date(2026, 7, 1), date(2026, 7, 13), date(2026, 7, 13)],
            formula_version="s3-financial-calculator-1.0.0",
            target_period="2025-ANNUAL",
            source_periods=["2025-ANNUAL"],
        )
    ]
    result = run_post_derived(checks, as_of=date(2026, 7, 13))
    assert result.verified == ["ev-per"]


def test_post_derived_rejects_mixed_fiscal_period():
    checks = [
        DerivedCheckInput(
            record_id="ev-mixed-period",
            corp_code="00126380",
            source_ids=["fact-1", "fact-2"],
            source_corp_codes=["00126380", "00126380"],
            unit="RATIO",
            source_units=["KRW", "KRW"],
            as_of=date(2026, 7, 13),
            source_as_of=[date(2026, 7, 1), date(2026, 7, 1)],
            formula_version="s3-financial-calculator-1.0.0",
            target_period="2025-ANNUAL",
            source_periods=["2025-ANNUAL", "2024-ANNUAL"],  # a fact from a different period
        )
    ]
    result = run_post_derived(checks, as_of=date(2026, 7, 13))
    assert result.rejected == ["ev-mixed-period"]
    assert "fiscal_period" in result.integrity_log[0]
