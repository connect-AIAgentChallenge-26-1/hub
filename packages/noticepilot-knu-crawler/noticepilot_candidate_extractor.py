#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NoticePilot calendar candidate extractor v0.4.4.

Scope:
  - input: normalized notice JSON files created by knu_crawler_probe.py
  - output: deterministic calendarEvent candidate JSON files
  - extraction: conservative rule-based Korean date/deadline detection
  - validation: status/includeInCalendarFeed assignment for MVP safety

This module intentionally does not call an LLM. It provides a transparent baseline
and expected-test harness before LLM extraction is introduced.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "noticepilot.calendarCandidates.v0.4"
EXTRACTOR_VERSION = "0.4.4"
TIMEZONE = "Asia/Seoul"

DATE_RE = re.compile(
    r"(?P<year>20\d{2})\s*[.\-/년]\s*"
    r"(?P<month>\d{1,2})\s*[.\-/월]\s*"
    r"(?P<day>\d{1,2})\s*"
    r"(?:[.]?\s*\([^)\n]{0,8}\))?\s*(?:일)?"
)
TIME_RE = re.compile(r"(?P<hour>\d{1,2})\s*:\s*(?P<minute>\d{2})")

ACTION_KEYWORDS = (
    "마감",
    "기한",
    "까지",
    "제출",
    "신청",
    "접수",
    "등록",
    "납부",
    "면접",
    "시험",
    "설명회",
    "오리엔테이션",
    "OT",
    "발표",
)
UNCERTAIN_KEYWORDS = ("추후", "예정", "선착순", "별도 공지", "변동 가능")
INTERNAL_ACTOR_KEYWORDS = ("학과", "부서", "담당자", "대학", "행정실", "지원과", "교학지원과")
USER_ACTOR_KEYWORDS = ("학생", "대상자", "신청자", "지원자", "재학생", "휴학생", "학부생", "대학원생")


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def normalize_space(text: str | None) -> str:
    return " ".join((text or "").replace("\xa0", " ").split())


CAMPUS_LABELS = {
    "chuncheon": "춘천",
    "samcheok": "삼척",
    "dogye": "도계",
    "gangneung_wonju": "강릉원주",
    "all": "전체",
    "unknown": "불명확",
}


def normalize_campus_label(label: str | None) -> list[str]:
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
    if "삼척" in raw:
        campuses.append("samcheok")
    if "강릉" in raw or "원주" in raw or "강릉원주" in compact:
        campuses.append("gangneung_wonju")
    deduped: list[str] = []
    for c in campuses:
        if c not in deduped:
            deduped.append(c)
    return deduped or ["unknown"]


def default_campus_scope() -> dict[str, Any]:
    return {
        "sourceLabel": None,
        "campuses": ["unknown"],
        "scopeType": "unknown",
        "confidence": "low",
        "source": "none",
        "labels": {"unknown": CAMPUS_LABELS["unknown"]},
    }


def campus_scope_from_notice(notice: dict[str, Any]) -> dict[str, Any]:
    scope = notice.get("campusScope")
    if isinstance(scope, dict) and scope.get("campuses"):
        return scope
    list_meta = notice.get("listMetadata") or {}
    raw = list_meta.get("campus") or list_meta.get("author")
    campuses = normalize_campus_label(raw)
    if campuses != ["unknown"]:
        return {
            "sourceLabel": raw,
            "campuses": campuses,
            "scopeType": "all_campuses" if campuses == ["all"] else "campus_specific",
            "confidence": "high" if campuses == ["all"] else "medium",
            "source": "listMetadata.campus_or_author",
            "labels": {c: CAMPUS_LABELS.get(c, c) for c in campuses},
        }
    return default_campus_scope()


def compact_title(title: str) -> str:
    t = normalize_space(title)
    t = re.sub(r"^20\d{2}학년도\s*", "", t)
    t = re.sub(r"^[12]학기\s*", "", t)
    t = re.sub(r"\s*안내$", "", t)
    return t or normalize_space(title)


