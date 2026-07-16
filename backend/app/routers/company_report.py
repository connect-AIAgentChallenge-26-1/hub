"""기능 A 종목 공부 리포트 라우터 — S1 확장(기업개황)·S2·S3·S4·S15·S20을
S11이 오케스트레이션한 결과를 반환한다 (docs/skills.md S11, docs/checklist.md C5).
"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, get_opendart_provider
from app.models.user import User
from app.providers.opendart import OpenDartProvider
from app.schemas.company_report import (
    CheckpointPayload,
    CitationPayload,
    CompanyOverviewPayload,
    CompanyReportPayload,
    CompanyReportRequest,
    DisclosureItemPayload,
    GlossaryPayload,
    MetricPointPayload,
    MetricTrendPayload,
    TermDefinitionPayload,
)
from app.schemas.envelope import Envelope, Status, now_utc
from app.services.company_report_generator import CompanyReportGenerator

router = APIRouter(prefix="/api/v1/company-report", tags=["company-report"])


def _envelope[T](request: Request, data: T, warnings: list[str] | None = None) -> Envelope[T]:
    started_at = now_utc()
    return Envelope[T](
        request_id=request.state.request_id,
        trace_id=request.state.trace_id,
        as_of=started_at.date(),
        status=Status.SUCCESS,
        warnings=warnings or [],
        source_ids=[],
        model_or_rule_version="s11-company-report-generator-1.0.0",
        started_at=started_at,
        completed_at=now_utc(),
        data=data,
    )


@router.post("", response_model=Envelope[CompanyReportPayload])
def generate_company_report(
    body: CompanyReportRequest,
    request: Request,
    db: Session = Depends(get_db),
    provider: OpenDartProvider = Depends(get_opendart_provider),
    _current_user: User = Depends(get_current_user),
) -> Envelope[CompanyReportPayload]:
    generator = CompanyReportGenerator(db, provider)
    report = generator.generate(
        body.corp_code,
        body.stock_code,
        body.as_of,
        body.bgn_de,
        body.end_de,
        body.bsns_years,
        body.reprt_codes,
        body.fs_div,
    )

    overview = (
        CompanyOverviewPayload(
            corp_name=report.overview.corp_name,
            corp_name_eng=report.overview.corp_name_eng,
            stock_code=report.overview.stock_code,
            stock_name=report.overview.stock_name,
            ceo_name=report.overview.ceo_name,
            corp_classification=report.overview.corp_classification,
            corp_classification_label=report.overview.corp_classification_label,
            business_registration_no=report.overview.business_registration_no,
            corporate_registration_no=report.overview.corporate_registration_no,
            address=report.overview.address,
            homepage_url=report.overview.homepage_url,
            ir_url=report.overview.ir_url,
            phone=report.overview.phone,
            fax=report.overview.fax,
            industry_code=report.overview.industry_code,
            established_date=report.overview.established_date,
            fiscal_year_end_month=report.overview.fiscal_year_end_month,
            as_of=report.overview.as_of,
            source_url=report.overview.source_url,
        )
        if report.overview is not None
        else None
    )

    payload = CompanyReportPayload(
        corp_code=report.corp_code,
        as_of=report.as_of,
        overview=overview,
        disclosures=[
            DisclosureItemPayload(
                rcept_no=d.rcept_no,
                report_nm=d.report_nm,
                filed_at=d.filed_at,
                report_type=d.report_type,
                is_correction=d.is_correction,
                corrected_original_rcept_no=d.corrected_original_rcept_no,
                corrected_by_rcept_no=d.corrected_by_rcept_no,
                source_url=d.source_url,
            )
            for d in report.disclosures
        ],
        metric_trends=[
            MetricTrendPayload(
                metric=t.metric,
                points=[
                    MetricPointPayload(
                        fiscal_period=p.fiscal_period,
                        value=p.value,
                        unit=p.unit,
                        account_id=p.account_id,
                        account_name=p.account_name,
                        formula=p.formula,
                        formula_version=p.formula_version,
                        filed_at=p.filed_at,
                        as_of=p.as_of,
                    )
                    for p in t.points
                ],
                change_reason_code=t.change_reason_code,
                change_pct=t.change_pct,
            )
            for t in report.metric_trends
        ],
        glossary=GlossaryPayload(
            definitions=[
                TermDefinitionPayload(
                    term=d.term,
                    definition=d.definition,
                    source=d.source,
                    glossary_version=d.glossary_version,
                )
                for d in report.glossary.definitions
            ],
            unexplained_terms=list(report.glossary.unexplained_terms),
        ),
        checkpoints=[
            CheckpointPayload(code=c.code, message=c.message, severity=c.severity)
            for c in report.checkpoints
        ],
        citations=[
            CitationPayload(
                evidence_id=c.evidence_id,
                quote=c.quote,
                source_url=c.source_url,
                filed_at=c.filed_at,
                target_period=c.target_period,
                method=c.method,
                verified=c.verified,
            )
            for c in report.citations
        ],
        generator_version=report.generator_version,
    )
    return _envelope(request, payload)
