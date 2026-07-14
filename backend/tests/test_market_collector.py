from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.models.market import (
    CorporateActionType,
    RawMarketRecord,
    RawMarketRecordType,
)
from app.providers.kis import KisProvider, TokenCache, checksum_of, stable_json_bytes
from app.services.market_collector import MANUAL_INPUT_PROVIDER, MarketCollector
from tests.support.kis_mock import load_json


def _raw_record(
    db_session: Session,
    record_type: RawMarketRecordType,
    stock_code: str,
    target_period: str | None,
    payload: dict[str, Any],
) -> RawMarketRecord:
    record = RawMarketRecord(
        source_provider="kis",
        record_type=record_type,
        stock_code=stock_code,
        target_period=target_period,
        raw_payload=payload,
        checksum=checksum_of(stable_json_bytes(payload)),
    )
    db_session.add(record)
    db_session.commit()
    db_session.refresh(record)
    return record


def _collector(db_session: Session) -> MarketCollector:
    provider = KisProvider(app_key="k", app_secret="s", env="vps", token_cache=TokenCache())
    return MarketCollector(db_session, provider)


def test_normalize_period_price_creates_quote_rows_with_price_basis(db_session):
    fixture = load_json("period_price_005930_unadjusted.json")
    record = _raw_record(
        db_session,
        RawMarketRecordType.PERIOD_PRICE,
        "005930",
        "20260601-20260713-unadjusted",
        fixture,
    )
    collector = _collector(db_session)
    result = collector.normalize([record], corp_code="00126380", as_of=date(2026, 7, 13))
    assert len(result.quotes) == len(fixture["output2"])
    assert all(q.price_basis.value == "UNADJUSTED" for q in result.quotes)
    assert all(q.corp_code == "00126380" for q in result.quotes)


def test_normalize_period_price_excludes_trade_dates_after_as_of(db_session):
    fixture = load_json("period_price_005930_unadjusted.json")
    record = _raw_record(
        db_session,
        RawMarketRecordType.PERIOD_PRICE,
        "005930",
        "20260601-20260713-unadjusted",
        fixture,
    )
    collector = _collector(db_session)
    # 가장 최근 거래일(20260713)보다 앞선 as_of를 주면 그 뒤 날짜는 전부 제외돼야 한다
    # (T04 이전 임시 PRE_NORMALIZE 규칙).
    result = collector.normalize([record], corp_code="00126380", as_of=date(2026, 7, 1))
    assert all(q.trade_date <= date(2026, 7, 1) for q in result.quotes)
    assert len(result.quotes) < len(fixture["output2"])
    assert any("excluded" in line for line in result.trace)


def test_normalize_current_price_creates_shares_outstanding(db_session):
    fixture = load_json("current_price_005930.json")
    record = _raw_record(db_session, RawMarketRecordType.CURRENT_PRICE, "005930", None, fixture)
    collector = _collector(db_session)
    result = collector.normalize([record], corp_code="00126380", as_of=date(2026, 7, 13))
    assert len(result.shares_outstanding) == 1
    assert result.shares_outstanding[0].shares_outstanding == fixture["output"]["lstn_stcn"]
    assert result.shares_outstanding[0].face_value == fixture["output"]["stck_fcam"]


def test_normalize_corporate_action_rev_split_preserves_face_amount_detail(db_session):
    fixture = load_json("corp_action_rev_split_005930_2018.json")
    record = _raw_record(
        db_session,
        RawMarketRecordType.CORPORATE_ACTION,
        "005930",
        f"{CorporateActionType.FACE_VALUE_CHANGE.value}-20180101-20181231",
        fixture,
    )
    collector = _collector(db_session)
    result = collector.normalize([record], corp_code="00126380", as_of=date(2026, 7, 13))
    assert len(result.corporate_actions) == 1
    action = result.corporate_actions[0]
    assert action.action_type is CorporateActionType.FACE_VALUE_CHANGE
    assert action.record_date == date(2018, 5, 2)
    # 삼성전자 2018-05-04 50:1 액면분할 실 데이터: 5000원 -> 100원.
    assert action.detail["inter_bf_face_amt"] == "000005000"
    assert action.detail["inter_af_face_amt"] == "000000100"


def test_normalize_corporate_action_excludes_records_after_as_of(db_session):
    fixture = load_json("corp_action_rev_split_005930_2018.json")
    record = _raw_record(
        db_session,
        RawMarketRecordType.CORPORATE_ACTION,
        "005930",
        f"{CorporateActionType.FACE_VALUE_CHANGE.value}-20180101-20181231",
        fixture,
    )
    collector = _collector(db_session)
    result = collector.normalize([record], corp_code="00126380", as_of=date(2018, 1, 1))
    assert result.corporate_actions == []
    assert any("excluded" in line for line in result.trace)


def test_normalize_corporate_action_bonus_issue_empty_produces_no_rows(db_session):
    fixture = load_json("corp_action_bonus_issue_005930.json")
    record = _raw_record(
        db_session,
        RawMarketRecordType.CORPORATE_ACTION,
        "005930",
        f"{CorporateActionType.BONUS_ISSUE.value}-20200101-20261231",
        fixture,
    )
    collector = _collector(db_session)
    result = collector.normalize([record], corp_code="00126380", as_of=date(2026, 7, 13))
    assert result.corporate_actions == []


def test_numeric_evidence_includes_close_price_and_shares_outstanding(db_session):
    price_fixture = load_json("period_price_005930_unadjusted.json")
    current_fixture = load_json("current_price_005930.json")
    quote_record = _raw_record(
        db_session,
        RawMarketRecordType.PERIOD_PRICE,
        "005930",
        "20260601-20260713-unadjusted",
        price_fixture,
    )
    current_record = _raw_record(
        db_session, RawMarketRecordType.CURRENT_PRICE, "005930", None, current_fixture
    )
    collector = _collector(db_session)
    result = collector.normalize(
        [quote_record, current_record], corp_code="00126380", as_of=date(2026, 7, 13)
    )
    metrics = {e["metric"] for e in result.numeric_evidence}
    assert "close_price" in metrics
    assert "shares_outstanding" in metrics
    close_price_evidence = next(e for e in result.numeric_evidence if e["metric"] == "close_price")
    assert close_price_evidence["evidence_domain"] == "market"
    assert close_price_evidence["unit"] == "KRW"
    assert isinstance(close_price_evidence["value"], float)


def test_numeric_evidence_includes_dividend_per_share(db_session):
    fixture = load_json("corp_action_dividend_005930.json")
    record = _raw_record(
        db_session,
        RawMarketRecordType.CORPORATE_ACTION,
        "005930",
        f"{CorporateActionType.DIVIDEND.value}-20250101-20261231",
        fixture,
    )
    collector = _collector(db_session)
    result = collector.normalize([record], corp_code="00126380", as_of=date(2026, 7, 13))
    dividend_evidence = [e for e in result.numeric_evidence if e["metric"] == "dividend_per_share"]
    assert len(dividend_evidence) >= 1
    assert dividend_evidence[0]["unit"] == "KRW"


def test_manual_input_records_quote_with_manual_provider_and_distinct_license(db_session):
    collector = _collector(db_session)
    quote = collector.record_manual_quote(
        stock_code="005930",
        corp_code="00126380",
        trade_date=date(2026, 7, 10),
        close_price="263000",
        source_note="증권사 HTS 화면 수기 입력 (KIS 장애 대응)",
    )
    assert quote.provider == MANUAL_INPUT_PROVIDER
    assert "수동 입력" in quote.license
    assert quote.close_price == "263000"
