from app.providers.base import (
    ProviderAuthError,
    ProviderMaintenanceError,
    ProviderNotFoundError,
    ProviderRateLimitedError,
    ProviderTimeoutError,
    map_provider_error,
)
from app.schemas.envelope import Status


def test_timeout_maps_to_external_error():
    mapping = map_provider_error(ProviderTimeoutError())
    assert mapping.status is Status.EXTERNAL_ERROR
    assert mapping.reason_code == "PROVIDER_TIMEOUT"


def test_provider_rate_limit_is_external_error_not_service_rate_limit():
    # docs/skills.md: RATE_LIMITED는 우리 서비스의 사용자·tenant·비용 한도 전용.
    # provider가 우리를 제한한 것은 provider 장애 축(EXTERNAL_ERROR)이다.
    mapping = map_provider_error(ProviderRateLimitedError())
    assert mapping.status is Status.EXTERNAL_ERROR
    assert mapping.reason_code == "PROVIDER_RATE_LIMITED"


def test_provider_auth_failure_is_external_error_not_user_auth():
    # AUTHENTICATION_ERROR는 우리 서비스 사용자의 인증 실패 전용.
    # provider API key 실패는 EXTERNAL_ERROR + reason_code로 구분한다.
    mapping = map_provider_error(ProviderAuthError())
    assert mapping.status is Status.EXTERNAL_ERROR
    assert mapping.reason_code == "PROVIDER_AUTH_FAILED"


def test_maintenance_maps_to_external_error_not_not_found():
    # 점검(maintenance)은 "데이터 없음"과 다른 실패다 (CLAUDE.md 절대 원칙 7).
    mapping = map_provider_error(ProviderMaintenanceError())
    assert mapping.status is Status.EXTERNAL_ERROR
    assert mapping.reason_code == "PROVIDER_MAINTENANCE"


def test_not_found_is_distinct_from_external_error():
    mapping = map_provider_error(ProviderNotFoundError())
    assert mapping.status is Status.NOT_FOUND
    assert mapping.reason_code == "PROVIDER_NO_DATA"
