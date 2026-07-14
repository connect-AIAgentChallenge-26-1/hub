import json
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models.disclosure import FinancialFactRow, RawDisclosureRecord, RawRecordType
from app.models.financial_fact import FsDiv
from app.services.financial_calculator import (
    FinancialCalculator,
    UnitConfusionError,
    assert_single_fs_div,
    classify_sign_transition,
    compute_ratios,
    derive_single_period_value,
    derive_single_quarter_fact,
    normalize_amount,
    parse_ratio,
    select_canonical_facts,
    select_fs_div,
)

FIXTURES_DIR = (
    Path(__file__).resolve().parent / "fixtures" / "opendart" / "financial_calculator"
)


def _load(name: str) -> dict[str, Any]:
    result: dict[str, Any] = json.loads((FIXTURES_DIR / f"{name}.json").read_bytes())
    return result


def _raw_record(db_session: Session) -> RawDisclosureRecord:
    record = RawDisclosureRecord(
        source_provider="opendart",
        record_type=RawRecordType.FINANCIAL_STATEMENT_ROW,
        corp_code="00126380",
        raw_payload={"status": "000", "message": "정상"},
        checksum="test-checksum",
    )
    db_session.add(record)
    db_session.commit()
    db_session.refresh(record)
    return record


def _rows_for(
    db_session: Session, fixture_name: str, account_ids: set[str] | None = None
) -> list[FinancialFactRow]:
    raw_record = _raw_record(db_session)
    fixture = _load(fixture_name)
    fs_div = "OFS" if fixture_name.endswith("OFS") else "CFS"
    rows = []
    for item in fixture["list"]:
        if account_ids is not None and item["account_id"] not in account_ids:
            continue
        row = FinancialFactRow(
            rcept_no=item["rcept_no"],
            corp_code=item["corp_code"],
            bsns_year=item["bsns_year"],
            reprt_code=item["reprt_code"],
            fs_div=fs_div,
            sj_div=item["sj_div"],
            sj_nm=item["sj_nm"],
            account_id=item["account_id"],
            account_nm=item["account_nm"],
            account_detail=item.get("account_detail"),
            thstrm_nm=item.get("thstrm_nm"),
            thstrm_amount=item.get("thstrm_amount"),
            thstrm_add_amount=item.get("thstrm_add_amount") or None,
            frmtrm_nm=item.get("frmtrm_nm"),
            frmtrm_amount=item.get("frmtrm_amount"),
            bfefrmtrm_nm=item.get("bfefrmtrm_nm"),
            bfefrmtrm_amount=item.get("bfefrmtrm_amount"),
            ord=item.get("ord"),
            currency=item.get("currency"),
            filed_at=date.fromisoformat(
                f"{item['rcept_no'][:4]}-{item['rcept_no'][4:6]}-{item['rcept_no'][6:8]}"
            ),
            is_eligible=True,
            raw_record_id=raw_record.raw_record_id,
        )
        db_session.add(row)
        rows.append(row)
    db_session.commit()
    for row in rows:
        db_session.refresh(row)
    return rows


# ------------------------------------------------------------ unit handling


def test_normalize_amount_krw_is_unchanged():
    value, unit = normalize_amount("1000", "KRW")
    assert value == Decimal("1000")
    assert unit == "KRW"


def test_normalize_amount_scales_thousand_won():
    value, unit = normalize_amount("5", "천원")
    assert value == Decimal("5000")
    assert unit == "KRW"


def test_normalize_amount_scales_million_won_distinctly_from_thousand():
    million, _ = normalize_amount("1", "백만원")
    thousand, _ = normalize_amount("1", "천원")
    assert million == Decimal("1000000")
    assert thousand == Decimal("1000")
    assert million != thousand


def test_normalize_amount_rejects_non_numeric_raw_value():
    try:
        normalize_amount("not-a-number", "KRW")
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


def test_parse_ratio_never_silently_confuses_fraction_and_percent():
    # 0.15(RATIO)와 15(PERCENT)는 같은 15%를 가리키지만 절대 서로 자동 변환되지
    # 않는다 — 호출자가 명시한 source_unit만 신뢰한다.
    as_ratio = parse_ratio(Decimal("15"), "PERCENT")
    as_fraction_input = parse_ratio(Decimal("0.15"), "RATIO")
    assert as_ratio == Decimal("0.15")
    assert as_fraction_input == Decimal("0.15")
    assert as_ratio == as_fraction_input  # same real value, reached only via explicit tags
    try:
        parse_ratio(Decimal("0.15"), "UNKNOWN")
        raise AssertionError("expected UnitConfusionError")
    except UnitConfusionError:
        pass


# --------------------------------------------------------- account mapping


