"""S14 외부 근거 수집 — docs/skills.md S14. COLLECT는 versioned deterministic
query-builder로 StructuredClaim에서만 검색어를 만들어 네이버 뉴스 검색 결과를
immutable RawExternalRecord로 저장한다. NORMALIZE는 entity match와 게시 시각을
정규화하지만, 네이버 뉴스 `description`은 기사 산문 요약이므로 여기서 나온 수치를
NumericEvidence로 승격하지 않는다(docs/skills.md S14 제약, CLAUDE.md 절대 원칙 2).

공공데이터포털·KRX 공식 구조화 provider는 자격증명이 없어(docs/prerequisites.md T03)
이 Task에서 provider client를 구현하지 않는다 — `promote_official_numeric_evidence`는
그 provider가 붙었을 때 재사용할 변환 로직만 먼저 준비해 둔 것이고, 호출 시
`OFFICIAL_STRUCTURED_PROVIDERS`가 아닌 출처(네이버 뉴스 등 산문 provider)를 넘기면
즉시 거부한다 — 이 거부가 "산문 수치 미승격"의 실행 가능한 강제 지점이다.
"""

from __future__ import annotations

import email.utils
import re
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from app.models.external_evidence import (
    OFFICIAL_STRUCTURED_PROVIDERS,
    ExternalDocument,
    ExternalSourceProvider,
    RawExternalRecord,
)
from app.providers.naver_news import NaverNewsProvider, checksum_of, stable_json_bytes
from app.schemas.structured_claim import StructuredClaim

QUERY_BUILDER_VERSION = "s14-query-builder-1.0.0"

_HTML_TAG = re.compile(r"<[^>]+>")


def build_news_query(claim: StructuredClaim, company_name: str) -> str:
    """Deterministic, versioned query-builder — 오직 Claim 필드(+회사명, S1
    Company에서 이미 확정된 값)에서만 검색어를 만든다(docs/skills.md "S14 versioned
    deterministic query-builder가 Structured Claim에서만 검색어를 생성"). 같은
    입력은 항상 같은 문자열을 낸다(순서·공백 고정)."""
    parts = [company_name, claim.metric]
    if claim.current_period:
        parts.append(claim.current_period)
    return " ".join(part for part in parts if part)


def _strip_html(text: str) -> str:
    return _HTML_TAG.sub("", text)


@dataclass(frozen=True)
class ExternalNormalizeResult:
    external_documents: list[ExternalDocument] = field(default_factory=list)
    numeric_evidence: list[dict[str, object]] = field(default_factory=list)
    publication_times: list[str] = field(default_factory=list)
    entity_matches: list[dict[str, object]] = field(default_factory=list)
    provider_trace: list[str] = field(default_factory=list)
    trace: list[str] = field(default_factory=list)
    verifiable_status: str = "UNVERIFIABLE"


