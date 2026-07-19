#!/usr/bin/env python3
"""Long-lived JSON-lines bridge for the opt-in Foundation.25.1 reference feed.

The bridge deliberately keeps all capability-token operations and ICS rendering
inside Python, alongside the restored Foundation implementation.  Standard
output is protocol-only: one JSON response for each newline-delimited request.
"""
from __future__ import annotations

import argparse
import base64
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


REFERENCE_PROFILE_ID = "subprof_9baaae14deb3460fa31777d362507cbc"
REFERENCE_SCHEMA_VERSION = "noticepilot.referenceSubscriptionFeed.v0.1"


class BridgeRequestError(ValueError):
    pass


def _parse_args() -> argparse.Namespace:
    repository_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument(
        "--foundation-root",
        type=Path,
        default=repository_root / "packages" / "noticepilot-knu-crawler",
    )
    return parser.parse_args()


def _load_foundation(foundation_root: Path) -> tuple[Any, Any]:
    root = foundation_root.resolve()
    if not root.is_dir():
        raise RuntimeError("Foundation package is unavailable")

    sys.path.insert(0, str(root))
    from noticepilot_postgres_persistence import (  # pylint: disable=import-outside-toplevel
        InMemoryPostgresReferenceStore,
        build_foundation_bootstrap_bundle,
    )
    from noticepilot_subscription_delivery import (  # pylint: disable=import-outside-toplevel
        SubscriptionFeedDeliveryService,
    )

    store = InMemoryPostgresReferenceStore()
    store.bootstrap(build_foundation_bootstrap_bundle(root))
    return store, SubscriptionFeedDeliveryService(store)


def _require_exact_object(
    value: Any,
    *,
    keys: set[str],
    label: str,
) -> Mapping[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise BridgeRequestError(f"invalid {label}")
    return value


class ReferenceFeedBridge:
    def __init__(self, foundation_root: Path) -> None:
        self.store, self.service = _load_foundation(foundation_root)
        snapshot = next(
            (
                row
                for row in self.store.rows("feed_snapshot")
                if row["profile_id"] == REFERENCE_PROFILE_ID
            ),
            None,
        )
        profile = self.store.get("subscription_profile_head", REFERENCE_PROFILE_ID)
        revision = self.store.get(
            "subscription_profile_revision",
            REFERENCE_PROFILE_ID,
            profile["current_revision"] if profile else None,
        )
        if snapshot is None or profile is None or revision is None:
            raise RuntimeError("Foundation reference profile is unavailable")
        if snapshot["profile_revision"] != profile["current_revision"]:
            raise RuntimeError("Foundation reference snapshot is stale")

        self.snapshot = snapshot
        self.calendar_name = revision["payload"]["calendarName"]

    def provision(self, params: Any) -> dict[str, Any]:
        _require_exact_object(params, keys=set(), label="provision parameters")
        provisioned = self.service.provision_feed(
            profile_id=REFERENCE_PROFILE_ID,
            snapshot_id=self.snapshot["snapshot_id"],
            calendar_name=self.calendar_name,
            now=datetime.now(timezone.utc).isoformat(),
        )
        return {
            "schemaVersion": REFERENCE_SCHEMA_VERSION,
            "calendarName": self.calendar_name,
            "eventCount": self.snapshot["event_count"],
            "tokenPrefix": provisioned.token_prefix,
            "subscriptionPath": provisioned.subscription_path,
            "expiresOnServerRestart": True,
        }

    def render(self, params: Any) -> dict[str, Any]:
        values = _require_exact_object(
            params,
            keys={"feedId", "token", "ifNoneMatch"},
            label="render parameters",
        )
        feed_id = values["feedId"]
        token = values["token"]
        if_none_match = values["ifNoneMatch"]
        if not isinstance(feed_id, str) or not isinstance(token, str):
            raise BridgeRequestError("invalid feed capability")
        if if_none_match is not None and not isinstance(if_none_match, str):
            raise BridgeRequestError("invalid conditional request")

        response = self.service.render_feed(
            feed_id,
            token,
            if_none_match=if_none_match,
        )
        return {
            "statusCode": response.status_code,
            "headers": dict(response.headers),
            "bodyBase64": base64.b64encode(response.body).decode("ascii"),
        }

    def dispatch(self, request: Any) -> tuple[Any, dict[str, Any]]:
        values = _require_exact_object(
            request,
            keys={"id", "method", "params"},
            label="bridge request",
        )
        request_id = values["id"]
        method = values["method"]
        if not isinstance(request_id, str) or not request_id:
            raise BridgeRequestError("invalid request id")
        if method == "provision_reference":
            return request_id, self.provision(values["params"])
        if method == "render_feed":
            return request_id, self.render(values["params"])
        raise BridgeRequestError("unsupported bridge method")


def _error_code(error: Exception) -> str:
    # Imports happen only after the package path is installed during bootstrap.
    from noticepilot_subscription_delivery import (  # pylint: disable=import-outside-toplevel
        SubscriptionAuthenticationError,
        SubscriptionFeedUnavailableError,
    )

    if isinstance(error, SubscriptionAuthenticationError):
        return "not_found"
    if isinstance(error, SubscriptionFeedUnavailableError):
        return "gone" if error.status == "revoked" else "temporarily_unavailable"
    if isinstance(error, BridgeRequestError):
        return "invalid_request"
    return "unavailable"


def _write_response(payload: Mapping[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def main() -> int:
    args = _parse_args()
    bridge = ReferenceFeedBridge(args.foundation_root)
    for line in sys.stdin:
        request_id: Any = None
        try:
            request = json.loads(line)
            if isinstance(request, dict):
                request_id = request.get("id")
            request_id, result = bridge.dispatch(request)
            _write_response({"id": request_id, "ok": True, "result": result})
        except Exception as error:  # The protocol must stay alive after bad requests.
            _write_response(
                {
                    "id": request_id if isinstance(request_id, str) else None,
                    "ok": False,
                    "error": {"code": _error_code(error)},
                }
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
