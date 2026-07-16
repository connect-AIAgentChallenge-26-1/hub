"""기능 B 가치 범위·가격 위치 라우터 — S21(비교군)·S5(가치 시나리오)·
S6(가격 위치)를 오케스트레이션한 결과를 반환한다 (docs/skills.md S5·S6·S21,
docs/checklist.md C6)."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, get_kis_provider, get_opendart_provider
from app.models.user import User
from app.providers.kis import KisProvider
from app.providers.opendart import OpenDartProvider
from app.schemas.envelope import Envelope, Status, now_utc
from app.schemas.valuation_report import (
    CheckpointPayload,
    CompanyProfilePayload,
    ExclusionPayload,
    MethodPositionPayload,
    PeerStatisticsPayload,
    PeerUniversePayload,
    PricePositionPayload,
    ValuationPayload,
    ValuationReportPayload,
    ValuationReportRequest,
    ValueRangePayload,
)
from app.services.peer_universe import CompanyProfile
from app.services.valuation_report_generator import CompanySpec, ValuationReportGenerator

router = APIRouter(prefix="/api/v1/valuation-report", tags=["valuation-report"])


def _envelope[T](request: Request, data: T, warnings: list[str] | None = None) -> Envelope[T]:
    started_at = now_utc()
    return Envelope[T](
        request_id=request.state.request_id,
        trace_id=request.state.trace_id,
        as_of=started_at.date(),
        status=Status.SUCCESS,
        warnings=warnings or [],
        source_ids=[],
        model_or_rule_version="b-valuation-report-generator-1.0.0",
        started_at=started_at,
        completed_at=now_utc(),
        data=data,
    )


def _profile_payload(p: CompanyProfile) -> CompanyProfilePayload:
    return CompanyProfilePayload(
        corp_code=p.corp_code,
        corp_name=p.corp_name,
        stock_code=p.stock_code,
        industry_code=p.industry_code,
        eps=p.eps,
        bps=p.bps,
        per=p.per,
        pbr=p.pbr,
        roe=p.roe,
        price=p.price,
        price_as_of=p.price_as_of,
        financial_as_of=p.financial_as_of,
    )


@router.post("", response_model=Envelope[ValuationReportPayload])
def generate_valuation_report(
    body: ValuationReportRequest,
    request: Request,
    db: Session = Depends(get_db),
    opendart: OpenDartProvider = Depends(get_opendart_provider),
    kis: KisProvider = Depends(get_kis_provider),
    _current_user: User = Depends(get_current_user),
) -> Envelope[ValuationReportPayload]:
    generator = ValuationReportGenerator(db, opendart, kis)
    report = generator.generate(
        CompanySpec(body.target.corp_code, body.target.stock_code),
        [CompanySpec(c.corp_code, c.stock_code) for c in body.candidates],
        body.as_of,
        body.bsns_year,
        body.reprt_code,
        body.fs_div,
    )

    peer_payload = None
    if report.peer_result is not None:
        stats = report.peer_result.statistics
        peer_payload = PeerUniversePayload(
            peer_universe=[_profile_payload(p) for p in report.peer_result.peer_universe],
            exclusions=[
                ExclusionPayload(
                    corp_code=e.corp_code,
                    corp_name=e.corp_name,
                    reason_code=e.reason_code,
                    detail=e.detail,
                )
                for e in report.peer_result.exclusions
            ],
            statistics=PeerStatisticsPayload(
                sample_size=stats.sample_size,
                per_median=stats.per_median,
                per_p25=stats.per_p25,
                per_p75=stats.per_p75,
                pbr_median=stats.pbr_median,
                pbr_p25=stats.pbr_p25,
                pbr_p75=stats.pbr_p75,
                roe_median=stats.roe_median,
                per_sample_size=stats.per_sample_size,
                pbr_sample_size=stats.pbr_sample_size,
                roe_sample_size=stats.roe_sample_size,
            ),
            quality_score=report.peer_result.quality_score,
            sufficient=report.peer_result.sufficient,
            rule_version=report.peer_result.rule_version,
            numeric_evidence=list(report.peer_result.numeric_evidence),
        )

    valuation_payload = None
    if report.valuation is not None:
        valuation_payload = ValuationPayload(
            value_ranges=[
                ValueRangePayload(
                    method=r.method,
                    formula=r.formula,
                    formula_version=r.formula_version,
                    low=r.low,
                    mid=r.mid,
                    high=r.high,
                    assumptions=r.assumptions,
                    sensitivity_note=r.sensitivity_note,
                )
                for r in report.valuation.value_ranges
            ],
            data_quality=report.valuation.data_quality,
            rule_version=report.valuation.rule_version,
            numeric_evidence=list(report.valuation.numeric_evidence),
        )

    price_position_payload = None
    if report.price_position is not None:
        pp = report.price_position
        price_position_payload = PricePositionPayload(
            price=pp.price,
            overall_position=pp.overall_position,
            method_positions=[
                MethodPositionPayload(
                    method=mp.method, position=mp.position, distance_pct=mp.distance_pct
                )
                for mp in pp.method_positions
            ],
            sensitivity=pp.sensitivity,
            assumptions=pp.assumptions,
            rule_version=pp.rule_version,
        )

    payload = ValuationReportPayload(
        target_corp_code=report.target_corp_code,
        as_of=report.as_of,
        target_profile=(
            _profile_payload(report.target_profile) if report.target_profile is not None else None
        ),
        peer=peer_payload,
        valuation=valuation_payload,
        price_position=price_position_payload,
        checkpoints=[
            CheckpointPayload(code=c.code, message=c.message, severity=c.severity)
            for c in report.checkpoints
        ],
        generator_version=report.generator_version,
    )
    return _envelope(request, payload)
