"""한국투자증권(KIS) Developers Open API provider (S13 시세·기업행위 수집).
Implements RawSourceProvider (app/providers/base.py).

계약 근거: docs/skills.md S13 + 공식 예제(github.com/koreainvestment/open-trading-api,
examples_llm/domestic_stock/{inquire_price,inquire_daily_itemchartprice,
ksdinfo_dividend,ksdinfo_bonus_issue,ksdinfo_paidin_capin,ksdinfo_rev_split}) 및
2026-07-14 모의투자(vps) 계정으로 직접 호출해 확인한 응답 shape
(backend/tests/fixtures/kis/).

실전 호출로만 발견한 사항(문서화된 한계, 임의 추정 아님):
  - 접근토큰(`/oauth2/tokenP`)은 분당 1회로 제한되며(EGW00133), 6시간 이내 재요청 시
    기존 토큰을 그대로 반환한다 — 프로세스 내 in-memory 캐시로 재사용한다.
  - 일반 조회 TR은 초당 요청 수 제한이 있다(EGW00201, "초당 거래건수를 초과하였습니다").
  - 존재하지 않는 종목코드로 현재가를 조회하면 HTTP 200 + rt_cd="0"(성공)이지만
    output의 가격·종목명 필드가 전부 0/공백으로 온다 — provider가 명시적 오류를
    반환하지 않으므로 이 shape을 우리가 직접 감지해 "데이터 없음"으로 변환해야 한다.
  - 국내휴장일조회(CTCA0903R)는 모의투자 환경에서 거부된다(EGW02006 "모의투자 TR이
    아닙니다") — 실전투자 전용이라 이 provider는 거래 캘린더를 기간별시세 응답의
    실제 거래일 집합에서 파생한다(NORMALIZE 단계, 이 모듈의 책임 밖).
"""

from __future__ import annotations

import hashlib
import json
import threading
import time
from dataclasses import dataclass
from typing import Any, Literal

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.providers.base import (
    ProviderAuthError,
    ProviderMaintenanceError,
    ProviderNotFoundError,
    ProviderRateLimitedError,
    ProviderTimeoutError,
    ProviderTokenRateLimitedError,
    RawSourceProvider,
)

KisEnv = Literal["vps", "prod"]

KIS_BASE_URLS: dict[KisEnv, str] = {
    "prod": "https://openapi.koreainvestment.com:9443",
    "vps": "https://openapivts.koreainvestment.com:29443",
}

_RETRYABLE_EXCEPTIONS = (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError)

# msg_cd(비즈니스 오류 코드) -> 우리 예외 taxonomy. 실제 응답에서 확인된 코드만
# 등록한다 — 목록에 없는 코드는 "예상 밖 provider 상태"로 ProviderMaintenanceError.
_MSG_CD_TO_ERROR: dict[str, type[Exception]] = {
    "EGW00201": ProviderRateLimitedError,  # 초당 거래건수 초과
    "EGW00121": ProviderAuthError,  # 유효하지 않은 token
    "EGW00304": ProviderAuthError,  # 고객식별키(appsecret) 유효하지 않음
    "EGW02006": ProviderMaintenanceError,  # 이 TR은 현재 환경(vps/prod)에서 지원 안 됨
}

_TOKEN_ERROR_CODE_TO_ERROR: dict[str, type[Exception]] = {
    "EGW00133": ProviderTokenRateLimitedError,  # 접근토큰 발급 분당 1회 제한
}


def checksum_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def stable_json_bytes(data: dict[str, Any]) -> bytes:
    return json.dumps(data, sort_keys=True, ensure_ascii=False).encode("utf-8")


@dataclass(frozen=True)
class RawFetch:
    raw_payload: dict[str, Any]
    checksum: str


@dataclass
class _CachedToken:
    token: str
    expires_at: float  # time.monotonic() 기준


