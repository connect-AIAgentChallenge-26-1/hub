"""Deterministic, read-only repository-to-Wiki mapping audits."""

from __future__ import annotations

import hashlib
import json
import posixpath
import re
import unicodedata
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import unquote


class AuditError(RuntimeError):
    """Raised when an input or safety check fails closed."""


class DuplicateKeyError(AuditError):
    """Raised for a duplicate JSON object key at any nesting level."""


def _reject_duplicate_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise DuplicateKeyError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def load_json_no_duplicates(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(
            path.read_text(encoding="utf-8"), object_pairs_hook=_reject_duplicate_pairs
        )
    except OSError as error:
        raise AuditError(f"cannot read JSON: {path}: {error}") from error
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise AuditError(f"invalid JSON: {path}: {error}") from error
    if not isinstance(value, dict):
        raise AuditError(f"top-level JSON value must be an object: {path}")
    return value


def _normalize_strings(value: Any) -> Any:
    if isinstance(value, str):
        return value.replace("\r\n", "\n").replace("\r", "\n")
    if isinstance(value, list):
        return [_normalize_strings(item) for item in value]
    if isinstance(value, dict):
        return {key: _normalize_strings(item) for key, item in value.items()}
    return value


def canonical_json_bytes(value: Any) -> bytes:
    text = json.dumps(
        _normalize_strings(value),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return text.encode("utf-8") + b"\n"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def validate_relative_path(path: str) -> None:
    if not path or path.startswith("/") or "\\" in path or "\0" in path:
        raise AuditError(f"invalid relative path: {path!r}")
    if any(segment in {"", ".", ".."} for segment in path.split("/")):
        raise AuditError(f"invalid path segment: {path!r}")


def _validate_path_collisions(paths: Iterable[str], label: str) -> None:
    exact: set[str] = set()
    normalized: dict[str, str] = {}
    folded: dict[str, str] = {}
    for path in paths:
        validate_relative_path(path)
        if path in exact:
            raise AuditError(f"duplicate {label} path: {path}")
        exact.add(path)
        nfc = unicodedata.normalize("NFC", path)
        if nfc in normalized and normalized[nfc] != path:
            raise AuditError(f"Unicode-normalization {label} collision: {path}")
        normalized[nfc] = path
        key = nfc.casefold()
        if key in folded and folded[key] != path:
            raise AuditError(f"case-insensitive {label} collision: {path}")
        folded[key] = path


def _validated_root(path: Path, label: str) -> Path:
    try:
        root = path.resolve(strict=True)
    except OSError as error:
        raise AuditError(f"{label} root is unavailable: {path}: {error}") from error
    if not root.is_dir():
        raise AuditError(f"{label} root is not a directory: {path}")
    return root


def _mapped_file(root: Path, relative_path: str, label: str) -> Path:
    validate_relative_path(relative_path)
    candidate = root.joinpath(*relative_path.split("/"))
    try:
        resolved = candidate.resolve(strict=True)
    except OSError as error:
        raise AuditError(f"{label} path is unavailable: {relative_path}: {error}") from error
    if root not in resolved.parents or not candidate.is_file() or candidate.is_symlink():
        raise AuditError(f"{label} path is not a regular file within its root: {relative_path}")
    return candidate


def _wiki_files(root: Path) -> list[str]:
    files: list[str] = []
    for path in root.rglob("*"):
        relative = path.relative_to(root)
        if relative.parts and relative.parts[0] == ".git":
            continue
        if path.is_symlink():
            raise AuditError(f"Wiki tree contains a symlink: {relative.as_posix()}")
        if path.is_file():
            files.append(relative.as_posix())
    return sorted(files)


_SHA256 = re.compile(r"[0-9a-f]{64}\Z")
_MARKDOWN_LINK = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")
_URI_SCHEME = re.compile(r"[A-Za-z][A-Za-z0-9+.-]*:")


def _validate_digest(value: Any, field: str, path: str) -> str:
    if not isinstance(value, str) or not _SHA256.fullmatch(value):
        raise AuditError(f"{field} must be a lowercase SHA-256 digest: {path}")
    return value


def _markdown_targets(data: bytes, source_path: str) -> list[tuple[int, str]]:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise AuditError(f"Markdown source is not UTF-8: {source_path}: {error}") from error
    targets: list[tuple[int, str]] = []
    fenced = False
    for line_number, line in enumerate(text.splitlines(), 1):
        if line.lstrip().startswith("```"):
            fenced = not fenced
            continue
        if fenced:
            continue
        for match in _MARKDOWN_LINK.finditer(line):
            target = match.group(1).strip()
            if target.startswith("<") and ">" in target:
                target = target[1 : target.index(">")]
            else:
                target = target.split(maxsplit=1)[0]
            targets.append((line_number, target))
    return targets


def _is_external_or_fragment(target: str) -> bool:
    return bool(_URI_SCHEME.match(target)) or target.startswith(("#", "//"))


def resolve_repository_target(source_path: str, raw_target: str) -> str:
    """Resolve a repository-relative Markdown target without filesystem access."""
    target = unquote(raw_target.split("#", 1)[0].split("?", 1)[0])
    resolved = posixpath.normpath(posixpath.join(posixpath.dirname(source_path), target))
    if resolved == ".." or resolved.startswith("../") or resolved.startswith("/"):
        raise AuditError(f"relative link escapes repository: {source_path} -> {raw_target}")
    validate_relative_path(resolved)
    return resolved


_TOP_LEVEL_KEYS = {"schemaVersion", "requireCompleteWiki", "pages"}
_PAGE_KEYS = {
    "syncMode",
    "repositoryPath",
    "wikiPath",
    "expectedRepositorySha256",
    "expectedWikiSha256",
}


def _validated_pages(mapping: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
    unknown = sorted(set(mapping) - _TOP_LEVEL_KEYS)
    if unknown:
        raise AuditError(f"unknown mapping fields: {unknown}")
    if mapping.get("schemaVersion") != "wiki-sync.v1":
        raise AuditError("unsupported schemaVersion")
    require_complete = mapping.get("requireCompleteWiki", False)
    if not isinstance(require_complete, bool):
        raise AuditError("requireCompleteWiki must be a boolean")
    pages = mapping.get("pages")
    if not isinstance(pages, list) or not pages:
        raise AuditError("pages must be a non-empty array")

    repository_paths: list[str] = []
    wiki_paths: list[str] = []
    for index, page in enumerate(pages):
        if not isinstance(page, dict):
            raise AuditError(f"page {index} must be an object")
        page_unknown = sorted(set(page) - _PAGE_KEYS)
        if page_unknown:
            raise AuditError(f"unknown page fields at index {index}: {page_unknown}")
        mode = page.get("syncMode")
        wiki_path = page.get("wikiPath")
        if mode not in {"publish", "preserve-wiki-only"}:
            raise AuditError(f"unknown sync mode at index {index}: {mode}")
        if not isinstance(wiki_path, str):
            raise AuditError(f"wikiPath must be a string at index {index}")
        wiki_paths.append(wiki_path)
        _validate_digest(page.get("expectedWikiSha256"), "expectedWikiSha256", wiki_path)

        repository_path = page.get("repositoryPath")
        if mode == "publish":
            if not isinstance(repository_path, str):
                raise AuditError(f"publish entry lacks repositoryPath: {wiki_path}")
            repository_paths.append(repository_path)
            _validate_digest(
                page.get("expectedRepositorySha256"),
                "expectedRepositorySha256",
                repository_path,
            )
        elif repository_path is not None or "expectedRepositorySha256" in page:
            raise AuditError(
                f"preserve-wiki-only entry must not declare a repository source: {wiki_path}"
            )

    _validate_path_collisions(wiki_paths, "Wiki")
    _validate_path_collisions(repository_paths, "repository")
    return pages, require_complete


_REASON_PRIORITY = (
    "source_relative_link_missing",
    "unmapped_wiki_path",
    "both_sides_changed",
    "wiki_content_drift",
    "preserved_wiki_page_drift",
)


def _ordered_reasons(reasons: Iterable[str]) -> list[str]:
    unique = set(reasons)
    ordered = [reason for reason in _REASON_PRIORITY if reason in unique]
    ordered.extend(sorted(unique - set(_REASON_PRIORITY)))
    return ordered


def audit_mapping(repository_root: Path, wiki_root: Path, mapping_path: Path) -> dict[str, Any]:
    """Audit explicit repository/Wiki roots against a content-baseline mapping."""
    repository_root = _validated_root(repository_root, "repository")
    wiki_root = _validated_root(wiki_root, "Wiki")
    mapping = load_json_no_duplicates(mapping_path)
    if mapping_path.read_bytes() != canonical_json_bytes(mapping):
        raise AuditError("mapping is not canonical JSON bytes")
    pages, require_complete = _validated_pages(mapping)

    reasons: set[str] = set()
    repository_drift: list[str] = []
    wiki_drift: list[str] = []
    preserved_count = 0
    source_link_count = 0
    missing_links: list[dict[str, Any]] = []

    for page in pages:
        wiki_path = page["wikiPath"]
        wiki_file = _mapped_file(wiki_root, wiki_path, "Wiki")
        wiki_changed = sha256_bytes(wiki_file.read_bytes()) != page["expectedWikiSha256"]
        if wiki_changed:
            wiki_drift.append(wiki_path)

        if page["syncMode"] == "preserve-wiki-only":
            preserved_count += 1
            if wiki_changed:
                reasons.add("preserved_wiki_page_drift")
            continue

        repository_path = page["repositoryPath"]
        repository_file = _mapped_file(repository_root, repository_path, "repository")
        repository_data = repository_file.read_bytes()
        repository_changed = (
            sha256_bytes(repository_data) != page["expectedRepositorySha256"]
        )
        if repository_changed:
            repository_drift.append(repository_path)
        if repository_changed and wiki_changed:
            reasons.add("both_sides_changed")
        elif wiki_changed:
            reasons.add("wiki_content_drift")

        if repository_path.endswith(".md"):
            for source_line, target in _markdown_targets(repository_data, repository_path):
                if _is_external_or_fragment(target):
                    continue
                normalized_target = resolve_repository_target(repository_path, target)
                source_link_count += 1
                try:
                    _mapped_file(repository_root, normalized_target, "relative link target")
                except AuditError:
                    missing_links.append(
                        {
                            "normalizedTarget": normalized_target,
                            "rawTarget": target,
                            "sourceLine": source_line,
                            "sourcePath": repository_path,
                        }
                    )
                    reasons.add("source_relative_link_missing")

    mapped_wiki_paths = {page["wikiPath"] for page in pages}
    unmapped_wiki_paths: list[str] = []
    if require_complete:
        unmapped_wiki_paths = sorted(set(_wiki_files(wiki_root)) - mapped_wiki_paths)
        if unmapped_wiki_paths:
            reasons.add("unmapped_wiki_path")

    repository_drift.sort()
    wiki_drift.sort()
    missing_links.sort(
        key=lambda finding: (
            finding["sourcePath"],
            finding["sourceLine"],
            finding["rawTarget"],
        )
    )
    ordered_reasons = _ordered_reasons(reasons)
    if ordered_reasons:
        status = "blocked"
    else:
        status = "safe_change" if repository_drift else "no_op"
    return {
        "mappingSha256": sha256_bytes(canonical_json_bytes(mapping)),
        "mappedPageCount": len(pages),
        "preservedWikiOnlyPageCount": preserved_count,
        "primaryReason": ordered_reasons[0] if ordered_reasons else None,
        "reasons": ordered_reasons,
        "repositoryDriftCount": len(repository_drift),
        "repositoryDriftPaths": repository_drift,
        "sourceRelativeLinkCount": source_link_count,
        "sourceRelativeLinkFindings": missing_links,
        "sourceRelativeLinkMissingCount": len(missing_links),
        "status": status,
        "unmappedWikiPathCount": len(unmapped_wiki_paths),
        "unmappedWikiPaths": unmapped_wiki_paths,
        "wikiCompletenessRequired": require_complete,
        "wikiDriftCount": len(wiki_drift),
        "wikiDriftPaths": wiki_drift,
        "wikiMutation": False,
    }
