from datetime import date

from sqlalchemy.orm import Session

from app.providers.opendart import RawFetch, checksum_of
from app.services.company_resolver import CompanyResolver
from tests.support.opendart_mock import load_bytes

AS_OF = date(2026, 7, 13)


def _ingest(db: Session) -> CompanyResolver:
    resolver = CompanyResolver(db)
    zip_bytes = load_bytes("corp_code_sample.zip")
    resolver.ingest_corp_master(RawFetch(raw_payload=zip_bytes, checksum=checksum_of(zip_bytes)))
    return resolver


def test_ingest_loads_all_sample_rows(db_session):
    resolver = _ingest(db_session)
    result = resolver.resolve("삼성전자", as_of=AS_OF)
    assert result.matched is True


def test_ingest_is_idempotent_on_repeat_calls(db_session):
    resolver = _ingest(db_session)
    zip_bytes = load_bytes("corp_code_sample.zip")
    count_again = resolver.ingest_corp_master(
        RawFetch(raw_payload=zip_bytes, checksum=checksum_of(zip_bytes))
    )
    # 같은 파일을 두 번 수집해도 Company row가 중복되지 않고 upsert된다.
    result = resolver.resolve("NAVER", as_of=AS_OF)
    assert result.matched is True
    assert count_again == 9  # fixture row count, unchanged on re-ingest


def test_resolve_by_exact_stock_code(db_session):
    resolver = _ingest(db_session)
    result = resolver.resolve("005930", as_of=AS_OF)
    assert result.matched is True
    assert result.corp_code == "00126380"
    assert result.matched_by == "STOCK_CODE_EXACT"


def test_resolve_unknown_stock_code_is_not_found(db_session):
    resolver = _ingest(db_session)
    result = resolver.resolve("999999", as_of=AS_OF)
    assert result.matched is False
    assert result.reason_code == "NOT_FOUND"


def test_resolve_unique_exact_name(db_session):
    resolver = _ingest(db_session)
    result = resolver.resolve("SK하이닉스", as_of=AS_OF)
    assert result.matched is True
    assert result.stock_code == "000660"
    assert result.matched_by == "NAME_EXACT"


def test_resolve_ambiguous_name_returns_all_candidates_without_auto_confirming(db_session):
    # 덕성: 실제 OpenDART 데이터에 동명 4개(상장 1 + 비상장 3)가 존재한다.
    # 상장사가 하나뿐이어도 자동으로 확정하지 않고 항상 후보를 반환해야 한다
    # (docs/checklist.md C1 "사용자 확정 없이 모호한 후보를 자동 확정하지 않는 테스트").
    resolver = _ingest(db_session)
    result = resolver.resolve("덕성", as_of=AS_OF)
    assert result.matched is False
    assert result.reason_code == "AMBIGUOUS"
    assert len(result.candidates) == 4
    listed = [c for c in result.candidates if c.listing_status == "LISTED"]
    assert len(listed) == 1
    assert listed[0].stock_code == "004830"


def test_resolve_unlisted_company_is_explicitly_not_matched(db_session):
    resolver = _ingest(db_session)
    result = resolver.resolve("다코", as_of=AS_OF)
    assert result.matched is False
    assert result.reason_code == "UNLISTED"
    assert result.corp_code == "00434003"


def test_resolve_fuzzy_substring_match(db_session):
    resolver = _ingest(db_session)
    result = resolver.resolve("삼성전", as_of=AS_OF)
    assert result.matched is True
    assert result.matched_by == "NAME_FUZZY"


def test_resolve_empty_query_is_safe(db_session):
    resolver = _ingest(db_session)
    result = resolver.resolve("   ", as_of=AS_OF)
    assert result.matched is False
    assert result.reason_code == "EMPTY_QUERY"


def test_resolve_rejects_unsupported_market_filter(db_session):
    # KRX 업종/시장 분류 provider가 아직 없다(T03 미결정) — 조용히 무시하는
    # 대신 명시적으로 안전 종료한다.
    resolver = _ingest(db_session)
    result = resolver.resolve("삼성전자", as_of=AS_OF, market="KOSPI")
    assert result.matched is False
    assert result.reason_code == "UNSUPPORTED_MARKET_FILTER"


def test_resolve_before_any_ingest_is_not_found(db_session):
    resolver = CompanyResolver(db_session)
    result = resolver.resolve("삼성전자", as_of=AS_OF)
    assert result.matched is False
    assert result.reason_code == "NOT_FOUND"


def test_resolve_does_not_leak_market_into_result_when_matched(db_session):
    # market 분류 provider가 없으므로 매치된 결과에도 market은 절대 값을
    # 채우지 않는다(환각 금지) — None이어야 한다.
    resolver = _ingest(db_session)
    result = resolver.resolve("NAVER", as_of=AS_OF)
    assert result.matched is True
    assert result.market is None
