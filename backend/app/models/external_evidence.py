"""S14 외부 근거 수집 (docs/skills.md S14). provider allowlist는 3개
(공공데이터포털/KRX 공식 구조화 provider 2개 + 네이버 뉴스 검색) 이지만, 공공데이터포털·
KRX는 자격증명이 아직 없다 — `docs/prerequisites.md` T03에 등록된 BLOCKED 항목이며
`ExternalSourceProvider`에 값은 정의해 allowlist 계약은 완성하되 실제 COLLECT
provider client는 이 Task에서 구현하지 않는다(임의로 만든 응답을 실 데이터처럼 쓰지
않기 위함, CLAUDE.md 절대 원칙 2)."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ExternalSourceProvider(str, enum.Enum):
    NAVER_NEWS = "naver_news"
    DATA_GO_KR = "data_go_kr"  # allowlisted, provider client BLOCKED (자격증명 없음)
    KRX_OFFICIAL = "krx_official"  # allowlisted, provider client BLOCKED (자격증명 없음)


# 이 3개 외 출처는 COLLECT 대상이 아니다(docs/skills.md S14 "provider allowlist").
OFFICIAL_STRUCTURED_PROVIDERS = frozenset(
    {ExternalSourceProvider.DATA_GO_KR, ExternalSourceProvider.KRX_OFFICIAL}
)


class RawExternalRecord(Base):
    """Immutable provider snapshot (docs/skills.md RawExternalRecord 등가).
    `query`는 versioned query-builder가 Claim에서 만든 검색어 그대로 보존한다."""

    __tablename__ = "raw_external_records"

    raw_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    source_provider: Mapped[ExternalSourceProvider] = mapped_column(
        Enum(ExternalSourceProvider, name="external_source_provider"), nullable=False
    )
    claim_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    query: Mapped[str] = mapped_column(String(500), nullable=False)
    query_builder_version: Mapped[str] = mapped_column(String(50), nullable=False)
    corp_code: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    stock_code: Mapped[str] = mapped_column(String(6), nullable=False)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ExternalDocument(Base):
    """S14 NORMALIZE `external_documents` — provider 원문 기사 1건 = 1행.
    `revised_at`는 네이버 뉴스 검색 API가 수정 시각을 제공하지 않아 항상 NULL이다
    (문서화된 provider 한계 — 존재하지 않는 값을 임의로 채우지 않는다, CLAUDE.md
    절대 원칙 2)."""

    __tablename__ = "external_documents"
    __table_args__ = (
        UniqueConstraint("raw_record_id", "source_url", name="uq_external_document"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    source_provider: Mapped[ExternalSourceProvider] = mapped_column(
        Enum(ExternalSourceProvider, name="external_source_provider"), nullable=False
    )
    corp_code: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    stock_code: Mapped[str] = mapped_column(String(6), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revised_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    entity_matched: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    entity_match_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    raw_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("raw_external_records.raw_record_id"), nullable=False
    )
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
