# Observation v0.1 Run Diagnosis

## Input run

- date range: 2026-01-01 through 2026-07-11
- requested boards: 504, 715, 716, 717, 719, 720, 721
- reported notices: 450
- requests: 1,237
- request errors: 0

## Critical finding

The run is not a complete seven-board corpus. Only boards 717, 720, and 721 produced selected notices.

Boards 504, 715, 716, and 719 fell back to anchor-only parsing. Their rows had no `publishedAt`, so the date-range selector selected zero records and could not stop at the lower date boundary. Board 504 reached `max_pages=200`; boards 715, 716, and 719 walked to an empty page.

The absence of HTTP errors therefore does not imply collection completeness.

## Flag quality finding

The v0.1 classifier searched broad keywords through the full body:

- `revisionLike`: 75 total, but only 18 titles contained a revision term
- `cancellationLike`: 77 total, but only 4 titles contained a cancellation term

This made ordinary phrases such as course-registration cancellation or statements that a schedule may change look like reconciliation revisions/cancellations.

## Duplicate finding

All 18 duplicate groups were same-board groups because four boards were absent. The v0.1 title normalizer removed every leading bracketed/parenthesized qualifier, including campus labels. This can group separate Chuncheon/Samcheok/Gangneung-Wonju notices together.

## v0.2 remediation

- layout-variant header mapping
- exact board-specific URL filtering
- fallback metadata enrichment
- undated parser fail-closed guard
- campus qualifier preservation
- revision/cancellation false-positive reduction

A clean rerun into a new output directory is required. Do not use `--resume` against the v0.1 output because its selected corpus and duplicate decisions were produced by the old parsing/rule version.
