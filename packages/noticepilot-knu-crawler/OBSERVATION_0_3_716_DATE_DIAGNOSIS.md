# Board 716 date-semantics diagnosis

## Finding

Board 716 (`채용안내`) list pages use the columns:

```text
번호 | 캠퍼스 | 제목 | 접수기간 | 진행상태 | 조회수
```

The list does not expose `등록일`. The previous observation collector scanned the
first date-looking value in each row and therefore mapped the start of `접수기간`
to `publishedAt`.

Rows for document screening results, interview schedules, and final results often
show only `~` in the application-period column. Those rows were omitted entirely
by date-range selection.

## Uploaded-page measurements

| Page | Rows | Parseable application period | `~` / no period | Main omitted type |
|---|---:|---:|---:|---|
| 1 | 50 | 24 | 26 | screening/interview/final-result notices |
| 9 | 50 | 17 | 33 | screening/interview notices and migrated notices |
| 10 | 50 | 32 | 18 | screening/interview/final-result notices |

## Correction in observation.3

1. `접수기간` is stored separately as `application_period_start` and
   `application_period_end`.
2. It is never used as `publishedAt`.
3. All board 716 rows, including `~` rows, are retained as detail candidates.
4. The canonical `publishedAt` is extracted from detail-page `등록일`.
5. Date-range filtering is applied after detail retrieval.
6. Pagination stops only after two consecutive pages whose available application
   starts are entirely below the lower bound.
7. `--refresh-boards 716` can repair an existing resumed corpus while reusing the
   other six boards.
8. After an error-free refresh, obsolete board 716 normalized JSON files are moved
   to `normalized/refresh_archive/board_716/` rather than deleted.

## Required correction command

```bash
python3 knu_observation_collector.py \
  --profile observation-2026 \
  --output-dir local-observation-data/observation-2026-v2 \
  --page-itm 50 \
  --max-pages 200 \
  --delay 1.0 \
  --resume \
  --refresh-boards 716 \
  --continue-on-error
```
