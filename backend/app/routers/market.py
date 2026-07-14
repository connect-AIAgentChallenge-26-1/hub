from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, get_kis_provider
from app.models.market import CorporateActionType, Quote, RawMarketRecord
from app.models.user import User
from app.providers.kis import KisProvider
from app.schemas.envelope import Envelope, Status, now_utc
from app.schemas.market import (
    CollectCorporateActionRequest,
    CollectCurrentPriceRequest,
    CollectPayload,
    CollectPeriodPriceRequest,
    CorporateActionPayload,
    ManualInputPayload,
    ManualInputRequest,
    MarketRequest,
    NormalizeMarketRequest,
    NormalizePayload,
    QuotePayload,
    SharesOutstandingPayload,
)
from app.services.market_collector import LICENSE_NOTICE, MarketCollector

router = APIRouter(prefix="/api/v1/market", tags=["market"])


def _envelope[T](request: Request, data: T, warnings: list[str] | None = None) -> Envelope[T]:
    started_at = now_utc()
    return Envelope[T](
        request_id=request.state.request_id,
        trace_id=request.state.trace_id,
        as_of=started_at.date(),
        status=Status.SUCCESS,
        warnings=warnings or [],
        source_ids=[],
        model_or_rule_version="s13-market-collector-1.0.0",
        started_at=started_at,
        completed_at=now_utc(),
        data=data,
    )


def _quote_payload(quote: Quote) -> QuotePayload:
    return QuotePayload(
        stock_code=quote.stock_code,
        corp_code=quote.corp_code,
        trade_date=quote.trade_date,
        price_basis=quote.price_basis.value,
        open_price=quote.open_price,
        high_price=quote.high_price,
        low_price=quote.low_price,
        close_price=quote.close_price,
        volume=quote.volume,
        trading_value=quote.trading_value,
        adjustment_flag_code=quote.adjustment_flag_code,
        provider=quote.provider,
        license=quote.license,
    )


@router.post("", response_model=Envelope[CollectPayload | NormalizePayload | ManualInputPayload])
def collect_or_normalize(
    body: MarketRequest,
    request: Request,
    db: Session = Depends(get_db),
    provider: KisProvider = Depends(get_kis_provider),
    _current_user: User = Depends(get_current_user),
) -> Envelope[CollectPayload | NormalizePayload | ManualInputPayload]:
    collector = MarketCollector(db, provider)
    warnings: list[str] = []

    if isinstance(body, CollectCurrentPriceRequest):
        record = collector.collect_current_price(body.stock_code)
        payload: CollectPayload | NormalizePayload | ManualInputPayload = CollectPayload(
            raw_record_ids=[record.raw_record_id],
            provider="kis",
            license=LICENSE_NOTICE,
            collected_at=record.collected_at,
        )
    elif isinstance(body, CollectPeriodPriceRequest):
        record = collector.collect_period_price(
            body.stock_code, body.start, body.end, body.adjusted
        )
        payload = CollectPayload(
            raw_record_ids=[record.raw_record_id],
            provider="kis",
            license=LICENSE_NOTICE,
            collected_at=record.collected_at,
        )
    elif isinstance(body, CollectCorporateActionRequest):
        record = collector.collect_corporate_action(
            CorporateActionType(body.action_type), body.stock_code, body.start, body.end
        )
        payload = CollectPayload(
            raw_record_ids=[record.raw_record_id],
            provider="kis",
            license=LICENSE_NOTICE,
            collected_at=record.collected_at,
        )
    elif isinstance(body, ManualInputRequest):
        quote = collector.record_manual_quote(
            body.stock_code, body.corp_code, body.trade_date, body.close_price, body.source_note
        )
        payload = ManualInputPayload(quote=_quote_payload(quote))
    else:
        payload, warnings = _normalize(body, db, collector)

    return _envelope(request, payload, warnings)


def _normalize(
    body: NormalizeMarketRequest, db: Session, collector: MarketCollector
) -> tuple[NormalizePayload, list[str]]:
    records: list[RawMarketRecord] = []
    missing_ids: list[str] = []
    for record_id in body.eligible_raw_record_ids:
        record = db.get(RawMarketRecord, record_id)
        if record is None:
            missing_ids.append(str(record_id))
            continue
        records.append(record)
    warnings = [f"eligible_raw_record_id not found, skipped: {rid}" for rid in missing_ids]

    result = collector.normalize(records, corp_code=body.corp_code, as_of=body.as_of)
    payload = NormalizePayload(
        quotes=[_quote_payload(q) for q in result.quotes],
        corporate_actions=[
            CorporateActionPayload(
                stock_code=a.stock_code,
                corp_code=a.corp_code,
                action_type=a.action_type.value,
                record_date=a.record_date,
                detail=a.detail,
            )
            for a in result.corporate_actions
        ],
        shares_outstanding=[
            SharesOutstandingPayload(
                stock_code=s.stock_code,
                corp_code=s.corp_code,
                as_of_date=s.as_of_date,
                shares_outstanding=s.shares_outstanding,
                face_value=s.face_value,
            )
            for s in result.shares_outstanding
        ],
        numeric_evidence=result.numeric_evidence,
        provider=result.provider,
        license=result.license,
        trace=result.trace,
    )
    return payload, warnings
