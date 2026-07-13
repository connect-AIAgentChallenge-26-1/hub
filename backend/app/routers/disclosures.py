import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, get_opendart_provider
from app.models.disclosure import RawDisclosureRecord
from app.models.user import User
from app.providers.opendart import OpenDartProvider
from app.schemas.disclosure import (
    CollectDisclosuresRequest,
    CollectPayload,
    CorrectionChainPayload,
    DisclosurePayload,
    DisclosuresRequest,
    DocumentChunkPayload,
    FinancialFactRowPayload,
    NormalizeDisclosuresRequest,
    NormalizePayload,
    ProviderTraceEntry,
)
from app.schemas.envelope import Envelope, Status, now_utc
from app.services.disclosure_collector import DisclosureCollector

router = APIRouter(prefix="/api/v1/disclosures", tags=["disclosures"])


def _envelope[T](request: Request, data: T, warnings: list[str] | None = None) -> Envelope[T]:
    started_at = now_utc()
    return Envelope[T](
        request_id=request.state.request_id,
        trace_id=request.state.trace_id,
        as_of=started_at.date(),
        status=Status.SUCCESS,
        warnings=warnings or [],
        source_ids=[],
        model_or_rule_version="s2-disclosure-collector-1.0.0",
        started_at=started_at,
        completed_at=now_utc(),
        data=data,
    )


def _collect(
    body: CollectDisclosuresRequest, db: Session, collector: DisclosureCollector
) -> CollectPayload:
    raw_records: list[RawDisclosureRecord] = []
    raw_records.append(
        collector.collect_disclosure_list(
            corp_code=body.corp_code,
            bgn_de=body.period.bgn_de,
            end_de=body.period.end_de,
        )
    )
    for reprt_code in body.reprt_codes:
        for fs_div in body.fs_divs or ["CFS"]:
            raw_records.append(
                collector.collect_financial_statements(
                    corp_code=body.corp_code,
                    bsns_year=str(body.as_of.year),
                    reprt_code=reprt_code,
                    fs_div=fs_div,
                )
            )
    return CollectPayload(
        raw_record_ids=[r.raw_record_id for r in raw_records],
        provider_trace=[
            ProviderTraceEntry(raw_record_id=r.raw_record_id, record_type=r.record_type.value)
            for r in raw_records
        ],
    )


def _normalize(
    body: NormalizeDisclosuresRequest, db: Session, collector: DisclosureCollector
) -> tuple[NormalizePayload, list[str]]:
    records: list[RawDisclosureRecord] = []
    missing_ids: list[uuid.UUID] = []
    for record_id in body.eligible_raw_record_ids:
        record = db.get(RawDisclosureRecord, record_id)
        if record is None:
            missing_ids.append(record_id)
            continue
        records.append(record)
    # 호출자가 지정한 eligible_raw_record_ids 중 DB에 없는 id는 조용히
    # 버리지 않는다 — 오탈자·경합·다른 tenant의 id 같은 호출자 오류일 수
    # 있으므로 warning으로 드러낸다(CLAUDE.md 절대 원칙 7 오류 구분).
    warnings = [f"eligible_raw_record_id not found, skipped: {rid}" for rid in missing_ids]
    result = collector.normalize(records, as_of=body.as_of)
    payload = NormalizePayload(
        disclosures=[
            DisclosurePayload(
                rcept_no=d.rcept_no,
                corp_code=d.corp_code,
                report_nm=d.report_nm,
                filed_at=d.filed_at,
                report_type=d.report_type.value,
                is_correction=d.is_correction,
            )
            for d in result.disclosures
        ],
        eligible_financial_rows=[
            FinancialFactRowPayload(
                rcept_no=r.rcept_no,
                corp_code=r.corp_code,
                fs_div=r.fs_div,
                sj_div=r.sj_div,
                account_id=r.account_id,
                account_nm=r.account_nm,
                thstrm_amount=r.thstrm_amount,
                filed_at=r.filed_at,
            )
            for r in result.eligible_financial_rows
        ],
        document_chunks=[
            DocumentChunkPayload(
                presentation_item_id=c.presentation_item_id,
                rcept_no=c.rcept_no,
                chunk_index=c.chunk_index,
                quote=c.quote,
                chunk_offset=c.chunk_offset,
            )
            for c in result.document_chunks
        ],
        document_evidence=result.document_evidence,
        correction_chains=[
            CorrectionChainPayload(
                corp_code=c.corp_code,
                original_rcept_no=c.original_rcept_no,
                correction_rcept_no=c.correction_rcept_no,
                matched_by=c.matched_by,
            )
            for c in result.correction_chains
        ],
        trace=result.trace,
    )
    return payload, warnings


@router.post("", response_model=Envelope[CollectPayload | NormalizePayload])
def collect_or_normalize(
    body: DisclosuresRequest,
    request: Request,
    db: Session = Depends(get_db),
    provider: OpenDartProvider = Depends(get_opendart_provider),
    _current_user: User = Depends(get_current_user),
) -> Envelope[CollectPayload | NormalizePayload]:
    collector = DisclosureCollector(db, provider)
    warnings: list[str] = []
    if body.operation == "COLLECT":
        payload: CollectPayload | NormalizePayload = _collect(body, db, collector)
    else:
        payload, warnings = _normalize(body, db, collector)
    return _envelope(request, payload, warnings)
