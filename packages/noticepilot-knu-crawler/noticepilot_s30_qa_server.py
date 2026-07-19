#!/usr/bin/env python3
"""Local-only HTTP fixture server for S30 Samsung Calendar physical QA."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from email.utils import format_datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from noticepilot_samsung_calendar_qa import QA_PATH, STAGES


class S30QaServerError(RuntimeError):
    pass


def _etag(body: bytes) -> str:
    return f'"{hashlib.sha256(body).hexdigest()}"'


def _now_http() -> str:
    return format_datetime(datetime.now(timezone.utc), usegmt=True)


def make_handler(runtime_dir: Path):
    runtime_dir = runtime_dir.resolve()
    log_path = runtime_dir / "physical-qa" / "request-log.jsonl"

    class Handler(BaseHTTPRequestHandler):
        server_version = "NoticePilotS30QA/0.1"

        def _log(self, *, status: int, stage: str | None, etag: str | None) -> None:
            log_path.parent.mkdir(parents=True, exist_ok=True)
            row: dict[str, Any] = {
                "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "method": self.command,
                "path": self.path,
                "ifNoneMatch": self.headers.get("If-None-Match"),
                "status": status,
                "stage": stage,
                "etag": etag,
                "userAgent": self.headers.get("User-Agent"),
            }
            with log_path.open("a", encoding="utf-8", newline="") as fh:
                fh.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")

        def _serve(self, send_body: bool) -> None:
            if self.path != QA_PATH:
                self.send_response(404)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
                if send_body:
                    self.wfile.write(b"not found")
                self._log(status=404, stage=None, etag=None)
                return
            stage_path = runtime_dir / "active-stage.txt"
            stage = stage_path.read_text(encoding="utf-8").strip() if stage_path.exists() else ""
            if stage not in STAGES:
                self.send_response(503)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Retry-After", "60")
                self.end_headers()
                if send_body:
                    self.wfile.write(b"invalid QA stage")
                self._log(status=503, stage=stage or None, etag=None)
                return
            body = (runtime_dir / "fixtures" / f"{stage}.ics").read_bytes()
            etag = _etag(body)
            if self.headers.get("If-None-Match") == etag:
                self.send_response(304)
                self.send_header("ETag", etag)
                self.send_header("Cache-Control", "private, max-age=60, must-revalidate")
                self.send_header("X-NoticePilot-QA-Stage", stage)
                self.end_headers()
                self._log(status=304, stage=stage, etag=etag)
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/calendar; charset=utf-8")
            self.send_header("Content-Disposition", 'inline; filename="noticepilot-samsung-qa.ics"')
            self.send_header("Content-Length", str(len(body)))
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", "private, max-age=60, must-revalidate")
            self.send_header("Last-Modified", _now_http())
            self.send_header("X-NoticePilot-QA-Stage", stage)
            self.end_headers()
            if send_body:
                self.wfile.write(body)
            self._log(status=200, stage=stage, etag=etag)

        def do_GET(self) -> None:  # noqa: N802
            self._serve(True)

        def do_HEAD(self) -> None:  # noqa: N802
            self._serve(False)

        def log_message(self, fmt: str, *args: Any) -> None:
            return

    return Handler


def serve(runtime_dir: Path, host: str, port: int) -> None:
    if not (runtime_dir / "manifest.json").exists():
        raise S30QaServerError(f"S30 runtime manifest not found: {runtime_dir}")
    server = ThreadingHTTPServer((host, port), make_handler(runtime_dir))
    print(f"S30 Samsung Calendar QA server: http://{host}:{port}{QA_PATH}")
    print(f"Active stage file: {runtime_dir / 'active-stage.txt'}")
    server.serve_forever()