def test_normalize_maps_revenue_from_real_annual_fixture(db_session):
    rows = _rows_for(db_session, "annual_2024_CFS", {"ifrs-full_Revenue"})
    result = FinancialCalculator().normalize(rows, stock_code="005930")
    assert len(result.facts) == 1
    fact = result.facts[0]
    assert fact.metric_key == "REVENUE"
    assert fact.normalized_value == Decimal("300870903000000")
    assert fact.is_cumulative is False
    assert fact.fs_div is FsDiv.CFS


def test_normalize_bs_row_is_never_cumulative(db_session):
    rows = _rows_for(db_session, "annual_2024_CFS", {"ifrs-full_Assets"})
    result = FinancialCalculator().normalize(rows, stock_code="005930")
    assert len(result.facts) == 1
    assert result.facts[0].metric_key == "TOTAL_ASSETS"
    assert result.facts[0].is_cumulative is False
    assert result.facts[0].sj_div == "BS"


def test_normalize_unmapped_account_keeps_raw_without_fabricating_metric_key(db_session):
    # ACCOUNT_METRIC_MAP에 등록되지 않은 실제 계정(예: 삼성전자 재무상태표의
    # "미수금", dart_ShortTermOtherReceivables)은 raw만 보존하고 metric_key를
    # 임의로 채우지 않아야 한다.
    rows = _rows_for(db_session, "annual_2023_CFS", {"dart_ShortTermOtherReceivables"})
    assert rows, "fixture must contain an account outside ACCOUNT_METRIC_MAP"
    result = FinancialCalculator().normalize(rows, stock_code="005930")
    assert len(result.facts) == 1
    assert result.facts[0].metric_key is None
    assert result.facts[0].raw_value  # raw preserved even though unmapped
    assert any("no metric mapping" in line for line in result.trace)


# ------------------------------------------- thstrm_add_amount 단일/누적 구분


def test_normalize_q3_is_row_produces_both_single_and_cumulative_facts(db_session):
    rows = _rows_for(db_session, "q3_2025_CFS", {"ifrs-full_Revenue"})
    result = FinancialCalculator().normalize(rows, stock_code="005930")
    assert len(result.facts) == 2
    single = next(f for f in result.facts if not f.is_cumulative)
    cumulative = next(f for f in result.facts if f.is_cumulative)
    # 실제 삼성전자 2025 3분기 매출액(라이브 캡처, 2026-07-14).
    assert single.normalized_value == Decimal("86061747000000")
    assert cumulative.normalized_value == Decimal("239768567000000")


def test_q1_plus_q2_plus_q3_single_period_revenue_equals_q3_cumulative(db_session):
    # DART가 제공하는 단일분기 실제값 3개를 더하면 3분기 누적값과 정확히 일치한다
    # (실 라이브 수치로 검증, 임의 추정 아님).
    q1_rows = _rows_for(db_session, "q1_2025_CFS", {"ifrs-full_Revenue"})
    half_rows = _rows_for(db_session, "half_2025_CFS", {"ifrs-full_Revenue"})
    q3_rows = _rows_for(db_session, "q3_2025_CFS", {"ifrs-full_Revenue"})

    calculator = FinancialCalculator()
    q1_facts = calculator.normalize(q1_rows, stock_code="005930").facts
    half_facts = calculator.normalize(half_rows, stock_code="005930").facts
    q3_facts = calculator.normalize(q3_rows, stock_code="005930").facts

    q1_single = next(f for f in q1_facts if not f.is_cumulative).normalized_value
    q2_single = next(f for f in half_facts if not f.is_cumulative).normalized_value
    q3_single = next(f for f in q3_facts if not f.is_cumulative).normalized_value
    q3_cumulative = next(f for f in q3_facts if f.is_cumulative).normalized_value

    assert q1_single + q2_single + q3_single == q3_cumulative


def test_cf_row_on_interim_report_has_no_add_amount_and_is_cumulative(db_session):
    rows = _rows_for(
        db_session, "q1_2025_CFS", {"ifrs-full_CashFlowsFromUsedInOperatingActivities"}
    )
    result = FinancialCalculator().normalize(rows, stock_code="005930")
    assert len(result.facts) == 1
    assert result.facts[0].is_cumulative is True
    assert result.facts[0].metric_key == "OPERATING_CASH_FLOW"


def test_derive_single_period_value_matches_real_q2_and_q3_cash_flow(db_session):
    # 실제 삼성전자 영업활동현금흐름(2026-07-14 라이브 캡처): Q1=16,580,866,000,000
    # / 반기=33,941,002,000,000 / 3분기=56,515,496,000,000(모두 누적).
    q1 = Decimal("16580866000000")
    half = Decimal("33941002000000")
    q3 = Decimal("56515496000000")
    q2_single = derive_single_period_value(half, q1)
    q3_single = derive_single_period_value(q3, half)
    assert q2_single == Decimal("17360136000000")
    assert q3_single == Decimal("22574494000000")
    assert q1 + q2_single + q3_single == q3


