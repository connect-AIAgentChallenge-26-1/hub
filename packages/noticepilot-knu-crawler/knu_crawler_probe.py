#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NoticePilot KNU crawler probe v0.4.4.

v0.4.4 scope:
  - polite, single-threaded list/detail/attachment probing
  - row-scoped list parsing to avoid duplicate anchor extraction
  - normalized notice JSON output for downstream candidate extraction
  - raw HTML + attachment manifest preservation
  - deterministic report/metrics for local/server comparison

This script intentionally does not run LLM extraction. It creates stable inputs for
rule-based candidate extraction and validator stages.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html as html_lib
import json
import re
import statistics
import sys
import time
import unicodedata
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urljoin, urlparse

import requests
from bs4 import BeautifulSoup

USER_AGENT = "NoticePilotBot/0.4.4 (+local-test; contact: local)"
BASE_URL = "https://www.kangwon.ac.kr"
DEFAULT_TIMEOUT = 20
INSTITUTION = "kangwon.ac.kr"
TIMEZONE = "Asia/Seoul"

ALLOWED_HOSTS = {"kangwon.ac.kr", "www.kangwon.ac.kr"}
BLOCKED_SUFFIXES = (
    "/login.do",
    "/logout.do",
    "/save.do",
    "/updt.do",
    "/rply.do",
    "/preview.do",
    "/server-preview.do",
    "/past-preview.do",
    "/error.do",
)
BLOCKED_CONTAINS = ("/myslf-cert/",)


@dataclass
class RequestMetric:
    kind: str
    url: str
    allowed: bool
    status_code: int | None
    elapsed_ms: float | None
    size_bytes: int | None
    content_type: str | None
    error: str | None = None


@dataclass
class ListItem:
    row_index: int
    board_id: str
    pst_sn: str
    url: str
    title: str
    notice_no: str | None = None
    campus: str | None = None
    author: str | None = None
    published_at: str | None = None
    application_period_start: str | None = None
    application_period_end: str | None = None
    views: str | None = None
    is_pinned: bool = False
    parse_source: str = "table_row"


@dataclass
class AttachmentProbe:
    index: int
    display_name: str
    download_url: str
    server_name: str | None
    path: str | None
    downloaded: bool = False
    status: str = "metadata_only"
    elapsed_ms: float | None = None
    size_bytes: int | None = None
    detected_type: str | None = None
    sha256: str | None = None
    local_path: str | None = None
    error: str | None = None


@dataclass
class DetailProbe:
    board_id: str
    category: str
    pst_sn: str
    title: str
    url: str
    status: str
    elapsed_ms: float | None
    body_chars: int
    attachment_count: int
    attachments: list[AttachmentProbe]
    normalized_notice_path: str | None = None
    raw_html_path: str | None = None
    raw_html_sha256: str | None = None
    content_hash: str | None = None
    list_item: ListItem | None = None
    error: str | None = None


@dataclass
class BoardProbe:
    board_id: str
    name: str
    category: str
    priority: int
    list_url: str
    list_status: str
    list_elapsed_ms: float | None
    discovered_detail_count: int
    sampled_detail_count: int
    details: list[DetailProbe]
    raw_list_path: str | None = None
    row_parser_used: bool = False
    fallback_anchor_parser_used: bool = False
    error: str | None = None


# ---------------------------------------------------------------------------
# URL / file helpers
# ---------------------------------------------------------------------------


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalize_space(text: str | None) -> str:
    return " ".join((text or "").replace("\xa0", " ").split())


