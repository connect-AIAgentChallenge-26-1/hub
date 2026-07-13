"""S1 Company Resolver — docs/skills.md S1. Ingests OpenDART's corp master
and resolves a user query to exactly one company, or explains why it can't
(ambiguous candidates, unlisted, not found) rather than guessing.
"""

from __future__ import annotations

import io
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass, field
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.company import Company, ListingStatus, RawCorpMasterBatch
from app.providers.opendart import RawFetch


@dataclass(frozen=True)
class CompanyCandidate:
    corp_code: str
    corp_name: str
    stock_code: str | None
    listing_status: str


@dataclass(frozen=True)
class ResolveResult:
    matched: bool
    corp_name: str | None = None
    corp_code: str | None = None
    stock_code: str | None = None
    market: str | None = None
    matched_by: str | None = None
    listing_status: str | None = None
    resolved_at: date | None = None
    candidates: list[CompanyCandidate] = field(default_factory=list)
    reason_code: str | None = None


def parse_corp_master_xml(xml_bytes: bytes) -> list[dict[str, str | None]]:
    root = ET.fromstring(xml_bytes)
    rows = []
    for node in root.findall("list"):
        stock_code = (node.findtext("stock_code") or "").strip()
        rows.append(
            {
                "corp_code": node.findtext("corp_code"),
                "corp_name": node.findtext("corp_name"),
                "corp_eng_name": node.findtext("corp_eng_name"),
                "stock_code": stock_code or None,
                "modify_date": node.findtext("modify_date"),
            }
        )
    return rows


def extract_zip_member(zip_bytes: bytes, inner_name: str | None = None) -> bytes:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        name = inner_name or zf.namelist()[0]
        return zf.read(name)


class CompanyResolver:
    def __init__(self, db: Session):
        self._db = db

    def ingest_corp_master(self, fetch: RawFetch) -> int:
        xml_bytes = extract_zip_member(fetch.raw_payload)
        rows = parse_corp_master_xml(xml_bytes)

        batch = RawCorpMasterBatch(
            source_provider="opendart",
            raw_payload=fetch.raw_payload,
            checksum=fetch.checksum,
            record_count=len(rows),
        )
        self._db.add(batch)
        self._db.flush()

        for row in rows:
            corp_code = row["corp_code"]
            corp_name = row["corp_name"]
            modify_date_raw = row["modify_date"]
            if not corp_code or not corp_name or not modify_date_raw:
                # 실제 OpenDART 응답에서는 발생하지 않지만, 필수 필드가 빠진
                # row를 자동으로 채워 넣지 않고 건너뛴다(환각 금지 원칙).
                continue
            modify_date = datetime.strptime(modify_date_raw, "%Y%m%d").date()
            stock_code = row["stock_code"]
            corp_eng_name = row["corp_eng_name"]
            listing_status = ListingStatus.LISTED if stock_code else ListingStatus.UNLISTED
            existing = self._db.get(Company, corp_code)
            if existing is not None:
                existing.corp_name = corp_name
                existing.corp_eng_name = corp_eng_name
                existing.stock_code = stock_code
                existing.listing_status = listing_status
                existing.source_modify_date = modify_date
                existing.source_batch_id = batch.id
            else:
                self._db.add(
                    Company(
                        corp_code=corp_code,
                        corp_name=corp_name,
                        corp_eng_name=corp_eng_name,
                        stock_code=stock_code,
                        listing_status=listing_status,
                        source_modify_date=modify_date,
                        source_batch_id=batch.id,
                    )
                )
        self._db.commit()
        return len(rows)

    def resolve(self, query: str, as_of: date, market: str | None = None) -> ResolveResult:
        query = query.strip()
        if not query:
            return ResolveResult(matched=False, reason_code="EMPTY_QUERY", resolved_at=as_of)

        # market 필터는 KRX 업종/시장 분류 provider가 아직 없어(T03 미결정)
        # 지원하지 않는다 — 조용히 무시하는 대신 명시적으로 안전 종료한다.
        if market is not None:
            return ResolveResult(
                matched=False, reason_code="UNSUPPORTED_MARKET_FILTER", resolved_at=as_of
            )

        if query.isdigit() and len(query) == 6:
            company = self._db.execute(
                select(Company).where(Company.stock_code == query)
            ).scalar_one_or_none()
            if company is None:
                return ResolveResult(matched=False, reason_code="NOT_FOUND", resolved_at=as_of)
            return self._settle(company, "STOCK_CODE_EXACT", as_of)

        exact_matches = list(
            self._db.execute(select(Company).where(Company.corp_name == query)).scalars()
        )
        if len(exact_matches) == 1:
            return self._settle(exact_matches[0], "NAME_EXACT", as_of)
        if len(exact_matches) > 1:
            # 동명 종목이 여럿이면 상장 여부와 무관하게 항상 후보를 반환한다 —
            # "더 그럴듯해 보이는" 상장사를 임의로 자동 확정하지 않는다.
            return ResolveResult(
                matched=False,
                reason_code="AMBIGUOUS",
                resolved_at=as_of,
                candidates=[self._candidate(m) for m in exact_matches],
            )

        fuzzy_matches = list(
            self._db.execute(
                select(Company).where(Company.corp_name.ilike(f"%{query}%")).limit(20)
            ).scalars()
        )
        if len(fuzzy_matches) == 1:
            return self._settle(fuzzy_matches[0], "NAME_FUZZY", as_of)
        if len(fuzzy_matches) > 1:
            return ResolveResult(
                matched=False,
                reason_code="AMBIGUOUS",
                resolved_at=as_of,
                candidates=[self._candidate(m) for m in fuzzy_matches],
            )

        return ResolveResult(matched=False, reason_code="NOT_FOUND", resolved_at=as_of)

    def _settle(self, company: Company, matched_by: str, as_of: date) -> ResolveResult:
        if company.listing_status is ListingStatus.UNLISTED:
            return ResolveResult(
                matched=False,
                corp_name=company.corp_name,
                corp_code=company.corp_code,
                matched_by=matched_by,
                listing_status=company.listing_status.value,
                resolved_at=as_of,
                reason_code="UNLISTED",
            )
        return ResolveResult(
            matched=True,
            corp_name=company.corp_name,
            corp_code=company.corp_code,
            stock_code=company.stock_code,
            market=None,
            matched_by=matched_by,
            listing_status=company.listing_status.value,
            resolved_at=as_of,
        )

    def _candidate(self, company: Company) -> CompanyCandidate:
        return CompanyCandidate(
            corp_code=company.corp_code,
            corp_name=company.corp_name,
            stock_code=company.stock_code,
            listing_status=company.listing_status.value,
        )
