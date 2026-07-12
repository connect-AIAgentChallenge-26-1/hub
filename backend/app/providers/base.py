"""Provider interface — the shared shape every external data source
(OpenDART S2, market data S13, external evidence S14, broker S12) implements
from T02 onward. Defined now so T01 fixes the error-mapping contract before
any concrete provider exists.

docs/skills.md 공통 원칙 7 "실패 구분": provider timeout·rate limit·인증·점검은
데이터 없음(NOT_FOUND)이나 구현 오류(INTERNAL_ERROR)와 다른 EXTERNAL_ERROR
reason_code로 구분해야 한다. map_provider_error() is the single place that
mapping happens so every provider maps errors identically.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

from app.schemas.envelope import Status


class ProviderError(Exception):
    """Base for provider-side failures. Subclasses carry a reason_code so
    callers can map them onto Envelope.status without inspecting message text.
    """

    reason_code: str = "PROVIDER_ERROR"
    status: Status = Status.EXTERNAL_ERROR


class ProviderTimeoutError(ProviderError):
    reason_code = "PROVIDER_TIMEOUT"


class ProviderRateLimitedError(ProviderError):
    """provider가 우리 호출을 rate limit한 경우. docs/skills.md status 표에서
    RATE_LIMITED는 "우리 서비스의 사용자·tenant·비용 한도"에만 쓰이므로
    provider-side limit은 EXTERNAL_ERROR로 남는다."""

    reason_code = "PROVIDER_RATE_LIMITED"


class ProviderAuthError(ProviderError):
    """provider 자격증명(API key 등) 실패. AUTHENTICATION_ERROR는 우리 서비스
    사용자의 인증 실패 전용이므로 provider-side 인증 오류는 EXTERNAL_ERROR다."""

    reason_code = "PROVIDER_AUTH_FAILED"


class ProviderMaintenanceError(ProviderError):
    reason_code = "PROVIDER_MAINTENANCE"


class ProviderNotFoundError(ProviderError):
    """The provider was reachable and answered, but has no data for this
    query — distinct from a timeout/outage (CLAUDE.md 절대 원칙 7)."""

    reason_code = "PROVIDER_NO_DATA"
    status = Status.NOT_FOUND


@dataclass(frozen=True)
class ProviderErrorMapping:
    status: Status
    reason_code: str


def map_provider_error(exc: ProviderError) -> ProviderErrorMapping:
    return ProviderErrorMapping(status=exc.status, reason_code=exc.reason_code)


class RawSourceProvider(ABC):
    """One instance per external source. `collect` returns raw immutable
    records (docs/skills.md RawDisclosureRecord/RawMarketRecord/
    RawExternalRecord shape) — normalization is a separate step per skill,
    not this interface's job.
    """

    source_provider: str

    @abstractmethod
    def collect(self, **query: Any) -> list[dict[str, Any]]:
        """Returns raw provider records or raises a ProviderError subclass.
        Must never return partial/guessed data silently."""
        raise NotImplementedError