class TokenCache:
    """(app_key, env)별 접근토큰 in-process 캐시. KIS는 분당 1회 발급 제한이라
    provider 인스턴스가 요청마다 새로 만들어져도(app/dependencies.py 패턴) 토큰은
    프로세스 생애 동안 재사용해야 한다."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._entries: dict[tuple[str, str], _CachedToken] = {}

    def get(self, app_key: str, env: str) -> str | None:
        with self._lock:
            entry = self._entries.get((app_key, env))
            if entry is None or entry.expires_at <= time.monotonic():
                return None
            return entry.token

    def set(self, app_key: str, env: str, token: str, expires_in_seconds: float) -> None:
        with self._lock:
            # 만료 몇 분 전에 미리 갱신하도록 안전마진을 둔다.
            margin = min(300.0, expires_in_seconds / 10)
            self._entries[(app_key, env)] = _CachedToken(
                token=token, expires_at=time.monotonic() + expires_in_seconds - margin
            )


_SHARED_TOKEN_CACHE = TokenCache()


class KisProvider(RawSourceProvider):
    source_provider = "kis"

    def __init__(
        self,
        app_key: str,
        app_secret: str,
        env: KisEnv = "vps",
        client: httpx.Client | None = None,
        timeout: float = 10.0,
        token_cache: TokenCache | None = None,
    ) -> None:
        self._app_key = app_key
        self._app_secret = app_secret
        self._env = env
        self._base_url = KIS_BASE_URLS[env]
        self._client = client or httpx.Client(timeout=timeout)
        self._owns_client = client is None
        self._token_cache = token_cache if token_cache is not None else _SHARED_TOKEN_CACHE

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> KisProvider:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # ------------------------------------------------------------- auth

    def _issue_token(self) -> str:
        cached = self._token_cache.get(self._app_key, self._env)
        if cached is not None:
            return cached
        try:
            response = self._client.post(
                f"{self._base_url}/oauth2/tokenP",
                headers={"Content-Type": "application/json"},
                content=json.dumps(
                    {
                        "grant_type": "client_credentials",
                        "appkey": self._app_key,
                        "appsecret": self._app_secret,
                    }
                ),
            )
        except _RETRYABLE_EXCEPTIONS as exc:
            raise ProviderTimeoutError(f"KIS token issuance network error: {exc}") from exc
        body: dict[str, Any] = response.json()
        access_token = body.get("access_token")
        if response.status_code != 200 or not isinstance(access_token, str):
            error_code = body.get("error_code", "")
            error_cls = _TOKEN_ERROR_CODE_TO_ERROR.get(error_code, ProviderAuthError)
            raise error_cls(
                f"KIS token issuance failed {error_code}: {body.get('error_description', body)}"
            )
        expires_in = float(body.get("expires_in", 86400))
        self._token_cache.set(self._app_key, self._env, access_token, expires_in)
        return access_token

    # ------------------------------------------------------------- HTTP

    @retry(
        retry=retry_if_exception_type(ProviderTimeoutError),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, max=4),
        reraise=True,
    )
    def _request(self, path: str, tr_id: str, params: dict[str, Any]) -> httpx.Response:
        token = self._issue_token()
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "authorization": f"Bearer {token}",
            "appkey": self._app_key,
            "appsecret": self._app_secret,
            "tr_id": tr_id,
            "custtype": "P",
        }
        try:
            return self._client.get(f"{self._base_url}{path}", headers=headers, params=params)
        except _RETRYABLE_EXCEPTIONS as exc:
            raise ProviderTimeoutError(f"KIS network error calling {path}: {exc}") from exc

    def _get(self, path: str, tr_id: str, params: dict[str, Any]) -> dict[str, Any]:
        response = self._request(path, tr_id, params)
        data: dict[str, Any] = response.json()
        rt_cd = data.get("rt_cd")
        if rt_cd is not None and rt_cd != "0":
            msg_cd = data.get("msg_cd", "")
            error_cls = _MSG_CD_TO_ERROR.get(msg_cd, ProviderMaintenanceError)
            raise error_cls(f"KIS {path} {msg_cd}: {data.get('msg1', '')}")
        return data

    # --------------------------------------------------------- endpoints

    def fetch_current_price(self, stock_code: str) -> RawFetch:
        data = self._get(
            "/uapi/domestic-stock/v1/quotations/inquire-price",
            "FHKST01010100",
            {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": stock_code},
        )
        output = data.get("output") or {}
        # KIS는 존재하지 않는 종목코드에도 rt_cd="0"(성공)을 반환하고 output의
        # 가격·종목코드·종목명을 전부 0/공백으로 채운다 — 실제 라이브 호출로 확인한
        # provider 고유 동작. 명시적 오류가 없으므로 이 shape을 직접 감지한다.
        if not output.get("stck_shrn_iscd") and output.get("stck_prpr") in (None, "0"):
            raise ProviderNotFoundError(f"KIS inquire-price: no data for stock_code={stock_code}")
        payload_bytes = stable_json_bytes(data)
        return RawFetch(raw_payload=data, checksum=checksum_of(payload_bytes))

    def fetch_period_price(
        self, stock_code: str, start: str, end: str, adjusted: bool
    ) -> RawFetch:
        # FID_ORG_ADJ_PRC: 0=수정주가(adjusted), 1=원주가(unadjusted) — 공식 예제
        # docstring 그대로(examples_llm/domestic_stock/inquire_daily_itemchartprice).
        fid_org_adj_prc = "0" if adjusted else "1"
        data = self._get(
            "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
            "FHKST03010100",
            {
                "FID_COND_MRKT_DIV_CODE": "J",
                "FID_INPUT_ISCD": stock_code,
                "FID_INPUT_DATE_1": start,
                "FID_INPUT_DATE_2": end,
                "FID_PERIOD_DIV_CODE": "D",
                "FID_ORG_ADJ_PRC": fid_org_adj_prc,
            },
        )
        payload_bytes = stable_json_bytes(data)
        return RawFetch(raw_payload=data, checksum=checksum_of(payload_bytes))

    def fetch_corporate_action_raw(
        self, path: str, tr_id: str, params: dict[str, Any]
    ) -> RawFetch:
        # 4개 예탁원(KSD) endpoint(dividend/bonus-issue/paidin-capin/rev-split)가
        # 서로 다른 파라미터 이름·개수를 쓰므로(SHT_CD 위치, GB1 유무 등) 호출부
        # (app/services/market_collector.py)가 type별 params를 조립해 넘긴다 —
        # 이 메서드는 공통 GET+오류매핑만 담당한다.
        data = self._get(path, tr_id, params)
        payload_bytes = stable_json_bytes(data)
        return RawFetch(raw_payload=data, checksum=checksum_of(payload_bytes))

    def collect(self, **query: Any) -> list[dict[str, Any]]:
        raise NotImplementedError(
            "use fetch_current_price/fetch_period_price/fetch_corporate_action_raw"
        )
