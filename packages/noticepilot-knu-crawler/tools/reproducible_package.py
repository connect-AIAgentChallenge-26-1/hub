#!/usr/bin/env python3
"""Build and verify deterministic NoticePilot ZIP archives.

Byte-for-byte reproducibility is scoped to an identical source inventory,
normalized epoch, packager implementation, Python implementation/version, and
zlib compile/runtime version.  The integrity manifest intentionally excludes
toolchain details so that they can be retained as external execution evidence.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import fnmatch
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import secrets
import stat
import struct
import sys
import unicodedata
import zipfile
from typing import Iterable, Mapping, Sequence


SCHEMA_VERSION = "noticepilot.reproduciblePackageIntegrity.v0.1"
INTEGRITY_NAME = "PACKAGE_INTEGRITY.json"
VERSION_MANIFEST_NAME = "VERSION_MANIFEST.json"
MIN_EPOCH = 315532800  # 1980-01-01T00:00:00Z
MAX_EPOCH = 4354819198  # 2107-12-31T23:59:58Z
TOP_LEVEL_EXACT = {
    ".venv",
    "__MACOSX",
    "evidence",
    "staging",
    "calendar",
    "attachments",
    "raw_downloads",
    "local-observation-data",
    "observation-output",
}
TOP_LEVEL_GLOBS = ("probe_out*", "calendar_*")
ANY_DIRECTORY = {"__pycache__"}
ZIP_UTF8_FLAG = 1 << 11
ZIP_ENCRYPTED_FLAG = 1
ZIP_DATA_DESCRIPTOR_FLAG = 1 << 3
ZIP64_EXTRA_ID = 0x0001


class PackageError(RuntimeError):
    """A fail-closed package contract violation."""


class PublicationError(PackageError):
    """A publication failure that retains the exact commit state."""

    def __init__(self, message: str, state: "PublicationState") -> None:
        super().__init__(message)
        self.state = state


@dataclass(frozen=True)
class SnapshotEntry:
    path: str
    kind: str
    device: int
    inode: int
    mode: int
    size: int
    mtime_ns: int
    sha256: str | None
    excluded: bool


@dataclass(frozen=True)
class SourceFile:
    path: str
    source_path: Path
    sha256: str
    mode: str
    size: int
    stat_signature: tuple[int, int, int, int, int]


@dataclass(frozen=True)
class SourceDirectory:
    path: str
    mode: str = "0755"


@dataclass
class SourceScan:
    root: Path
    snapshot: dict[str, SnapshotEntry]
    directories: list[SourceDirectory]
    files: list[SourceFile]


@dataclass
class PublicationState:
    archiveBuilt: bool = False
    archiveVerified: bool = False
    outputPublished: bool = False
    publicationDurable: bool = False
    temporaryRemoved: bool = False
    packagingEligible: bool = False
    temporaryArchivePath: str | None = None
    finalOutputPath: str | None = None


@dataclass(frozen=True)
class CentralEntry:
    name: str
    raw_name: bytes
    version_made: int
    version_needed: int
    flags: int
    compression: int
    dos_time: int
    dos_date: int
    crc: int
    compressed_size: int
    uncompressed_size: int
    external_attr: int
    local_offset: int
    extra: bytes
    comment: bytes


def canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _contains_control(value: str) -> bool:
    return any(ord(character) < 32 or ord(character) == 127 for character in value)


def validate_identifier(value: object, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise PackageError(f"{label} must be a non-empty string")
    if value != unicodedata.normalize("NFC", value):
        raise PackageError(f"{label} must already be Unicode NFC")
    if value != value.strip():
        raise PackageError(f"{label} must not contain leading/trailing whitespace")
    if value in {".", ".."}:
        raise PackageError(f"{label} must not be '.' or '..'")
    if "/" in value or "\\" in value or "\x00" in value or _contains_control(value):
        raise PackageError(f"{label} contains an unsafe path character")
    return value


def package_root_name(package_name: object, package_version: object) -> str:
    name = validate_identifier(package_name, "packageName")
    version = validate_identifier(package_version, "packageVersion")
    root = f"{name}-v{version}"
    validate_identifier(root, "combined package root")
    return root


def validate_relative_path(path: str, *, directory: bool = False) -> str:
    value = path[:-1] if directory and path.endswith("/") else path
    if not value or value.startswith("/") or "\\" in value or "\x00" in value:
        raise PackageError(f"unsafe relative path: {path!r}")
    if value != unicodedata.normalize("NFC", value) or _contains_control(value):
        raise PackageError(f"non-normalized relative path: {path!r}")
    parts = value.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        raise PackageError(f"unsafe relative path component: {path!r}")
    return value + ("/" if directory else "")


def is_excluded(path: str, *, is_directory: bool) -> bool:
    parts = path.split("/")
    basename = parts[-1]
    if any(component in ANY_DIRECTORY for component in parts):
        return True
    top_is_directory = len(parts) > 1 or is_directory
    if top_is_directory and (
        parts[0] in TOP_LEVEL_EXACT
        or any(fnmatch.fnmatchcase(parts[0], pattern) for pattern in TOP_LEVEL_GLOBS)
    ):
        return True
    if basename == ".DS_Store" or basename.startswith("._"):
        return True
    if basename.endswith((".pyc", ".pyo")):
        return True
    return False


def _kind_from_mode(mode: int) -> str:
    if stat.S_ISREG(mode):
        return "file"
    if stat.S_ISDIR(mode):
        return "directory"
    if stat.S_ISLNK(mode):
        return "symlink"
    return "special"


def _file_stat_signature(value: os.stat_result) -> tuple[int, int, int, int, int]:
    return (value.st_dev, value.st_ino, value.st_mode, value.st_size, value.st_mtime_ns)


def _read_stable_file(path: Path, expected: os.stat_result) -> tuple[bytes, str]:
    before = path.stat(follow_symlinks=False)
    if _file_stat_signature(before) != _file_stat_signature(expected):
        raise PackageError(f"source changed before read: {path}")
    with path.open("rb") as handle:
        content = handle.read()
    after = path.stat(follow_symlinks=False)
    if _file_stat_signature(before) != _file_stat_signature(after):
        raise PackageError(f"source changed while reading: {path}")
    return content, sha256_bytes(content)


def scan_source(source_root: Path | str) -> SourceScan:
    root = Path(source_root).resolve()
    if not root.is_dir():
        raise PackageError(f"source root is not a directory: {root}")
    snapshot: dict[str, SnapshotEntry] = {}
    directories: list[SourceDirectory] = []
    files: list[SourceFile] = []
    normalized_paths: dict[str, str] = {}

    def visit(directory: Path, prefix: tuple[str, ...]) -> None:
        try:
            children = sorted(os.scandir(directory), key=lambda row: row.name)
        except OSError as error:
            raise PackageError(f"cannot scan source directory {directory}: {error}") from error
        for child in children:
            relative_parts = (*prefix, child.name)
            relative = "/".join(relative_parts)
            validate_relative_path(relative)
            normalized = unicodedata.normalize("NFC", relative)
            previous = normalized_paths.get(normalized)
            if previous is not None and previous != relative:
                raise PackageError(f"source paths collide after NFC normalization: {previous}, {relative}")
            normalized_paths[normalized] = relative
            try:
                metadata = child.stat(follow_symlinks=False)
            except OSError as error:
                raise PackageError(f"cannot stat source path {relative}: {error}") from error
            kind = _kind_from_mode(metadata.st_mode)
            excluded = is_excluded(relative, is_directory=kind == "directory")
            if kind in {"symlink", "special"}:
                raise PackageError(f"unsupported source {kind}: {relative}")
            digest: str | None = None
            if kind == "file":
                content, digest = _read_stable_file(Path(child.path), metadata)
                del content
            snapshot[relative] = SnapshotEntry(
                path=relative,
                kind=kind,
                device=metadata.st_dev,
                inode=metadata.st_ino,
                mode=metadata.st_mode,
                size=metadata.st_size,
                mtime_ns=metadata.st_mtime_ns,
                sha256=digest,
                excluded=excluded,
            )
            if not excluded:
                if kind == "directory":
                    directories.append(SourceDirectory(path=f"{relative}/"))
                else:
                    normalized_mode = "0755" if metadata.st_mode & 0o111 else "0644"
                    files.append(SourceFile(
                        path=relative,
                        source_path=Path(child.path),
                        sha256=digest or "",
                        mode=normalized_mode,
                        size=metadata.st_size,
                        stat_signature=_file_stat_signature(metadata),
                    ))
            if kind == "directory":
                visit(Path(child.path), relative_parts)

    visit(root, ())
    directories.sort(key=lambda row: row.path)
    files.sort(key=lambda row: row.path)
    return SourceScan(root=root, snapshot=snapshot, directories=directories, files=files)


def assert_same_snapshot(before: SourceScan, after: SourceScan) -> None:
    if before.snapshot != after.snapshot:
        before_paths = set(before.snapshot)
        after_paths = set(after.snapshot)
        added = sorted(after_paths - before_paths)
        removed = sorted(before_paths - after_paths)
        changed = sorted(
            path for path in before_paths & after_paths
            if before.snapshot[path] != after.snapshot[path]
        )
        raise PackageError(
            "source mutated during packaging: "
            f"added={added[:5]}, removed={removed[:5]}, changed={changed[:5]}"
        )


def normalize_epoch(value: int) -> tuple[int, tuple[int, int, int, int, int, int], str]:
    if value < MIN_EPOCH or value > MAX_EPOCH:
        raise PackageError("source date epoch is outside the ZIP DOS timestamp range")
    normalized = value - (value % 2)
    current = datetime.fromtimestamp(normalized, timezone.utc)
    if current.year < 1980 or current.year > 2107:
        raise PackageError("source date epoch is outside the ZIP DOS timestamp range")
    date_time = (current.year, current.month, current.day, current.hour, current.minute, current.second)
    timestamp = current.strftime("%Y-%m-%dT%H:%M:%SZ")
    return normalized, date_time, timestamp


def resolve_epoch(cli_epoch: int | None, environment: Mapping[str, str] | None = None) -> int:
    env = os.environ if environment is None else environment
    raw_environment = env.get("SOURCE_DATE_EPOCH")
    environment_epoch: int | None = None
    if raw_environment is not None:
        try:
            environment_epoch = int(raw_environment)
        except ValueError as error:
            raise PackageError("SOURCE_DATE_EPOCH must be an integer") from error
    if cli_epoch is None and environment_epoch is None:
        raise PackageError("--source-date-epoch or SOURCE_DATE_EPOCH is required")
    if cli_epoch is not None and environment_epoch is not None and cli_epoch != environment_epoch:
        raise PackageError("CLI epoch and SOURCE_DATE_EPOCH must be identical")
    return normalize_epoch(cli_epoch if cli_epoch is not None else environment_epoch or 0)[0]


def _load_version_manifest(scan: SourceScan, package_version: str) -> tuple[str, str, bytes]:
    row = next((item for item in scan.files if item.path == VERSION_MANIFEST_NAME), None)
    if row is None:
        raise PackageError(f"included source is missing {VERSION_MANIFEST_NAME}")
    content, digest = _read_stable_file(row.source_path, row.source_path.stat(follow_symlinks=False))
    if digest != row.sha256:
        raise PackageError(f"{VERSION_MANIFEST_NAME} changed after source scan")
    try:
        manifest = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PackageError(f"invalid {VERSION_MANIFEST_NAME}: {error}") from error
    if not isinstance(manifest, dict):
        raise PackageError(f"{VERSION_MANIFEST_NAME} must be a JSON object")
    package_name = validate_identifier(manifest.get("packageName"), "packageName")
    manifest_version = validate_identifier(manifest.get("packageVersion"), "manifest packageVersion")
    requested_version = validate_identifier(package_version, "packageVersion")
    if manifest_version != requested_version:
        raise PackageError(
            f"requested package version {requested_version!r} does not match manifest {manifest_version!r}"
        )
    return package_name, manifest_version, content


def _inventory_rows(scan: SourceScan) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    directories = [{"path": row.path, "mode": row.mode} for row in scan.directories]
    files = [
        {"path": row.path, "sha256": row.sha256, "mode": row.mode}
        for row in scan.files
    ]
    return directories, files


def build_integrity_manifest(
    scan: SourceScan,
    package_name: str,
    package_version: str,
    epoch: int,
    timestamp: str,
) -> dict[str, object]:
    directories, files = _inventory_rows(scan)
    inventory = {"directories": directories, "files": files}
    version_row = next(row for row in files if row["path"] == VERSION_MANIFEST_NAME)
    value: dict[str, object] = {
        "schemaVersion": SCHEMA_VERSION,
        "packageName": package_name,
        "packageVersion": package_version,
        "sourceDateEpoch": epoch,
        "normalizedZipTimestamp": timestamp,
        "compression": {"method": "deflate", "level": 9},
        "directories": directories,
        "files": files,
        "sourceInventoryHash": sha256_bytes(canonical_json(inventory)),
        "versionManifestHash": version_row["sha256"],
    }
    value["manifestHash"] = sha256_bytes(canonical_json(value))
    return value


def _zip_info(name: str, date_time: tuple[int, int, int, int, int, int], *, directory: bool, mode: int) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, date_time=date_time)
    info.create_system = 3
    info.compress_type = zipfile.ZIP_STORED if directory else zipfile.ZIP_DEFLATED
    info.external_attr = (
        ((stat.S_IFDIR | mode) << 16) | 0x10
        if directory
        else (stat.S_IFREG | mode) << 16
    )
    info.extra = b""
    info.comment = b""
    return info


def _write_archive(
    handle: object,
    scan: SourceScan,
    root_name: str,
    integrity_bytes: bytes,
    date_time: tuple[int, int, int, int, int, int],
) -> None:
    entries: list[tuple[str, str, SourceDirectory | SourceFile | None]] = []
    entries.extend((row.path, "directory", row) for row in scan.directories)
    entries.extend((row.path, "file", row) for row in scan.files)
    entries.append((INTEGRITY_NAME, "integrity", None))
    entries.sort(key=lambda row: row[0])
    with zipfile.ZipFile(
        handle,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        allowZip64=False,
        compresslevel=9,
        strict_timestamps=True,
    ) as archive:
        archive.comment = b""
        root_info = _zip_info(f"{root_name}/", date_time, directory=True, mode=0o755)
        archive.writestr(root_info, b"", compress_type=zipfile.ZIP_STORED)
        for relative, kind, row in entries:
            archive_name = f"{root_name}/{relative}"
            if kind == "directory":
                info = _zip_info(archive_name, date_time, directory=True, mode=0o755)
                archive.writestr(info, b"", compress_type=zipfile.ZIP_STORED)
            elif kind == "integrity":
                info = _zip_info(archive_name, date_time, directory=False, mode=0o644)
                archive.writestr(info, integrity_bytes, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
            else:
                assert isinstance(row, SourceFile)
                metadata = row.source_path.stat(follow_symlinks=False)
                if _file_stat_signature(metadata) != row.stat_signature:
                    raise PackageError(f"source changed before ZIP write: {relative}")
                content, digest = _read_stable_file(row.source_path, metadata)
                if digest != row.sha256:
                    raise PackageError(f"source content changed before ZIP write: {relative}")
                mode = 0o755 if row.mode == "0755" else 0o644
                info = _zip_info(archive_name, date_time, directory=False, mode=mode)
                archive.writestr(info, content, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def _parse_extra(extra: bytes) -> list[tuple[int, bytes]]:
    rows: list[tuple[int, bytes]] = []
    offset = 0
    while offset < len(extra):
        if offset + 4 > len(extra):
            raise PackageError("malformed ZIP extra field")
        identifier, size = struct.unpack_from("<HH", extra, offset)
        offset += 4
        if offset + size > len(extra):
            raise PackageError("malformed ZIP extra field payload")
        rows.append((identifier, extra[offset:offset + size]))
        offset += size
    return rows


def _decode_raw_name(raw_name: bytes, flags: int) -> str:
    if flags & ZIP_UTF8_FLAG:
        try:
            return raw_name.decode("utf-8")
        except UnicodeDecodeError as error:
            raise PackageError("UTF-8 filename flag is set for invalid UTF-8 bytes") from error
    if any(value >= 128 for value in raw_name):
        raise PackageError("non-ASCII filename must use UTF-8 flag; CP437 fallback is forbidden")
    try:
        return raw_name.decode("ascii")
    except UnicodeDecodeError as error:
        raise PackageError("invalid ASCII filename") from error


def _parse_central_directory(archive_bytes: bytes) -> list[CentralEntry]:
    eocd_offset = archive_bytes.rfind(b"PK\x05\x06", max(0, len(archive_bytes) - 65557))
    if eocd_offset < 0 or eocd_offset + 22 != len(archive_bytes):
        raise PackageError("missing, commented, or trailing-data ZIP EOCD")
    (
        signature,
        disk_number,
        central_disk,
        disk_entries,
        total_entries,
        central_size,
        central_offset,
        comment_length,
    ) = struct.unpack_from("<4s4H2IH", archive_bytes, eocd_offset)
    if signature != b"PK\x05\x06" or comment_length != 0:
        raise PackageError("ZIP comment is forbidden")
    if disk_number or central_disk or disk_entries != total_entries:
        raise PackageError("multi-disk ZIP archives are forbidden")
    if total_entries == 0xFFFF or central_size == 0xFFFFFFFF or central_offset == 0xFFFFFFFF:
        raise PackageError("ZIP64 EOCD values are forbidden")
    if central_offset + central_size != eocd_offset:
        raise PackageError("central directory boundaries are inconsistent or contain ZIP64 records")
    if eocd_offset >= 20 and archive_bytes[eocd_offset - 20:eocd_offset - 16] == b"PK\x06\x07":
        raise PackageError("ZIP64 locator is forbidden")

    entries: list[CentralEntry] = []
    offset = central_offset
    for _ in range(total_entries):
        if offset + 46 > eocd_offset:
            raise PackageError("truncated central directory")
        values = struct.unpack_from("<4s6H3I5H2I", archive_bytes, offset)
        if values[0] != b"PK\x01\x02":
            raise PackageError("invalid central directory signature")
        (
            _, version_made, version_needed, flags, compression, dos_time, dos_date,
            crc, compressed_size, uncompressed_size, name_length, extra_length,
            comment_length, disk_start, _internal_attr, external_attr, local_offset,
        ) = values
        start = offset + 46
        end_name = start + name_length
        end_extra = end_name + extra_length
        end_comment = end_extra + comment_length
        if end_comment > eocd_offset:
            raise PackageError("central directory variable fields are truncated")
        raw_name = archive_bytes[start:end_name]
        extra = archive_bytes[end_name:end_extra]
        comment = archive_bytes[end_extra:end_comment]
        if disk_start != 0:
            raise PackageError("multi-disk ZIP entry is forbidden")
        if any(identifier == ZIP64_EXTRA_ID for identifier, _ in _parse_extra(extra)):
            raise PackageError("ZIP64 extra field is forbidden")
        entries.append(CentralEntry(
            name=_decode_raw_name(raw_name, flags),
            raw_name=raw_name,
            version_made=version_made,
            version_needed=version_needed,
            flags=flags,
            compression=compression,
            dos_time=dos_time,
            dos_date=dos_date,
            crc=crc,
            compressed_size=compressed_size,
            uncompressed_size=uncompressed_size,
            external_attr=external_attr,
            local_offset=local_offset,
            extra=extra,
            comment=comment,
        ))
        offset = end_comment
    if offset != eocd_offset:
        raise PackageError("central directory size does not match its entries")
    return entries


def _verify_local_headers(archive_bytes: bytes, entries: Sequence[CentralEntry]) -> None:
    for entry in entries:
        offset = entry.local_offset
        if offset + 30 > len(archive_bytes):
            raise PackageError(f"truncated local header: {entry.name}")
        values = struct.unpack_from("<4s5H3I2H", archive_bytes, offset)
        (
            signature, _version_needed, flags, compression, dos_time, dos_date,
            crc, compressed_size, uncompressed_size, name_length, extra_length,
        ) = values
        if signature != b"PK\x03\x04":
            raise PackageError(f"invalid local header signature: {entry.name}")
        start = offset + 30
        end_name = start + name_length
        end_extra = end_name + extra_length
        if end_extra > len(archive_bytes):
            raise PackageError(f"truncated local header fields: {entry.name}")
        raw_name = archive_bytes[start:end_name]
        local_extra = archive_bytes[end_name:end_extra]
        if flags & ZIP_DATA_DESCRIPTOR_FLAG:
            raise PackageError(f"data descriptor flag is forbidden: {entry.name}")
        comparisons = {
            "raw filename": (raw_name, entry.raw_name),
            "flags": (flags, entry.flags),
            "compression": (compression, entry.compression),
            "DOS time": (dos_time, entry.dos_time),
            "DOS date": (dos_date, entry.dos_date),
            "local extra": (local_extra, entry.extra),
            "CRC": (crc, entry.crc),
            "compressed size": (compressed_size, entry.compressed_size),
            "uncompressed size": (uncompressed_size, entry.uncompressed_size),
        }
        for label, (local, central) in comparisons.items():
            if local != central:
                raise PackageError(f"local/central {label} mismatch: {entry.name}")


def _dos_values(date_time: tuple[int, int, int, int, int, int]) -> tuple[int, int]:
    year, month, day, hour, minute, second = date_time
    dos_time = (hour << 11) | (minute << 5) | (second // 2)
    dos_date = ((year - 1980) << 9) | (month << 5) | day
    return dos_time, dos_date


def _entry_is_directory(entry: CentralEntry) -> bool:
    mode = entry.external_attr >> 16
    return stat.S_ISDIR(mode)


def _validate_archive_path(name: str) -> None:
    directory = name.endswith("/")
    validate_relative_path(name, directory=directory)


def _expected_entries(root_name: str, manifest: Mapping[str, object]) -> list[str]:
    directories = manifest.get("directories")
    files = manifest.get("files")
    if not isinstance(directories, list) or not isinstance(files, list):
        raise PackageError("integrity directories/files must be arrays")
    relative: list[str] = [INTEGRITY_NAME]
    for row in directories:
        if not isinstance(row, dict) or set(row) != {"path", "mode"}:
            raise PackageError("invalid integrity directory row")
        path = row.get("path")
        if not isinstance(path, str) or row.get("mode") != "0755":
            raise PackageError("invalid integrity directory path or mode")
        relative.append(validate_relative_path(path, directory=True))
    for row in files:
        if not isinstance(row, dict) or set(row) != {"path", "sha256", "mode"}:
            raise PackageError("invalid integrity file row")
        path = row.get("path")
        if not isinstance(path, str) or row.get("mode") not in {"0644", "0755"}:
            raise PackageError("invalid integrity file path or mode")
        if not isinstance(row.get("sha256"), str) or len(row["sha256"]) != 64:
            raise PackageError("invalid integrity file hash")
        relative.append(validate_relative_path(path))
    if directories != sorted(directories, key=lambda row: row["path"]):
        raise PackageError("integrity directories are not sorted")
    if files != sorted(files, key=lambda row: row["path"]):
        raise PackageError("integrity files are not sorted")
    if len(relative) != len(set(relative)):
        raise PackageError("duplicate integrity path")
    return [f"{root_name}/"] + [f"{root_name}/{path}" for path in sorted(relative)]


def verify_archive(
    archive_path: Path | str,
    source_root: Path | str | None = None,
    *,
    enforce_filename: bool = True,
) -> dict[str, object]:
    archive_file = Path(archive_path).resolve()
    archive_bytes = archive_file.read_bytes()
    entries = _parse_central_directory(archive_bytes)
    if not entries:
        raise PackageError("archive is empty")
    _verify_local_headers(archive_bytes, entries)
    names = [entry.name for entry in entries]
    if len(names) != len(set(names)):
        raise PackageError("duplicate ZIP entry name")
    normalized_seen: dict[str, str] = {}
    for entry in entries:
        _validate_archive_path(entry.name)
        normalized = unicodedata.normalize("NFC", entry.name)
        previous = normalized_seen.get(normalized)
        if previous is not None and previous != entry.name:
            raise PackageError("ZIP entry names collide after NFC normalization")
        normalized_seen[normalized] = entry.name
        if entry.flags & ZIP_ENCRYPTED_FLAG:
            raise PackageError(f"encrypted ZIP entry is forbidden: {entry.name}")
        if entry.flags & ZIP_DATA_DESCRIPTOR_FLAG:
            raise PackageError(f"data descriptor flag is forbidden: {entry.name}")
        if entry.flags & ~(ZIP_UTF8_FLAG):
            raise PackageError(f"unexpected ZIP flags on {entry.name}: {entry.flags:#x}")
        if entry.extra or entry.comment:
            raise PackageError(f"ZIP extra field/comment is forbidden: {entry.name}")
        if any(ord(character) > 127 for character in entry.name) and not entry.flags & ZIP_UTF8_FLAG:
            raise PackageError(f"non-ASCII ZIP name lacks UTF-8 flag: {entry.name}")
        if all(ord(character) < 128 for character in entry.name) and any(value >= 128 for value in entry.raw_name):
            raise PackageError(f"ASCII ZIP name has non-ASCII bytes: {entry.name}")

    integrity_names = [name for name in names if name.endswith(f"/{INTEGRITY_NAME}")]
    if len(integrity_names) != 1:
        raise PackageError("archive must contain exactly one integrity manifest")
    integrity_name = integrity_names[0]
    root_name = integrity_name[:-(len(INTEGRITY_NAME) + 1)]
    if "/" in root_name:
        raise PackageError("versioned ZIP root must be one path component")
    with zipfile.ZipFile(archive_file, "r", allowZip64=False) as archive:
        if archive.comment:
            raise PackageError("ZIP comment is forbidden")
        try:
            integrity_bytes = archive.read(integrity_name)
        except (KeyError, RuntimeError, zipfile.BadZipFile) as error:
            raise PackageError(f"cannot read integrity manifest: {error}") from error
        try:
            manifest = json.loads(integrity_bytes.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise PackageError(f"invalid integrity manifest JSON: {error}") from error
        if not isinstance(manifest, dict):
            raise PackageError("integrity manifest must be an object")
        if canonical_json(manifest) != integrity_bytes:
            raise PackageError("integrity manifest is not canonical JSON")
        expected_manifest_fields = {
            "schemaVersion", "packageName", "packageVersion", "sourceDateEpoch",
            "normalizedZipTimestamp", "compression", "directories", "files",
            "sourceInventoryHash", "versionManifestHash", "manifestHash",
        }
        if set(manifest) != expected_manifest_fields:
            raise PackageError("integrity manifest field set is invalid")
        if manifest.get("schemaVersion") != SCHEMA_VERSION:
            raise PackageError("unsupported integrity schema version")
        package_name = validate_identifier(manifest.get("packageName"), "packageName")
        package_version = validate_identifier(manifest.get("packageVersion"), "packageVersion")
        expected_root = package_root_name(package_name, package_version)
        if root_name != expected_root:
            raise PackageError("ZIP root does not match integrity package identifiers")
        if enforce_filename and archive_file.name != f"{expected_root}.zip":
            raise PackageError("archive filename does not match package identifiers")
        compression = manifest.get("compression")
        if compression != {"method": "deflate", "level": 9}:
            raise PackageError("integrity compression contract must be deflate level 9")
        epoch = manifest.get("sourceDateEpoch")
        if not isinstance(epoch, int):
            raise PackageError("integrity sourceDateEpoch must be an integer")
        normalized_epoch, date_time, timestamp = normalize_epoch(epoch)
        if epoch != normalized_epoch or manifest.get("normalizedZipTimestamp") != timestamp:
            raise PackageError("integrity timestamp is not normalized")
        expected_names = _expected_entries(expected_root, manifest)
        if names != expected_names:
            raise PackageError("ZIP entry set or root-first unified lexical ordering is invalid")
        manifest_without_hash = dict(manifest)
        claimed_manifest_hash = manifest_without_hash.pop("manifestHash", None)
        if claimed_manifest_hash != sha256_bytes(canonical_json(manifest_without_hash)):
            raise PackageError("integrity manifestHash mismatch")
        inventory = {"directories": manifest["directories"], "files": manifest["files"]}
        if manifest.get("sourceInventoryHash") != sha256_bytes(canonical_json(inventory)):
            raise PackageError("integrity sourceInventoryHash mismatch")
        files_by_path = {row["path"]: row for row in manifest["files"]}
        directories_by_path = {row["path"]: row for row in manifest["directories"]}
        version_row = files_by_path.get(VERSION_MANIFEST_NAME)
        if version_row is None or manifest.get("versionManifestHash") != version_row["sha256"]:
            raise PackageError("VERSION_MANIFEST hash contract mismatch")
        expected_dos_time, expected_dos_date = _dos_values(date_time)
        archived_version_manifest: bytes | None = None
        for entry in entries:
            if entry.version_made >> 8 != 3:
                raise PackageError(f"ZIP entry creator system must be Unix: {entry.name}")
            if entry.dos_time != expected_dos_time or entry.dos_date != expected_dos_date:
                raise PackageError(f"unexpected ZIP timestamp: {entry.name}")
            unix_mode = entry.external_attr >> 16
            if entry.name == f"{expected_root}/" or entry.name.endswith("/"):
                if entry.compression != zipfile.ZIP_STORED or not stat.S_ISDIR(unix_mode):
                    raise PackageError(f"directory ZIP contract mismatch: {entry.name}")
                if stat.S_IMODE(unix_mode) != 0o755:
                    raise PackageError(f"directory mode mismatch: {entry.name}")
                if entry.external_attr & 0xFFFF != 0x10:
                    raise PackageError(f"directory DOS attribute mismatch: {entry.name}")
                if entry.uncompressed_size != 0:
                    raise PackageError(f"directory entry must be empty: {entry.name}")
            else:
                if entry.compression != zipfile.ZIP_DEFLATED or not stat.S_ISREG(unix_mode):
                    raise PackageError(f"regular-file ZIP contract mismatch: {entry.name}")
                if entry.external_attr & 0xFFFF:
                    raise PackageError(f"regular-file DOS attribute mismatch: {entry.name}")
                relative = entry.name[len(expected_root) + 1:]
                expected_mode = "0644" if relative == INTEGRITY_NAME else files_by_path[relative]["mode"]
                if stat.S_IMODE(unix_mode) != int(expected_mode, 8):
                    raise PackageError(f"regular-file mode mismatch: {entry.name}")
                try:
                    content = archive.read(entry.name)
                except (RuntimeError, zipfile.BadZipFile) as error:
                    raise PackageError(f"cannot read ZIP entry {entry.name}: {error}") from error
                if relative != INTEGRITY_NAME and sha256_bytes(content) != files_by_path[relative]["sha256"]:
                    raise PackageError(f"ZIP entry hash mismatch: {entry.name}")
                if relative == VERSION_MANIFEST_NAME:
                    archived_version_manifest = content
        for path in directories_by_path:
            if not path.endswith("/"):
                raise PackageError(f"integrity directory lacks trailing slash: {path}")
        if archived_version_manifest is None:
            raise PackageError(f"archive is missing {VERSION_MANIFEST_NAME}")
        try:
            version_manifest = json.loads(archived_version_manifest.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise PackageError(f"invalid archived {VERSION_MANIFEST_NAME}: {error}") from error
        if not isinstance(version_manifest, dict):
            raise PackageError(f"archived {VERSION_MANIFEST_NAME} must be an object")
        if version_manifest.get("packageName") != package_name:
            raise PackageError("VERSION_MANIFEST packageName does not match ZIP root")
        if version_manifest.get("packageVersion") != package_version:
            raise PackageError("VERSION_MANIFEST packageVersion does not match ZIP root")

    source_verified = False
    if source_root is not None:
        source_before = scan_source(source_root)
        source_directories, source_files = _inventory_rows(source_before)
        if source_directories != manifest["directories"] or source_files != manifest["files"]:
            raise PackageError("source inventory does not match archive integrity manifest")
        source_inventory = {"directories": source_directories, "files": source_files}
        if sha256_bytes(canonical_json(source_inventory)) != manifest["sourceInventoryHash"]:
            raise PackageError("source inventory hash does not match archive")
        source_after = scan_source(source_root)
        assert_same_snapshot(source_before, source_after)
        source_verified = True
    return {
        "result": "pass",
        "archive": str(archive_file),
        "entryCount": len(entries),
        "packageName": package_name,
        "packageVersion": package_version,
        "archiveOnlyVerified": True,
        "sourceAwareVerified": source_verified,
        "localCentralHeaderVerified": True,
        "zip64Absent": True,
        "filenameEncodingContractVerified": True,
    }


def _fsync_directory(directory: Path) -> None:
    descriptor = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _output_preflight(source_root: Path, output: Path, root_name: str) -> None:
    resolved_output = output.resolve(strict=False)
    if resolved_output.name != f"{root_name}.zip":
        raise PackageError("output filename must match packageName and packageVersion")
    try:
        resolved_output.relative_to(source_root)
    except ValueError:
        pass
    else:
        raise PackageError("output must be outside source root")
    if output.exists() or output.is_symlink():
        raise PackageError("output already exists; no-overwrite publication refused")
    if not output.parent.is_dir():
        raise PackageError("output parent directory must already exist")


def build_archive(
    source_root: Path | str,
    output: Path | str,
    package_version: str,
    source_date_epoch: int,
    *,
    dry_run: bool = False,
) -> PublicationState:
    source = Path(source_root).resolve()
    final_output = Path(output).resolve(strict=False)
    state = PublicationState(finalOutputPath=str(final_output))
    scan_before = scan_source(source)
    normalized_epoch, date_time, timestamp = normalize_epoch(source_date_epoch)
    package_name, manifest_version, _ = _load_version_manifest(scan_before, package_version)
    root_name = package_root_name(package_name, manifest_version)
    _output_preflight(source, final_output, root_name)
    integrity = build_integrity_manifest(
        scan_before,
        package_name,
        manifest_version,
        normalized_epoch,
        timestamp,
    )
    if dry_run:
        return state
    temporary = final_output.parent / f".{final_output.name}.{os.getpid()}.{secrets.token_hex(8)}.tmp"
    state.temporaryArchivePath = str(temporary)
    descriptor: int | None = None
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w+b", closefd=True) as handle:
            descriptor = None
            _write_archive(
                handle,
                scan_before,
                root_name,
                canonical_json(integrity),
                date_time,
            )
            handle.flush()
            os.fsync(handle.fileno())
        state.archiveBuilt = True
        verify_archive(temporary, enforce_filename=False)
        state.archiveVerified = True
        scan_after = scan_source(source)
        assert_same_snapshot(scan_before, scan_after)
        os.link(temporary, final_output)
        state.outputPublished = True
        _fsync_directory(final_output.parent)
        state.publicationDurable = True
        os.unlink(temporary)
        state.temporaryRemoved = True
        _fsync_directory(final_output.parent)
        state.packagingEligible = True
        return state
    except Exception as error:
        if descriptor is not None:
            os.close(descriptor)
        if isinstance(error, PublicationError):
            raise
        raise PublicationError(str(error), state) from error


def safe_unpack(archive_path: Path | str, destination: Path | str) -> dict[str, str]:
    result = verify_archive(archive_path)
    target = Path(destination)
    if not target.is_dir() or any(target.iterdir()):
        raise PackageError("safe unpack destination must be an existing empty directory")
    inventory: dict[str, str] = {}
    with zipfile.ZipFile(archive_path, "r", allowZip64=False) as archive:
        for info in archive.infolist():
            relative = PurePosixPath(info.filename)
            output = target.joinpath(*relative.parts)
            unix_mode = info.external_attr >> 16
            if info.filename.endswith("/"):
                output.mkdir(mode=0o755)
                os.chmod(output, 0o755)
                inventory[info.filename] = "directory:0755"
            else:
                output.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
                content = archive.read(info.filename)
                descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, stat.S_IMODE(unix_mode))
                with os.fdopen(descriptor, "wb") as handle:
                    handle.write(content)
                os.chmod(output, stat.S_IMODE(unix_mode))
                inventory[info.filename] = f"{sha256_bytes(content)}:{stat.S_IMODE(unix_mode):04o}"
    result["safeUnpackEntryCount"] = len(inventory)
    return inventory


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    build = subparsers.add_parser("build", help="build a deterministic archive")
    build.add_argument("--source-root", required=True, type=Path)
    build.add_argument("--output", required=True, type=Path)
    build.add_argument("--package-version", required=True)
    build.add_argument("--source-date-epoch", type=int)
    build.add_argument("--dry-run", action="store_true")
    verify = subparsers.add_parser("verify", help="verify an archive")
    verify.add_argument("--archive", required=True, type=Path)
    verify.add_argument("--source-root", type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    try:
        args = parser.parse_args(argv)
        if args.command == "build":
            epoch = resolve_epoch(args.source_date_epoch)
            state = build_archive(
                args.source_root,
                args.output,
                args.package_version,
                epoch,
                dry_run=args.dry_run,
            )
            print(json.dumps(asdict(state), ensure_ascii=False, sort_keys=True))
        else:
            result = verify_archive(args.archive, args.source_root)
            print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except PublicationError as error:
        payload = asdict(error.state)
        payload["error"] = str(error)
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True), file=sys.stderr)
        return 1
    except (PackageError, OSError, ValueError, struct.error, zipfile.BadZipFile) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