def normalize_date_text(text: str | None) -> str | None:
    t = normalize_space(text)
    if not t:
        return None
    m = re.fullmatch(r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\.?", t)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    return t


CAMPUS_LABELS = {
    "chuncheon": "춘천",
    "samcheok": "삼척",
    "dogye": "도계",
    "gangneung_wonju": "강릉원주",
    "all": "전체",
    "unknown": "불명확",
}


def normalize_campus_label(label: str | None) -> list[str]:
    """Map KNU campus labels to NoticePilot's campus taxonomy.

    Taxonomy:
      - chuncheon
      - samcheok
      - dogye
      - gangneung_wonju
      - all
      - unknown

    KNU list metadata uses labels such as '삼척', '강릉 원주', and 'ALL'.
    Some future pages may contain multiple campus words in one label.
    """
    raw = normalize_space(label)
    if not raw:
        return ["unknown"]
    upper = raw.upper()
    if upper in {"ALL", "전체"} or "전체" in raw:
        return ["all"]

    campuses: list[str] = []
    compact = raw.replace(" ", "").replace("/", "")
    if "춘천" in raw:
        campuses.append("chuncheon")
    if "도계" in raw:
        campuses.append("dogye")
    # Keep 삼척 and 도계 separate when both are named. If only 삼척 is shown,
    # do not automatically include 도계; user profiles can opt into both later.
    if "삼척" in raw:
        campuses.append("samcheok")
    if "강릉" in raw or "원주" in raw or "강릉원주" in compact:
        campuses.append("gangneung_wonju")

    # Deduplicate while preserving order.
    deduped = []
    for c in campuses:
        if c not in deduped:
            deduped.append(c)
    return deduped or ["unknown"]


def build_campus_scope(
    *,
    title: str | None,
    body_text: str | None,
    list_campus: str | None,
    author: str | None,
) -> dict[str, Any]:
    """Infer campus applicability for filtering user-specific feeds.

    This is an applicability hint, not a legal truth. Priority is:
      1. explicit title/body campus wording
      2. listMetadata.campus
      3. author department name
      4. unknown
    """
    # Treat title/body as high-confidence only when campus applicability is
    # explicitly stated. A body line such as "삼척교육지원과로 제출" is a
    # destination office, not necessarily an applicability label; list metadata
    # is safer for the current KNU pages.
    title_body = f"{title or ''}\n{body_text or ''}"
    explicit_signal = any(token in title_body for token in ("춘천캠퍼스", "삼척캠퍼스", "도계캠퍼스", "강릉캠퍼스", "원주캠퍼스", "전체 캠퍼스", "전체캠퍼스"))
    if explicit_signal:
        explicit = normalize_campus_label(title_body)
        if explicit != ["unknown"]:
            return {
                "sourceLabel": "title_or_body",
                "campuses": explicit,
                "scopeType": "all_campuses" if explicit == ["all"] else "campus_specific",
                "confidence": "high",
                "source": "title_or_body",
                "labels": {c: CAMPUS_LABELS.get(c, c) for c in explicit},
            }

    list_scope = normalize_campus_label(list_campus)
    if list_scope != ["unknown"]:
        return {
            "sourceLabel": list_campus,
            "campuses": list_scope,
            "scopeType": "all_campuses" if list_scope == ["all"] else "campus_specific",
            "confidence": "high" if list_scope == ["all"] else "medium",
            "source": "listMetadata.campus",
            "labels": {c: CAMPUS_LABELS.get(c, c) for c in list_scope},
        }

    author_scope = normalize_campus_label(author)
    if author_scope != ["unknown"]:
        return {
            "sourceLabel": author,
            "campuses": author_scope,
            "scopeType": "all_campuses" if author_scope == ["all"] else "campus_specific",
            "confidence": "low",
            "source": "listMetadata.author",
            "labels": {c: CAMPUS_LABELS.get(c, c) for c in author_scope},
        }

    return {
        "sourceLabel": list_campus or author or None,
        "campuses": ["unknown"],
        "scopeType": "unknown",
        "confidence": "low",
        "source": "none",
        "labels": {"unknown": CAMPUS_LABELS["unknown"]},
    }


def is_allowed_kangwon_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.netloc not in ALLOWED_HOSTS:
        return False
    path = parsed.path
    if path == "/robots.txt" or path == "/sitemap.xml":
        return True
    if not path.startswith("/ko/"):
        return False
    if path.startswith("/neibis-api/"):
        return False
    if any(path.endswith(suffix) for suffix in BLOCKED_SUFFIXES):
        return False
    if any(part in path for part in BLOCKED_CONTAINS):
        return False
    return True


def is_allowed_kangwon_notice_url(url: str) -> bool:
    if not is_allowed_kangwon_url(url):
        return False
    path = urlparse(url).path
    if path.startswith("/ko/bbs/") and (path.endswith("/list.do") or path.endswith("/detail.do")):
        return True
    if path == "/ko/cmmn/download.do":
        return True
    return False


def sanitize_filename(name: str, fallback: str) -> str:
    name = unquote(name or "").strip()
    name = unicodedata.normalize("NFC", name)
    name = name.replace("/", "_").replace("\\", "_")
    name = re.sub(r"[\x00-\x1f\x7f]", "", name)
    name = re.sub(r"\s+", "_", name)
    name = re.sub(r'[<>:"|?*]', "_", name)
    name = name.strip("._ ")
    return name or fallback


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def detect_file_type(head: bytes, filename: str = "") -> str:
    lower = filename.lower()
    if head.startswith(b"%PDF"):
        return "pdf"
    if head.startswith(bytes.fromhex("D0CF11E0A1B11AE1")):
        return "hwp_ole" if lower.endswith(".hwp") else "ole_compound"
    if head.startswith(b"PK\x03\x04"):
        if lower.endswith(".hwpx"):
            return "hwpx_zip"
        if lower.endswith(".xlsx"):
            return "xlsx_zip"
        return "zip_based"
    if b"<html" in head[:512].lower() or b"<!doctype html" in head[:512].lower():
        return "html_or_error_page"
    return "unknown"


def relpath(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except Exception:
        return str(path)


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------


def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,application/octet-stream,*/*;q=0.8",
            "Connection": "keep-alive",
        }
    )
    return s


def polite_sleep(delay: float) -> None:
    if delay > 0:
        time.sleep(delay)


def request_get(
    session: requests.Session,
    url: str,
    kind: str,
    metrics: list[RequestMetric],
    timeout: int = DEFAULT_TIMEOUT,
    stream: bool = False,
) -> requests.Response:
    allowed = is_allowed_kangwon_notice_url(url) or urlparse(url).path == "/robots.txt"
    start = time.perf_counter()
    if not allowed:
        elapsed = (time.perf_counter() - start) * 1000
        metrics.append(RequestMetric(kind, url, False, None, elapsed, None, None, "blocked_by_policy"))
        raise ValueError(f"Blocked by URL policy: {url}")
    try:
        r = session.get(requests.utils.requote_uri(url), timeout=timeout, allow_redirects=True, stream=stream)
        elapsed = (time.perf_counter() - start) * 1000
        final_allowed = is_allowed_kangwon_notice_url(r.url) or urlparse(r.url).path == "/robots.txt"
        if not final_allowed:
            metrics.append(
                RequestMetric(
                    kind,
                    url,
                    False,
                    r.status_code,
                    elapsed,
                    None,
                    r.headers.get("Content-Type"),
                    f"redirected_out_of_policy: {r.url}",
                )
            )
            raise ValueError(f"Redirected out of allowed scope: {r.url}")
        size = None if stream else len(r.content)
        metrics.append(RequestMetric(kind, url, True, r.status_code, elapsed, size, r.headers.get("Content-Type"), None))
        r.raise_for_status()
        return r
    except Exception as e:
        elapsed = (time.perf_counter() - start) * 1000
        metrics.append(RequestMetric(kind, url, True, None, elapsed, None, None, repr(e)))
        raise


# ---------------------------------------------------------------------------
# Registry / parser
# ---------------------------------------------------------------------------


def load_registry(path: Path, boards: set[str] | None, priority_max: int) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    selected = []
    for b in data:
        if not b.get("canonical", True):
            continue
        if int(b.get("priority", 999)) > priority_max:
            continue
        if boards and str(b.get("boardId")) not in boards:
            continue
        selected.append(b)
    return selected


def list_url(board_id: str, page_itm: int = 10) -> str:
    return f"{BASE_URL}/ko/bbs/{board_id}/list.do?pageIndex=1&pageItm={page_itm}&searchGbn=0&searchOrderSort=0"


def extract_pst_sn(url: str) -> str | None:
    qs = parse_qs(urlparse(url).query)
    return (qs.get("pstSn") or [None])[0]


DATE_CELL_RE = re.compile(r"(?<!\d)(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})(?:일)?\.?(?!\d)")
HEADER_ALIASES = {
    "notice_no": ("번호", "no", "순번"),
    "campus": ("캠퍼스", "구분", "지역"),
    "title": ("제목",),
    "author": ("작성자", "담당부서", "부서", "기관"),
    "published_at": ("등록일시", "등록일", "작성일", "게시일", "공고일"),
    "application_period": ("접수기간", "모집기간", "채용기간"),
    "views": ("조회수", "조회"),
}


def _normalize_header(text: str | None) -> str:
    return re.sub(r"[^0-9a-z가-힣]+", "", normalize_space(text).lower())


def _header_index(headers: list[str], field: str) -> int | None:
    aliases = tuple(_normalize_header(v) for v in HEADER_ALIASES[field])
    for idx, header in enumerate(headers):
        if any(alias and alias in header for alias in aliases):
            return idx
    return None


def _date_from_text(text: str | None) -> str | None:
    raw = normalize_space(text)
    if not raw:
        return None
    match = DATE_CELL_RE.search(raw)
    if not match:
        return None
    return f"{match.group(1)}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"


def _date_values_from_text(text: str | None) -> list[str]:
    raw = normalize_space(text)
    values: list[str] = []
    for match in DATE_CELL_RE.finditer(raw):
        value = f"{match.group(1)}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"
        if value not in values:
            values.append(value)
    return values


def _scan_date_range(cells: list[str], preferred: int | None = None) -> tuple[str | None, str | None]:
    values: list[str] = []
    if preferred is not None and preferred < len(cells):
        values = _date_values_from_text(cells[preferred])
    if not values:
        for value in cells:
            candidate = _date_values_from_text(value)
            if len(candidate) >= 2:
                values = candidate
                break
    if not values:
        return None, None
    if len(values) == 1:
        return values[0], None
    return values[0], values[1]


def extract_detail_published_at(soup: BeautifulSoup) -> str | None:
    """Extract the actual BBS registration date from a detail page.

    Board 716 lists an application period instead of a publication date. The
    canonical observation date must therefore come from the detail header.
    """
    for container in soup.select(".view-header-info, .view-info, .detail-info"):
        for row in container.find_all(["p", "li", "div"], recursive=True):
            text = normalize_space(row.get_text(" ", strip=True))
            if re.search(r"(?:등록일|게시일|작성일)", text):
                value = _date_from_text(text)
                if value:
                    return value
    label = soup.find(string=lambda x: isinstance(x, str) and re.search(r"(?:등록일|게시일|작성일)", x))
    if label is not None:
        parent = getattr(label, "parent", None)
        if parent is not None:
            value = _date_from_text(parent.get_text(" ", strip=True))
            if value:
                return value
    return None


def _scan_date(cells: list[str], preferred: int | None = None) -> str | None:
    if preferred is not None and preferred < len(cells):
        value = _date_from_text(cells[preferred])
        if value:
            return value
    # Dates normally appear toward the right side of a list row. Reverse scanning
    # avoids interpreting a year in the title as the publication date.
    for value in reversed(cells):
        parsed = _date_from_text(value)
        if parsed:
            return parsed
    return None


def _campus_from_cells(cells: list[str], preferred: int | None = None) -> str | None:
    candidates = []
    if preferred is not None and preferred < len(cells):
        candidates.append(cells[preferred])
    candidates.extend(cells)
    for value in candidates:
        normalized = normalize_campus_label(value)
        if normalized != ["unknown"]:
            return normalize_space(value)
    return None


def _detail_path_matches_board(url: str, board_id: str) -> bool:
    return urlparse(url).path == f"/ko/bbs/{board_id}/detail.do"


def _item_from_row(
    *,
    tr: Any,
    link: Any,
    base_url: str,
    board_id: str,
    row_index: int,
    headers: list[str] | None = None,
    parse_source: str = "table_row",
) -> ListItem | None:
    full = urljoin(base_url, html_lib.unescape(link.get("href") or ""))
    if not _detail_path_matches_board(full, board_id):
        return None
    pst_sn = extract_pst_sn(full)
    if not pst_sn:
        return None
    cells = tr.find_all("td")
    cell_texts = [normalize_space(td.get_text(" ", strip=True)) for td in cells]
    if not cell_texts:
        return None
    header_values = headers or []
    idx_no = _header_index(header_values, "notice_no") if header_values else 0
    idx_campus = _header_index(header_values, "campus") if header_values else None
    idx_title = _header_index(header_values, "title") if header_values else None
    idx_author = _header_index(header_values, "author") if header_values else None
    idx_date = _header_index(header_values, "published_at") if header_values else None
    idx_application_period = _header_index(header_values, "application_period") if header_values else None
    idx_views = _header_index(header_values, "views") if header_values else None

    notice_no = cell_texts[idx_no] if idx_no is not None and idx_no < len(cell_texts) else cell_texts[0]
    title = normalize_space(link.get_text(" ", strip=True))
    if not title and idx_title is not None and idx_title < len(cell_texts):
        title = cell_texts[idx_title]
    author = cell_texts[idx_author] if idx_author is not None and idx_author < len(cell_texts) else None
    views = cell_texts[idx_views] if idx_views is not None and idx_views < len(cell_texts) else None
    application_period_start, application_period_end = _scan_date_range(cell_texts, idx_application_period)
    # Never reinterpret an application period as a publication date.
    if idx_date is not None:
        published_at = _scan_date(cell_texts, idx_date)
    elif idx_application_period is not None:
        published_at = None
    else:
        published_at = _scan_date(cell_texts, None)
    return ListItem(
        row_index=row_index,
        board_id=board_id,
        pst_sn=pst_sn,
        url=full,
        title=title,
        notice_no=notice_no,
        campus=_campus_from_cells(cell_texts, idx_campus),
        author=author,
        published_at=published_at,
        application_period_start=application_period_start,
        application_period_end=application_period_end,
        views=views,
        is_pinned=(notice_no in {"공지", "notice", "고정"}),
        parse_source=parse_source,
    )


def parse_list_items_row_scoped(html: str, base_url: str, board_id: str) -> list[ListItem]:
    """Parse list rows across the KNU board layout variants.

    KNU boards do not all share the exact same header labels. Academic and
    scholarship boards use a campus-rich table, while general/event/job/contest
    boards use variants such as 담당부서/등록일 or 구분/공고일. This parser maps
    known header aliases and falls back to a right-to-left date scan within the
    row, but always requires an exact board-specific detail URL.
    """
    soup = BeautifulSoup(html, "lxml")
    items: list[ListItem] = []
    seen: set[str] = set()

    for table in soup.find_all("table"):
        headers = [_normalize_header(th.get_text(" ", strip=True)) for th in table.find_all("th")]
        has_title_header = _header_index(headers, "title") is not None
        has_detail_rows = table.find("a", href=True) is not None
        if not (has_title_header or has_detail_rows):
            continue

        for row_index, tr in enumerate(table.find_all("tr"), start=1):
            link = tr.find("a", href=True)
            if not link:
                continue
            item = _item_from_row(
                tr=tr,
                link=link,
                base_url=base_url,
                board_id=board_id,
                row_index=row_index,
                headers=headers,
                parse_source="table_row",
            )
            if item is None or item.pst_sn in seen:
                continue
            seen.add(item.pst_sn)
            items.append(item)
    return items


def _nearest_metadata_container(anchor: Any, board_id: str) -> Any | None:
    # Prefer a semantic row/list item. For card layouts, stop at the first ancestor
    # that contains a publication date and no more than a few links to this board.
    tr = anchor.find_parent("tr")
    if tr is not None:
        return tr
    current = anchor.parent
    for _ in range(6):
        if current is None or getattr(current, "name", None) in {"body", "html"}:
            break
        text = normalize_space(current.get_text(" ", strip=True))
        board_links = [
            a for a in current.find_all("a", href=True)
            if _detail_path_matches_board(urljoin(BASE_URL, html_lib.unescape(a.get("href") or "")), board_id)
        ]
        if _date_from_text(text) and 1 <= len(board_links) <= 3:
            return current
        current = current.parent
    return None


def parse_detail_links_fallback(html: str, base_url: str, board_id: str) -> list[ListItem]:
    """Fallback for non-table/card layouts, preserving date metadata when possible."""
    soup = BeautifulSoup(html, "lxml")
    scope = soup.find("main") or soup.find(id="content") or soup
    items: list[ListItem] = []
    seen: set[str] = set()
    for row_index, a in enumerate(scope.find_all("a", href=True), start=1):
        full = urljoin(base_url, html_lib.unescape(a.get("href") or ""))
        if not _detail_path_matches_board(full, board_id):
            continue
        pst_sn = extract_pst_sn(full)
        if not pst_sn or pst_sn in seen:
            continue
        container = _nearest_metadata_container(a, board_id)
        text = normalize_space(container.get_text(" ", strip=True)) if container is not None else ""
        date_value = _date_from_text(text)
        campus = None
        if container is not None:
            parts = [normalize_space(x.get_text(" ", strip=True)) for x in container.find_all(["td", "span", "div", "li"])]
            campus = _campus_from_cells(parts)
        seen.add(pst_sn)
        items.append(
            ListItem(
                row_index=row_index,
                board_id=board_id,
                pst_sn=pst_sn,
                url=full,
                title=normalize_space(a.get_text(" ", strip=True)),
                campus=campus,
                published_at=date_value,
                is_pinned=("공지" in text[:30]),
                parse_source="metadata_fallback" if container is not None else "anchor_fallback",
            )
        )
    return items


def parse_list_items(html: str, base_url: str, board_id: str) -> tuple[list[ListItem], bool, bool]:
    row_items = parse_list_items_row_scoped(html, base_url, board_id)
    dated_row_items = [item for item in row_items if item.published_at]
    application_period_items = [
        item for item in row_items
        if item.application_period_start or item.application_period_end
    ]
    # Board 716 deliberately has no publication-date column. Preserve the
    # row-scoped parser so 접수기간 remains separate from detail-page 등록일.
    if dated_row_items or application_period_items or (board_id == "716" and row_items):
        return row_items, True, False
    fallback_items = parse_detail_links_fallback(html, base_url, board_id)
    # Prefer whichever parser preserved more publication dates. Date-range collection
    # cannot safely proceed on a larger but undated anchor set.
    if sum(bool(i.published_at) for i in fallback_items) > sum(bool(i.published_at) for i in row_items):
        return fallback_items, False, True
    if row_items:
        return row_items, True, False
    return fallback_items, False, True

def clean_notice_text(text: str) -> str:
    """Normalize detail-body text for downstream extraction.

    This is intentionally lighter than summarization: it only removes common UI
    tokens that the KNU site injects around notice bodies.
    """
    lines = []
    skip_exact = {
        "chevron_forward",
        "keyboard_arrow_down",
        "check_circle",
        "open_in_new",
        "stat_minus_1",
        "radio_button_unchecked",
        "radio_button_checked",
    }
    for raw in (text or "").splitlines():
        line = raw.replace("\xa0", " ").strip()
        if not line or line in skip_exact:
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def extract_body_text(soup: BeautifulSoup) -> str:
    """Extract only the human-authored notice body, not global navigation/footer.

    v0.2 sometimes selected a broad `.contents` wrapper and produced 7k+ chars
    containing menus, footer, satisfaction survey, and the actual notice body.
    v0.2.1 prioritizes KNU's real detail body containers observed in current
    pages: `.info-editor-area .editor-wrap` and `.editor-wrap`.
    """
    primary_selectors = [
        ".info-editor-area .editor-wrap",
        ".editor-wrap",
        ".info-editor-area",
    ]
    for selector in primary_selectors:
        for node in soup.select(selector):
            txt = clean_notice_text(node.get_text("\n", strip=True))
            if len(txt) > 20:
                return txt

    # Fall back to a detail card, but remove non-body regions first.
    for selector in [".card.detail", "main.detail", "#content.detail"]:
        node = soup.select_one(selector)
        if not node:
            continue
        node = BeautifulSoup(str(node), "lxml")
        for rm in node.select(
            ".sub-contents-title, .view-header-info, form#detail-form, "
            ".view-file-container, .rating-content, .btn-wrap, .button-wrap"
        ):
            rm.decompose()
        txt = clean_notice_text(node.get_text("\n", strip=True))
        if len(txt) > 20:
            return txt

    # Last resort: strip global non-content regions before returning text.
    clone = BeautifulSoup(str(soup), "lxml")
    for tag in clone(["script", "style", "noscript", "header", "footer", "nav"]):
        tag.decompose()
    for rm in clone.select(
        ".all-menu-container, .mobile-util-container, .sub-top-container, "
        ".sub-contents-title, .rating-content, .footer-contents"
    ):
        rm.decompose()
    return clean_notice_text(clone.get_text("\n", strip=True))


def extract_attachments(html: str, detail_url: str) -> list[AttachmentProbe]:
    soup = BeautifulSoup(html, "lxml")
    urls: list[str] = []

    for a in soup.find_all("a"):
        values = []
        href = a.get("href")
        if href:
            values.append(href)
        for attr_name in ("data-atch-download-url", "data-download-url", "data-url"):
            v = a.get(attr_name)
            if v:
                values.append(v)
        for raw in values:
            full = urljoin(detail_url, html_lib.unescape(raw))
            if is_allowed_kangwon_notice_url(full) and urlparse(full).path == "/ko/cmmn/download.do":
                urls.append(full)

    seen_keys: set[tuple[str | None, str | None, str | None]] = set()
    out: list[AttachmentProbe] = []
    for url in urls:
        qs = parse_qs(urlparse(url).query)
        dn = unquote((qs.get("dn") or [""])[0]) or None
        fn = unquote((qs.get("fn") or [""])[0]) or None
        path = unquote((qs.get("path") or [""])[0]) or None
        key = (dn, fn, path)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        out.append(
            AttachmentProbe(
                index=len(out) + 1,
                display_name=fn or dn or f"attachment_{len(out) + 1}",
                download_url=url,
                server_name=dn,
                path=path,
            )
        )
    return out


# ---------------------------------------------------------------------------
# Output builders
# ---------------------------------------------------------------------------


def download_attachment(
    session: requests.Session,
    att: AttachmentProbe,
    output_dir: Path,
    metrics: list[RequestMetric],
    delay: float,
) -> AttachmentProbe:
    start = time.perf_counter()
    safe = sanitize_filename(att.display_name, f"attachment_{att.index}")
    target = output_dir / f"{att.index:02d}_{safe}"
    tmp = output_dir / f".{target.name}.tmp"
    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        r = request_get(session, att.download_url, "attachment", metrics, stream=True)
        size = 0
        with tmp.open("wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 128):
                if not chunk:
                    continue
                f.write(chunk)
                size += len(chunk)
        head = tmp.read_bytes()[:2048]
        detected = detect_file_type(head, att.display_name)
        att.elapsed_ms = (time.perf_counter() - start) * 1000
        att.size_bytes = size
        att.detected_type = detected
        if detected == "html_or_error_page" or size == 0:
            att.status = "failed_invalid_content"
            att.error = "invalid content or empty file"
            invalid = output_dir / f"{target.name}.invalid.html"
            tmp.replace(invalid)
            att.local_path = str(invalid)
            return att
        tmp.replace(target)
        att.downloaded = True
        att.status = "downloaded"
        att.local_path = str(target)
        att.sha256 = sha256_file(target)
        polite_sleep(delay)
        return att
    except Exception as e:
        att.elapsed_ms = (time.perf_counter() - start) * 1000
        att.status = "failed_exception"
        att.error = repr(e)
        try:
            if tmp.exists():
                tmp.unlink()
        except Exception:
            pass
        return att


def write_normalized_notice(
    out_dir: Path,
    board: dict[str, Any],
    detail: DetailProbe,
    body_text: str,
    attachments: list[AttachmentProbe],
    crawled_at: str,
    raw_html_path: Path,
) -> Path:
    normalized_dir = out_dir / "normalized" / "notices"
    normalized_dir.mkdir(parents=True, exist_ok=True)
    notice_id = f"knu-{detail.board_id}-{detail.pst_sn}"
    attachment_dicts = []
    for a in attachments:
        d = asdict(a)
        if d.get("local_path"):
            d["local_path"] = relpath(Path(d["local_path"]), out_dir)
        attachment_dicts.append(d)

    # Hash only the stable analysis input, not volatile probe/download status.
    # This drives reanalysis/cache invalidation and must match DetailProbe.content_hash.
    stable_attachment_identity = [
        {
            "display_name": a.display_name,
            "server_name": a.server_name,
            "path": a.path,
        }
        for a in attachments
    ]
    evidence_input_hash = sha256_text(
        "\n".join(
            [
                notice_id,
                detail.title,
                detail.list_item.published_at if detail.list_item else "",
                body_text,
                json.dumps(stable_attachment_identity, ensure_ascii=False, sort_keys=True),
            ]
        )
    )
    detail.content_hash = evidence_input_hash
    text_status = "body_html_extracted" if body_text.strip() else "empty_body"
    attachment_required = bool(attachments) and len(body_text.strip()) < 250

    normalized = {
        "schemaVersion": "noticepilot.normalizedNotice.v0.3",
        "noticeId": notice_id,
        "institution": INSTITUTION,
        "sourceSystem": "kangwon.ac.kr public bbs",
        "board": {
            "boardId": detail.board_id,
            "name": board.get("name"),
            "category": detail.category,
            "priority": board.get("priority"),
            "aliasBoardIds": board.get("aliasBoardIds", []),
        },
        "sourceUrl": detail.url,
        "pstSn": detail.pst_sn,
        "title": detail.title,
        "publishedAt": detail.list_item.published_at if detail.list_item else None,
        "timezone": TIMEZONE,
        "campusScope": build_campus_scope(
            title=detail.title,
            body_text=body_text,
            list_campus=detail.list_item.campus if detail.list_item else None,
            author=detail.list_item.author if detail.list_item else None,
        ),
        "listMetadata": asdict(detail.list_item) if detail.list_item else None,
        "rawHtml": {
            "path": relpath(raw_html_path, out_dir),
            "sha256": detail.raw_html_sha256,
        },
        "extractedText": body_text,
        "extractedTextChars": len(body_text),
        "textExtractionStatus": text_status,
        "attachments": attachment_dicts,
        "attachmentCount": len(attachments),
        "attachmentRequiredForFullExtraction": attachment_required,
        "contentHash": evidence_input_hash,
        "crawler": {
            "version": "0.4.4",
            "userAgent": USER_AGENT,
            "crawledAt": crawled_at,
        },
    }
    path = normalized_dir / f"{notice_id}.json"
    path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def write_attachment_manifest(out_dir: Path, board_reports: list[BoardProbe]) -> None:
    rows: list[dict[str, Any]] = []
    for b in board_reports:
        for d in b.details:
            for a in d.attachments:
                row = {
                    "boardId": d.board_id,
                    "category": d.category,
                    "pstSn": d.pst_sn,
                    "noticeId": f"knu-{d.board_id}-{d.pst_sn}",
                    "noticeTitle": d.title,
                    **asdict(a),
                }
                if row.get("local_path"):
                    row["local_path"] = relpath(Path(row["local_path"]), out_dir)
                rows.append(row)
    manifest_dir = out_dir / "normalized"
    manifest_dir.mkdir(parents=True, exist_ok=True)
    (manifest_dir / "attachment_manifest.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    values = sorted(values)
    if len(values) == 1:
        return values[0]
    k = (len(values) - 1) * p
    f = int(k)
    c = min(f + 1, len(values) - 1)
    if f == c:
        return values[f]
    return values[f] + (values[c] - values[f]) * (k - f)


def summarize(report: dict[str, Any]) -> dict[str, Any]:
    metrics = [RequestMetric(**m) if isinstance(m, dict) else m for m in report["request_metrics"]]
    lat = [m.elapsed_ms for m in metrics if m.elapsed_ms is not None and m.error is None]
    errors = [m for m in metrics if m.error]
    attachment_statuses: list[str] = []
    details = []
    normalized_count = 0
    for b in report["boards"]:
        for d in b["details"]:
            details.append(d)
            if d.get("normalized_notice_path"):
                normalized_count += 1
            for a in d["attachments"]:
                attachment_statuses.append(a["status"])
    return {
        "request_count": len(metrics),
        "request_error_count": len(errors),
        "latency_ms": {
            "avg": statistics.mean(lat) if lat else None,
            "p50": percentile(lat, 0.50),
            "p90": percentile(lat, 0.90),
            "max": max(lat) if lat else None,
        },
        "board_count": len(report["boards"]),
        "detail_count": len(details),
        "normalized_notice_count": normalized_count,
        "attachment_count": len(attachment_statuses),
        "attachment_status_counts": {s: attachment_statuses.count(s) for s in sorted(set(attachment_statuses))},
        "row_parser_board_count": sum(1 for b in report["boards"] if b.get("row_parser_used")),
        "fallback_anchor_parser_board_count": sum(1 for b in report["boards"] if b.get("fallback_anchor_parser_used")),
    }


# ---------------------------------------------------------------------------
# Probe
# ---------------------------------------------------------------------------


def run_probe(args: argparse.Namespace) -> int:
    registry_path = Path(args.registry)
    out_dir = Path(args.output_dir)
    raw_dir = out_dir / "raw"
    attachments_dir = out_dir / "attachments"
    out_dir.mkdir(parents=True, exist_ok=True)

    board_filter = {x.strip() for x in args.boards.split(",") if x.strip()} or None
    boards_cfg = load_registry(registry_path, board_filter, args.priority_max)

    session = make_session()
    metrics: list[RequestMetric] = []
    board_reports: list[BoardProbe] = []

    started = now_utc_iso()

    for b in boards_cfg:
        board_id = str(b["boardId"])
        url = list_url(board_id, args.page_itm)
        br = BoardProbe(
            board_id=board_id,
            name=str(b.get("name", board_id)),
            category=str(b.get("category", "unknown")),
            priority=int(b.get("priority", 999)),
            list_url=url,
            list_status="pending",
            list_elapsed_ms=None,
            discovered_detail_count=0,
            sampled_detail_count=0,
            details=[],
        )
        try:
            polite_sleep(args.delay)
            r = request_get(session, url, "list", metrics)
            r.encoding = r.apparent_encoding or r.encoding
            br.list_elapsed_ms = metrics[-1].elapsed_ms
            br.list_status = "ok"
            raw_list = raw_dir / f"board_{board_id}_list.html"
            raw_list.parent.mkdir(parents=True, exist_ok=True)
            raw_list.write_text(r.text, encoding="utf-8")
            br.raw_list_path = relpath(raw_list, out_dir)

            items, row_used, fallback_used = parse_list_items(r.text, url, board_id)
            br.row_parser_used = row_used
            br.fallback_anchor_parser_used = fallback_used
            br.discovered_detail_count = len(items)
            sample = items[: args.details_per_board]
            br.sampled_detail_count = len(sample)

            for item in sample:
                detail_url = item.url
                dp = DetailProbe(
                    board_id=board_id,
                    category=br.category,
                    pst_sn=item.pst_sn,
                    title=item.title,
                    url=detail_url,
                    status="pending",
                    elapsed_ms=None,
                    body_chars=0,
                    attachment_count=0,
                    attachments=[],
                    list_item=item,
                )
                try:
                    polite_sleep(args.delay)
                    dr = request_get(session, detail_url, "detail", metrics)
                    dr.encoding = dr.apparent_encoding or dr.encoding
                    dp.elapsed_ms = metrics[-1].elapsed_ms
                    raw_detail = raw_dir / f"board_{board_id}_pst_{dp.pst_sn}.html"
                    raw_detail.write_text(dr.text, encoding="utf-8")
                    dp.raw_html_path = relpath(raw_detail, out_dir)
                    dp.raw_html_sha256 = sha256_text(dr.text)

                    soup = BeautifulSoup(dr.text, "lxml")
                    body_text = extract_body_text(soup)
                    dp.body_chars = len(body_text)
                    atts = extract_attachments(dr.text, detail_url)
                    dp.attachment_count = len(atts)
                    dp.attachments = atts
                    dp.status = "ok"

                    if args.download != "none" and atts:
                        selected = atts[:1] if args.download == "first" else atts
                        local_attachment_dir = attachments_dir / f"board_{board_id}_pst_{dp.pst_sn}"
                        for att in selected:
                            download_attachment(session, att, local_attachment_dir, metrics, args.delay)
                        if args.download == "first" and len(atts) > 1:
                            for att in atts[1:]:
                                att.status = "skipped_by_probe_download_first"

                    normalized_path = write_normalized_notice(out_dir, b, dp, body_text, atts, now_utc_iso(), raw_detail)
                    dp.normalized_notice_path = relpath(normalized_path, out_dir)

                except Exception as e:
                    dp.status = "failed"
                    dp.error = repr(e)
                br.details.append(dp)
        except Exception as e:
            br.list_status = "failed"
            br.error = repr(e)
        board_reports.append(br)

    finished = now_utc_iso()
    write_attachment_manifest(out_dir, board_reports)

    report: dict[str, Any] = {
        "probe": {
            "version": "0.4.4",
            "started_at": started,
            "finished_at": finished,
            "user_agent": USER_AGENT,
            "base_url": BASE_URL,
            "mode": {
                "priority_max": args.priority_max,
                "boards": sorted(board_filter) if board_filter else None,
                "page_itm": args.page_itm,
                "details_per_board": args.details_per_board,
                "download": args.download,
                "delay_sec": args.delay,
            },
            "robots_interpretation": {
                "allowed_path_prefix": "/ko/",
                "blocked": [
                    "/neibis-api/",
                    "*/login.do",
                    "*/logout.do",
                    "*/save.do",
                    "*/updt.do",
                    "*/rply.do",
                    "*/preview.do",
                    "*/error.do",
                ],
            },
        },
        "boards": [asdict(b) for b in board_reports],
        "request_metrics": [asdict(m) for m in metrics],
    }
    report["summary"] = summarize(report)

    report_path = out_dir / "probe_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_path = out_dir / "request_metrics.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        fieldnames = (
            list(asdict(metrics[0]).keys())
            if metrics
            else ["kind", "url", "allowed", "status_code", "elapsed_ms", "size_bytes", "content_type", "error"]
        )
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for m in metrics:
            writer.writerow(asdict(m))

    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    print(f"\nSaved: {report_path}")
    print(f"Saved: {csv_path}")
    print(f"Saved: {out_dir / 'normalized' / 'attachment_manifest.json'}")

    if report["summary"]["request_error_count"]:
        return 2
    return 0