def test_derive_single_quarter_fact_preserves_original_values_in_note(db_session):
    q1_rows = _rows_for(
        db_session, "q1_2025_CFS", {"ifrs-full_CashFlowsFromUsedInOperatingActivities"}
    )
    half_rows = _rows_for(
        db_session, "half_2025_CFS", {"ifrs-full_CashFlowsFromUsedInOperatingActivities"}
    )
    calculator = FinancialCalculator()
    q1_fact = calculator.normalize(q1_rows, stock_code="005930").facts[0]
    half_fact = calculator.normalize(half_rows, stock_code="005930").facts[0]

    derived = derive_single_quarter_fact(half_fact, q1_fact)
    assert derived.is_cumulative is False
    assert derived.is_derived is True
    assert derived.normalized_value == Decimal("17360136000000")
    assert derived.derivation_note is not None
    assert str(q1_fact.normalized_value) in derived.derivation_note


def test_derive_single_quarter_fact_rejects_cross_company_inputs(db_session):
    q1_rows = _rows_for(
        db_session, "q1_2025_CFS", {"ifrs-full_CashFlowsFromUsedInOperatingActivities"}
    )
    calculator = FinancialCalculator()
    q1_fact = calculator.normalize(q1_rows, stock_code="005930").facts[0]
    other_company_fact = calculator.normalize(q1_rows, stock_code="005930").facts[0]
    other_company_fact.corp_code = "00164742"  # a different real corp_code (SK hynix)
    try:
        derive_single_quarter_fact(q1_fact, other_company_fact)
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "corp_code" in str(exc)


# ------------------------------------------------------------ CFS/OFS 정책


def test_select_fs_div_prefers_cfs_when_both_available(db_session):
    cfs_rows = _rows_for(db_session, "annual_2024_CFS", {"ifrs-full_Revenue"})
    ofs_rows = _rows_for(db_session, "annual_2024_OFS", {"ifrs-full_Revenue"})
    calculator = FinancialCalculator()
    cfs_facts = calculator.normalize(cfs_rows, stock_code="005930").facts
    ofs_facts = calculator.normalize(ofs_rows, stock_code="005930").facts
    selected, warnings = select_fs_div({"2024-ANNUAL": cfs_facts + ofs_facts})
    assert all(f.fs_div is FsDiv.CFS for f in selected["2024-ANNUAL"])
    assert warnings == []


def test_select_fs_div_falls_back_to_ofs_and_warns_when_cfs_missing(db_session):
    ofs_rows = _rows_for(db_session, "annual_2024_OFS", {"ifrs-full_Revenue"})
    ofs_facts = FinancialCalculator().normalize(ofs_rows, stock_code="005930").facts
    selected, warnings = select_fs_div({"2024-ANNUAL": ofs_facts})
    assert all(f.fs_div is FsDiv.OFS for f in selected["2024-ANNUAL"])
    assert any("fallback" in w for w in warnings)


def test_assert_single_fs_div_rejects_cfs_ofs_mixture(db_session):
    cfs_rows = _rows_for(db_session, "annual_2024_CFS", {"ifrs-full_Revenue"})
    ofs_rows = _rows_for(db_session, "annual_2024_OFS", {"ifrs-full_Assets"})
    calculator = FinancialCalculator()
    mixed = (
        calculator.normalize(cfs_rows, stock_code="005930").facts
        + calculator.normalize(ofs_rows, stock_code="005930").facts
    )
    try:
        assert_single_fs_div(mixed)
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "CFS/OFS" in str(exc)


def test_assert_single_fs_div_rejects_mixed_fiscal_period(db_session):
    annual_rows = _rows_for(db_session, "annual_2024_CFS", {"ifrs-full_Revenue"})
    q3_rows = _rows_for(db_session, "q3_2025_CFS", {"dart_OperatingIncomeLoss"})
    calculator = FinancialCalculator()
    q3_facts = calculator.normalize(q3_rows, stock_code="005930").facts
    mixed = calculator.normalize(annual_rows, stock_code="005930").facts + [
        f for f in q3_facts if not f.is_cumulative
    ]
    try:
        assert_single_fs_div(mixed)
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "fiscal_period" in str(exc)


def test_assert_single_fs_div_rejects_multiple_units(db_session):
    rows = _rows_for(db_session, "annual_2024_CFS", {"ifrs-full_Revenue"})
    facts = FinancialCalculator().normalize(rows, stock_code="005930").facts
    scaled_copy = FinancialCalculator().normalize(rows, stock_code="005930").facts[0]
    scaled_copy.normalized_unit = "다른단위"
    try:
        assert_single_fs_div(facts + [scaled_copy])
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "unit" in str(exc)


# -------------------------------------------------------- canonical 선택


