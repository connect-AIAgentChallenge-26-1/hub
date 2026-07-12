from datetime import date
from typing import Any

import pytest
from pydantic import ValidationError

from app.schemas.envelope import ENVELOPE_SCHEMA_VERSION, Envelope, Status, now_utc


def _base_kwargs(**overrides: Any) -> dict[str, Any]:
    started_at = now_utc()
    kwargs: dict[str, Any] = dict(
        request_id="req-1",
        trace_id="trace-1",
        as_of=date(2026, 7, 12),
        status=Status.SUCCESS,
        source_ids=[],
        model_or_rule_version="rule-1.0.0",
        started_at=started_at,
        completed_at=now_utc(),
    )
    kwargs.update(overrides)
    return kwargs


def test_success_envelope_uses_default_schema_version() -> None:
    envelope = Envelope[dict[str, bool]](**_base_kwargs(data={"ok": True}))
    assert envelope.schema_version == ENVELOPE_SCHEMA_VERSION
    assert envelope.warnings == []


def test_error_status_requires_reason_code() -> None:
    with pytest.raises(ValidationError):
        Envelope[dict[str, bool]](**_base_kwargs(status=Status.EXTERNAL_ERROR))


def test_error_status_with_reason_code_is_valid() -> None:
    envelope = Envelope[dict[str, bool]](
        **_base_kwargs(status=Status.EXTERNAL_ERROR, reason_code="PROVIDER_TIMEOUT")
    )
    assert envelope.reason_code == "PROVIDER_TIMEOUT"


def test_status_rejects_value_outside_enum() -> None:
    with pytest.raises(ValidationError):
        Envelope[dict[str, bool]](**_base_kwargs(status="OK"))


def test_source_ids_is_required_not_defaulted() -> None:
    # docs/skills.md: source_ids[]는 필수 필드다. 생략하면 자동으로 []가
    # 채워지는 것이 아니라 ValidationError여야 한다.
    kwargs = _base_kwargs()
    del kwargs["source_ids"]
    with pytest.raises(ValidationError):
        Envelope[dict[str, bool]](**kwargs)
