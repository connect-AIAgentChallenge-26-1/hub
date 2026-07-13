"""Test doubles for OpenDartProvider — replays real captured fixtures
(backend/tests/fixtures/opendart/) through an httpx.MockTransport instead of
calling the live API. Each test controls its own response queue so
retry/error-mapping behavior can be exercised deterministically."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "opendart"


def load_bytes(name: str) -> bytes:
    return (FIXTURES_DIR / name).read_bytes()


def load_json(name: str) -> dict[str, Any]:
    result: dict[str, Any] = json.loads(load_bytes(name))
    return result


def load_error(key: str) -> dict[str, Any]:
    errors = load_json("error_responses.json")
    return dict(errors[key])


def json_response(payload: dict[str, Any], status_code: int = 200) -> httpx.Response:
    return httpx.Response(status_code, json=payload)


def xml_error_response(status: str, message: str, status_code: int = 200) -> httpx.Response:
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f"<result><status>{status}</status><message>{message}</message></result>"
    )
    return httpx.Response(status_code, content=body.encode("utf-8"))


def zip_response(zip_bytes: bytes, status_code: int = 200) -> httpx.Response:
    return httpx.Response(status_code, content=zip_bytes)


class QueueTransport(httpx.BaseTransport):
    """Pops one canned response (or raises one canned exception) per request,
    in the order given. Raises if more requests happen than were queued —
    a test that expects N calls should queue exactly N items."""

    def __init__(self, responses: list[httpx.Response | Exception]):
        self._responses = list(responses)
        self.call_count = 0

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.call_count += 1
        if not self._responses:
            raise AssertionError(
                f"QueueTransport received an unexpected {self.call_count}th request: {request.url}"
            )
        item = self._responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def client_with_responses(
    responses: list[httpx.Response | Exception],
) -> tuple[httpx.Client, QueueTransport]:
    transport = QueueTransport(responses)
    client = httpx.Client(transport=transport)
    return client, transport
