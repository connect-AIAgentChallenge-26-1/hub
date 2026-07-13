"""OpenDART provider (S1 corp master + S2 disclosure/financial/document
collection). Implements the RawSourceProvider interface from
app/providers/base.py — see that module for the shared error taxonomy.

Two response shapes exist depending on endpoint family (reverse-engineered
from live calls, 2026-07-13 — see backend/tests/fixtures/opendart/error_responses.json):
  - JSON endpoints (list.json, fnlttSinglAcntAll.json): body is always JSON
    with a `status`/`message` field; `list` is present only when status=="000".
  - File endpoints (corpCode.xml, document.xml): success is a zip binary
    (magic bytes "PK"); failure is XML `<result><status/><message/></result>`.
"""

from __future__ import annotations

import hashlib
import json
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.providers.base import (
    ProviderAuthError,
    ProviderMaintenanceError,
    ProviderNotFoundError,
    ProviderRateLimitedError,
    ProviderTimeoutError,
    RawSourceProvider,
)

DART_BASE_URL = "https://opendart.fss.or.kr/api"

# DART status code -> our ProviderError taxonomy. Anything not listed here
# (and not "000") falls through to ProviderMaintenanceError with the raw
# status preserved in the message — an "unexpected provider-side state" we
# haven't specifically categorized, rather than silently treated as success.
_STATUS_TO_ERROR: dict[str, type[Exception]] = {
    "010": ProviderAuthError,
    "011": ProviderAuthError,
    "012": ProviderAuthError,
    "013": ProviderNotFoundError,
    "014": ProviderNotFoundError,
    "020": ProviderRateLimitedError,
}

_RETRYABLE_EXCEPTIONS = (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError)


def _raise_for_status_code(status: str, message: str) -> None:
    if status == "000":
        return
    error_cls = _STATUS_TO_ERROR.get(status)
    if error_cls is not None:
        raise error_cls(f"OpenDART {status}: {message}")
    raise ProviderMaintenanceError(f"OpenDART unexpected status {status}: {message}")


def checksum_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def stable_json_bytes(data: dict[str, Any]) -> bytes:
    """Canonical JSON encoding for checksums. `ensure_ascii=False` matters —
    OpenDART payloads are Korean, and the ASCII-escaped and non-escaped forms
    of the same dict hash to different checksums. Any caller that recomputes
    a checksum for the *same* payload (e.g. a cache-hit path) must use this
    exact function, not a fresh `json.dumps(...)` call, or the checksum drifts
    even though the content is unchanged."""
    return json.dumps(data, sort_keys=True, ensure_ascii=False).encode("utf-8")


@dataclass(frozen=True)
class RawFetch:
    """One provider call's raw result, ready to become a RawDisclosureRecord/
    RawSourceRecord (docs/skills.md). `raw_payload` is JSON-serializable
    (dict for JSON endpoints, {"zip_base64": ...} handled by the caller for
    file endpoints — kept as raw bytes here, caller decides encoding)."""

    raw_payload: Any
    checksum: str


class OpenDartProvider(RawSourceProvider):
    source_provider = "opendart"

    def __init__(
        self, api_key: str, client: httpx.Client | None = None, timeout: float = 10.0
    ) -> None:
        self._api_key = api_key
        self._client = client or httpx.Client(timeout=timeout)
        self._owns_client = client is None

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> OpenDartProvider:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    @retry(
        # tenacity must match ProviderTimeoutError, not the raw httpx
        # exceptions below — each attempt converts httpx's exception to
        # ProviderTimeoutError *before* re-raising, so that is the type that
        # actually propagates out of this function on a failed attempt.
        retry=retry_if_exception_type(ProviderTimeoutError),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, max=4),
        reraise=True,
    )
    def _request(self, path: str, params: dict[str, Any]) -> httpx.Response:
        # Network-level failures (timeout/connection reset) are retried with
        # backoff up to 3 attempts — but rate-limit/auth/no-data are business
        # responses (HTTP 200 with a status field), never retried here.
        try:
            return self._client.get(
                f"{DART_BASE_URL}/{path}", params={**params, "crtfc_key": self._api_key}
            )
        except _RETRYABLE_EXCEPTIONS as exc:
            raise ProviderTimeoutError(f"OpenDART network error calling {path}: {exc}") from exc

    def _get_json(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        response = self._request(path, params)
        data: dict[str, Any] = response.json()
        _raise_for_status_code(data.get("status", ""), data.get("message", ""))
        return data

    def _get_file(self, path: str, params: dict[str, Any]) -> bytes:
        response = self._request(path, params)
        content = response.content
        if content.startswith(b"PK"):
            return content
        # Not a zip -> the XML error envelope this endpoint family uses.
        try:
            root = ET.fromstring(content)
            status = root.findtext("status", default="")
            message = root.findtext("message", default="")
        except ET.ParseError as exc:
            raise ProviderMaintenanceError(
                f"OpenDART {path} returned neither a zip nor a parseable error body"
            ) from exc
        _raise_for_status_code(status, message)
        # status was "000" but body still isn't a zip — genuinely unexpected.
        raise ProviderMaintenanceError(f"OpenDART {path} returned status=000 without a zip body")

    def fetch_corp_code_master(self) -> RawFetch:
        content = self._get_file("corpCode.xml", {})
        return RawFetch(raw_payload=content, checksum=checksum_of(content))

    def fetch_disclosure_list(
        self,
        corp_code: str,
        bgn_de: str,
        end_de: str,
        page_no: int = 1,
        page_count: int = 100,
    ) -> RawFetch:
        data = self._get_json(
            "list.json",
            {
                "corp_code": corp_code,
                "bgn_de": bgn_de,
                "end_de": end_de,
                "page_no": page_no,
                "page_count": page_count,
            },
        )
        payload_bytes = stable_json_bytes(data)
        return RawFetch(raw_payload=data, checksum=checksum_of(payload_bytes))

    def fetch_financial_statements(
        self, corp_code: str, bsns_year: str, reprt_code: str, fs_div: str
    ) -> RawFetch:
        data = self._get_json(
            "fnlttSinglAcntAll.json",
            {
                "corp_code": corp_code,
                "bsns_year": bsns_year,
                "reprt_code": reprt_code,
                "fs_div": fs_div,
            },
        )
        payload_bytes = stable_json_bytes(data)
        return RawFetch(raw_payload=data, checksum=checksum_of(payload_bytes))

    def fetch_document(self, rcept_no: str) -> RawFetch:
        content = self._get_file("document.xml", {"rcept_no": rcept_no})
        return RawFetch(raw_payload=content, checksum=checksum_of(content))

    def collect(self, **query: Any) -> list[dict[str, Any]]:
        """RawSourceProvider ABC entry point — not used directly; the typed
        fetch_* methods above are used instead since each OpenDART operation
        has a distinct shape. Required by the interface so this class can
        still be registered/discovered as a RawSourceProvider."""
        raise NotImplementedError("use fetch_corp_code_master/fetch_disclosure_list/etc.")