def run_offline_parser_check(sample_dir: Path) -> int:
    if not sample_dir.exists():
        print(f"sample dir not found: {sample_dir}", file=sys.stderr)
        return 2
    checks = []
    for path in sorted(sample_dir.glob("board_*_list.html")):
        m = re.search(r"board_(\d+)_list\.html", path.name)
        if not m:
            continue
        board_id = m.group(1)
        html = path.read_text(encoding="utf-8")
        items, row_used, fallback_used = parse_list_items(html, list_url(board_id), board_id)
        checks.append(
            {
                "file": path.name,
                "boardId": board_id,
                "itemCount": len(items),
                "rowParserUsed": row_used,
                "fallbackAnchorParserUsed": fallback_used,
                "firstItems": [asdict(i) for i in items[:3]],
            }
        )
    print(json.dumps({"offlineParserChecks": checks}, ensure_ascii=False, indent=2))
    return 0 if checks and all(c["rowParserUsed"] and c["itemCount"] > 0 for c in checks) else 1



def run_offline_detail_check(sample_dir: Path) -> int:
    if not sample_dir.exists():
        print(f"sample dir not found: {sample_dir}", file=sys.stderr)
        return 2
    checks = []
    for path in sorted(sample_dir.glob("board_*_pst_*.html")):
        html = path.read_text(encoding="utf-8")
        soup = BeautifulSoup(html, "lxml")
        text = extract_body_text(soup)
        checks.append(
            {
                "file": path.name,
                "extractedTextChars": len(text),
                "containsGlobalNav": "대학소개\n입학안내\n대학·대학원" in text,
                "containsFooterCopyright": "COPYRIGHT" in text,
                "preview": text[:500],
            }
        )
    ok = bool(checks) and all(
        c["extractedTextChars"] > 20
        and not c["containsGlobalNav"]
        and not c["containsFooterCopyright"]
        for c in checks
    )
    print(json.dumps({"offlineDetailChecks": checks}, ensure_ascii=False, indent=2))
    return 0 if ok else 1

