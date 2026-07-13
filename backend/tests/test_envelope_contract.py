import json
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.schemas.envelope import ENVELOPE_SCHEMA_VERSION, Envelope, Status, now_utc

TIMESTAMP_FIXTURE_PATH = (
    Path(__file__).resolve().parents[2] / "contracts" / "fixtures" / "timestamps.json"
)
TIMESTAMP_FIXTURES = json.loads(TIMESTAMP_FIXTURE_PATH.read_text())


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


@pytest.mark.parametrize("value", TIMESTAMP_FIXTURES["valid"])
def test_accepts_cross_runtime_valid_timestamp(value: str) -> None:
    # contracts/fixtures/timestamps.json은 contracts/envelope.test.js도 그대로
    # 읽는다 — 같은 입력에 JS/Python Envelope가 동일하게 판정하는지가 목적
    # (docs/skills.md RFC3339 계약, 2026-07-12 23:51 리뷰).
    envelope = Envelope[dict[str, bool]](**_base_kwargs(started_at=value))
    assert envelope.started_at.isoformat() is not None


@pytest.mark.parametrize("value", TIMESTAMP_FIXTURES["invalid"])
def test_rejects_cross_runtime_invalid_timestamp(value: str) -> None:
    with pytest.raises(ValidationError):
        Envelope[dict[str, bool]](**_base_kwargs(started_at=value))
