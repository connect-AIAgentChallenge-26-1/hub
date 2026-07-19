#!/usr/bin/env python3
"""Repair stale schedule-segment summary fields without changing source rows."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any, Sequence
import uuid

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import noticepilot_mvp_policy_pipeline as policy  # noqa: E402


DERIVED_FIELDS = ("segmentCount", "locallyGroundedCount", "typeCounts")
SEGMENT_DIRECTORY = Path("derived/mvp-policy-v0.1/segments")


class RepairFailure(RuntimeError):
    """A controlled validation or application failure."""

    def __init__(self, message: str, *, phase: str, path: Path | None = None) -> None:
        super().__init__(message)
        self.phase = phase
        self.path = path


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return True


def serialize_document(document: dict[str, Any]) -> bytes:
    return json.dumps(document, ensure_ascii=False, indent=2).encode("utf-8")


def without_derived_summary_fields(document: dict[str, Any]) -> dict[str, Any]:
    value = copy.deepcopy(document)
    summary = value.get("summary")
    if isinstance(summary, dict):
        for field in DERIVED_FIELDS:
            summary.pop(field, None)
    return value


def atomic_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.s24a-repair-{uuid.uuid4().hex}.tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except BaseException:
        # Failure evidence is intentionally retained; cleanup is forbidden.
        raise


def write_report(path: Path, report: dict[str, Any]) -> None:
    content = json.dumps(report, ensure_ascii=False, indent=2).encode("utf-8")
    atomic_write(path, content)


def base_report(*, root: Path, mode: str) -> dict[str, Any]:
    return {
        "root": str(root),
        "mode": mode,
        "scannedCount": 0,
        "matchedCount": 0,
        "mismatchedCount": 0,
        "modifiedCount": 0,
        "skippedCount": 0,
        "errorCount": 0,
        "mismatchFields": {field: 0 for field in DERIVED_FIELDS},
        "plannedCount": 0,
        "attemptedCount": 0,
        "appliedCount": 0,
    }


def validate_external_path(path: Path, root: Path, *, label: str) -> None:
    if is_within(path, root):
        raise RepairFailure(
            f"{label} must be outside the S8 root: {path}",
            phase="preflight",
            path=path,
        )


def validate_staging(path: Path, root: Path) -> Path:
    resolved = path.resolve()
    validate_external_path(resolved, root, label="staging directory")
    if resolved.exists():
        if not resolved.is_dir():
            raise RepairFailure(
                f"staging path is not a directory: {resolved}",
                phase="preflight",
                path=resolved,
            )
        if next(resolved.iterdir(), None) is not None:
            raise RepairFailure(
                f"staging directory must be empty: {resolved}",
                phase="preflight",
                path=resolved,
            )
    else:
        resolved.mkdir(parents=True)
    return resolved


def load_document(path: Path) -> tuple[bytes, dict[str, Any]]:
    source = path.read_bytes()
    try:
        document = json.loads(source.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RepairFailure(
            f"invalid UTF-8 JSON document: {exc}", phase="scan", path=path
        ) from exc
    if not isinstance(document, dict):
        raise RepairFailure("document must be a JSON object", phase="scan", path=path)
    if not isinstance(document.get("segments"), list):
        raise RepairFailure("segments must be an array", phase="scan", path=path)
    if not isinstance(document.get("summary"), dict):
        raise RepairFailure("summary must be an object", phase="scan", path=path)
    if source != serialize_document(document):
        raise RepairFailure(
            "document serialization differs from the Foundation.25 corpus format",
            phase="scan",
            path=path,
        )
    return source, document


def build_repaired_document(document: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    segments = document["segments"]
    derived = policy.build_schedule_segment_summary(segments)
    repaired = copy.deepcopy(document)
    existing_summary = repaired["summary"]
    repaired["summary"] = {**existing_summary, **derived}
    return repaired, derived


def verify_staged_document(
    *, original: dict[str, Any], staged_bytes: bytes, staged_path: Path
) -> None:
    try:
        staged = json.loads(staged_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RepairFailure(
            f"staged document is invalid: {exc}", phase="stage", path=staged_path
        ) from exc
    if staged_bytes != serialize_document(staged):
        raise RepairFailure(
            "staged document is not deterministically serialized",
            phase="stage",
            path=staged_path,
        )
    if without_derived_summary_fields(staged) != without_derived_summary_fields(original):
        raise RepairFailure(
            "staged document changes fields outside the derived summary contract",
            phase="stage",
            path=staged_path,
        )
    expected = policy.build_schedule_segment_summary(staged["segments"])
    if any(staged["summary"].get(field) != expected[field] for field in DERIVED_FIELDS):
        raise RepairFailure(
            "staged summary does not match segments", phase="stage", path=staged_path
        )


def execute(
    *,
    root: Path,
    apply: bool,
    expected_document_count: int,
    expected_mismatch_count: int,
    staging_dir: Path | None,
    report: dict[str, Any],
) -> dict[str, Any]:
    segment_directory = root / SEGMENT_DIRECTORY
    if not segment_directory.is_dir():
        raise RepairFailure(
            f"segment directory is missing: {segment_directory}",
            phase="preflight",
            path=segment_directory,
        )
    staging = None
    if apply:
        if staging_dir is None:
            raise RepairFailure("--staging-dir is required with --apply", phase="preflight")
        staging = validate_staging(staging_dir, root)

    paths = sorted(segment_directory.glob("*.segments.json"))
    report["scannedCount"] = len(paths)
    if len(paths) != expected_document_count:
        raise RepairFailure(
            f"document count mismatch: {len(paths)} != {expected_document_count}",
            phase="scan",
            path=segment_directory,
        )

    planned: list[tuple[Path, bytes, str, Path | None]] = []
    for path in paths:
        source, document = load_document(path)
        repaired, derived = build_repaired_document(document)
        mismatched_fields = [
            field for field in DERIVED_FIELDS
            if document["summary"].get(field) != derived[field]
        ]
        if not mismatched_fields:
            continue
        for field in mismatched_fields:
            report["mismatchFields"][field] += 1
        repaired_bytes = serialize_document(repaired)
        staged_path = None
        if apply:
            assert staging is not None
            staged_path = staging / path.name
            staged_path.write_bytes(repaired_bytes)
            verify_staged_document(
                original=document,
                staged_bytes=staged_path.read_bytes(),
                staged_path=staged_path,
            )
        planned.append((path, repaired_bytes, sha256_bytes(source), staged_path))

    report["mismatchedCount"] = len(planned)
    report["matchedCount"] = len(paths) - len(planned)
    report["skippedCount"] = report["matchedCount"]
    report["plannedCount"] = len(planned)
    if len(planned) != expected_mismatch_count:
        raise RepairFailure(
            f"mismatch count differs from expectation: {len(planned)} != {expected_mismatch_count}",
            phase="scan",
            path=segment_directory,
        )
    if not apply:
        return report

    for source_path, expected_bytes, original_sha, staged_path in planned:
        report["attemptedCount"] += 1
        try:
            if sha256_bytes(source_path.read_bytes()) != original_sha:
                raise RepairFailure(
                    "source changed after staging", phase="apply", path=source_path
                )
            assert staged_path is not None
            staged_bytes = staged_path.read_bytes()
            if staged_bytes != expected_bytes:
                raise RepairFailure(
                    "staged content changed before apply", phase="apply", path=staged_path
                )
            atomic_write(source_path, staged_bytes)
            if source_path.read_bytes() != staged_bytes:
                raise RepairFailure(
                    "applied content verification failed", phase="apply", path=source_path
                )
        except RepairFailure:
            raise
        except BaseException as exc:
            raise RepairFailure(
                f"atomic replacement failed: {exc}", phase="apply", path=source_path
            ) from exc
        report["appliedCount"] += 1
        report["modifiedCount"] += 1
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-document-count", type=int, required=True)
    parser.add_argument("--expected-mismatch-count", type=int, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--staging-dir", type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    root = args.root.resolve()
    report_path = args.report.resolve()
    mode = "apply" if args.apply else "dry-run"
    report = base_report(root=root, mode=mode)
    try:
        validate_external_path(report_path, root, label="report path")
        execute(
            root=root,
            apply=args.apply,
            expected_document_count=args.expected_document_count,
            expected_mismatch_count=args.expected_mismatch_count,
            staging_dir=args.staging_dir,
            report=report,
        )
    except RepairFailure as exc:
        report["errorCount"] += 1
        report["failedPath"] = str(exc.path) if exc.path is not None else None
        report["failurePhase"] = exc.phase
        report["failureMessage"] = str(exc)
        report["partialWritePossible"] = bool(report["appliedCount"])
        report["packagingEligible"] = False
        try:
            validate_external_path(report_path, root, label="report path")
            write_report(report_path, report)
        except BaseException as report_exc:
            print(
                f"repair failed: {exc}; additionally failed to write report: {report_exc}",
                file=sys.stderr,
            )
            return 2
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1
    try:
        write_report(report_path, report)
    except BaseException as exc:
        print(f"repair completed but report write failed: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
