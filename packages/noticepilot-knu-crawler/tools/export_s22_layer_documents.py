#!/usr/bin/env python3
"""Export S22 structure and temporal layer observations without policy decisions."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from noticepilot_mvp_policy_pipeline import (
    STRUCTURE_ANALYZER,
    TEMPORAL_PARSER,
    normalize_space,
    parse_iso_date,
)

SCHEMA_VERSION = "noticepilot.s22LayerDocument.v0.1"


def load_notice(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"notice JSON must be an object: {path}")
    return value


def build_document(notice: dict[str, Any]) -> dict[str, Any]:
    published = parse_iso_date(notice.get("publishedAt"))
    if published is None:
        raise ValueError("publishedAt is required for deterministic S22 export")
    segments = STRUCTURE_ANALYZER.analyze(
        normalize_space(notice.get("title")),
        str(notice.get("extractedText") or ""),
        published,
    )
    mentions = []
    for segment in segments:
        mention = TEMPORAL_PARSER.to_temporal_mention(
            segment.segment_id, segment.text, published
        )
        if mention is not None:
            mentions.append(mention.to_dict())
    return {
        "schemaVersion": SCHEMA_VERSION,
        "sourceNoticeId": notice.get("noticeId"),
        "engineVersions": {
            "structure": STRUCTURE_ANALYZER.version,
            "temporal": TEMPORAL_PARSER.version,
        },
        "segments": [segment.source_metadata() | {"text": segment.text} for segment in segments],
        "temporalMentions": mentions,
        "summary": {
            "segmentCount": len(segments),
            "temporalMentionCount": len(mentions),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    notice = load_notice(args.input)
    document = build_document(notice)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Saved: {args.output}")


if __name__ == "__main__":
    main()