def normalize_date(match: re.Match[str], segment: str) -> tuple[str, str, bool]:
    year = int(match.group("year"))
    month = int(match.group("month"))
    day = int(match.group("day"))
    date_text = match.group(0).strip()
    tail = segment[match.end() : match.end() + 40]
    time_match = TIME_RE.search(tail)
    if time_match:
        hour = int(time_match.group("hour"))
        minute = int(time_match.group("minute"))
        normalized = f"{year:04d}-{month:02d}-{day:02d}T{hour:02d}:{minute:02d}:00+09:00"
        # Include nearby time in the human date text when present.
        date_text = normalize_space(segment[match.start() : match.end() + time_match.end()])
        return normalized, date_text, False
    return f"{year:04d}-{month:02d}-{day:02d}", date_text, True


def classify_event_type(segment: str) -> str:
    # Prefer explicit application-period/deadline wording over generic document names.
    if "신청기간" in segment or "신청 기한" in segment or "신청마감" in segment or "접수기간" in segment or "접수마감" in segment:
        return "application_deadline"
    if "납부" in segment or "등록금" in segment:
        return "payment_deadline"
    if "제출기한" in segment or "제출 기한" in segment or "제출마감" in segment or "제출 마감" in segment:
        return "submission_deadline"
    if "신청" in segment or "접수" in segment:
        return "application_deadline"
    if "제출" in segment:
        return "submission_deadline"
    if "면접" in segment:
        return "interview"
    if "시험" in segment:
        return "exam"
    if "설명회" in segment or "오리엔테이션" in segment or "OT" in segment:
        return "orientation"
    if "발표" in segment:
        return "announcement"
    if "마감" in segment or "기한" in segment or "까지" in segment:
        return "deadline"
    return "other"


def infer_target_actor(segment: str, title: str, event_type: str) -> str:
    # Prefer explicit actor prefixes before a colon.
    prefix_match = re.match(r"^\s*[-–—]?\s*([^:：]{1,20})\s*[:：]", segment)
    if prefix_match:
        prefix = prefix_match.group(1)
        if any(k in prefix for k in ("학생", "대상자", "신청자", "지원자")):
            return "student"
        if any(k in prefix for k in INTERNAL_ACTOR_KEYWORDS):
            return "department"

    joined = f"{title}\n{segment}"
    if any(k in segment[:40] for k in USER_ACTOR_KEYWORDS):
        return "student"
    if any(k in segment[:40] for k in INTERNAL_ACTOR_KEYWORDS):
        return "department"
    # Most application/submission notices are user-actionable unless explicitly internal.
    if event_type in {"application_deadline", "submission_deadline", "payment_deadline"}:
        return "student"
    if any(k in joined for k in USER_ACTOR_KEYWORDS):
        return "student"
    return "unknown"


def make_candidate_title(source_title: str, event_type: str, target_actor: str) -> str:
    base = compact_title(source_title)
    if event_type == "application_deadline":
        suffix = "신청 마감"
    elif event_type == "submission_deadline":
        suffix = "제출 마감"
    elif event_type == "payment_deadline":
        suffix = "납부 마감"
    elif event_type == "interview":
        suffix = "면접 일정"
    elif event_type == "exam":
        suffix = "시험 일정"
    elif event_type == "orientation":
        suffix = "안내/참석 일정"
    elif event_type == "announcement":
        suffix = "발표일"
    else:
        suffix = "마감"
    if target_actor == "department" and event_type.endswith("deadline"):
        suffix = f"학과 {suffix}"
    elif target_actor == "student" and event_type == "submission_deadline":
        suffix = f"학생 {suffix}"
    if suffix in base:
        return base
    if base.endswith("신청") and suffix == "신청 마감":
        return f"{base} 마감".strip()
    if base.endswith("제출") and suffix.endswith("제출 마감"):
        return f"{base} 마감".strip()
    return f"{base} {suffix}".strip()


