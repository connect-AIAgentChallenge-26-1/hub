from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, get_opendart_provider
from app.models.user import User
from app.providers.opendart import OpenDartProvider
from app.schemas.company import CompanyCandidatePayload, IngestPayload, ResolvePayload
from app.schemas.envelope import Envelope, Status, now_utc
from app.services.company_resolver import CompanyResolver

router = APIRouter(prefix="/api/v1/companies", tags=["companies"])


def _envelope[T](request: Request, data: T) -> Envelope[T]:
    started_at = now_utc()
    return Envelope[T](
        request_id=request.state.request_id,
        trace_id=request.state.trace_id,
        as_of=started_at.date(),
        status=Status.SUCCESS,
        source_ids=[],
        model_or_rule_version="s1-company-resolver-1.0.0",
        started_at=started_at,
        completed_at=now_utc(),
        data=data,
    )


@router.get("/resolve", response_model=Envelope[ResolvePayload])
def resolve(
    request: Request,
    query: str = Query(min_length=1),
    as_of: date | None = Query(default=None),
    market: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> Envelope[ResolvePayload]:
    resolver = CompanyResolver(db)
    result = resolver.resolve(query=query, as_of=as_of or now_utc().date(), market=market)
    payload = ResolvePayload(
        matched=result.matched,
        corp_name=result.corp_name,
        corp_code=result.corp_code,
        stock_code=result.stock_code,
        market=result.market,
        matched_by=result.matched_by,
        listing_status=result.listing_status,
        resolved_at=result.resolved_at or now_utc().date(),
        candidates=[
            CompanyCandidatePayload(
                corp_code=c.corp_code,
                corp_name=c.corp_name,
                stock_code=c.stock_code,
                listing_status=c.listing_status,
            )
            for c in result.candidates
        ],
        reason_code=result.reason_code,
    )
    return _envelope(request, payload)


@router.post("/ingest", response_model=Envelope[IngestPayload])
def ingest(
    request: Request,
    db: Session = Depends(get_db),
    provider: OpenDartProvider = Depends(get_opendart_provider),
    _current_user: User = Depends(get_current_user),
) -> Envelope[IngestPayload]:
    # 인증된 사용자면 누구나 호출 가능 — tenant별 데이터가 아니라 전역 corp
    # master 캐시 갱신이라 세분화된 권한 모델은 T11에서 role이 생기면 추가한다.
    fetch = provider.fetch_corp_code_master()
    resolver = CompanyResolver(db)
    record_count = resolver.ingest_corp_master(fetch)
    return _envelope(request, IngestPayload(record_count=record_count))
