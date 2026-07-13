import httpx
import pytest

from app.providers.base import (
    ProviderAuthError,
    ProviderMaintenanceError,
    ProviderNotFoundError,
    ProviderRateLimitedError,
    ProviderTimeoutError,
)
from app.providers.opendart import OpenDartProvider
from tests.support.opendart_mock import (
    QueueTransport,
    client_with_responses,
    json_response,
    load_bytes,
    load_error,
    load_json,
    xml_error_response,
    zip_response,
)


def _provider(
    responses: list[httpx.Response | Exception],
) -> tuple[OpenDartProvider, QueueTransport]:
    client, transport = client_with_responses(responses)
    return OpenDartProvider(api_key="test-key", client=client), transport


def test_fetch_disclosure_list_success_returns_real_fixture():
    fixture = load_json("disclosure_list_samsung.json")
    provider, _ = _provider([json_response(fixture)])
    fetch = provider.fetch_disclosure_list("00126380", "20240101", "20240401")
    assert fetch.raw_payload["status"] == "000"
    assert len(fetch.raw_payload["list"]) == len(fixture["list"])
    assert fetch.checksum


def test_fetch_financial_statements_success_returns_real_fixture():
    fixture = load_json("financial_statements_samsung.json")
    provider, _ = _provider([json_response(fixture)])
    fetch = provider.fetch_financial_statements("00126380", "2023", "11011", "CFS")
    assert fetch.raw_payload["list"][0]["account_nm"] == "자산총계"


def test_fetch_corp_code_master_success_returns_zip_bytes():
    zip_bytes = load_bytes("corp_code_sample.zip")
    provider, _ = _provider([zip_response(zip_bytes)])
    fetch = provider.fetch_corp_code_master()
    assert fetch.raw_payload.startswith(b"PK")
    assert fetch.checksum


def test_fetch_document_success_returns_zip_bytes():
    zip_bytes = load_bytes("document_20241129001733.zip")
    provider, _ = _provider([zip_response(zip_bytes)])
    fetch = provider.fetch_document("20241129001733")
    assert fetch.raw_payload.startswith(b"PK")


@pytest.mark.parametrize(
    "error_key,expected_exception",
    [
        ("013_no_data", ProviderNotFoundError),
        ("014_file_not_found", ProviderNotFoundError),
        ("020_rate_limited", ProviderRateLimitedError),
        ("010_unregistered_key", ProviderAuthError),
        ("011_locked_key", ProviderAuthError),
        ("012_forbidden_ip", ProviderAuthError),
        ("100_invalid_field", ProviderMaintenanceError),
        ("900_undefined_error", ProviderMaintenanceError),
    ],
)
def test_json_endpoint_error_mapping(error_key, expected_exception):
    error = load_error(error_key)
    provider, _ = _provider([json_response(error)])
    with pytest.raises(expected_exception):
        provider.fetch_disclosure_list("00126380", "20250101", "20250102")


def test_file_endpoint_xml_error_maps_to_auth_error():
    # corpCode.xml/document.xml return an XML envelope (not JSON) on failure —
    # captured live with an invalid key, 2026-07-13.
    error = load_error("010_unregistered_key")
    provider, _ = _provider([xml_error_response(error["status"], error["message"])])
    with pytest.raises(ProviderAuthError):
        provider.fetch_corp_code_master()


def test_file_endpoint_no_data_maps_to_not_found():
    error = load_error("014_file_not_found")
    provider, _ = _provider([xml_error_response(error["status"], error["message"])])
    with pytest.raises(ProviderNotFoundError):
        provider.fetch_document("00000000000000")


def test_file_endpoint_garbage_body_maps_to_maintenance_error():
    provider, _ = _provider([httpx.Response(200, content=b"not xml and not a zip")])
    with pytest.raises(ProviderMaintenanceError):
        provider.fetch_corp_code_master()


def test_transient_network_errors_are_retried_then_succeed():
    fixture = load_json("disclosure_list_samsung.json")
    provider, transport = _provider(
        [
            httpx.TimeoutException("boom"),
            httpx.ConnectError("boom again"),
            json_response(fixture),
        ]
    )
    fetch = provider.fetch_disclosure_list("00126380", "20240101", "20240401")
    assert fetch.raw_payload["status"] == "000"
    assert transport.call_count == 3


def test_persistent_network_errors_exhaust_retries_and_raise():
    provider, transport = _provider(
        [
            httpx.TimeoutException("boom"),
            httpx.TimeoutException("boom"),
            httpx.TimeoutException("boom"),
        ]
    )
    with pytest.raises(ProviderTimeoutError):
        provider.fetch_disclosure_list("00126380", "20240101", "20240401")
    assert transport.call_count == 3


def test_rate_limit_and_auth_errors_are_not_retried():
    # business-level errors (HTTP 200 + status field) must not trigger the
    # network retry loop — only one call should happen.
    error = load_error("020_rate_limited")
    provider, transport = _provider([json_response(error)])
    with pytest.raises(ProviderRateLimitedError):
        provider.fetch_disclosure_list("00126380", "20240101", "20240401")
    assert transport.call_count == 1
