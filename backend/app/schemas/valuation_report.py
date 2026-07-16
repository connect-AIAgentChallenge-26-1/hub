"""기능 B 가치 범위·가격 위치 API 요청·응답 계약 (docs/skills.md S5·S6·S21,
docs/checklist.md C6)."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class CompanySpecPayload(BaseModel):
    corp_code: str
    stock_code: str


class ValuationReportRequest(BaseModel):
    target: CompanySpecPayload
    candidates: list[CompanySpecPayload]
    as_of: date
    bsns_year: str
    reprt_code: str
    fs_div: str = "CFS"


class CompanyProfilePayload(BaseModel):
    corp_code: str
    corp_name: str
    stock_code: str
    industry_code: str
    eps: float | None
    bps: float | None
    per: float | None
    pbr: float | None
    roe: float | None
    price: float
    price_as_of: date
    financial_as_of: date


class ExclusionPayload(BaseModel):
    corp_code: str
    corp_name: str
    reason_code: str
    detail: str


class PeerStatisticsPayload(BaseModel):
    sample_size: int
    per_median: float | None
    per_p25: float | None
    per_p75: float | None
    pbr_median: float | None
    pbr_p25: float | None
    pbr_p75: float | None
    roe_median: float | None
    # metric별 유효 표본 수 — 이 수가 낮으면(특히 3 미만) 해당 metric의 valuation
    # range가 만들어지지 않는다(GPT 리뷰 2026-07-16 11:00 발견, S5 참고).
    per_sample_size: int
    pbr_sample_size: int
    roe_sample_size: int


class PeerUniversePayload(BaseModel):
    peer_universe: list[CompanyProfilePayload]
    exclusions: list[ExclusionPayload]
    statistics: PeerStatisticsPayload
    quality_score: float
    sufficient: bool
    rule_version: str
    # S15.POST_DERIVED를 통과한 것만 남는다(GPT 리뷰 2026-07-16 13:52 발견 —
    # 이전에는 S21 numeric_evidence가 S15 검증 없이 만들어지고 API에도 아예
    # 노출되지 않았다). `financial_facts.py`의 `CalculateFinancialFactsPayload`와
    # 동일하게 typed 모델 대신 dict를 그대로 노출한다(provenance shape이 도메인마다
    # 달라 필드를 강제하지 않는 기존 관례).
    numeric_evidence: list[dict[str, object]]


class ValueRangePayload(BaseModel):
    method: str
    formula: str
    formula_version: str
    low: float
    mid: float
    high: float
    assumptions: str
    sensitivity_note: str


class ValuationPayload(BaseModel):
    value_ranges: list[ValueRangePayload]
    data_quality: str
    rule_version: str
    numeric_evidence: list[dict[str, object]]


class MethodPositionPayload(BaseModel):
    method: str
    position: str
    distance_pct: float | None


class PricePositionPayload(BaseModel):
    price: float
    overall_position: str
    method_positions: list[MethodPositionPayload]
    sensitivity: str
    assumptions: str
    rule_version: str


class CheckpointPayload(BaseModel):
    code: str
    message: str
    severity: str


class ValuationReportPayload(BaseModel):
    target_corp_code: str
    as_of: date
    target_profile: CompanyProfilePayload | None
    peer: PeerUniversePayload | None
    valuation: ValuationPayload | None
    price_position: PricePositionPayload | None
    checkpoints: list[CheckpointPayload]
    generator_version: str