class ExternalEvidenceCollector:
    def __init__(self, db: Session, naver_provider: NaverNewsProvider):
        self._db = db
        self._naver_provider = naver_provider

    # ---------------------------------------------------------------- COLLECT

    def collect_news(
        self, claim: StructuredClaim, company_name: str, display: int = 10
    ) -> RawExternalRecord:
        query = build_news_query(claim, company_name)
        fetch = self._naver_provider.search_news(query, display=display)
        record = RawExternalRecord(
            source_provider=ExternalSourceProvider.NAVER_NEWS,
            claim_id=claim.claim_id,
            query=query,
            query_builder_version=QUERY_BUILDER_VERSION,
            corp_code=claim.corp_code,
            stock_code=claim.stock_code,
            raw_payload=fetch.raw_payload,
            checksum=fetch.checksum,
        )
        self._db.add(record)
        self._db.commit()
        self._db.refresh(record)
        return record

    # --------------------------------------------------------------- NORMALIZE

    def normalize(
        self, eligible_raw_records: list[RawExternalRecord], company_name: str, as_of: date
    ) -> ExternalNormalizeResult:
        documents: list[ExternalDocument] = []
        publication_times: list[str] = []
        entity_matches: list[dict[str, object]] = []
        provider_trace: list[str] = []
        trace: list[str] = []

        for record in eligible_raw_records:
            if record.source_provider is not ExternalSourceProvider.NAVER_NEWS:
                trace.append(
                    f"{record.raw_record_id}: source_provider {record.source_provider} "
                    "has no NORMALIZE handler yet (공식 구조화 provider 자격증명 미확보)"
                )
                continue
            provider_trace.append(f"naver_news query={record.query!r}")
            items = record.raw_payload.get("items") or []
            for item in items:
                published_at = _parse_pubdate(item.get("pubDate"))
                if published_at is not None and published_at.date() > as_of:
                    trace.append(f"article {item.get('link')}: published_at > as_of, excluded")
                    continue
                title = _strip_html(item.get("title", ""))
                description = _strip_html(item.get("description", ""))
                matched = company_name in title or company_name in description
                checksum = checksum_of(
                    stable_json_bytes(
                        {"title": title, "description": description, "link": item.get("link", "")}
                    )
                )
                existing = self._db.query(ExternalDocument).filter_by(
                    raw_record_id=record.raw_record_id, source_url=item.get("link", "")
                ).one_or_none()
                if existing is None:
                    existing = ExternalDocument(
                        source_provider=record.source_provider,
                        corp_code=record.corp_code,
                        stock_code=record.stock_code,
                        title=title,
                        description=description,
                        source_url=item.get("link", ""),
                        # 네이버 뉴스 검색 API는 기사 수정 시각을 제공하지 않는다 —
                        # revised_at은 항상 NULL(문서화된 provider 한계, 임의 추정 금지).
                        published_at=published_at,
                        revised_at=None,
                        entity_matched=matched,
                        entity_match_text=company_name if matched else None,
                        checksum=checksum,
                        raw_record_id=record.raw_record_id,
                    )
                    self._db.add(existing)
                documents.append(existing)
                if published_at is not None:
                    publication_times.append(published_at.isoformat())
                entity_matches.append(
                    {
                        "source_url": item.get("link", ""),
                        "matched": matched,
                        "matched_text": company_name if matched else None,
                    }
                )
        self._db.commit()

        # 산문(네이버 뉴스) 출처에서 numeric_evidence를 만들지 않는다 — 이 리스트는
        # 항상 비어 있고, 공식 구조화 provider가 붙기 전까지는 그럴 수밖에 없다
        # (docs/skills.md S14 제약).
        numeric_evidence: list[dict[str, object]] = []

        any_matched = any(d.entity_matched for d in documents)
        verifiable_status = "SOURCE_AVAILABLE" if any_matched else "UNVERIFIABLE"
        if not documents:
            trace.append("no external documents collected — UNVERIFIABLE (뉴스·테마 원천 부재)")

        return ExternalNormalizeResult(
            external_documents=documents,
            numeric_evidence=numeric_evidence,
            publication_times=publication_times,
            entity_matches=entity_matches,
            provider_trace=provider_trace,
            trace=trace,
            verifiable_status=verifiable_status,
        )


def promote_official_numeric_evidence(
    record: RawExternalRecord,
    field_map: dict[str, tuple[str, str]],
    as_of: date,
) -> list[dict[str, object]]:
    """공식 구조화 provider(공공데이터포털/KRX)의 raw_payload에서 지정한 필드만
    결정론적으로 NumericEvidence로 변환한다. `field_map`은 {payload_key: (metric,
    unit)}. 네이버 뉴스 같은 산문 provider의 record가 들어오면 즉시 거부한다 — 이
    거부 자체가 "산문 수치 미승격" 제약의 실행 지점이다."""
    if record.source_provider not in OFFICIAL_STRUCTURED_PROVIDERS:
        raise ValueError(
            f"promote_official_numeric_evidence: {record.source_provider} is not an official "
            "structured provider — prose-derived numbers must not be promoted to NumericEvidence "
            "(docs/skills.md S14 제약)"
        )
    evidence: list[dict[str, object]] = []
    for payload_key, (metric, unit) in field_map.items():
        value = record.raw_payload.get(payload_key)
        if value is None:
            continue
        evidence.append(
            {
                "numeric_evidence_id": str(uuid.uuid4()),
                "evidence_domain": "flow",
                "corp_code": record.corp_code,
                "metric": metric,
                "value": float(value),
                "unit": unit,
                "target_period": record.query,
                "as_of": as_of.isoformat(),
                "source_ids": [str(record.raw_record_id)],
                "provenance": {"provider": record.source_provider.value},
                "integrity_status": "VERIFIED",
            }
        )
    return evidence


def _parse_pubdate(raw: str | None) -> datetime | None:
    if not raw:
        return None
    parsed = email.utils.parsedate_to_datetime(raw)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed
