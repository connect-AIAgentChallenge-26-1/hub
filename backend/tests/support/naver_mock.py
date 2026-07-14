"""Test doubles for NaverNewsProvider — replays real captured fixtures
(backend/tests/fixtures/naver/, captured live 2026-07-14)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from tests.support.opendart_mock import QueueTransport, client_with_responses, json_response

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "naver"

__all__ = ["QueueTransport", "client_with_responses", "json_response", "load_json"]


def load_json(name: str) -> dict[str, Any]:
    result: dict[str, Any] = json.loads((FIXTURES_DIR / name).read_bytes())
    return result
