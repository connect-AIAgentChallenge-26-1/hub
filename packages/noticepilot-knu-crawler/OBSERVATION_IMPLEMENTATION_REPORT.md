# NoticePilot KNU observation collector implementation report

## Baseline

- Source package: `noticepilot-knu-crawler-v0.4.4`
- Add-on package version: `0.4.4-observation.1`
- Observation period: `2026-01-01` through `2026-07-11`, inclusive
- Observation boards: `504, 715, 716, 717, 719, 720, 721`
- Runtime boards remain: `720, 721`

## Added files

- `knu_observation_collector.py`
- `configs/knu_collection_profiles.v0.1.json`
- `OBSERVATION_IMPLEMENTATION_REPORT.md`

## Implemented behavior

1. Production and observation collection are separated by named profiles.
2. List pages are traversed until the lower date bound is reached.
3. Pinned rows do not prematurely terminate pagination.
4. Repeated `pstSn` values are de-duplicated per board.
5. The date range is inclusive at both ends.
6. Detail collection can resume from existing normalized notice JSON.
7. All attachment metadata is retained.
8. Attachment bytes are downloaded selectively for schedule, revision, or duplicate checks.
9. Deterministic first-pass flags are emitted for:
   - revision/extension wording
   - cancellation wording
   - additional recruitment wording
   - date expressions
   - attachment references
10. Possible duplicates are recorded but never auto-merged.
11. JSONL and TSV observation indexes are generated.
12. Raw corpus and selected fixtures remain local-only by default.

## Validation performed

The following checks passed in the ChatGPT execution environment:

```text
python3 -m py_compile ...
python3 knu_crawler_probe.py --offline-parser-check
python3 knu_crawler_probe.py --offline-detail-check
python3 noticepilot_candidate_extractor.py --offline-candidate-check
python3 noticepilot_ics_exporter.py --offline-export-check
python3 knu_observation_collector.py --offline-check
python3 knu_observation_collector.py --list-profiles
```

The bundled list parser successfully processed both existing KNU list fixtures.
Existing normalized-notice, candidate-extraction, and static-ICS checks remained
operational.

## Live collection attempt in ChatGPT

A seven-board list-only run was invoked with the observation profile. The
collector created a structured report and attempted one request for each board,
but all seven requests failed before HTTP connection because the code execution
container could not resolve `www.kangwon.ac.kr`.

```text
requestCount: 7
requestErrorCount: 7
noticeCount: 0
failure class: DNS NameResolutionError
```

This is an execution-environment network limitation. The failure report is
available separately as `noticepilot-observation-run-attempt`.

## Full local execution command

```bash
python3 knu_observation_collector.py \
  --profile observation-2026 \
  --output-dir local-observation-data/observation-2026 \
  --page-itm 50 \
  --max-pages 200 \
  --delay 1.0 \
  --resume \
  --continue-on-error
```

A discovery-only pass can be run with `--list-only` before fetching detail pages.
