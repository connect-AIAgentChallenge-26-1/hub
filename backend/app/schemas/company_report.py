"""기능 A 종목 공부 리포트 API 요청·응답 계약 (docs/skills.md S11,
docs/checklist.md C5)."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class CompanyReportRequest(BaseModel):
    corp_code: str
    stock_code: str
    as_of: date
    bgn_de: str  # YYYYMMDD — 공시 목록 조회 시작일
    end_de: str  # YYYYMMDD — 공시 목록 조회 종료일
    bsns_years: list[str] = []
    reprt_codes: list[str] = []
    fs_div: str = "CFS"


class CompanyOverviewPayload(BaseModel):
    corp_name: str
    corp_name_eng: str
    stock_code: str
    stock_name: str
    ceo_name: str
    corp_classification: str
    corp_classification_label: str
    business_registration_no: str
    corporate_registration_no: str
    address: str
    homepage_url: str
    ir_url: str
    phone: str
    fax: str
    industry_code: str
    established_date: str
    fiscal_year_end_month: str
    as_of: date
    source_url: str


class DisclosureItemPayload(BaseModel):
    rcept_no: str
    report_nm: str
    filed_at: date
    report_type: str
    is_correction: bool
    corrected_original_rcept_no: str | None
    corrected_by_rcept_no: str | None
    source_url: str


class MetricPointPayload(BaseModel):
    fiscal_period: str
    value: float
    unit: str
    account_id: str
    account_name: str
    formula: str | None
    formula_version: str | None
    filed_at: date
    as_of: date


class MetricTrendPayload(BaseModel):
    metric: str
    points: list[MetricPointPayload]
    change_reason_code: str | None
    change_pct: float | None


class TermDefinitionPayload(BaseModel):
    term: str
    definition: str
    source: str
    glossary_version: str


class GlossaryPayload(BaseModel):
    definitions: list[TermDefinitionPayload]
    unexplained_terms: list[str]


class CheckpointPayload(BaseModel):
    code: str
    message: str
    severity: str


class CitationPayload(BaseModel):
    evidence_id: str
    quote: str
    source_url: str
    filed_at: str
    target_period: str | None
    method: str
    verified: bool


class CompanyReportPayload(BaseModel):
    corp_code: str
    as_of: date
    overview: CompanyOverviewPayload | None
    disclosures: list[DisclosureItemPayload]
    metric_trends: list[MetricTrendPayload]
    glossary: GlossaryPayload
    checkpoints: list[CheckpointPayload]
    citations: list[CitationPayload]
    generator_version: str