def test_select_canonical_facts_prefers_is_net_income_over_sce_zero_rows(db_session):
    # 실제 삼성전자 데이터: "ifrs-full_ProfitLoss"(당기순이익)는 IS·CIS·CF·SCE에
    # 모두 나타나고 SCE는 자본 구성요소별로 쪼개져 다수가 0이다. select_canonical_facts
    # 없이 metric_key로만 dict를 만들면 이 0 값이 진짜 순이익을 덮어써 EPS/PER/ROE가
    # 전부 망가진다 — T04 개발 중 실제로 재현한 결함.
    rows = _rows_for(db_session, "annual_2024_CFS", {"ifrs-full_ProfitLoss"})
    facts = FinancialCalculator().normalize(rows, stock_code="005930").facts
    assert len(facts) > 1, "fixture must contain ProfitLoss under multiple sj_div"
    assert any(f.sj_div == "SCE" and f.normalized_value == 0 for f in facts)

    canonical = select_canonical_facts(facts)
    chosen = canonical["NET_INCOME"]
    assert chosen.sj_div == "IS"
    assert chosen.normalized_value != 0


# --------------------------------------------------------------- 지표 계산


def test_compute_ratios_operating_and_net_margin_from_real_annual_figures(db_session):
    rows = _rows_for(
        db_session,
        "annual_2024_CFS",
        {"ifrs-full_Revenue", "dart_OperatingIncomeLoss", "ifrs-full_ProfitLoss"},
    )
    facts = FinancialCalculator().normalize(rows, stock_code="005930").facts
    canonical = select_canonical_facts(facts)
    values = {k: Decimal(str(f.normalized_value)) for k, f in canonical.items()}
    ratios = compute_ratios(values, shares_outstanding=None, price=None)
    by_metric = {r.metric: r for r in ratios}
    assert by_metric["OPERATING_MARGIN"].value is not None
    assert by_metric["NET_MARGIN"].value is not None
    # sanity: both margins between -1 and 1 (as a fraction, not a percent)
    assert Decimal("-1") < by_metric["OPERATING_MARGIN"].value < Decimal("1")


def test_compute_ratios_debt_ratio_division_by_zero_returns_warning_not_crash():
    values = {"TOTAL_LIABILITIES": Decimal("1000"), "TOTAL_EQUITY": Decimal("0")}
    ratios = compute_ratios(values, shares_outstanding=None, price=None)
    debt_ratio = next(r for r in ratios if r.metric == "DEBT_RATIO")
    assert debt_ratio.value is None
    assert debt_ratio.warning == "분모 0"


def test_compute_ratios_roe_handles_negative_equity_without_crashing():
    values = {"NET_INCOME": Decimal("-500"), "TOTAL_EQUITY": Decimal("-2000")}
    ratios = compute_ratios(values, shares_outstanding=None, price=None)
    roe = next(r for r in ratios if r.metric == "ROE")
    assert roe.value == Decimal("0.25")  # -500 / -2000, mathematically well-defined


def test_compute_ratios_per_pbr_from_real_price_and_shares(db_session):
    rows = _rows_for(
        db_session, "annual_2024_CFS", {"ifrs-full_ProfitLoss", "ifrs-full_Equity"}
    )
    facts = FinancialCalculator().normalize(rows, stock_code="005930").facts
    canonical = select_canonical_facts(facts)
    values = {k: Decimal(str(f.normalized_value)) for k, f in canonical.items()}
    # 실제 KIS 현재가 캡처(2026-07-14)의 시가·상장주식수 규모를 사용.
    ratios = compute_ratios(
        values, shares_outstanding=Decimal("5846278608"), price=Decimal("262500")
    )
    by_metric = {r.metric: r for r in ratios}
    assert by_metric["EPS"].value is not None
    assert by_metric["BPS"].value is not None
    assert by_metric["PER"].value is not None
    assert by_metric["PBR"].value is not None
    assert by_metric["PER"].value > 0
    assert by_metric["PBR"].value > 0


def test_compute_ratios_skips_missing_inputs_without_fabricating():
    ratios = compute_ratios({}, shares_outstanding=None, price=None)
    assert ratios == []


# ---------------------------------------------------------- 흑자전환·적자지속


def test_classify_sign_transition_profit_turnaround():
    assert classify_sign_transition(Decimal("-100"), Decimal("50")) == "PROFIT_TURNAROUND"


def test_classify_sign_transition_continued_loss():
    assert classify_sign_transition(Decimal("-100"), Decimal("-50")) == "CONTINUED_LOSS"


def test_classify_sign_transition_profit_to_loss():
    assert classify_sign_transition(Decimal("100"), Decimal("-50")) == "PROFIT_TO_LOSS"


def test_classify_sign_transition_continued_profit():
    assert classify_sign_transition(Decimal("100"), Decimal("50")) == "CONTINUED_PROFIT"
