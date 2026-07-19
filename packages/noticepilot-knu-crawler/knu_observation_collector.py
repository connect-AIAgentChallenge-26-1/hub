#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""NoticePilot KNU observation collector v0.3.

This script is intentionally separate from the production probe path. It reuses
v0.4.4's URL policy, list/detail parser, normalized notice writer and attachment
probe, while adding:

- named collection profiles
- date-range pagination
- global pstSn de-duplication per board
- resumable detail collection
- deterministic first-pass observation labels
- selective attachment download decisions
- JSONL/TSV indexes and collection diagnostics

It does not promote candidates, reconcile CalendarEvents or publish ICS feeds.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from dataclasses import asdict
from datetime import date, datetime
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

from knu_crawler_probe import (
    BASE_URL,
    AttachmentProbe,
    DetailProbe,
    ListItem,
    RequestMetric,
    download_attachment,
    extract_attachments,
    extract_body_text,
    extract_detail_published_at,
    load_registry,
    make_session,
    now_utc_iso,
    parse_list_items,
    polite_sleep,
    relpath,
    request_get,
    sha256_text,
    write_attachment_manifest,
    write_normalized_notice,
)

COLLECTOR_VERSION = "0.3.0"
DEFAULT_PROFILE_CONFIG = "configs/knu_collection_profiles.v0.1.json"
REVISION_TITLE_TERMS = ("수정", "정정", "기간 연장", "기간연장", "연장 안내", "재공고", "재안내")
REVISION_BODY_PATTERNS = (
    re.compile(r"기존.{0,60}(?:공지|일정|기간).{0,40}(?:수정|정정|변경|연장)"),
    re.compile(r"(?:접수|신청|제출|모집|운영)\s*기간.{0,30}(?:연장|변경)"),
    re.compile(r"(?:변경\s*전|변경\s*후|정정\s*전|정정\s*후|수정\s*사항)"),
)
EVENT_CANCELLATION_TITLE_PATTERNS = (
    re.compile(r"^(?:\s*[\[(【]?(?:취소|중단|철회)[\])】]?\s*)"),
    re.compile(r"(?:행사|교육|특강|프로그램|시험|면접|채용|모집|공고|운영|설명회).{0,30}(?:취소|중단|철회|폐지|무산)"),
)
EVENT_CANCELLATION_BODY_PATTERNS = (
    re.compile(r"기존.{0,80}(?:행사|교육|특강|프로그램|시험|면접|채용|모집|공고|운영).{0,40}(?:취소|중단|철회|폐지)"),
    re.compile(r"(?:개최|운영|진행|실시)\s*(?:예정이던|예정인)?.{0,50}(?:취소|중단)"),
)
WITHDRAWAL_ACTION_PATTERNS = (
    re.compile(r"(?:수강|신청|등록|접수|입사|기숙사).{0,20}취소"),
    re.compile(r"취소.{0,20}(?:신청|기간|방법|절차|환불)"),
)
ADDITIONAL_TERMS = ("추가모집", "추가 모집", "재모집", "재 모집", "2차 모집", "3차 모집")
ATTACHMENT_REFERENCE_TERMS = (
    "붙임 참조",
    "붙임파일 참조",
    "첨부 참조",
    "첨부파일 참조",
    "공고문 참조",
    "세부사항은 붙임",
    "세부 사항은 붙임",
    "세부일정은 붙임",
    "세부 일정은 붙임",
    "자세한 사항은 붙임",
    "자세한 내용은 붙임",
    "첨부된",
)
DATE_TOKEN_RE = re.compile(
    r"(?:20\d{2}[.\-/년]\s*\d{1,2}[.\-/월]\s*\d{1,2}|\d{1,2}[.\-/월]\s*\d{1,2}(?:일)?)"
)
NON_IDENTITY_PREFIX_RE = re.compile(
    r"^(?:\[(?:일반공지|행사안내|채용안내|취업정보|공모안내|학사공지|장학공지|수정|정정|기간\s*연장)\]"
    r"|\((?:수정|정정|기간\s*연장)\)|【(?:수정|정정|기간\s*연장)】)\s*"
)
SPACE_PUNCT_RE = re.compile(r"[^0-9A-Za-z가-힣]+")


def parse_iso_date(value: str | None, field: str) -> date | None:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{field} must be YYYY-MM-DD: {value!r}") from exc


