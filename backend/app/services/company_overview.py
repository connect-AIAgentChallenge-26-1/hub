"""S1 확장 — 기업개황 수집 (docs/skills.md S1 migration 기록, T08).종목
해석(`company_resolver.py`)이 corp_code를 확정한 뒤, 리포트가 보여줄 회사
개요(대표자·설립일·주소·업종코드·상장 구분)를 OpenDART `company.json`에서
조회한다. `Company` 현재 projection과 달리 upsert하지 않고 매 조회를
immutable raw snapshot으로만 남긴다(company.py 모델 docstring 참고)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.models.company import RawCompanyOverviewRecord
from app.providers.opendart import OpenDartProvider

COMPANY_OVERVIEW_VERSION = "s1-company-overview-1.0.0"

# OpenDART corp_cls: 법인구분(Y=유가증권시장, K=코스닥, N=코넥스, E=기타).
# 임의 추정 아님 — 2026-07-15 실 API 응답으로 확인(삼성전자=Y, SK하이닉스=Y).
_CORP_CLS_LABEL = {
    "Y": "유가증권시장(코스피)",
    "K": "코스닥",
    "N": "코넥스",
    "E": "기타법인",
}


@dataclass(frozen=True)
class CompanyOverview:
    corp_code: str
    corp_name: str
    corp_name_eng: str
    stock_code: str
    stock_name: str
    ceo_name: str
    corp_classification: str  # raw Y/K/N/E
    corp_classification_label: str
    business_registration_no: str
    corporate_registration_no: str
    address: str
    homepage_url: str
    ir_url: str
    phone: str
    fax: str
    industry_code: str
    established_date: str  # YYYYMMDD (원본 보존, 임의로 date로 변환하지 않음)
    fiscal_year_end_month: str
    as_of: date
    source_url: str
    checksum: str


class CompanyOverviewCollector:
    def __init__(self, db: Session, provider: OpenDartProvider):
        self._db = db
        self._provider = provider

    def collect(self, corp_code: str) -> RawCompanyOverviewRecord:
        fetch = self._provider.fetch_company_overview(corp_code)
        record = RawCompanyOverviewRecord(
            source_provider="opendart",
            corp_code=corp_code,
            raw_payload=fetch.raw_payload,
            checksum=fetch.checksum,
        )
        self._db.add(record)
        self._db.commit()
        self._db.refresh(record)
        return record

    def normalize(self, record: RawCompanyOverviewRecord, as_of: date) -> CompanyOverview:
        payload = record.raw_payload
        cls = payload.get("corp_cls", "")
        return CompanyOverview(
            corp_code=payload["corp_code"],
            corp_name=payload["corp_name"],
            corp_name_eng=payload.get("corp_name_eng", ""),
            stock_code=payload.get("stock_code", ""),
            stock_name=payload.get("stock_name", ""),
            ceo_name=payload.get("ceo_nm", ""),
            corp_classification=cls,
            corp_classification_label=_CORP_CLS_LABEL.get(cls, "미분류"),
            business_registration_no=payload.get("bizr_no", ""),
            corporate_registration_no=payload.get("jurir_no", ""),
            address=payload.get("adres", ""),
            homepage_url=payload.get("hm_url", ""),
            ir_url=payload.get("ir_url", ""),
            phone=payload.get("phn_no", ""),
            fax=payload.get("fax_no", ""),
            industry_code=payload.get("induty_code", ""),
            established_date=payload.get("est_dt", ""),
            fiscal_year_end_month=payload.get("acc_mt", ""),
            as_of=as_of,
            source_url=f"https://opendart.fss.or.kr/api/company.json?corp_code={record.corp_code}",
            checksum=record.checksum,
        )
