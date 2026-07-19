#!/usr/bin/env python3
"""Export S23 structure, temporal, binding, and semantic layer documents."""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import noticepilot_mvp_policy_pipeline as policy  # noqa: E402


def load_policy_config() -> dict:
    return json.loads((ROOT / "configs" / "noticepilot_mvp_policy.v0.1.json").read_text(encoding="utf-8"))


def build_document(notice: dict) -> dict:
    notice_id = str(notice.get("noticeId") or "unknown")
    title = policy.normalize_space(notice.get("title"))
    body = str(notice.get("extractedText") or "")
    published = policy.parse_iso_date(notice.get("publishedAt"))
    if published is None:
        raise ValueError("publishedAt must contain an ISO date")
    board_id = str((notice.get("board") or {}).get("boardId") or notice.get("boardId") or "")
    config = load_policy_config()
    segments = policy.STRUCTURE_ANALYZER.analyze(title, body, published)

    mentions: dict[str, dict] = {}
    facts: dict[str, dict] = {}
    classifications: list[dict] = []
    role_counts: Counter[str] = Counter()
    for segment in segments:
        if not segment.date_spans:
            continue
        resolution = policy.TEMPORAL_PARSER.resolve(segment.text, published)
        if resolution is None:
            continue
        binding = policy.LOCAL_BINDER.bind_resolution(notice_id, segment, published)
        if binding is None:
            continue
        mentions[binding.temporal_mention.mention_id] = binding.temporal_mention.to_dict()
        facts[binding.bound_fact.fact_id] = binding.bound_fact.to_dict()
        initial_event = policy.SEMANTIC_CLASSIFIER.initial_event_type(segment, title, config)
        batch = policy.SEMANTIC_CLASSIFIER.classify_resolution(
            bound_fact=binding.bound_fact,
            source_segment=segment,
            title=title,
            published=published,
            resolution=resolution,
            policy_config=config,
            board_id=board_id,
            fallback_event_type=initial_event,
        )
        role_counts[batch.temporal_role.value] += 1
        classifications.append({
            "factId": binding.bound_fact.fact_id,
            "segmentId": segment.segment_id,
            **batch.to_dict(),
        })

    return {
        "schemaVersion": "noticepilot.s23LayerDocument.v0.1",
        "sourceNoticeId": notice_id,
        "engineVersions": {
            "structure": policy.STRUCTURE_ANALYZER.version,
            "temporal": policy.TEMPORAL_PARSER.version,
            "localBinding": policy.LOCAL_BINDER.version,
            "semanticClassification": policy.SEMANTIC_CLASSIFIER.version,
        },
        "segments": [segment.source_metadata() | {"text": segment.text} for segment in segments],
        "temporalMentions": list(mentions.values()),
        "boundTemporalFacts": list(facts.values()),
        "semanticClassifications": classifications,
        "summary": {
            "segmentCount": len(segments),
            "temporalMentionCount": len(mentions),
            "boundFactCount": len(facts),
            "semanticClassificationCount": len(classifications),
            "temporalRoleCounts": dict(role_counts),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    notice = json.loads(args.input.read_text(encoding="utf-8"))
    document = build_document(notice)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(document["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
