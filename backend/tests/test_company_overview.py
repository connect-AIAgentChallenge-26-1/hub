"""S1 확장 — 기업개황 수집·정규화 테스트 (docs/checklist.md C5)."""

from __future__ import annotations

from datetime import date

import pytest

from app.models.company import RawCompanyOverviewRecord
from app.providers.opendart import OpenDartProvider
from app.services.company_overview import CompanyOverviewCollector
from tests.support.opendart_mock import client_with_responses, json_response, load_json


@pytest.fixture
def provider_factory():
    created = []

    def make(responses):
        client, _transport = client_with_responses(responses)
        provider = OpenDartProvider(api_key="test-key", client=client)
        created.append(provider)
        return provider

    yield make
    for provider in created:
        provider.close()


def test_collect_stores_immutable_raw_record(db_session, provider_factory):
    fixture = load_json("company_overview_samsung.json")
    provider = provider_factory([json_response(fixture)])
    collector = CompanyOverviewCollector(db_session, provider)
    record = collector.collect("00126380")
    assert record.corp_code == "00126380"
    assert record.raw_payload["corp_name"] == "삼성전자(주)"
    assert record.checksum
    fetched = db_session.get(RawCompanyOverviewRecord, record.raw_record_id)
    assert fetched is not None


def test_normalize_maps_corp_cls_to_label(db_session, provider_factory):
    fixture = load_json("company_overview_samsung.json")
    provider = provider_factory([json_response(fixture)])
    collector = CompanyOverviewCollector(db_session, provider)
    record = collector.collect("00126380")
    overview = collector.normalize(record, as_of=date(2026, 7, 15))
    assert overview.corp_name == "삼성전자(주)"
    assert overview.stock_code == "005930"
    assert overview.corp_classification == "Y"
    assert overview.corp_classification_label == "유가증권시장(코스피)"
    assert overview.established_date == "19690113"
    assert overview.as_of == date(2026, 7, 15)
    assert overview.source_url.endswith("corp_code=00126380")


def test_normalize_unknown_corp_cls_is_labeled_uncategorized(db_session, provider_factory):
    fixture = dict(load_json("company_overview_samsung.json"))
    fixture["corp_cls"] = "Z"
    provider = provider_factory([json_response(fixture)])
    collector = CompanyOverviewCollector(db_session, provider)
    record = collector.collect("00126380")
    overview = collector.normalize(record, as_of=date(2026, 7, 15))
    # 알 수 없는 분류를 임의로 특정 시장으로 단정하지 않는다(환각 금지).
    assert overview.corp_classification_label == "미분류"


def test_normalize_missing_optional_field_defaults_to_empty_string(db_session, provider_factory):
    fixture = dict(load_json("company_overview_samsung.json"))
    del fixture["ir_url"]
    provider = provider_factory([json_response(fixture)])
    collector = CompanyOverviewCollector(db_session, provider)
    record = collector.collect("00126380")
    overview = collector.normalize(record, as_of=date(2026, 7, 15))
    assert overview.ir_url == ""
