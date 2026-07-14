from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, get_naver_provider
from app.models.external_evidence import RawExternalRecord
from app.models.user import User
from app.providers.naver_news import NaverNewsProvider
from app.schemas.envelope import Envelope, Status, now_utc
from app.schemas.external_evidence import (
    CollectNewsRequest,
    CollectPayload,
    ExternalDocumentPayload,
    ExternalEvidenceRequest,
    NormalizeExternalRequest,
    NormalizePayload,
)
from app.services.external_evidence_collector import ExternalEvidenceCollector

router = APIRouter(prefix="/api/v1/external-evidence", tags=["external-evidence"])


def _envelope[T](request: Request, data: T, warnings: list[str] | None = None) -> Envelope[T]:
    started_at = now_utc()
    return Envelope[T](
        request_id=request.state.request_id,
        trace_id=request.state.trace_id,
        as_of=started_at.date(),
        status=Status.SUCCESS,
        warnings=warnings or [],
        source_ids=[],
        model_or_rule_version="s14-external-evidence-collector-1.0.0",
        started_at=started_at,
        completed_at=now_utc(),
        data=data,
    )


@router.post("", response_model=Envelope[CollectPayload | NormalizePayload])
def collect_or_normalize(
    body: ExternalEvidenceRequest,
    request: Request,
    db: Session = Depends(get_db),
    provider: NaverNewsProvider = Depends(get_naver_provider),
    _current_user: User = Depends(get_current_user),
) -> Envelope[CollectPayload | NormalizePayload]:
    collector = ExternalEvidenceCollector(db, provider)
    warnings: list[str] = []

    if isinstance(body, CollectNewsRequest):
        record = collector.collect_news(body.claim, body.company_name, body.display)
        payload: CollectPayload | NormalizePayload = CollectPayload(
            raw_record_ids=[record.raw_record_id],
            query=record.query,
            query_builder_version=record.query_builder_version,
        )
    else:
        payload, warnings = _normalize(body, db, collector)

    return _envelope(request, payload, warnings)


def _normalize(
    body: NormalizeExternalRequest, db: Session, collector: ExternalEvidenceCollector
) -> tuple[NormalizePayload, list[str]]:
    records: list[RawExternalRecord] = []
    missing_ids: list[str] = []
    for record_id in body.eligible_raw_record_ids:
        record = db.get(RawExternalRecord, record_id)
        if record is None:
            missing_ids.append(str(record_id))
            continue
        records.append(record)
    warnings = [f"eligible_raw_record_id not found, skipped: {rid}" for rid in missing_ids]

    result = collector.normalize(records, company_name=body.company_name, as_of=body.as_of)
    payload = NormalizePayload(
        external_documents=[
            ExternalDocumentPayload(
                source_provider=d.source_provider.value,
                corp_code=d.corp_code,
                stock_code=d.stock_code,
                title=d.title,
                description=d.description,
                source_url=d.source_url,
                published_at=d.published_at,
                revised_at=d.revised_at,
                entity_matched=d.entity_matched,
                entity_match_text=d.entity_match_text,
                checksum=d.checksum,
            )
            for d in result.external_documents
        ],
        numeric_evidence=result.numeric_evidence,
        publication_times=result.publication_times,
        entity_matches=result.entity_matches,
        provider_trace=result.provider_trace,
        trace=result.trace,
        verifiable_status=result.verifiable_status,
    )
    return payload, warnings