def segment_lines(text: str) -> list[dict[str, Any]]:
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    segments: list[dict[str, Any]] = []
    label_re = re.compile(r"(신청\s*기간|접수\s*기간|제출\s*기한|제출\s*기간|신청\s*기한|마감|기한)")

    for i, line in enumerate(lines):
        line_norm = normalize_space(line)
        has_date = bool(DATE_RE.search(line_norm))
        has_action = any(k in line_norm for k in ACTION_KEYWORDS)

        # Use the line itself when it already contains both action semantics and date.
        if has_date and has_action:
            segments.append({"lineIndex": i, "text": line_norm})
            continue

        # Broken date line after a semantic label, e.g.
        #   2. 신청기간: ~
        #   2026. 7. 15.(수
        #   )까지
        if has_date:
            prev = lines[i - 1] if i > 0 else ""
            next_line = lines[i + 1] if i + 1 < len(lines) else ""
            if label_re.search(prev):
                combined_parts = [prev, line]
                if next_line.startswith(")") or "까지" in next_line or "마감" in next_line:
                    combined_parts.append(next_line)
                segments.append({"lineIndex": i - 1, "text": normalize_space(" ".join(combined_parts))})
            continue

        # Semantic label followed by one or two broken date lines.
        if has_action and label_re.search(line_norm):
            combined_parts = [line]
            for j in range(i + 1, min(len(lines), i + 4)):
                combined_parts.append(lines[j])
                candidate = normalize_space(" ".join(combined_parts))
                if DATE_RE.search(candidate):
                    # Include a following continuation such as ")까지" when the
                    # weekday parenthesis was split by HTML line breaks.
                    if j + 1 < len(lines) and (lines[j + 1].startswith(")") or "까지" in lines[j + 1] or "마감" in lines[j + 1]):
                        combined_parts.append(lines[j + 1])
                        candidate = normalize_space(" ".join(combined_parts))
                    # When a header like "제출기한" is followed by multiple
                    # actor-specific rows, do not create a synthetic candidate
                    # spanning all rows; the actor rows will be extracted directly.
                    if len(list(DATE_RE.finditer(candidate))) > 1:
                        break
                    segments.append({"lineIndex": i, "text": candidate})
                    break

    return segments


def should_consider_segment(segment: str) -> bool:
    return bool(DATE_RE.search(segment)) and any(k in segment for k in ACTION_KEYWORDS)


def validate_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    reasons: list[str] = list(candidate.get("uncertaintyReasons") or [])
    evidence = candidate.get("evidence") or ""
    event_type = candidate.get("eventType")
    target_actor = candidate.get("targetActor")

    if not evidence:
        reasons.append("missing_evidence")
    if not candidate.get("normalizedStart"):
        reasons.append("missing_normalized_date")
    for word in UNCERTAIN_KEYWORDS:
        if word in evidence:
            reasons.append(f"uncertain_keyword:{word}")
    if event_type == "other":
        reasons.append("weak_action_type")
    if target_actor == "department":
        reasons.append("internal_actor")
    if target_actor == "unknown":
        reasons.append("unknown_actor")

    # Confidence is conservative and policy-driven.
    if any(r.startswith("uncertain_keyword") or r in {"missing_evidence", "missing_normalized_date"} for r in reasons):
        confidence = "low"
    elif target_actor == "department" or event_type == "other":
        confidence = "medium"
    elif "까지" in evidence or "마감" in evidence or "기한" in evidence or "신청기간" in evidence or "접수기간" in evidence:
        confidence = "high"
    else:
        confidence = "medium"

    auto_ok = confidence == "high" and target_actor == "student" and event_type in {
        "application_deadline",
        "submission_deadline",
        "payment_deadline",
        "deadline",
    }
    candidate["confidence"] = confidence
    candidate["uncertaintyReasons"] = sorted(set(reasons))
    candidate["status"] = "auto_confirmed" if auto_ok else "needs_review"
    candidate["includeInCalendarFeed"] = bool(auto_ok)
    return candidate


