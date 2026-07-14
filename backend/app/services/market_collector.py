"""S13 시세·기업행위 수집 — docs/skills.md S13. COLLECT stores KIS responses as
immutable RawMarketRecord; NORMALIZE turns eligible raw records into
quotes/corporate_actions/shares_outstanding + market-domain NumericEvidence.

T04에서 S15(app/services/temporal_integrity.py)가 생기면서 `trade_date <=
as_of`/`record_date <= as_of` 차단은 이제 inline 규칙이 아니라
`temporal_integrity.pre_normalize()` 호출로 중앙화됐다.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.market import (
    CorporateAction,
    CorporateActionType,
    PriceBasis,
    Quote,
    RawMarketRecord,
    RawMarketRecordType,
    SharesOutstanding,
)
from app.providers.kis import KisProvider, RawFetch
from app.services.temporal_integrity import TemporalCandidate, pre_normalize

LICENSE_NOTICE = (
    "한국투자증권 KIS Developers Open API(apiportal.koreainvestment.com) 이용약관에 "
    "따름 — 모의투자(vps) 환경 수집, 실시간 시세 재배포 제한"
)

MANUAL_INPUT_PROVIDER = "manual_input"


@dataclass(frozen=True)
class MarketNormalizeResult:
    quotes: list[Quote] = field(default_factory=list)
    corporate_actions: list[CorporateAction] = field(default_factory=list)
    shares_outstanding: list[SharesOutstanding] = field(default_factory=list)
    numeric_evidence: list[dict[str, object]] = field(default_factory=list)
    provider: str = "kis"
    license: str = LICENSE_NOTICE
    trace: list[str] = field(default_factory=list)


class MarketCollector:
    def __init__(self, db: Session, provider: KisProvider):
        self._db = db
        self._provider = provider

    # ---------------------------------------------------------------- COLLECT

    def collect_current_price(self, stock_code: str) -> RawMarketRecord:
        fetch = self._provider.fetch_current_price(stock_code)
        return self._store(RawMarketRecordType.CURRENT_PRICE, stock_code, None, fetch)

    def collect_period_price(
        self, stock_code: str, start: str, end: str, adjusted: bool
    ) -> RawMarketRecord:
        fetch = self._provider.fetch_period_price(stock_code, start, end, adjusted)
        basis = "adjusted" if adjusted else "unadjusted"
        return self._store(
            RawMarketRecordType.PERIOD_PRICE, stock_code, f"{start}-{end}-{basis}", fetch
        )

    def collect_corporate_action(
        self, action_type: CorporateActionType, stock_code: str, start: str, end: str
    ) -> RawMarketRecord:
        params = self._corporate_action_params(action_type, stock_code, start, end)
        fetch = self._provider.fetch_corporate_action_raw(
            action_type.path, action_type.tr_id, params
        )
        return self._store(
            RawMarketRecordType.CORPORATE_ACTION,
            stock_code,
            f"{action_type.value}-{start}-{end}",
            fetch,
        )

    @staticmethod
    def _corporate_action_params(
        action_type: CorporateActionType, stock_code: str, start: str, end: str
    ) -> dict[str, str]:
        # 4개 예탁원(KSD) endpoint가 서로 다른 파라미터 이름을 쓴다(공식 예제 기준,
        # examples_llm/domestic_stock/ksdinfo_*).
        if action_type is CorporateActionType.DIVIDEND:
            return {
                "CTS": "", "GB1": "0", "F_DT": start, "T_DT": end,
                "SHT_CD": stock_code, "HIGH_GB": "",
            }
        if action_type is CorporateActionType.BONUS_ISSUE:
            return {"CTS": "", "F_DT": start, "T_DT": end, "SHT_CD": stock_code}
        if action_type is CorporateActionType.PAID_IN_CAPITAL_INCREASE:
            return {"CTS": "", "GB1": "1", "F_DT": start, "T_DT": end, "SHT_CD": stock_code}
        return {"SHT_CD": stock_code, "CTS": "", "F_DT": start, "T_DT": end, "MARKET_GB": "0"}

    def _store(
        self,
        record_type: RawMarketRecordType,
        stock_code: str,
        target_period: str | None,
        fetch: RawFetch,
    ) -> RawMarketRecord:
        record = RawMarketRecord(
            source_provider="kis",
            record_type=record_type,
            stock_code=stock_code,
            target_period=target_period,
            raw_payload=fetch.raw_payload,
            checksum=fetch.checksum,
        )
        self._db.add(record)
        self._db.commit()
        self._db.refresh(record)
        return record

    # --------------------------------------------------------------- NORMALIZE

    def normalize(
        self, eligible_raw_records: list[RawMarketRecord], corp_code: str, as_of: date
    ) -> MarketNormalizeResult:
        quotes: list[Quote] = []
        corporate_actions: list[CorporateAction] = []
        shares_outstanding: list[SharesOutstanding] = []
        numeric_evidence: list[dict[str, object]] = []
        trace: list[str] = []

        for record in eligible_raw_records:
            if record.record_type is RawMarketRecordType.PERIOD_PRICE:
                quotes.extend(self._normalize_period_price(record, corp_code, as_of, trace))
            elif record.record_type is RawMarketRecordType.CURRENT_PRICE:
                so = self._normalize_current_price(record, corp_code, as_of, trace)
                if so is not None:
                    shares_outstanding.append(so)
            elif record.record_type is RawMarketRecordType.CORPORATE_ACTION:
                corporate_actions.extend(
                    self._normalize_corporate_action(record, corp_code, as_of, trace)
                )

        for quote in quotes:
            numeric_evidence.append(self._quote_as_numeric_evidence(quote, corp_code, as_of))
        for so in shares_outstanding:
            numeric_evidence.append(self._shares_as_numeric_evidence(so, corp_code, as_of))
        for action in corporate_actions:
            if action.action_type is CorporateActionType.DIVIDEND:
                evidence = self._dividend_as_numeric_evidence(action, corp_code, as_of)
                if evidence is not None:
                    numeric_evidence.append(evidence)

        return MarketNormalizeResult(
            quotes=quotes,
            corporate_actions=corporate_actions,
            shares_outstanding=shares_outstanding,
            numeric_evidence=numeric_evidence,
            trace=trace,
        )

    def _normalize_period_price(
        self, record: RawMarketRecord, corp_code: str, as_of: date, trace: list[str]
    ) -> list[Quote]:
        # "unadjusted".endswith("adjusted") is also True, so the last "-"
        # segment must match exactly rather than using endswith().
        basis_token = (record.target_period or "").rsplit("-", 1)[-1]
        basis = PriceBasis.ADJUSTED if basis_token == "adjusted" else PriceBasis.UNADJUSTED
        rows = record.raw_payload.get("output2") or []
        rows_by_id = {f"{record.raw_record_id}#{i}": row for i, row in enumerate(rows)}
        candidates = [
            TemporalCandidate(
                record_id=candidate_id,
                effective_date=datetime.strptime(row["stck_bsop_date"], "%Y%m%d").date(),
                source_type="market",
                corp_code=corp_code,
            )
            for candidate_id, row in rows_by_id.items()
        ]
        pre_normalize_result = pre_normalize(candidates, as_of)
        trace.extend(pre_normalize_result.integrity_log)

        results: list[Quote] = []
        for candidate in pre_normalize_result.eligible:
            row = rows_by_id[candidate.record_id]
            trade_date = candidate.effective_date
            existing = self._db.query(Quote).filter_by(
                stock_code=record.stock_code, trade_date=trade_date, price_basis=basis
            ).one_or_none()
            if existing is not None:
                results.append(existing)
                continue
            quote = Quote(
                stock_code=record.stock_code,
                corp_code=corp_code,
                trade_date=trade_date,
                price_basis=basis,
                open_price=row["stck_oprc"],
                high_price=row["stck_hgpr"],
                low_price=row["stck_lwpr"],
                close_price=row["stck_clpr"],
                volume=row["acml_vol"],
                trading_value=row["acml_tr_pbmn"],
                adjustment_flag_code=row.get("flng_cls_code"),
                license=LICENSE_NOTICE,
                raw_record_id=record.raw_record_id,
            )
            self._db.add(quote)
            results.append(quote)
        self._db.commit()
        return results

    def _normalize_current_price(
        self, record: RawMarketRecord, corp_code: str, as_of: date, trace: list[str]
    ) -> SharesOutstanding | None:
        output = record.raw_payload.get("output") or {}
        shares = output.get("lstn_stcn")
        face_value = output.get("stck_fcam")
        if not shares or not face_value:
            trace.append(
                f"current_price {record.raw_record_id}: lstn_stcn/stck_fcam missing, skipped"
            )
            return None
        existing = self._db.query(SharesOutstanding).filter_by(
            stock_code=record.stock_code, as_of_date=as_of
        ).one_or_none()
        if existing is not None:
            return existing
        so = SharesOutstanding(
            stock_code=record.stock_code,
            corp_code=corp_code,
            as_of_date=as_of,
            shares_outstanding=shares,
            face_value=face_value,
            raw_record_id=record.raw_record_id,
        )
        self._db.add(so)
        self._db.commit()
        return so

    def _normalize_corporate_action(
        self, record: RawMarketRecord, corp_code: str, as_of: date, trace: list[str]
    ) -> list[CorporateAction]:
        action_type = CorporateActionType((record.target_period or "").split("-", 1)[0])
        rows = record.raw_payload.get("output1") or []
        rows_by_id: dict[str, dict[str, object]] = {}
        for i, row in enumerate(rows):
            raw_date = row.get("record_date")
            if not raw_date:
                trace.append(
                    f"corporate_action {record.raw_record_id}#{i}: record_date missing, skipped"
                )
                continue
            rows_by_id[f"{record.raw_record_id}#{i}"] = row
        candidates = [
            TemporalCandidate(
                record_id=candidate_id,
                effective_date=datetime.strptime(str(row["record_date"]), "%Y%m%d").date(),
                source_type="market",
                corp_code=corp_code,
            )
            for candidate_id, row in rows_by_id.items()
        ]
        pre_normalize_result = pre_normalize(candidates, as_of)
        trace.extend(pre_normalize_result.integrity_log)

        results: list[CorporateAction] = []
        for candidate in pre_normalize_result.eligible:
            row = rows_by_id[candidate.record_id]
            record_date = candidate.effective_date
            existing = self._db.query(CorporateAction).filter_by(
                stock_code=record.stock_code, action_type=action_type, record_date=record_date
            ).one_or_none()
            if existing is not None:
                results.append(existing)
                continue
            action = CorporateAction(
                stock_code=record.stock_code,
                corp_code=corp_code,
                action_type=action_type,
                record_date=record_date,
                detail=row,
                raw_record_id=record.raw_record_id,
            )
            self._db.add(action)
            results.append(action)
        self._db.commit()
        return results

    def _quote_as_numeric_evidence(
        self, quote: Quote, corp_code: str, as_of: date
    ) -> dict[str, object]:
        return {
            "numeric_evidence_id": str(uuid.uuid4()),
            "evidence_domain": "market",
            "corp_code": corp_code,
            "metric": "close_price",
            "value": float(quote.close_price),
            "unit": "KRW",
            "target_period": quote.trade_date.isoformat(),
            "as_of": as_of.isoformat(),
            "source_ids": [str(quote.raw_record_id)],
            "provenance": {
                "provider": "kis",
                "stock_code": quote.stock_code,
                "price_basis": quote.price_basis.value,
                "license": LICENSE_NOTICE,
            },
            "integrity_status": "VERIFIED",
        }

    def _shares_as_numeric_evidence(
        self, so: SharesOutstanding, corp_code: str, as_of: date
    ) -> dict[str, object]:
        return {
            "numeric_evidence_id": str(uuid.uuid4()),
            "evidence_domain": "market",
            "corp_code": corp_code,
            "metric": "shares_outstanding",
            "value": float(so.shares_outstanding),
            "unit": "SHARES",
            "target_period": so.as_of_date.isoformat(),
            "as_of": as_of.isoformat(),
            "source_ids": [str(so.raw_record_id)],
            "provenance": {
                "provider": "kis", "stock_code": so.stock_code, "license": LICENSE_NOTICE,
            },
            "integrity_status": "VERIFIED",
        }

    def _dividend_as_numeric_evidence(
        self, action: CorporateAction, corp_code: str, as_of: date
    ) -> dict[str, object] | None:
        amount = action.detail.get("per_sto_divi_amt")
        if amount in (None, ""):
            return None
        return {
            "numeric_evidence_id": str(uuid.uuid4()),
            "evidence_domain": "market",
            "corp_code": corp_code,
            "metric": "dividend_per_share",
            "value": float(amount),
            "unit": "KRW",
            "target_period": action.record_date.isoformat(),
            "as_of": as_of.isoformat(),
            "source_ids": [str(action.raw_record_id)],
            "provenance": {
                "provider": "kis", "stock_code": action.stock_code, "license": LICENSE_NOTICE,
            },
            "integrity_status": "VERIFIED",
        }

    # ------------------------------------------------------------ manual input

    def record_manual_quote(
        self,
        stock_code: str,
        corp_code: str,
        trade_date: date,
        close_price: str,
        source_note: str,
    ) -> Quote:
        """수동 입력 adapter (docs/skills.md S13 제약 "provider 장애 시 수동 입력
        경로를 제공하되 출처를 구분"). provider 호출이 없으므로 raw record는
        사용자가 제출한 값 자체를 payload로 남겨 감사 추적을 유지한다."""
        raw_payload = {
            "manual_input": True,
            "stock_code": stock_code,
            "trade_date": trade_date.isoformat(),
            "close_price": close_price,
            "source_note": source_note,
        }
        checksum = hashlib.sha256(
            json.dumps(raw_payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
        ).hexdigest()
        record = RawMarketRecord(
            source_provider=MANUAL_INPUT_PROVIDER,
            record_type=RawMarketRecordType.PERIOD_PRICE,
            stock_code=stock_code,
            target_period=f"{trade_date.isoformat()}-manual",
            raw_payload=raw_payload,
            checksum=checksum,
        )
        self._db.add(record)
        self._db.commit()
        self._db.refresh(record)

        quote = Quote(
            stock_code=stock_code,
            corp_code=corp_code,
            trade_date=trade_date,
            price_basis=PriceBasis.UNADJUSTED,
            open_price=close_price,
            high_price=close_price,
            low_price=close_price,
            close_price=close_price,
            volume="0",
            trading_value="0",
            adjustment_flag_code=None,
            provider=MANUAL_INPUT_PROVIDER,
            license=f"수동 입력 — {source_note}",
            raw_record_id=record.raw_record_id,
        )
        self._db.add(quote)
        self._db.commit()
        self._db.refresh(quote)
        return quote
