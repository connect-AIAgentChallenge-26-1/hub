import uuid
from datetime import date

from pydantic import BaseModel


class CalculateFinancialFactsRequest(BaseModel):
    financial_fact_row_ids: list[uuid.UUID]
    corp_code: str
    stock_code: str
    as_of: date
    normalization_policy_ref: str
    # 가격·발행주식 수는 S13 NORMALIZE 결과에서 호출자가 가져와 넘긴다(S3는 KIS를
    # 직접 호출하지 않는다 — docs/skills.md S3 입력 계약). 각각의 기준일도 함께
    # 받아 S15 POST_DERIVED가 재무제표 기준일과의 정합성을 검증한다("시세·발행주식
    # 수·시가총액 기준일 일치", docs/checklist.md C4). 값은 있는데 기준일이 없으면
    # 그 값을 쓰지 않는다(검증 불가능한 값을 조용히 신뢰하지 않는다).
    price: str | None = None
    price_as_of: date | None = None
    shares_outstanding: str | None = None
    shares_outstanding_as_of: date | None = None


class FinancialFactPayload(BaseModel):
    corp_code: str
    stock_code: str
    account_id: str
    account_name: str
    account_detail: str | None
    metric_key: str | None
    raw_value: str
    raw_unit: str
    normalized_value: float
    normalized_unit: str
    fiscal_period: str
    reprt_code: str
    report_type: str
    sj_div: str
    fs_div: str
    is_cumulative: bool
    is_provisional: bool
    is_derived: bool
    derivation_note: str | None
    rcept_no: str
    filed_at: date
    source_url: str


class FormulaPayload(BaseModel):
    metric: str
    fiscal_period: str
    formula: str
    formula_version: str


class CalculateFinancialFactsPayload(BaseModel):
    facts: list[FinancialFactPayload]
    numeric_evidence: list[dict[str, object]]
    formulas: list[FormulaPayload]
    warnings: list[str]
    trace: list[str]
    post_derived_rejected: list[str]
