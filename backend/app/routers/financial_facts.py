from decimal import Decimal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.disclosure import FinancialFactRow
from app.models.financial_fact import FinancialFact
from app.models.user import User
from app.schemas.envelope import Envelope, Status, now_utc
from app.schemas.financial_fact import (
    CalculateFinancialFactsPayload,
    CalculateFinancialFactsRequest,
    FinancialFactPayload,
    FormulaPayload,
)
from app.services.financial_calculator import (
    FinancialCalculator,
    assert_single_fs_div,
    compute_ratios,
    ratios_to_numeric_evidence,
    select_canonical_facts,
    select_fs_div,
)
from app.services.temporal_integrity import DerivedCheckInput, post_derived

# EPS/BPS는 발행주식 수만 쓰고 가격을 쓰지 않는다 — PER/PBR만 가격을 추가로 쓴다
# (docs/skills.md S3, compute_ratios의 FORMULA_REGISTRY 참고). source_as_of를
# 지표별로 나누지 않으면 price_as_of만 미래여도 EPS/BPS까지 함께 거부된다.
_SHARES_ONLY_METRICS = {"EPS", "BPS"}
_PRICE_AND_SHARES_METRICS = {"PER", "PBR"}

router = APIRouter(prefix="/api/v1/financial-facts", tags=["financial-facts"])


def _envelope[T](request: Request, data: T, warnings: list[str] | None = None) -> Envelope[T]:
    started_at = now_utc()
    return Envelope[T](
        request_id=request.state.request_id,
        trace_id=request.state.trace_id,
        as_of=started_at.date(),
        status=Status.SUCCESS,
        warnings=warnings or [],
        source_ids=[],
        model_or_rule_version="s3-financial-calculator-1.0.0",
        started_at=started_at,
        completed_at=now_utc(),
        data=data,
    )


def _formula_version_from(evidence: dict[str, object]) -> str:
    provenance = evidence["provenance"]
    assert isinstance(provenance, dict)
    return str(provenance["formula_version"])


def _fact_payload(fact: FinancialFact) -> FinancialFactPayload:
    return FinancialFactPayload(
        corp_code=fact.corp_code,
        stock_code=fact.stock_code,
        account_id=fact.account_id,
        account_name=fact.account_name,
        account_detail=fact.account_detail,
        metric_key=fact.metric_key,
        raw_value=fact.raw_value,
        raw_unit=fact.raw_unit,
        normalized_value=float(fact.normalized_value),
        normalized_unit=fact.normalized_unit,
        fiscal_period=fact.fiscal_period,
        reprt_code=fact.reprt_code,
        report_type=fact.report_type,
        sj_div=fact.sj_div,
        fs_div=fact.fs_div.value,
        is_cumulative=fact.is_cumulative,
        is_provisional=fact.is_provisional,
        is_derived=fact.is_derived,
        derivation_note=fact.derivation_note,
        rcept_no=fact.rcept_no,
        filed_at=fact.filed_at,
        source_url=fact.source_url,
    )