def load_profiles(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != "noticepilot.knuCollectionProfiles.v0.1":
        raise ValueError(f"unsupported profile schema: {data.get('schemaVersion')!r}")
    profiles = data.get("profiles")
    if not isinstance(profiles, dict) or not profiles:
        raise ValueError("profiles must be a non-empty object")
    return profiles


def resolve_profile(args: argparse.Namespace) -> dict[str, Any]:
    profiles = load_profiles(Path(args.profiles_config))
    if args.list_profiles:
        return {"_profiles": profiles}
    if args.profile not in profiles:
        raise ValueError(f"unknown profile {args.profile!r}; available={sorted(profiles)}")
    profile = dict(profiles[args.profile])
    boards = [x.strip() for x in args.boards.split(",") if x.strip()] if args.boards else list(profile.get("boards", []))
    if not boards:
        raise ValueError("resolved profile has no boards")
    profile.update(
        {
            "profileId": args.profile,
            "boards": boards,
            "publishedFrom": args.published_from or profile.get("publishedFrom"),
            "publishedThrough": args.published_through or profile.get("publishedThrough"),
            "attachmentPolicy": args.attachment_policy or profile.get("attachmentPolicy", "metadata"),
        }
    )
    return profile


def observation_list_url(board_id: str, page_index: int, page_itm: int) -> str:
    return (
        f"{BASE_URL}/ko/bbs/{board_id}/list.do?"
        f"pageIndex={page_index}&pageItm={page_itm}&searchGbn=0&searchOrderSort=0"
    )


def item_date(item: ListItem) -> date | None:
    try:
        return date.fromisoformat(item.published_at) if item.published_at else None
    except ValueError:
        return None


def uses_detail_publication_date(board_id: str) -> bool:
    return board_id == "716"


def application_start_date(item: ListItem) -> date | None:
    try:
        return date.fromisoformat(item.application_period_start) if item.application_period_start else None
    except ValueError:
        return None


def in_range(value: date | None, start: date | None, end: date | None) -> bool:
    if value is None:
        return False
    if start and value < start:
        return False
    if end and value > end:
        return False
    return True


def should_stop_after_page(items: list[ListItem], start: date | None) -> bool:
    """Stop only when every dated, non-pinned row is older than the lower bound.

    Pinned notices may be old and repeated on every page, so they never drive the
    cutoff. Undated pages do not trigger a date cutoff and are bounded by maxPages.
    """
    if start is None:
        return False
    dated_regular = [item_date(i) for i in items if not i.is_pinned and item_date(i) is not None]
    return bool(dated_regular) and all(d < start for d in dated_regular)


def normalize_duplicate_title(title: str) -> str:
    value = title.strip()
    while True:
        stripped = NON_IDENTITY_PREFIX_RE.sub("", value, count=1).strip()
        if stripped == value:
            break
        value = stripped
    # Remove revision markers but preserve campus/college/department qualifiers.
    value = re.sub(r"(?:수정\s*공지|수정|정정|기간\s*연장|연장\s*안내|재안내|재공고)", " ", value)
    return SPACE_PUNCT_RE.sub("", value).lower()


def _matches_any(text: str, patterns: tuple[re.Pattern[str], ...]) -> bool:
    return any(pattern.search(text) for pattern in patterns)


def classify_notice(title: str, body_text: str, attachment_count: int) -> dict[str, Any]:
    compact_title = re.sub(r"\s+", " ", title).strip()
    body_head = body_text[:2500]
    combined = f"{compact_title}\n{body_head}"
    lower_compact = combined.replace(" ", "")
    reason_codes: list[str] = []

    revision_title = any(term in compact_title for term in REVISION_TITLE_TERMS)
    revision_body = _matches_any(body_head, REVISION_BODY_PATTERNS)
    withdrawal_action = _matches_any(combined, WITHDRAWAL_ACTION_PATTERNS)
    event_cancel_title = _matches_any(compact_title, EVENT_CANCELLATION_TITLE_PATTERNS)
    event_cancel_body = _matches_any(body_head, EVENT_CANCELLATION_BODY_PATTERNS)
    event_cancellation = (event_cancel_title or event_cancel_body) and not (
        withdrawal_action and not event_cancel_title
    )

    flags = {
        "revisionLike": revision_title or revision_body,
        "cancellationLike": event_cancellation,
        "withdrawalActionLike": withdrawal_action,
        "additionalRecruitmentLike": any(term in combined for term in ADDITIONAL_TERMS),
        "containsDateExpression": bool(DATE_TOKEN_RE.search(combined)),
        "attachmentReferenced": any(term.replace(" ", "") in lower_compact for term in ATTACHMENT_REFERENCE_TERMS),
    }

    if not attachment_count:
        decision = "not_applicable"
        reason_codes.append("no_attachments")
    elif flags["revisionLike"] or flags["cancellationLike"]:
        decision = "required_for_revision"
        reason_codes.append("revision_or_event_cancellation_signal")
    elif flags["attachmentReferenced"]:
        decision = "required_for_schedule"
        reason_codes.append("attachment_reference")
    elif len(body_text.strip()) < 250:
        decision = "required_for_schedule"
        reason_codes.append("short_body_with_attachments")
    else:
        decision = "not_required"
        reason_codes.append("body_sufficient_for_first_pass")

    return {
        "ruleVersion": "noticepilot.knuObservationRules.v0.2",
        "flags": flags,
        "attachmentFetchDecision": decision,
        "attachmentFetchReasonCodes": reason_codes,
        "normalizedDuplicateTitle": normalize_duplicate_title(title),
    }

def should_download(policy: str, decision: str) -> bool:
    if policy in {"none", "metadata"}:
        return False
    if policy == "all":
        return True
    if policy == "selective":
        return decision in {"required_for_schedule", "required_for_revision", "required_for_duplicate_check"}
    raise ValueError(f"unsupported attachment policy: {policy}")


def load_existing_normalized(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def update_normalized_observation(path: Path, classification: dict[str, Any], profile: dict[str, Any]) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    data["observation"] = {
        "collectorVersion": COLLECTOR_VERSION,
        "profileId": profile["profileId"],
        **classification,
    }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def make_index_record(
    board: dict[str, Any],
    item: ListItem,
    detail: DetailProbe | None,
    classification: dict[str, Any] | None,
    status: str,
    resumed: bool,
) -> dict[str, Any]:
    return {
        "noticeId": f"knu-{item.board_id}-{item.pst_sn}",
        "boardId": item.board_id,
        "boardName": board.get("name"),
        "category": board.get("category"),
        "pstSn": item.pst_sn,
        "title": item.title,
        "publishedAt": item.published_at,
        "listedCampus": item.campus,
        "author": item.author,
        "sourceUrl": item.url,
        "isPinned": item.is_pinned,
        "collectionStatus": status,
        "resumed": resumed,
        "bodyChars": detail.body_chars if detail else None,
        "attachmentCount": detail.attachment_count if detail else None,
        "normalizedNoticePath": detail.normalized_notice_path if detail else None,
        "rawHtmlPath": detail.raw_html_path if detail else None,
        "contentHash": detail.content_hash if detail else None,
        "ruleDecision": classification,
        "aiAssistDecision": None,
        "humanDecision": None,
        "finalDecision": None,
        "error": detail.error if detail else None,
    }


def write_indexes(out_dir: Path, records: list[dict[str, Any]]) -> None:
    index_dir = out_dir / "index"
    index_dir.mkdir(parents=True, exist_ok=True)
    jsonl_path = index_dir / "notices.jsonl"
    with jsonl_path.open("w", encoding="utf-8") as f:
        for row in records:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    tsv_path = index_dir / "notices.tsv"
    fields = [
        "noticeId", "boardId", "boardName", "category", "pstSn", "title", "publishedAt",
        "listedCampus", "author", "sourceUrl", "isPinned", "collectionStatus", "resumed",
        "bodyChars", "attachmentCount", "normalizedNoticePath", "rawHtmlPath", "contentHash",
        "revisionLike", "cancellationLike", "withdrawalActionLike", "additionalRecruitmentLike", "containsDateExpression",
        "attachmentReferenced", "attachmentFetchDecision", "normalizedDuplicateTitle", "error",
    ]
    with tsv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, delimiter="\t", extrasaction="ignore")
        writer.writeheader()
        for row in records:
            flat = dict(row)
            decision = row.get("ruleDecision") or {}
            flags = decision.get("flags") or {}
            flat.update(flags)
            flat["attachmentFetchDecision"] = decision.get("attachmentFetchDecision")
            flat["normalizedDuplicateTitle"] = decision.get("normalizedDuplicateTitle")
            writer.writerow(flat)


def mark_duplicate_suspects(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for row in records:
        decision = row.get("ruleDecision") or {}
        key = decision.get("normalizedDuplicateTitle")
        if key and row.get("collectionStatus") in {"ok", "resumed", "list_only"}:
            groups.setdefault(key, []).append(row)

    suspects: list[dict[str, Any]] = []
    for key, group in groups.items():
        source_ids = {(r.get("boardId"), r.get("pstSn")) for r in group}
        if len(source_ids) < 2:
            continue
        cross_board = len({r.get("boardId") for r in group}) > 1
        ordered = sorted(group, key=lambda r: (r.get("publishedAt") or "", r.get("boardId") or "", r.get("pstSn") or ""))
        suspects.append(
            {
                "normalizedDuplicateTitle": key,
                "crossBoard": cross_board,
                "noticeIds": [r["noticeId"] for r in ordered],
                "titles": [r["title"] for r in ordered],
                "publishedAt": [r.get("publishedAt") for r in ordered],
                "decision": "possible_duplicate",
                "automaticMerge": False,
                "reasonCodes": ["same_normalized_title", "insufficient_identity_evidence"],
            }
        )
        for row in group:
            decision = row.get("ruleDecision") or {}
            decision["possibleDuplicate"] = True
            decision["possibleDuplicateNoticeIds"] = [r["noticeId"] for r in ordered if r["noticeId"] != row["noticeId"]]
            if decision.get("attachmentFetchDecision") == "not_required":
                decision["attachmentFetchDecision"] = "required_for_duplicate_check"
                decision.setdefault("attachmentFetchReasonCodes", []).append("same_normalized_title")
    return suspects



def download_duplicate_check_attachments(
    *,
    records: list[dict[str, Any]],
    detail_probes: list[DetailProbe],
    out_dir: Path,
    attachments_dir: Path,
    session: Any,
    metrics: list[RequestMetric],
    delay: float,
    profile: dict[str, Any],
) -> int:
    """Download attachment bytes for exact-title duplicate suspects in selective mode.

    The first pass cannot know cross-post relationships until all notices are indexed.
    This second pass updates normalized JSON and the in-memory detail probes only for
    records promoted to required_for_duplicate_check.
    """
    if profile.get("attachmentPolicy") != "selective":
        return 0
    probes_by_notice = {f"knu-{d.board_id}-{d.pst_sn}": d for d in detail_probes}
    downloaded = 0
    for row in records:
        decision = row.get("ruleDecision") or {}
        if decision.get("attachmentFetchDecision") != "required_for_duplicate_check":
            continue
        if not row.get("attachmentCount"):
            continue
        normalized_rel = row.get("normalizedNoticePath")
        if not normalized_rel:
            continue
        normalized_path = out_dir / normalized_rel
        data = load_existing_normalized(normalized_path)
        if not data:
            continue
        attachment_rows = data.get("attachments") or []
        attachments: list[AttachmentProbe] = []
        for raw in attachment_rows:
            allowed = {
                "index", "display_name", "download_url", "server_name", "path",
                "downloaded", "status", "elapsed_ms", "size_bytes", "detected_type",
                "sha256", "local_path", "error",
            }
            kwargs = {k: raw.get(k) for k in allowed if k in raw}
            attachments.append(AttachmentProbe(**kwargs))
        target_dir = attachments_dir / f"board_{row['boardId']}_pst_{row['pstSn']}"
        for attachment in attachments:
            if attachment.downloaded and attachment.local_path:
                continue
            download_attachment(session, attachment, target_dir, metrics, delay)
            if attachment.downloaded:
                downloaded += 1
        serialized = []
        for attachment in attachments:
            payload = asdict(attachment)
            if payload.get("local_path"):
                payload["local_path"] = relpath(Path(payload["local_path"]), out_dir)
            serialized.append(payload)
        data["attachments"] = serialized
        data["observation"] = {
            "collectorVersion": COLLECTOR_VERSION,
            "profileId": profile["profileId"],
            **decision,
        }
        normalized_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        probe = probes_by_notice.get(row["noticeId"])
        if probe is not None:
            probe.attachments = attachments
    return downloaded

def collect_list_items(
    *,
    session: Any,
    board: dict[str, Any],
    start: date | None,
    end: date | None,
    out_dir: Path,
    page_itm: int,
    max_pages: int,
    delay: float,
    metrics: list[RequestMetric],
) -> tuple[list[ListItem], dict[str, Any]]:
    board_id = str(board["boardId"])
    detail_date_mode = uses_detail_publication_date(board_id)
    raw_lists = out_dir / "raw" / "lists"
    raw_lists.mkdir(parents=True, exist_ok=True)
    selected: list[ListItem] = []
    seen: set[str] = set()
    pages: list[dict[str, Any]] = []
    stop_reason = "max_pages"
    stale_application_page_streak = 0

    for page_index in range(1, max_pages + 1):
        url = observation_list_url(board_id, page_index, page_itm)
        polite_sleep(delay)
        response = request_get(session, url, "observation_list", metrics)
        response.encoding = response.apparent_encoding or response.encoding
        raw_path = raw_lists / f"board_{board_id}_page_{page_index:04d}.html"
        raw_path.write_text(response.text, encoding="utf-8")
        items, row_used, fallback_used = parse_list_items(response.text, url, board_id)
        new_items = [i for i in items if i.pst_sn not in seen]
        for item in new_items:
            seen.add(item.pst_sn)
            if detail_date_mode or in_range(item_date(item), start, end):
                selected.append(item)

        app_dates = [
            application_start_date(i)
            for i in items
            if not i.is_pinned and application_start_date(i) is not None
        ]
        if detail_date_mode and start and app_dates and all(d < start for d in app_dates):
            stale_application_page_streak += 1
        elif detail_date_mode:
            stale_application_page_streak = 0

        page_selected_count = (
            len(new_items)
            if detail_date_mode
            else sum(1 for i in new_items if in_range(item_date(i), start, end))
        )
        pages.append(
            {
                "pageIndex": page_index,
                "url": url,
                "rawPath": relpath(raw_path, out_dir),
                "parsedCount": len(items),
                "newCount": len(new_items),
                "selectedCount": page_selected_count,
                "dateFilterDeferredToDetail": detail_date_mode,
                "rowParserUsed": row_used,
                "fallbackParserUsed": fallback_used,
                "oldestRegularDate": min(
                    (item_date(i) for i in items if not i.is_pinned and item_date(i)),
                    default=None,
                ).isoformat()
                if any(not i.is_pinned and item_date(i) for i in items)
                else None,
                "oldestApplicationStart": min(app_dates).isoformat() if app_dates else None,
                "newestApplicationStart": max(app_dates).isoformat() if app_dates else None,
            }
        )

        if not items:
            stop_reason = "empty_page"
            break
        if not new_items:
            stop_reason = "no_new_items"
            break

        if detail_date_mode:
            # Board 716 exposes 접수기간, not 등록일. Keep every row—including
            # result/interview notices with "~"—and stop only after two consecutive
            # pages whose available application starts are wholly before the lower
            # bound. Actual inclusion is decided from detail-page 등록일.
            if stale_application_page_streak >= 2:
                stop_reason = "application_period_lower_bound_guard"
                break
            continue

        dated_regular_count = sum(1 for i in items if not i.is_pinned and item_date(i) is not None)
        if items and dated_regular_count == 0:
            stop_reason = "undated_list_metadata"
            break
        if should_stop_after_page(items, start):
            stop_reason = "date_lower_bound_reached"
            break

    if detail_date_mode:
        selected.sort(
            key=lambda i: (
                int(i.notice_no) if (i.notice_no or "").isdigit() else -1,
                i.pst_sn,
            ),
            reverse=True,
        )
    else:
        selected.sort(
            key=lambda i: (i.published_at or "", i.pst_sn),
            reverse=True,
        )
    return selected, {
        "boardId": board_id,
        "pageCount": len(pages),
        "selectedCount": len(selected),
        "dateFilterDeferredToDetail": detail_date_mode,
        "uniqueSeenCount": len(seen),
        "stopReason": stop_reason,
        "pages": pages,
    }


def run_collection(args: argparse.Namespace) -> int:
    profile = resolve_profile(args)
    if "_profiles" in profile:
        print(json.dumps(profile["_profiles"], ensure_ascii=False, indent=2))
        return 0

    start = parse_iso_date(profile.get("publishedFrom"), "publishedFrom")
    end = parse_iso_date(profile.get("publishedThrough"), "publishedThrough")
    if start and end and start > end:
        raise ValueError("publishedFrom must be <= publishedThrough")

    out_dir = Path(args.output_dir)
    raw_details = out_dir / "raw" / "details"
    attachments_dir = out_dir / "attachments" / "selected"
    reports_dir = out_dir / "reports"
    for path in (raw_details, attachments_dir, reports_dir):
        path.mkdir(parents=True, exist_ok=True)

    board_filter = set(profile["boards"])
    registry = load_registry(Path(args.registry), board_filter, priority_max=999)
    known = {str(b["boardId"]) for b in registry}
    missing = board_filter - known
    if missing:
        raise ValueError(f"profile contains unknown/non-canonical boards: {sorted(missing)}")

    session = make_session()
    metrics: list[RequestMetric] = []
    records: list[dict[str, Any]] = []
    list_reports: list[dict[str, Any]] = []
    detail_probes: list[DetailProbe] = []
    refresh_boards = {x.strip() for x in args.refresh_boards.split(",") if x.strip()}
    unknown_refresh = refresh_boards - known
    if unknown_refresh:
        raise ValueError(f"--refresh-boards contains unknown boards: {sorted(unknown_refresh)}")
    detail_filtered_out_counts: dict[str, int] = {}
    started = now_utc_iso()

    for board in registry:
        board_id = str(board["boardId"])
        try:
            items, board_list_report = collect_list_items(
                session=session,
                board=board,
                start=start,
                end=end,
                out_dir=out_dir,
                page_itm=args.page_itm,
                max_pages=args.max_pages,
                delay=args.delay,
                metrics=metrics,
            )
            list_reports.append({**board_list_report, "status": "ok", "error": None})
        except Exception as exc:
            list_reports.append({"boardId": board_id, "status": "failed", "error": repr(exc), "pages": []})
            if not args.continue_on_error:
                raise
            continue

        if args.max_details_per_board is not None:
            items = items[: args.max_details_per_board]

        for item in items:
            normalized_path = out_dir / "normalized" / "notices" / f"knu-{board_id}-{item.pst_sn}.json"
            existing = (
                load_existing_normalized(normalized_path)
                if args.resume and board_id not in refresh_boards
                else None
            )
            if existing:
                if existing.get("publishedAt"):
                    item.published_at = str(existing["publishedAt"])
                classification = (existing.get("observation") or {}).copy()
                classification.pop("collectorVersion", None)
                classification.pop("profileId", None)
                dp = DetailProbe(
                    board_id=board_id,
                    category=str(board.get("category", "unknown")),
                    pst_sn=item.pst_sn,
                    title=item.title,
                    url=item.url,
                    status="resumed",
                    elapsed_ms=None,
                    body_chars=int(existing.get("extractedTextChars") or 0),
                    attachment_count=int(existing.get("attachmentCount") or 0),
                    attachments=[],
                    normalized_notice_path=relpath(normalized_path, out_dir),
                    raw_html_path=(existing.get("rawHtml") or {}).get("path"),
                    raw_html_sha256=(existing.get("rawHtml") or {}).get("sha256"),
                    content_hash=existing.get("contentHash"),
                    list_item=item,
                )
                detail_probes.append(dp)
                records.append(make_index_record(board, item, dp, classification, "resumed", True))
                continue

            if args.list_only:
                classification = classify_notice(item.title, "", 0)
                records.append(make_index_record(board, item, None, classification, "list_only", False))
                continue

            dp = DetailProbe(
                board_id=board_id,
                category=str(board.get("category", "unknown")),
                pst_sn=item.pst_sn,
                title=item.title,
                url=item.url,
                status="pending",
                elapsed_ms=None,
                body_chars=0,
                attachment_count=0,
                attachments=[],
                list_item=item,
            )
            classification: dict[str, Any] | None = None
            try:
                polite_sleep(args.delay)
                response = request_get(session, item.url, "observation_detail", metrics)
                response.encoding = response.apparent_encoding or response.encoding
                raw_detail = raw_details / f"board_{board_id}_pst_{item.pst_sn}.html"
                raw_detail.write_text(response.text, encoding="utf-8")
                dp.elapsed_ms = metrics[-1].elapsed_ms
                dp.raw_html_path = relpath(raw_detail, out_dir)
                dp.raw_html_sha256 = sha256_text(response.text)
                soup = BeautifulSoup(response.text, "lxml")
                if uses_detail_publication_date(board_id):
                    actual_published_at = extract_detail_published_at(soup)
                    if not actual_published_at:
                        raise ValueError("detail page registration date not found for board 716")
                    item.published_at = actual_published_at
                    if not in_range(item_date(item), start, end):
                        dp.status = "out_of_range"
                        detail_filtered_out_counts[board_id] = detail_filtered_out_counts.get(board_id, 0) + 1

                if dp.status != "out_of_range":
                    body_text = extract_body_text(soup)
                    attachments = extract_attachments(response.text, item.url)
                    dp.body_chars = len(body_text)
                    dp.attachment_count = len(attachments)
                    dp.attachments = attachments
                    classification = classify_notice(item.title, body_text, len(attachments))

                    if should_download(profile["attachmentPolicy"], classification["attachmentFetchDecision"]):
                        target_dir = attachments_dir / f"board_{board_id}_pst_{item.pst_sn}"
                        for attachment in attachments:
                            download_attachment(session, attachment, target_dir, metrics, args.delay)

                    normalized_path = write_normalized_notice(
                        out_dir, board, dp, body_text, attachments, now_utc_iso(), raw_detail
                    )
                    update_normalized_observation(normalized_path, classification, profile)
                    dp.normalized_notice_path = relpath(normalized_path, out_dir)
                    dp.status = "ok"
            except Exception as exc:
                dp.status = "failed"
                dp.error = repr(exc)
                if not args.continue_on_error:
                    raise

            detail_probes.append(dp)
            if dp.status != "out_of_range":
                records.append(make_index_record(board, item, dp, classification, dp.status, False))

    for report_row in list_reports:
        board_id = str(report_row.get("boardId"))
        report_row["detailOutOfRangeCount"] = detail_filtered_out_counts.get(board_id, 0)

    refresh_cleanup: list[dict[str, Any]] = []
    if refresh_boards and not args.list_only:
        list_status_by_board = {
            str(row.get("boardId")): row.get("status")
            for row in list_reports
        }
        for refresh_board_id in sorted(refresh_boards):
            board_failures = [
                dp for dp in detail_probes
                if dp.board_id == refresh_board_id and dp.status == "failed"
            ]
            if list_status_by_board.get(refresh_board_id) != "ok" or board_failures:
                refresh_cleanup.append(
                    {
                        "boardId": refresh_board_id,
                        "status": "skipped_due_to_collection_errors",
                        "failureCount": len(board_failures),
                        "archivedCount": 0,
                    }
                )
                continue

            valid_notice_ids = {
                str(row.get("noticeId"))
                for row in records
                if str(row.get("boardId")) == refresh_board_id
                and row.get("collectionStatus") in {"ok", "resumed"}
            }
            archive_dir = out_dir / "normalized" / "refresh_archive" / f"board_{refresh_board_id}"
            archived_count = 0
            for existing_path in (out_dir / "normalized" / "notices").glob(
                f"knu-{refresh_board_id}-*.json"
            ):
                if existing_path.stem in valid_notice_ids:
                    continue
                archive_dir.mkdir(parents=True, exist_ok=True)
                target = archive_dir / existing_path.name
                if target.exists():
                    target.unlink()
                existing_path.replace(target)
                archived_count += 1
            refresh_cleanup.append(
                {
                    "boardId": refresh_board_id,
                    "status": "completed",
                    "failureCount": 0,
                    "archivedCount": archived_count,
                    "archivePath": relpath(archive_dir, out_dir) if archived_count else None,
                }
            )

    duplicate_suspects = mark_duplicate_suspects(records)
    duplicate_attachment_download_count = download_duplicate_check_attachments(
        records=records,
        detail_probes=detail_probes,
        out_dir=out_dir,
        attachments_dir=attachments_dir,
        session=session,
        metrics=metrics,
        delay=args.delay,
        profile=profile,
    )
    write_indexes(out_dir, records)
    write_attachment_manifest(
        out_dir,
        [
            type("ObservationBoard", (), {"details": detail_probes})()
        ],
    )

    finished = now_utc_iso()
    board_counts: dict[str, int] = {}
    status_counts: dict[str, int] = {}
    attachment_decision_counts: dict[str, int] = {}
    flag_counts = {"revisionLike": 0, "cancellationLike": 0, "withdrawalActionLike": 0, "additionalRecruitmentLike": 0, "containsDateExpression": 0}
    for row in records:
        board_counts[row["boardId"]] = board_counts.get(row["boardId"], 0) + 1
        status_counts[row["collectionStatus"]] = status_counts.get(row["collectionStatus"], 0) + 1
        decision = row.get("ruleDecision") or {}
        attachment_decision = decision.get("attachmentFetchDecision")
        if attachment_decision:
            attachment_decision_counts[attachment_decision] = attachment_decision_counts.get(attachment_decision, 0) + 1
        for flag in flag_counts:
            if (decision.get("flags") or {}).get(flag):
                flag_counts[flag] += 1

    report = {
        "schemaVersion": "noticepilot.knuObservationCollectionReport.v0.1",
        "collector": {
            "version": COLLECTOR_VERSION,
            "startedAt": started,
            "finishedAt": finished,
            "profile": profile,
            "dateRange": {
                "publishedFrom": start.isoformat() if start else None,
                "publishedThrough": end.isoformat() if end else None,
            },
            "mode": {
                "pageItm": args.page_itm,
                "maxPages": args.max_pages,
                "maxDetailsPerBoard": args.max_details_per_board,
                "delaySec": args.delay,
                "resume": args.resume,
                "refreshBoards": sorted(refresh_boards),
                "listOnly": args.list_only,
                "continueOnError": args.continue_on_error,
            },
        },
        "summary": {
            "noticeCount": len(records),
            "boardCounts": board_counts,
            "statusCounts": status_counts,
            "attachmentDecisionCounts": attachment_decision_counts,
            "flagCounts": flag_counts,
            "possibleDuplicateGroupCount": len(duplicate_suspects),
            "duplicateAttachmentDownloadCount": duplicate_attachment_download_count,
            "detailOutOfRangeCount": sum(detail_filtered_out_counts.values()),
            "requestCount": len(metrics),
            "requestErrorCount": sum(1 for m in metrics if m.error),
        },
        "boardCollection": list_reports,
        "refreshCleanup": refresh_cleanup,
        "possibleDuplicates": duplicate_suspects,
        "requestMetrics": [asdict(m) for m in metrics],
    }
    report_path = reports_dir / "collection-summary.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (reports_dir / "duplicate-suspects.json").write_text(
        json.dumps(duplicate_suspects, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    print(f"Saved: {report_path}")
    print(f"Saved: {out_dir / 'index' / 'notices.jsonl'}")
    print(f"Saved: {out_dir / 'index' / 'notices.tsv'}")
    return 2 if report["summary"]["requestErrorCount"] else 0


def run_offline_check(sample_dir: Path, profiles_config: Path) -> int:
    errors: list[str] = []
    profiles = load_profiles(profiles_config)
    if profiles.get("observation-2026", {}).get("boards") != ["504", "715", "716", "717", "719", "720", "721"]:
        errors.append("observation-2026 board profile mismatch")

    if not in_range(date(2026, 1, 1), date(2026, 1, 1), date(2026, 7, 11)):
        errors.append("inclusive lower bound failed")
    if in_range(date(2025, 12, 31), date(2026, 1, 1), date(2026, 7, 11)):
        errors.append("lower exclusion failed")
    if not should_stop_after_page(
        [ListItem(1, "720", "1", "https://www.kangwon.ac.kr/ko/bbs/720/detail.do?pstSn=1", "x", published_at="2025-12-31")],
        date(2026, 1, 1),
    ):
        errors.append("date cutoff failed")

    revision = classify_notice("[기간 연장] 신청 안내", "붙임 참조", 1)
    if revision["attachmentFetchDecision"] != "required_for_revision":
        errors.append("revision attachment decision failed")
    short_body = classify_notice("행사 안내", "붙임 참조", 2)
    if short_body["attachmentFetchDecision"] != "required_for_schedule":
        errors.append("schedule attachment decision failed")
    withdrawal = classify_notice("계절수업 수강신청 취소 안내", "취소 신청 기간 안내", 0)
    if withdrawal["flags"]["cancellationLike"] or not withdrawal["flags"]["withdrawalActionLike"]:
        errors.append("withdrawal/cancellation distinction failed")
    cancelled = classify_notice("[취소] AI 캠프 행사 취소 안내", "기존 행사를 취소합니다.", 1)
    if not cancelled["flags"]["cancellationLike"]:
        errors.append("event cancellation detection failed")
    generic_change = classify_notice("신청 안내", "운영 일정은 사정에 따라 변경될 수 있습니다.", 0)
    if generic_change["flags"]["revisionLike"]:
        errors.append("generic change false positive")
    if normalize_duplicate_title("[일반공지] 2026 AI 캠프 참가자 모집") != normalize_duplicate_title("(수정) 2026 AI 캠프 참가자 모집"):
        errors.append("duplicate title normalization failed")
    if normalize_duplicate_title("[춘천] KNU 장학금 안내") == normalize_duplicate_title("[삼척] KNU 장학금 안내"):
        errors.append("campus qualifier was removed from duplicate identity")

    alt_table = """
    <table><thead><tr><th>번호</th><th>구분</th><th>제목</th><th>담당부서</th><th>등록일</th></tr></thead>
    <tbody><tr><td>1</td><td>춘천</td><td><a href='/ko/bbs/504/detail.do?pstSn=99'>일반공지</a></td>
    <td>학생과</td><td>2026.07.10</td></tr></tbody></table>
    <a href='/ko/bbs/721/detail.do?pstSn=999'>다른 게시판 링크</a>
    """
    alt_items, alt_row_used, _ = parse_list_items(alt_table, observation_list_url("504", 1, 50), "504")
    if not alt_row_used or len(alt_items) != 1 or alt_items[0].published_at != "2026-07-10":
        errors.append("alternate list header/date parser failed")

    board_716_table = """
    <table><thead><tr><th>번호</th><th>캠퍼스</th><th>제목</th><th>접수기간</th><th>진행상태</th><th>조회수</th></tr></thead>
    <tbody>
      <tr><td>2</td><td>춘천</td><td><a href='/ko/bbs/716/detail.do?pstSn=2'>채용 공고</a></td>
      <td>2026.07.10 ~ 2026.07.17</td><td>진행중</td><td>10</td></tr>
      <tr><td>1</td><td>춘천</td><td><a href='/ko/bbs/716/detail.do?pstSn=1'>합격자 발표</a></td>
      <td>~</td><td></td><td>11</td></tr>
    </tbody></table>
    """
    board_716_items, board_716_row_used, board_716_fallback = parse_list_items(
        board_716_table, observation_list_url("716", 1, 50), "716"
    )
    if (
        not board_716_row_used
        or board_716_fallback
        or len(board_716_items) != 2
        or any(item.published_at for item in board_716_items)
        or board_716_items[0].application_period_start != "2026-07-10"
        or board_716_items[1].application_period_start is not None
    ):
        errors.append("board 716 application-period separation failed")

    detail_date_html = """
    <div class='view-header-info'><p><span>등록일</span> 2026.07.10</p>
    <p><span>수정일</span> 2026.07.11</p></div>
    """
    if extract_detail_published_at(BeautifulSoup(detail_date_html, "lxml")) != "2026-07-10":
        errors.append("detail registration date extraction failed")

    parsed_files = 0
    for path in sorted(sample_dir.glob("board_*_list.html")):
        board_match = re.search(r"board_(\d+)_list\.html", path.name)
        if not board_match:
            continue
        board_id = board_match.group(1)
        html = path.read_text(encoding="utf-8")
        items, row_used, _ = parse_list_items(html, observation_list_url(board_id, 1, 10), board_id)
        parsed_files += 1
        if not row_used or not items:
            errors.append(f"sample list parse failed: {path.name}")

    result = {
        "offlineObservationCheck": {
            "ok": not errors,
            "collectorVersion": COLLECTOR_VERSION,
            "sampleListFiles": parsed_files,
            "errors": errors,
        }
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="KNU date-range observation collector")
    parser.add_argument("--registry", default="configs/knu_board_registry.v0.2.json")
    parser.add_argument("--profiles-config", default=DEFAULT_PROFILE_CONFIG)
    parser.add_argument("--profile", default="observation-2026")
    parser.add_argument("--list-profiles", action="store_true")
    parser.add_argument("--boards", default="", help="override profile boards with comma-separated IDs")
    parser.add_argument("--published-from", default="", help="override lower bound YYYY-MM-DD")
    parser.add_argument("--published-through", default="", help="override upper bound YYYY-MM-DD")
    parser.add_argument("--attachment-policy", choices=["none", "metadata", "selective", "all"], default="")
    parser.add_argument("--output-dir", default="local-observation-data/observation-2026")
    parser.add_argument("--page-itm", type=int, default=50)
    parser.add_argument("--max-pages", type=int, default=200)
    parser.add_argument("--max-details-per-board", type=int, default=None)
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument(
        "--refresh-boards",
        default="",
        help="comma-separated boards to re-fetch even when --resume is enabled",
    )
    parser.add_argument("--list-only", action="store_true")
    parser.add_argument("--continue-on-error", action="store_true")
    parser.add_argument("--offline-check", action="store_true")
    parser.add_argument("--sample-dir", default="samples/raw")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        if args.offline_check:
            return run_offline_check(Path(args.sample_dir), Path(args.profiles_config))
        return run_collection(args)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
