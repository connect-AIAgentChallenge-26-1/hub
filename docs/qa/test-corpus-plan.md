# NoticePilot Test Corpus Plan

## Purpose

The test corpus provides real notice examples for evaluating NoticePilot's extraction quality. It should be built before relying on real AI integration as a product-quality signal.

The corpus should support:

- prompt/schema validation
- AI extraction QA
- date handling QA
- evidence quality review
- future school-level parsing
- future batch `.ics` export evaluation

## Confirmed Corpus Policy

Initial policy:

- Start with public URLs and manually extracted text.
- Include raw PDF/HWPX/HWP files in the repo only when they are public, safe, and necessary.
- Expected results should vary by notice type.
- School-level parsing should be considered after around 30 examples are collected.

## Suggested Folder Structure

```text
test-corpus/
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
```

## `notice_index.tsv` Columns

Recommended columns:

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

Example:

```text
id	institution	notice_type	source_title	source_url	published_at	file_type	raw_file_path	extracted_text_path	expected_result_path	has_attachment	has_deadline	has_relative_date	has_vague_date	contains_personal_info	copyright_risk	notes
kw-sch-001	kangwon	scholarship	2026학년도 2학기 장학금 신청 안내	https://example.edu/notice/1	2026-07-07	pdf		test-corpus/extracted-text/scholarship/kw-sch-001.txt	test-corpus/expected-results/scholarship/kw-sch-001.expected.json	true	true	false	false	false	low	신청기간과 제출서류 명확
```

## Public URL Policy

Preferred source types:

- public university notice pages
- public scholarship notices
- public competition announcements
- public job/internship notices
- public course/academic schedule notices

Avoid:

- login-required pages
- internal-only documents
- personal student information
- applicant lists
- files containing names, student IDs, phone numbers, or resident-registration-number-like data

## Raw File Inclusion Policy

Initial repo inclusion should be conservative.

Recommended approach:

```text
public URL + manually extracted text → include by default
raw PDF/HWPX/HWP attachment       → include only if public, safe, and necessary
```

Raw files should be excluded when:

- file size is excessive
- copyright status is unclear
- the document contains personal information
- the file is not necessary for current QA

## Manually Extracted Text Policy

Each corpus example should have a manually extracted text file.

Purpose:

- allows AI QA before PDF/HWPX/OCR extraction is implemented
- makes prompt/schema evaluation independent from file parsing
- supports reproducible expected-result writing

## Expected Result Policy by Notice Type

Expected result depth should vary by notice type.

### Scholarship

Prioritize:

- deadlines
- submissions
- requirements
- calendarEvents
- evidence

### Assignment / Course Notice

Prioritize:

- tasks
- submissions
- deadlines
- cautions
- calendarEvents when applicable

### School Notice

Prioritize:

- deadlines
- tasks
- cautions
- calendarEvents

### Competition

Prioritize:

- deadlines
- submissions
- requirements
- calendarEvents

### Job / Internship

Prioritize:

- deadlines
- requirements
- submissions
- calendarEvents
- cautions

### Ambiguous Date Notice

Prioritize:

- original date expression
- reviewRequired
- evidence
- caution/warning behavior

## Expected Result JSON Shape

Expected results may use an app-oriented structure for QA comparison:

```json
{
  "id": "kw-sch-001",
  "sourceTitle": "2026학년도 2학기 장학금 신청 안내",
  "noticeType": "scholarship",
  "expected": {
    "deadlines": [
      {
        "title": "장학금 신청 마감",
        "date": "2026-07-20",
        "evidence": "신청 기간: 2026.07.10. ~ 2026.07.20."
      }
    ],
    "submissions": [
      {
        "title": "성적증명서",
        "evidence": "제출서류: 성적증명서, 자기소개서"
      }
    ],
    "requirements": [],
    "cautions": [],
    "calendarEvents": [
      {
        "title": "장학금 신청 마감",
        "startDate": "2026-07-20",
        "eventType": "deadline"
      }
    ]
  }
}
```

The expected result does not need to mirror every frontend field. It should capture the human-verified extraction target.

## Initial Corpus Target

Start with a 10-example baseline:

```text
scholarship: 3
school/course notice: 3
assignment: 1
competition: 1
job/internship: 1
ambiguous date: 1
```

This baseline was collected on 2026-07-19 from public Kangwon National
University notice pages and cross-checked against the restored Foundation.25.1
evidence. The next gate is deterministic corpus validation. Later expansion
should prioritize new failure modes and source diversity.

## 30-example Threshold

School-level parsing should not be treated as a serious implementation phase until about 30 examples are collected.

Reason:

- school notice formats vary
- attachment patterns vary
- date formats vary
- categories differ by institution
- premature parser design may overfit a small sample

## Privacy and Copyright Cautions

Do not include:

- student names
- student IDs
- phone numbers
- resident-registration-number-like strings
- applicant lists
- internal-only documents
- login-required documents

When in doubt, keep only:

- public URL
- manually extracted text excerpt
- metadata
- expected result

## Evaluation Rubric

Suggested extraction quality dimensions:

```text
1. Deadline correctness
2. Calendar event candidate correctness
3. Submission extraction correctness
4. Requirement extraction correctness
5. Task extraction usefulness
6. Caution extraction usefulness
7. Evidence quality
8. Hallucination absence
9. Date normalization correctness
10. reviewRequired appropriateness
```

Suggested rating:

```text
pass
minor issue
major issue
fail
```

## Non-goals

The corpus scaffold does not require:

- automated crawling
- OCR
- PDF/HWPX parser implementation
- school-specific parser
- subscription calendar feed