@router.post("/calculate", response_model=Envelope[CalculateFinancialFactsPayload])
def calculate(
    body: CalculateFinancialFactsRequest,
    request: Request,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> Envelope[CalculateFinancialFactsPayload]:
    rows: list[FinancialFactRow] = []
    missing_ids: list[str] = []
    for row_id in body.financial_fact_row_ids:
        row = db.get(FinancialFactRow, row_id)
        if row is None:
            missing_ids.append(str(row_id))
            continue
        rows.append(row)
    warnings = [f"financial_fact_row_id not found, skipped: {rid}" for rid in missing_ids]

    calculator = FinancialCalculator()
    normalize_result = calculator.normalize(rows, stock_code=body.stock_code)
    warnings.extend(normalize_result.warnings)

    for fact in normalize_result.facts:
        db.add(fact)
    db.commit()
    for fact in normalize_result.facts:
        db.refresh(fact)

    numeric_evidence: list[dict[str, object]] = []
    formulas: list[FormulaPayload] = []
    post_derived_rejected: list[str] = []

    # 값은 있는데 기준일이 없으면 정합성을 검증할 수 없으므로 그 값 자체를 쓰지
    # 않는다(docs/checklist.md C4 "시세·발행주식 수 기준일 일치"). price/shares는
    # 요청 전체에 하나씩만 오므로(period별이 아님) 기간 loop 밖에서 한 번만 계산한다.
    shares = (
        Decimal(body.shares_outstanding)
        if body.shares_outstanding and body.shares_outstanding_as_of
        else None
    )
    price = Decimal(body.price) if body.price and body.price_as_of else None
    if body.shares_outstanding and not body.shares_outstanding_as_of:
        warnings.append("shares_outstanding_as_of 없음 — shares_outstanding 미사용")
    if body.price and not body.price_as_of:
        warnings.append("price_as_of 없음 — price 미사용")

    mapped_facts = [f for f in normalize_result.facts if f.metric_key is not None]
    facts_by_period: dict[str, list[FinancialFact]] = {}
    for fact in mapped_facts:
        facts_by_period.setdefault(fact.fiscal_period, []).append(fact)

    # 기간별로 CFS 우선·OFS fallback을 적용한다(docs/checklist.md C4) — 이전에는
    # filed_at이 가장 최신인 기간만 남기고 나머지 기간의 facts를 계산에서 조용히
    # 버렸다. 모든 기간을 계산·검증·경고 대상에 포함한다.
    selected_by_period, fs_div_warnings = select_fs_div(facts_by_period)
    warnings.extend(fs_div_warnings)

    for period in sorted(selected_by_period):
        period_facts = selected_by_period[period]
        if not period_facts:
            continue
        best_by_metric = select_canonical_facts(period_facts)

        try:
            assert_single_fs_div(list(best_by_metric.values()))
        except ValueError as exc:
            warnings.append(f"{period} 지표 계산 중단: {exc}")
            continue

        values = {k: Decimal(str(f.normalized_value)) for k, f in best_by_metric.items()}
        ratios = compute_ratios(values, shares, price)
        formulas.extend(
            FormulaPayload(
                metric=r.metric,
                fiscal_period=period,
                formula=r.formula,
                formula_version=r.formula_version,
            )
            for r in ratios
        )
        source_ids = [str(f.id) for f in best_by_metric.values()]
        raw_evidence = ratios_to_numeric_evidence(
            ratios, body.corp_code, period, body.as_of, source_ids
        )

        # PER/PBR은 재무제표 fact 외에 시세·발행주식 수 기준일도 함께 검증한다.
        # EPS/BPS는 가격을 쓰지 않으므로 발행주식 수 기준일만 검증한다 — price_as_of가
        # 미래라는 이유만으로 EPS/BPS까지 거부되지 않는다.
        fact_as_of = [f.filed_at for f in best_by_metric.values()]
        shares_as_of = [body.shares_outstanding_as_of] if body.shares_outstanding_as_of else []
        price_as_of = [body.price_as_of] if body.price_as_of else []
        checks = [
            DerivedCheckInput(
                record_id=str(evidence["numeric_evidence_id"]),
                corp_code=body.corp_code,
                source_ids=source_ids,
                source_corp_codes=[f.corp_code for f in best_by_metric.values()],
                unit=str(evidence["unit"]),
                source_units=[f.normalized_unit for f in best_by_metric.values()],
                as_of=body.as_of,
                source_as_of=(
                    fact_as_of + shares_as_of + price_as_of
                    if evidence["metric"] in _PRICE_AND_SHARES_METRICS
                    else fact_as_of + shares_as_of
                    if evidence["metric"] in _SHARES_ONLY_METRICS
                    else fact_as_of
                ),
                formula_version=_formula_version_from(evidence),
                target_period=period,
                source_periods=[f.fiscal_period for f in best_by_metric.values()],
            )
            for evidence in raw_evidence
        ]
        post_result = post_derived(checks, body.as_of)
        post_derived_rejected.extend(post_result.rejected)
        verified_ids = set(post_result.verified)
        numeric_evidence.extend(
            ev for ev in raw_evidence if ev["numeric_evidence_id"] in verified_ids
        )

    payload = CalculateFinancialFactsPayload(
        facts=[_fact_payload(f) for f in normalize_result.facts],
        numeric_evidence=numeric_evidence,
        formulas=formulas,
        warnings=warnings,
        trace=normalize_result.trace,
        post_derived_rejected=post_derived_rejected,
    )
    return _envelope(request, payload, warnings)
