# S22 Structure / Temporal Layer Extraction

## Goal

Extract the existing Policy.15 structure reconstruction and deterministic date parser into independently testable modules **without changing candidate, decision, feed, or ICS semantics**.

S22 is a refactor step. It does not introduce `temporalRole`, local binding output, semantic reclassification, or persisted JudgmentTrace records.

## Runtime composition

```text
noticepilot_mvp_policy_pipeline.py
  ├─ configures noticepilot_temporal_parser.py
  ├─ configures noticepilot_structure_analyzer.py
  └─ preserves the established Policy.15 function API through compatibility aliases
```

New modules:

```text
noticepilot_temporal_parser.py      version 0.1.0
noticepilot_structure_analyzer.py   version 0.1.0
```

The policy pipeline remains `0.1.14` because its observable behavior and output schemas are unchanged.

## StructureAnalyzer responsibility

`StructureAnalyzer` owns:

- title, paragraph, list-item, label-value, table-row, and continuation units;
- structural clause splitting that preserves dotted dates;
- one-line continuation ownership boundaries;
- bounded reconstruction of leave/return rows;
- bounded reconstruction of course-registration cohort rows;
- stable segment IDs and source locations.

During S22 compatibility, action/audience signal vocabularies are injected by the composition root. Moving those semantic signals out of the structure layer is deferred to S23/S24.

## TemporalParser responsibility

`TemporalParser` owns:

- absolute and supported relative date parsing;
- abbreviated-year and inherited-year rules;
- all-day and timed range normalization;
- 24:00 boundary normalization;
- invalid-date fail-closed behavior;
- multiple-discrete-date and truncated-context detection;
- projection into the S21 `TemporalMention` contract.

The parser does not decide event type, actor, applicability, publishability, or feed membership.

## Compatibility boundary

The pipeline exposes the same public symbols as Policy.15:

```python
resolve_date(...)
parse_date_tokens(...)
build_schedule_segments(...)
```

Those names are aliases to the extracted modules. The former in-file implementations were removed, so runtime execution cannot silently fall back to the legacy definitions.

## Audit CLI

A normalized notice can be inspected before policy classification:

```bash
python3 tools/export_s22_layer_documents.py \
  --input normalized-notice.json \
  --output /tmp/notice.layers.json
```

The output contains only:

- structured segments;
- deterministic temporal mentions;
- layer engine versions and counts.

It contains no publication decision.

## Non-goals

S22 does not include:

- date-to-action binding as a separate persisted model;
- `temporalRole` migration;
- semantic classification extraction;
- applicability or publishability extraction;
- intra-notice reconciliation extraction;
- any baseline-approved candidate changes.

These remain S23–S25 work.

## Acceptance results

- existing Policy.15 + S20/S21 tests remain green;
- S22 module tests cover runtime wiring, range compatibility, S21 temporal projection, continuation ownership, and flattened table reconstruction;
- embedded Policy.15 baseline diff remains zero;
- uploaded Policy.15 derived output matches the embedded baseline with zero semantic changes;
- package compiles and passes tests after independent ZIP extraction.

## Successor status

S23 now consumes S22 outputs through `LocalBinder` and `SemanticClassifier`.
See `S23_LOCAL_BINDING_SEMANTIC_CLASSIFICATION.md` and
`PROJECT_PHASE_ROADMAP.md`.