def extract_candidates_from_notice(notice: dict[str, Any]) -> dict[str, Any]:
    notice_id = notice.get("noticeId") or "unknown-notice"
    title = notice.get("title") or ""
    source_url = notice.get("sourceUrl")
    board_category = (notice.get("board") or {}).get("category")
    text = notice.get("extractedText") or ""
    campus_scope = campus_scope_from_notice(notice)

    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str, str]] = set()
    for seg in segment_lines(text):
        segment = seg["text"]
        if not should_consider_segment(segment):
            continue
        matches = list(DATE_RE.finditer(segment))
        if not matches:
            continue
        # For periods/ranges, the calendar-relevant deadline is usually the final date.
        chosen = matches[-1] if ("~" in segment or "부터" in segment or len(matches) > 1) else matches[0]
        normalized_start, date_text, is_all_day = normalize_date(chosen, segment)
        event_type = classify_event_type(segment)
        target_actor = infer_target_actor(segment, title, event_type)
        cand_title = make_candidate_title(title, event_type, target_actor)
        key = (normalized_start, event_type, target_actor, "")
        if key in seen:
            continue
        seen.add(key)
        base_id = sha256_text("|".join([notice_id, normalized_start, event_type, target_actor, segment]))[:12]
        candidate = {
            "id": f"cand-{notice_id}-{base_id}",
            "uidHint": f"noticepilot-{notice_id}-{base_id}@noticepilot.local",
            "sourceNoticeId": notice_id,
            "sourceTitle": title,
            "sourceUrl": source_url,
            "noticeType": board_category,
            "campusScope": campus_scope,
            "eventType": event_type,
            "targetActor": target_actor,
            "title": cand_title,
            "dateText": date_text,
            "normalizedStart": normalized_start,
            "normalizedEnd": None,
            "isAllDay": is_all_day,
            "evidence": segment,
            "evidenceLineIndex": seg.get("lineIndex"),
            "confidence": "medium",
            "uncertaintyReasons": [],
            "status": "candidate",
            "includeInCalendarFeed": False,
            "createdBy": "rule",
            "reviewedByUser": False,
        }
        candidates.append(validate_candidate(candidate))

    return {
        "schemaVersion": SCHEMA_VERSION,
        "sourceNoticeId": notice_id,
        "sourceContentHash": notice.get("contentHash"),
        "sourceTitle": title,
        "sourceUrl": source_url,
        "timezone": notice.get("timezone") or TIMEZONE,
        "sourceCampusScope": campus_scope,
        "extractor": {
            "version": EXTRACTOR_VERSION,
            "createdAt": now_utc_iso(),
            "mode": "rule_based_v1",
        },
        "candidates": candidates,
        "summary": {
            "candidateCount": len(candidates),
            "autoConfirmedCount": sum(1 for c in candidates if c["status"] == "auto_confirmed"),
            "needsReviewCount": sum(1 for c in candidates if c["status"] == "needs_review"),
            "calendarFeedIncludedCount": sum(1 for c in candidates if c["includeInCalendarFeed"]),
        },
    }


def iter_notice_files(input_path: Path) -> list[Path]:
    if input_path.is_file():
        return [input_path]
    return sorted(input_path.glob("*.json"))


def summarize_by_campus(results: list[dict[str, Any]]) -> dict[str, Any]:
    summary: dict[str, dict[str, int]] = {}
    for result in results:
        for candidate in result.get("candidates") or []:
            scope = candidate.get("campusScope") or {"campuses": ["unknown"]}
            campuses = scope.get("campuses") or ["unknown"]
            for campus in campuses:
                bucket = summary.setdefault(campus, {
                    "candidateCount": 0,
                    "autoConfirmedCount": 0,
                    "needsReviewCount": 0,
                    "calendarFeedIncludedCount": 0,
                })
                bucket["candidateCount"] += 1
                if candidate.get("status") == "auto_confirmed":
                    bucket["autoConfirmedCount"] += 1
                if candidate.get("status") == "needs_review":
                    bucket["needsReviewCount"] += 1
                if candidate.get("includeInCalendarFeed"):
                    bucket["calendarFeedIncludedCount"] += 1
    return {
        campus: {
            "label": CAMPUS_LABELS.get(campus, campus),
            **counts,
        }
        for campus, counts in sorted(summary.items())
    }


