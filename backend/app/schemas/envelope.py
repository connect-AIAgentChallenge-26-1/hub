"""Envelope<T> contract — Python mirror of contracts/envelope.js and
docs/skills.md "공통 데이터 계약". Both sides must be updated together
(docs/skills.md "스키마 버전·migration 정책": 문서 먼저, 코드 동기화).
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from enum import Enum
from typing import Generic, TypeVar

from pydantic import BaseModel, Field

ENVELOPE_SCHEMA_VERSION = "1.0.0"

T = TypeVar("T")


class Status(str, Enum):
    SUCCESS = "SUCCESS"
    PARTIAL_SUCCESS = "PARTIAL_SUCCESS"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR"
    AUTHORIZATION_ERROR = "AUTHORIZATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    CONFLICT = "CONFLICT"
    RATE_LIMITED = "RATE_LIMITED"
    EXTERNAL_ERROR = "EXTERNAL_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"


NON_ERROR_STATUS = {Status.SUCCESS, Status.PARTIAL_SUCCESS}


class Envelope(BaseModel, Generic[T]):
    schema_version: str = ENVELOPE_SCHEMA_VERSION
    request_id: str
    trace_id: str
    as_of: date
    status: Status
    reason_code: str | None = None
    warnings: list[str] = Field(default_factory=list)
    source_provider: str | None = None
    # docs/skills.md에서 source_ids[]는 ?가 없는 필수 필드다. 외부 출처가 없는
    # 응답도 빈 배열을 명시적으로 넣어야 하며 생략을 허용하지 않는다.
    source_ids: list[str]
    model_or_rule_version: str
    started_at: datetime
    completed_at: datetime
    data: T | None = None

    def model_post_init(self, __context: object) -> None:
        if self.status not in NON_ERROR_STATUS and not self.reason_code:
            raise ValueError(
                "reason_code is required when status is not SUCCESS/PARTIAL_SUCCESS"
            )


def new_ids() -> tuple[str, str]:
    """Generates a fresh (request_id, trace_id) pair for a new request."""
    return str(uuid.uuid4()), str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.now(UTC)
