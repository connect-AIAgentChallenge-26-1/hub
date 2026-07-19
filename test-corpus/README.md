# NoticePilot Test Corpus

This directory is the Phase 4-B scaffold for evaluating NoticePilot extraction quality with real notice examples.

The corpus supports later:

- prompt and schema validation
- AI extraction QA
- date handling QA
- evidence quality review
- future school-level parsing
- future batch `.ics` export evaluation

## Current Baseline State

The corpus contains 10 verified real public-notice entries as of 2026-07-19:

- scholarship: 3
- school_notice: 3
- assignment: 1
- competition: 1
- job_posting: 1
- ambiguous_date: 1

Each entry has a reachable public source URL, a privacy/copyright review, manually
curated extraction text, and a human-written expected result. The source facts
were cross-checked against the restored Foundation.25.1 corpus evidence. Raw
attachments are intentionally not copied into this repository.

Templates are examples only and are not counted as real corpus entries. Do not
fabricate corpus entries.

The 10-entry collection gate is complete. Deterministic structure, path, JSON,
evidence, and category-distribution validation remains the next Phase 4-B gate.

## Folder Structure

```text
test-corpus/
  README.md
  index/
    notice_index.tsv
  extracted-text/
    school_notice/
    scholarship/
    assignment/
    competition/
    job_posting/
    ambiguous_date/
  expected-results/
    school_notice/
    scholarship/
    assignment/
    competition/
    job_posting/
    ambiguous_date/
  raw/
    selected-public-files/
  templates/
    notice_index.example.tsv
    expected-result.example.json
    extracted-text.example.txt
```

Use the notice type folder names exactly as shown above. `job_posting` includes public job or internship notices.

## `notice_index.tsv`

The real corpus index lives at:

```text
test-corpus/index/notice_index.tsv
```

It is tab-separated and uses these columns:

```text
id
institution
notice_type
source_title
source_url
published_at
file_type
raw_file_path
extracted_text_path
expected_result_path
has_attachment
has_deadline
has_relative_date
has_vague_date
contains_personal_info
copyright_risk
notes
```

Column definitions:

- `id`: stable corpus identifier, such as `school-001` or `scholarship-001`
- `institution`: source institution or organization
- `notice_type`: one of `school_notice`, `scholarship`, `assignment`, `competition`, `job_posting`, `ambiguous_date`
- `source_title`: original notice title
- `source_url`: public URL when available
- `published_at`: publication date when known, formatted as `YYYY-MM-DD`
- `file_type`: source type such as `html`, `txt`, `pdf`, `hwp`, `hwpx`, or `unknown`
- `raw_file_path`: optional path under `test-corpus/raw/selected-public-files/`
- `extracted_text_path`: path to the manually extracted notice text
- `expected_result_path`: path to the human-written expected result JSON
- `has_attachment`: `true` or `false`
- `has_deadline`: `true` or `false`
- `has_relative_date`: `true` or `false`
- `has_vague_date`: `true` or `false`
- `contains_personal_info`: `true` or `false`
- `copyright_risk`: expected values such as `low`, `medium`, `high`, or `unknown`
- `notes`: short reviewer notes

If no verified real entries are available, keep only the header row.

## Real Entry Requirements

Only add a real corpus entry when it satisfies all of the following:

- public notice page or explicitly provided source material
- no login required
- no internal-only content
- no student names
- no student IDs
- no applicant lists
- no phone numbers unless they are public office contact numbers and necessary
- no resident-registration-number-like strings
- copyright risk reviewed

For each real entry, add:

```text
test-corpus/extracted-text/<notice_type>/<id>.txt
test-corpus/expected-results/<notice_type>/<id>.expected.json
```

Then add one row to `test-corpus/index/notice_index.tsv`.

## Template Files

Templates live under:

```text
test-corpus/templates/
```

They show the expected file shapes only. Template rows and placeholder data are not corpus data and must not be copied into the real index.

## Raw File Inclusion Policy

Prefer:

```text
public URL + manually extracted text + expected result JSON
```

Include raw PDF/HWPX/HWP files only when they are:

- public
- safe
- necessary for current QA
- not excessively large
- not copyright-sensitive beyond reasonable public notice use

Do not include raw files that contain personal information, applicant lists, unclear copyright status, or internal-only content.

## Privacy and Copyright Checklist

Before adding any real entry, confirm:

- source is public or explicitly provided for this task
- no student names, IDs, applicant lists, or resident-registration-number-like values
- phone numbers are excluded unless they are public office contact numbers and necessary
- copyright risk is reviewed and recorded in `notice_index.tsv`
- raw files are included only when necessary

## Expected Result Writing Policy

Expected result JSON captures the human-verified extraction target. It does not need to mirror every frontend-only field.

Each expected result should include all current app-oriented sections:

```text
deadlines
tasks
submissions
requirements
cautions
calendarEvents
```

Evidence should be a short excerpt from the original notice text. Do not invent evidence.

For ambiguous or vague dates, preserve the ambiguity:

```json
{
  "title": "Example ambiguous schedule",
  "date": "",
  "originalDateExpression": "To be announced",
  "reviewRequired": true,
  "evidence": "Schedule to be announced later."
}
```

## Initial Target

The initial baseline target is 10 verified real examples:

- scholarship: 3
- school_notice: 3
- assignment: 1
- competition: 1
- job_posting: 1
- ambiguous_date: 1

Expansion beyond the baseline should add failure modes and institutional variety,
not duplicate easy date formats. Every added entry must still use real, verified
material.

## School-level Parsing Threshold

School-level notice parsing should be considered after around 30 examples are collected. Earlier parser design risks overfitting to a small sample.

## Non-goals

This corpus scaffold does not implement:

- real AI mode
- API keys or AI provider SDKs
- PDF/HWPX/HWP/OCR extraction
- `/api/extract`
- school-level parser
- batch `.ics` export
- subscription calendar feed
- database/auth/payment/Google Calendar API
- runtime frontend or backend behavior changes
