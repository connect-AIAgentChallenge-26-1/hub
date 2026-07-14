"""S2 Disclosure Collector — docs/skills.md S2. COLLECT stores OpenDART
responses as immutable RawDisclosureRecord; NORMALIZE turns eligible raw
records into disclosures / eligible_financial_rows / document_chunks /
document_evidence / correction_chains, matching the discriminated union
input contract `{operation: NORMALIZE, eligible_raw_disclosure_records, ...}`.

T04에서 S15(app/services/temporal_integrity.py)가 생기면서 `filed_at <= as_of`
차단은 이제 이 파일의 inline 규칙이 아니라 `temporal_integrity.pre_normalize()`
호출로 중앙화됐다(과거 주석이 예고했던 교체). correction-chain 선택은 여전히
이 파일(disclosure 도메인 고유 정책)이 맡고, CFS/OFS 선택 정책은
app/services/financial_calculator.py(S3)가 맡는다.
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.disclosure import (
    CorrectionChain,
    Disclosure,
    DocumentChunk,
    FinancialFactRow,
    ProviderCacheEntry,
    RawDisclosureRecord,
    RawRecordType,
    ReportType,
)
from app.providers.opendart import OpenDartProvider, RawFetch, checksum_of, stable_json_bytes
from app.services.temporal_integrity import TemporalCandidate, pre_normalize

CORRECTION_BRACKET = re.compile(r"^\[[^\]]*정정[^\]]*\]\s*")

_CACHE_TTL = {
    RawRecordType.DISCLOSURE_LIST_ITEM: timedelta(hours=1),
    RawRecordType.FINANCIAL_STATEMENT_ROW: timedelta(hours=24),
    RawRecordType.DOCUMENT_FILE: timedelta(days=7),
}


def strip_correction_bracket(report_nm: str) -> tuple[str, bool]:
    match = CORRECTION_BRACKET.match(report_nm)
    if match:
        return report_nm[match.end() :], True
    return report_nm, False


def classify_report_type(report_nm: str) -> ReportType:
    base_name, _ = strip_correction_bracket(report_nm)
    if "3분기보고서" in base_name:
        return ReportType.Q3
    if "1분기보고서" in base_name:
        return ReportType.Q1
    if "반기보고서" in base_name:
        return ReportType.HALF
    if "사업보고서" in base_name:
        return ReportType.ANNUAL
    return ReportType.OTHER


def _cache_key(provider: str, path: str, params: dict[str, object]) -> str:
    canonical = json.dumps({"provider": provider, "path": path, "params": params}, sort_keys=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class NormalizeResult:
    disclosures: list[Disclosure] = field(default_factory=list)
    eligible_financial_rows: list[FinancialFactRow] = field(default_factory=list)
    document_chunks: list[DocumentChunk] = field(default_factory=list)
    document_evidence: list[dict[str, object]] = field(default_factory=list)
    correction_chains: list[CorrectionChain] = field(default_factory=list)
    trace: list[str] = field(default_factory=list)


class DisclosureCollector:
    def __init__(self, db: Session, provider: OpenDartProvider):
        self._db = db
        self._provider = provider

    # ---------------------------------------------------------------- COLLECT

    def _cached_or_fetch(
        self,
        record_type: RawRecordType,
        path: str,
        params: dict[str, object],
        fetch_fn: Callable[[], RawFetch],
    ) -> RawFetch:
        key = _cache_key("opendart", path, params)
        entry = self._db.get(ProviderCacheEntry, key)
        now = datetime.now(UTC)
        if entry is not None and entry.expires_at > now:
            payload = entry.response_json
            # 원본 fetch(opendart.py fetch_disclosure_list/fetch_financial_statements)와
            # 동일한 canonical 직렬화(stable_json_bytes)를 써야 같은 내용이 같은
            # checksum을 낸다 — ensure_ascii 기본값 차이로 한글 payload의 checksum이
            # 캐시 hit마다 달라지던 결함이 있었다.
            payload_checksum = checksum_of(stable_json_bytes(payload))
            return RawFetch(raw_payload=payload, checksum=payload_checksum)

        fetch = fetch_fn()
        if isinstance(fetch.raw_payload, dict):
            ttl = _CACHE_TTL[record_type]
            if entry is not None:
                entry.response_json = fetch.raw_payload
                entry.fetched_at = now
                entry.expires_at = now + ttl
            else:
                self._db.add(
                    ProviderCacheEntry(
                        cache_key=key,
                        source_provider="opendart",
                        response_json=fetch.raw_payload,
                        expires_at=now + ttl,
                    )
                )
            self._db.commit()
        return fetch

    def collect_disclosure_list(
        self, corp_code: str, bgn_de: str, end_de: str, page_no: int = 1, page_count: int = 100
    ) -> RawDisclosureRecord:
        params: dict[str, object] = {
            "corp_code": corp_code,
            "bgn_de": bgn_de,
            "end_de": end_de,
            "page_no": page_no,
            "page_count": page_count,
        }
        fetch = self._cached_or_fetch(
            RawRecordType.DISCLOSURE_LIST_ITEM,
            "list.json",
            params,
            lambda: self._provider.fetch_disclosure_list(
                corp_code, bgn_de, end_de, page_no, page_count
            ),
        )
        record = RawDisclosureRecord(
            source_provider="opendart",
            record_type=RawRecordType.DISCLOSURE_LIST_ITEM,
            corp_code=corp_code,
            raw_payload=fetch.raw_payload,
            checksum=fetch.checksum,
        )
        self._db.add(record)
        self._db.commit()
        self._db.refresh(record)
        return record

    def collect_financial_statements(
        self, corp_code: str, bsns_year: str, reprt_code: str, fs_div: str
    ) -> RawDisclosureRecord:
        params: dict[str, object] = {
            "corp_code": corp_code,
            "bsns_year": bsns_year,
            "reprt_code": reprt_code,
            "fs_div": fs_div,
        }
        fetch = self._cached_or_fetch(
            RawRecordType.FINANCIAL_STATEMENT_ROW,
            "fnlttSinglAcntAll.json",
            params,
            lambda: self._provider.fetch_financial_statements(
                corp_code, bsns_year, reprt_code, fs_div
            ),
        )
        record = RawDisclosureRecord(
            source_provider="opendart",
            record_type=RawRecordType.FINANCIAL_STATEMENT_ROW,
            corp_code=corp_code,
            target_period=f"{bsns_year}-{reprt_code}-{fs_div}",
            raw_payload=fetch.raw_payload,
            checksum=fetch.checksum,
        )
        self._db.add(record)
        self._db.commit()
        self._db.refresh(record)
        return record

    def collect_document(self, rcept_no: str, corp_code: str) -> RawDisclosureRecord:
        # document.xml zip bytes aren't JSON-serializable — base64-encode for
        # the JSONB raw_payload column and for the cache table. Not cached by
        # default (documents rarely re-requested; TTL kept short-lived below
        # if ever reused).
        fetch = self._provider.fetch_document(rcept_no)
        payload = {"zip_base64": base64.b64encode(fetch.raw_payload).decode("ascii")}
        record = RawDisclosureRecord(
            source_provider="opendart",
            record_type=RawRecordType.DOCUMENT_FILE,
            corp_code=corp_code,
            source_native_id=rcept_no,
            raw_payload=payload,
            checksum=fetch.checksum,
        )
        self._db.add(record)
        self._db.commit()
        self._db.refresh(record)
        return record

    # --------------------------------------------------------------- NORMALIZE

    def normalize(
        self, eligible_raw_records: list[RawDisclosureRecord], as_of: date
    ) -> NormalizeResult:
        disclosures: list[Disclosure] = []
        financial_rows: list[FinancialFactRow] = []
        document_chunks: list[DocumentChunk] = []
        trace: list[str] = []

        for record in eligible_raw_records:
            if record.record_type is RawRecordType.DISCLOSURE_LIST_ITEM:
                disclosures.extend(self._normalize_disclosure_list(record, as_of, trace))
            elif record.record_type is RawRecordType.FINANCIAL_STATEMENT_ROW:
                financial_rows.extend(self._normalize_financial_rows(record, as_of, trace))
            elif record.record_type is RawRecordType.DOCUMENT_FILE:
                document_chunks.extend(self._normalize_document(record))

        correction_chains = self._resolve_correction_chains(disclosures)
        document_evidence = [self._chunk_as_evidence(c) for c in document_chunks]

        return NormalizeResult(
            disclosures=disclosures,
            eligible_financial_rows=financial_rows,
            document_chunks=document_chunks,
            document_evidence=document_evidence,
            correction_chains=correction_chains,
            trace=trace,
        )

    def _normalize_disclosure_list(
        self, record: RawDisclosureRecord, as_of: date, trace: list[str]
    ) -> list[Disclosure]:
        items = record.raw_payload.get("list") or []
        items_by_id = {item["rcept_no"]: item for item in items}
        candidates = [
            TemporalCandidate(
                record_id=item["rcept_no"],
                effective_date=datetime.strptime(item["rcept_dt"], "%Y%m%d").date(),
                source_type="disclosure",
                corp_code=item.get("corp_code"),
            )
            for item in items
        ]
        pre_normalize_result = pre_normalize(candidates, as_of)
        trace.extend(pre_normalize_result.integrity_log)

        results = []
        for candidate in pre_normalize_result.eligible:
            item = items_by_id[candidate.record_id]
            rcept_no = item["rcept_no"]
            filed_at = candidate.effective_date
            report_nm = item["report_nm"]
            _, is_correction = strip_correction_bracket(report_nm)
            existing = self._db.get(Disclosure, rcept_no)
            if existing is not None:
                results.append(existing)
                continue
            disclosure = Disclosure(
                rcept_no=rcept_no,
                corp_code=item["corp_code"],
                report_nm=report_nm,
                filed_at=filed_at,
                flr_nm=item.get("flr_nm"),
                corp_cls=item.get("corp_cls"),
                remark=item.get("rm"),
                report_type=classify_report_type(report_nm),
                is_correction=is_correction,
                raw_record_id=record.raw_record_id,
            )
            self._db.add(disclosure)
            results.append(disclosure)
        self._db.commit()
        return results

    def _normalize_financial_rows(
        self, record: RawDisclosureRecord, as_of: date, trace: list[str]
    ) -> list[FinancialFactRow]:
        items = record.raw_payload.get("list") or []
        # fs_div is a query parameter, not echoed per-row by fnlttSinglAcntAll.
        fs_div = (record.target_period or "").split("-")[-1] or "CFS"
        # rcept_no repeats across rows (one per account line), so the candidate
        # id needs the row index to stay unique per row.
        items_by_id = {f"{row['rcept_no']}#{i}": row for i, row in enumerate(items)}
        candidates = [
            TemporalCandidate(
                record_id=candidate_id,
                # OpenDART rcept_no's leading 8 digits are the filing (submission)
                # date — the same convention used to order correction chains.
                effective_date=datetime.strptime(row["rcept_no"][:8], "%Y%m%d").date(),
                source_type="disclosure",
                corp_code=row.get("corp_code"),
            )
            for candidate_id, row in items_by_id.items()
        ]
        pre_normalize_result = pre_normalize(candidates, as_of)
        trace.extend(pre_normalize_result.integrity_log)

        results = []
        for candidate in pre_normalize_result.eligible:
            row = items_by_id[candidate.record_id]
            rcept_no = row["rcept_no"]
            filed_at = candidate.effective_date
            is_eligible = True
            existing = self._db.execute(
                select(FinancialFactRow).where(
                    FinancialFactRow.rcept_no == rcept_no,
                    FinancialFactRow.fs_div == fs_div,
                    FinancialFactRow.account_id == row["account_id"],
                    FinancialFactRow.sj_div == row["sj_div"],
                    FinancialFactRow.account_detail == row.get("account_detail"),
                )
            ).scalar_one_or_none()
            if existing is not None:
                results.append(existing)
                continue
            fact_row = FinancialFactRow(
                rcept_no=rcept_no,
                corp_code=row["corp_code"],
                bsns_year=row["bsns_year"],
                reprt_code=row["reprt_code"],
                fs_div=fs_div,
                sj_div=row["sj_div"],
                sj_nm=row["sj_nm"],
                account_id=row["account_id"],
                account_nm=row["account_nm"],
                account_detail=row.get("account_detail"),
                thstrm_nm=row.get("thstrm_nm"),
                thstrm_amount=row.get("thstrm_amount"),
                # annual 보고서는 이 필드가 빈 문자열로 온다 — "" 그대로 저장하면
                # 나중에 "값이 있다"로 오독될 수 있어 None으로 정규화한다.
                thstrm_add_amount=row.get("thstrm_add_amount") or None,
                frmtrm_nm=row.get("frmtrm_nm"),
                frmtrm_amount=row.get("frmtrm_amount"),
                bfefrmtrm_nm=row.get("bfefrmtrm_nm"),
                bfefrmtrm_amount=row.get("bfefrmtrm_amount"),
                ord=row.get("ord"),
                currency=row.get("currency"),
                filed_at=filed_at,
                is_eligible=is_eligible,
                raw_record_id=record.raw_record_id,
            )
            self._db.add(fact_row)
            results.append(fact_row)
        self._db.commit()
        return results

    def _normalize_document(
        self, record: RawDisclosureRecord, max_chars: int = 1000
    ) -> list[DocumentChunk]:
        import io
        import zipfile

        zip_bytes = base64.b64decode(record.raw_payload["zip_base64"])
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            xml_bytes = zf.read(zf.namelist()[0])

        text = _flatten_document_text(xml_bytes)
        rcept_no = record.source_native_id
        existing_chunks = self._db.execute(
            select(DocumentChunk).where(DocumentChunk.rcept_no == rcept_no)
        ).scalars().all()
        if existing_chunks:
            return list(existing_chunks)

        chunks = []
        if text:
            chunk_texts = [text[i : i + max_chars] for i in range(0, len(text), max_chars)]
        else:
            chunk_texts = [""]
        for index, chunk_text in enumerate(chunk_texts):
            chunk = DocumentChunk(
                rcept_no=rcept_no,
                corp_code=record.corp_code,
                chunk_index=index,
                quote=chunk_text,
                chunk_offset=index * max_chars,
                filed_at=record.published_at or record.collected_at.date(),
                raw_record_id=record.raw_record_id,
            )
            self._db.add(chunk)
            chunks.append(chunk)
        self._db.commit()
        return chunks

    def _chunk_as_evidence(self, chunk: DocumentChunk) -> dict[str, object]:
        # docs/skills.md Evidence: 기능 A는 presentation_item_id + relation=NEUTRAL.
        return {
            "evidence_id": str(chunk.presentation_item_id),
            "corp_code": chunk.corp_code,
            "presentation_item_id": str(chunk.presentation_item_id),
            "evidence_type": "DISCLOSURE_DOCUMENT_CHUNK",
            "document_id": chunk.rcept_no,
            "rcept_no": chunk.rcept_no,
            "filed_at": chunk.filed_at.isoformat(),
            "target_period": chunk.target_period,
            "source_url": f"https://opendart.fss.or.kr/api/document.xml?rcept_no={chunk.rcept_no}",
            "quote": chunk.quote,
            "chunk_offset": chunk.chunk_offset,
            "relation": "NEUTRAL",
            "relation_reason": "기업 리포트 원문 provenance",
            "relation_rule_version": "s2-document-evidence-1.0.0",
            "integrity_status": chunk.integrity_status,
        }

    def _resolve_correction_chains(self, disclosures: list[Disclosure]) -> list[CorrectionChain]:
        by_corp: dict[str, list[Disclosure]] = {}
        for d in disclosures:
            by_corp.setdefault(d.corp_code, []).append(d)

        chains: list[CorrectionChain] = []
        for corp_code, group in by_corp.items():
            ordered = sorted(group, key=lambda d: d.rcept_no)
            for d in ordered:
                if not d.is_correction:
                    continue
                base_name, _ = strip_correction_bracket(d.report_nm)
                candidates = [
                    o
                    for o in ordered
                    if o.rcept_no < d.rcept_no
                    and not o.is_correction
                    and strip_correction_bracket(o.report_nm)[0] == base_name
                ]
                if not candidates:
                    continue
                original = max(candidates, key=lambda o: o.rcept_no)
                existing = self._db.execute(
                    select(CorrectionChain).where(
                        CorrectionChain.correction_rcept_no == d.rcept_no
                    )
                ).scalar_one_or_none()
                if existing is not None:
                    chains.append(existing)
                    continue
                chain = CorrectionChain(
                    corp_code=corp_code,
                    original_rcept_no=original.rcept_no,
                    correction_rcept_no=d.rcept_no,
                    matched_by="BASE_REPORT_NAME_MATCH",
                )
                self._db.add(chain)
                chains.append(chain)
        self._db.commit()
        return chains


def _flatten_document_text(xml_bytes: bytes) -> str:
    """Extracts plain text from DART's proprietary DOCUMENT/SECTION/TABLE XML
    markup by walking every node's text content. This is a simplification —
    it loses table structure — documented as an accepted limitation rather
    than a silent gap (chunking still preserves an offset per chunk)."""
    root = ET.fromstring(xml_bytes)
    parts: list[str] = []

    def walk(node: ET.Element) -> None:
        if node.text and node.text.strip():
            parts.append(node.text.strip())
        for child in node:
            walk(child)
            if child.tail and child.tail.strip():
                parts.append(child.tail.strip())

    walk(root)
    return " ".join(parts)