def run_extract(args: argparse.Namespace) -> int:
    input_path = Path(args.input)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    files = iter_notice_files(input_path)
    reports = []
    results = []
    if not files:
        print(f"No normalized notice JSON files found: {input_path}", file=sys.stderr)
        return 2
    for path in files:
        notice = json.loads(path.read_text(encoding="utf-8"))
        result = extract_candidates_from_notice(notice)
        results.append(result)
        notice_id = result["sourceNoticeId"]
        out_path = out_dir / f"{notice_id}.candidates.json"
        out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        campus_scope = result.get("sourceCampusScope") or {}
        reports.append({
            "noticeId": notice_id,
            "path": str(out_path),
            "sourceCampusScope": campus_scope,
            **result["summary"],
        })
    summary = {
        "extractorVersion": EXTRACTOR_VERSION,
        "noticeCount": len(reports),
        "candidateCount": sum(r["candidateCount"] for r in reports),
        "autoConfirmedCount": sum(r["autoConfirmedCount"] for r in reports),
        "needsReviewCount": sum(r["needsReviewCount"] for r in reports),
        "campusSummary": summarize_by_campus(results),
        "items": reports,
    }
    (out_dir / "candidate_extraction_report.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"\nSaved: {out_dir / 'candidate_extraction_report.json'}")
    return 0


def load_expected(expected_dir: Path, notice_id: str) -> dict[str, Any] | None:
    path = expected_dir / f"{notice_id}.expected.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def check_expected(result: dict[str, Any], expected: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    candidates = result.get("candidates") or []
    if "expectedCandidateCount" in expected and len(candidates) != int(expected["expectedCandidateCount"]):
        failures.append(f"candidate count mismatch: expected {expected['expectedCandidateCount']}, got {len(candidates)}")
    if "expectedAutoConfirmedCount" in expected:
        actual_auto = sum(1 for c in candidates if c.get("status") == "auto_confirmed")
        if actual_auto != int(expected["expectedAutoConfirmedCount"]):
            failures.append(f"auto-confirmed count mismatch: expected {expected['expectedAutoConfirmedCount']}, got {actual_auto}")
    for idx, exp in enumerate(expected.get("expectedEvents") or [], start=1):
        matches = []
        for c in candidates:
            if exp.get("eventType") and c.get("eventType") != exp["eventType"]:
                continue
            if exp.get("targetActor") and c.get("targetActor") != exp["targetActor"]:
                continue
            if exp.get("normalizedStart") and c.get("normalizedStart") != exp["normalizedStart"]:
                continue
            if "shouldAutoConfirm" in exp and (c.get("status") == "auto_confirmed") != bool(exp["shouldAutoConfirm"]):
                continue
            if exp.get("evidenceContains") and exp["evidenceContains"] not in c.get("evidence", ""):
                continue
            matches.append(c)
        if not matches:
            failures.append(f"missing expected event #{idx}: {exp}")
    return failures


def run_offline_candidate_check(args: argparse.Namespace) -> int:
    sample_dir = Path(args.sample_dir)
    expected_dir = Path(args.expected_dir)
    files = iter_notice_files(sample_dir)
    checks = []
    all_failures = []
    for path in files:
        notice = json.loads(path.read_text(encoding="utf-8"))
        result = extract_candidates_from_notice(notice)
        notice_id = result["sourceNoticeId"]
        expected = load_expected(expected_dir, notice_id)
        failures = check_expected(result, expected) if expected else ["expected file missing"]
        checks.append(
            {
                "noticeId": notice_id,
                "candidateCount": result["summary"]["candidateCount"],
                "autoConfirmedCount": result["summary"]["autoConfirmedCount"],
                "failures": failures,
                "previewCandidates": result["candidates"][:3],
            }
        )
        all_failures.extend(f"{notice_id}: {f}" for f in failures)
    output = {"offlineCandidateChecks": checks, "failureCount": len(all_failures), "failures": all_failures}
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0 if files and not all_failures else 1


def build_arg_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="NoticePilot normalized notice -> calendar candidate extractor v0.4.4")
    ap.add_argument("--input", default="normalized/notices", help="normalized notice JSON file or directory")
    ap.add_argument("--output-dir", default="extracted/candidates", help="candidate output directory")
    ap.add_argument("--offline-candidate-check", action="store_true", help="run bundled sample normalized notices against expected JSON")
    ap.add_argument("--sample-dir", default="samples/normalized/notices", help="sample normalized notice directory")
    ap.add_argument("--expected-dir", default="expected", help="expected event JSON directory")
    return ap


def main() -> int:
    args = build_arg_parser().parse_args()
    if args.offline_candidate_check:
        return run_offline_candidate_check(args)
    return run_extract(args)


if __name__ == "__main__":
    raise SystemExit(main())