def build_arg_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="KNU crawler server-readiness probe v0.3")
    ap.add_argument("--registry", default="configs/knu_board_registry.v0.2.json", help="board registry JSON path")
    ap.add_argument("--output-dir", default="knu_crawler_probe_out", help="output directory")
    ap.add_argument("--boards", default="", help="comma-separated board IDs, e.g. 720,721")
    ap.add_argument("--priority-max", type=int, default=1, help="include boards with priority <= N")
    ap.add_argument("--page-itm", type=int, default=10, help="list page item count")
    ap.add_argument("--details-per-board", type=int, default=2, help="sample detail pages per board")
    ap.add_argument("--download", choices=["none", "first", "all"], default="none", help="attachment download mode")
    ap.add_argument("--delay", type=float, default=1.0, help="seconds between HTTP requests/downloads")
    ap.add_argument("--offline-parser-check", action="store_true", help="run row parser against bundled samples without network")
    ap.add_argument("--offline-detail-check", action="store_true", help="run detail body extractor against bundled samples without network")
    ap.add_argument("--sample-dir", default="samples/raw", help="sample raw HTML directory for --offline-parser-check")
    return ap


def main() -> int:
    ap = build_arg_parser()
    args = ap.parse_args()
    if args.offline_parser_check:
        return run_offline_parser_check(Path(args.sample_dir))
    if args.offline_detail_check:
        return run_offline_detail_check(Path(args.sample_dir))
    return run_probe(args)


if __name__ == "__main__":
    raise SystemExit(main())
