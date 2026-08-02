# 데모 시드 계약

이 문서는 생성 데이터의 식별자, 테이블, 컬럼 순서, 응답 형태와 검증 규칙을 고정한다.

## 0. 원칙

1. 서비스 코드와 스키마를 바꾸지 않고 같은 계약을 따르는 데이터만 생성한다.
2. 생성 스크립트는 데이터베이스에 접속하지 않는다. 메모리에서 계산하고 CSV 로만 낸다.
3. 모델(OpenAI) 호출은 0회다. 어댑터는 `Protocol` + `OpenAI*` + `Stub*` 3종 세트로 만들고
   데모 경로는 항상 `Stub*` 또는 저장된 결과를 쓴다.
4. 생성 데이터와 실 데이터는 `dataset_version` 으로 가른다.
5. 사용자 입력 공고는 통계 테이블과 외래키로 연결하지 않는다.

## 1. 식별자 규약

| 대상 | 값 | 비고 |
| --- | --- | --- |
| 데이터셋 버전 | `ds_demo_v1` | **생성 데이터 전용.** 실 데이터 버전과 절대 섞지 않는다 |
| 분류체계 | `taxonomy_<job>` | 예 `taxonomy_backend` |
| 분류체계 버전 | `tx_demo_<job>` | `version_number = 1`, `taxonomy_policy_version = 'tp_v1'` |
| 지식 버전 | `kn_demo_<job>` | |
| 분석 버전 | `an_demo_<job>` | `status = 'active'` |
| 차원 | `dim_<job>_<slug>` | slug 는 소문자·하이픈 |
| 차원 버전 | `dv_<job>_<slug>` | |
| 별칭 | `alias_<job>_<slug>_<n>` | |
| 역량 | `cap_<job>_<slug>` | |
| 회사 | `co_<slug>` | 기존 24개는 그대로 쓴다 |
| 출처 | `src_demo_<job>_<nn>` | |
| 스냅샷 | `snap_demo_<job>_<nn>` | `content_hash` 는 `raw_content` 의 SHA-256 |
| 공고 | `dp_<job>_<nn>` | `nn` 은 `01`~`30`. **실 데이터와 겹치지 않는 `dp_` 접두사** |
| 공고 버전 | `pv_demo_<job>_<nn>` | |
| 요구 표현 | `mention_<job>_<nn>_<k>` | |
| 할당 | `assign_<job>_<nn>_<k>` | |
| 청크 | `chunk_demo_<job>_<nn>_<k>` | |
| 실행 | `run_demo_<job>_<agent>` | agent 는 `stats`·`knowledge`·`interpretation`·`strategy`·`roadmap`·`aggregation` |
| 지표 사실 | `fact_demo_<job>_<seq>` | seq 는 6자리 0채움 |
| 산출물 | `out_demo_<job>_<type>_<scope>` | type 은 `stat`·`intp`·`strat`·`road` |
| 주장 | `claim_demo_<job>_<seq>` | |
| 체크리스트 개념 | `cc_<job>_<slug>` | 화면 체크 상태의 키 |
| 체크리스트 항목 | `ci_demo_<job>_<scope>_<slug>` | |
| 로드맵 항목 | `ri_demo_<job>_<scope>_<n>` | |
| 학습 트랙 | `st_demo_<job>_<scope>_<slug>` | |
| Wiki 페이지 | `wp_demo_<job>_<slug>` | |
| Wiki 개정 | `wr_demo_<job>_<slug>_1` | |

`<scope>` 는 `overall` · 기업군 `cluster_id` · 공고 `posting_id` 다.
공고 범위는 `interpretation`·`strategy`·`roadmap` 과 전략·로드맵 정규화 표에 쓴다 (4장).

## 2. 직무 아홉 종

| `job_role_id` | 표시명 | 깊이 |
| --- | --- | --- |
| `backend` | 백엔드 개발자 | 산출물 4종 · 차원 15 |
| `frontend` | 프론트엔드 개발자 | 산출물 4종 · 차원 8 |
| `ai_engineer` | AI 엔지니어 | 산출물 4종 · 차원 5 |
| `data_engineer` | 데이터 엔지니어 | 산출물 4종 · 차원 5 |
| `fullstack` | 풀스택 개발자 | 산출물 4종 · 차원 5 |
| `devops` | DevOps 엔지니어 | 산출물 4종 · 차원 5 |
| `mobile` | 모바일 개발자 | 산출물 4종 · 차원 5 |
| `security` | 정보보안 | 산출물 4종 · 차원 5 |
| `game_client` | 게임 개발자 | 산출물 4종 · 차원 5 |

아홉 직무 전부 `is_active = true`로 둔다.

직무당 공고 30건. `recent` 18건은 `period_id = 'y2026'`, `prev` 12건은 `y2024_2025`.
아홉 직무의 전체 공고 수는 270건이다.
`posted_at` 은 recent 가 `2026-01-01`~`2026-06-30`, prev 가 `2024-03-01`~`2025-11-30` 사이다.
두 범위는 3장의 기간 정의 안에 반드시 들어간다. 벗어나면 `statistics_facts.period_id` 가
가리키는 기간과 공고 게시일이 어긋난다.

두 기간 각각에서 여섯 기업군의 표본 수를 같게 둔다. recent 는 기업군마다 3건씩 총 18건,
prev 는 기업군마다 2건씩 총 12건이다. 기업군 범위 산출물은 해당 기간 표본을 따르고,
`cluster_axes` 만 표본 확보를 위해 두 기간을 합친 전체 30건을 사용한다. 따라서
`cluster_axes` 의 여섯 기업군은 각각 `n=5`다.

직무별 진행 중 공고는 6건, 마감 공고는 24건이다. prev 12건은 모두 마감 상태다. recent
18건은 진행 중 6건·마감 12건이다.

한 공고는 한 회사에 속하고, 승격 임계값(독립 공고 2·독립 회사 2)을 만족하도록 같은 차원이
최소 두 회사의 공고에 나타나게 한다.

## 3. 기간

기간 축은 달력 연도를 따른다. `0010_calendar_year_periods.sql` 이 넣는 두 행을 그대로 쓴다.
새로 만들지 않고 `starts_on`·`ends_on` 을 바꾸지도 않는다.

| `period_id` | `label` | `starts_on` | `ends_on` | `is_baseline` |
| --- | --- | --- | --- | --- |
| `y2026` | `2026년` | `2026-01-01` | `2026-12-31` | `true` |
| `y2024_2025` | `2024~2025년` | `2024-01-01` | `2025-12-31` | `false` |

`recent` 는 `y2026`, `prev` 는 `y2024_2025` 다. 생성 모듈의 기간 상수와
`meta.snapshots.recent.label`·`prev.label` 도 이 표의 값과 같다.
정의는 `docs/erd.md` 3.5 가 소유한다.

## 4. 서빙 경로

화면 조회는 **활성 분석 버전의 `analysis_outputs.payload` 를 그대로 반환**한다.
에이전트를 호출하지 않고 집계도 하지 않는다.

```
React → Express /api/{stats,reverse,conditions,roadmap}
      → active_analysis_versions(job_role_id)
      → analysis_outputs (analysis_version, scope_level, scope_id, output_type)
      → payload 반환
```

`analysis_outputs` 한 행이 화면 한 벌이다.

| `output_type` | `produced_by_agent` | `scope_level` | `scope_id` | payload |
| --- | --- | --- | --- | --- |
| `statistics` | `aggregation` | `overall` | `<job_role_id>` | 5절 A |
| `interpretation` | `interpretation` | `overall` | `<job_role_id>` | 5절 B (직무 공통 기대치만) |
| `interpretation` | `interpretation` | `cluster` | `<cluster_id>` | 5절 B (직무 공통 기대치 + 추가 요구) |
| `interpretation` | `interpretation` | `posting` | `<posting_id>` | 5절 B (직무 공통 기대치 + 추가 요구 + posting) |
| `strategy` | `strategy` | `overall` | `<job_role_id>` | 5절 C |
| `strategy` | `strategy` | `cluster` | `<cluster_id>` | 5절 C |
| `strategy` | `strategy` | `posting` | `<posting_id>` | 5절 C (기업군 바탕 + 공고별 추가 요구) |
| `roadmap` | `roadmap` | `overall` | `<job_role_id>` | 5절 D |
| `roadmap` | `roadmap` | `cluster` | `<cluster_id>` | 5절 D |
| `roadmap` | `roadmap` | `posting` | `<posting_id>` | 5절 D (기업군 바탕 + 공고별 추가 요구) |

**직무당 필수 행 수**

- `statistics` 1행 (overall)
- `interpretation` 1 + 6 + 30 = 37행 (overall, 기업군 6, 전체 공고 30)
- `strategy` 1 + 6 + 30 = 37행 (overall, 기업군 6, 전체 공고 30)
- `roadmap` 1 + 6 + 30 = 37행 (overall, 기업군 6, 전체 공고 30)

합계 112행 × 9직무 = 1,008행. 이 가운데 직무 조각이 만드는 것은 52행(`statistics` 1 ·
`interpretation` 37 · `strategy` 7 · `roadmap` 7)이고, posting 범위 `strategy`·`roadmap`
60행은 `build_demo_seed.py` 가 만든다.

**posting 범위의 `strategy`·`roadmap` 파생**

공고 범위 전략·로드맵은 직무 조각(`scripts/demo_seed/<job>.py`)이 아니라 조각을 합치는
`scripts/build_demo_seed.py` 가 한 번에 만든다. 규칙을 아홉 직무 모듈에 흩어 두면 직무마다
달라진다. 재료는 그 공고가 속한 기업군의 전략·로드맵 payload(바탕), 그 공고
`interpretation` payload 의 `deviations`(차별점), 그 공고의 회사명·제목이다.

- `strategy` 는 기업군 payload 를 복사한 뒤 추가 요구에 해당하는 체크리스트 항목을 앞으로
  끌어올리고 `is_deviation`·`dev_n` 을 그 공고 해석에 맞춘다. 추가 요구 항목의 `reason` 은 그
  공고를 근거로 다시 쓴다. 추가 요구와 무관한 항목은 그대로 두며 항목을 지우지 않는다.
- `roadmap` 은 추가 요구를 채우는 단계를 앞으로 당기고 `n` 과 `phase` 의 `STEP nn` 을 다시 매긴다.
  `check_rows` 의 `item_id` 집합은 같은 공고 `strategy` 의 `checklist[].item_id` 집합과 같고
  `source_step` 은 새 단계 번호를 가리킨다.
- `scope` 는 `{"level":"posting","cluster_tag":"<기업군 표시명>","posting_id":"<dp_...>"}`.
- `output_id` 는 `out_demo_<job>_strat_<posting_id>` · `out_demo_<job>_road_<posting_id>`,
  `generated_at` 과 `verification_status` 는 바탕이 된 기업군 행의 값을 그대로 쓴다(재실행 결정성).
- `checklist_items`·`roadmap_items`·`roadmap_item_fills`·`study_tracks` 에 같은 범위
  (`scope_level='posting'`, `scope_id=<posting_id>`)의 행을 함께 만든다. `analysis_claims` 는 늘리지 않는다.

Express의 폴백 규칙은 posting 범위 요청을 그 공고가 속한 기업군 행으로 낮춘다. 이 규칙은
안전망으로 남긴다. 정상 경로에서는 아홉 직무 전부 posting 범위 행이 있으므로 닿지 않는다.

평면 `postings` 표를 읽던 경로는 `legacy_posting_samples` 로 이름을 바꿔 폴백으로 남긴다.
`agent/migrations/` 의 `postings` 는 정규화 표이며 평면 표와 이름이 겹치므로 그대로 두면 안 된다.

## 5. payload 스키마

**화면이 소비하는 형태를 유지한다.** 키를 바꾸지 않는다.
아래는 각 payload 의 최상위 키다. 세부 필드는 `server/src/stats.js` 의 `aggregate` 반환값과
`agent/main.py` 의 응답 모델을 기준으로 한다.

### A. `statistics` payload

```jsonc
{
  "job": "<job_role_id>",
  "meta": { "generated_at", "snapshots": {"recent":{"label","n"},"prev":{"label","n"}},
            "sources": ["job_posting", ...], "disclaimer": "생성 데이터 기반 결과입니다",
            "dataset_version": "ds_demo_v1", "analysis_version": "an_demo_<job>",
            "is_synthetic": true },
  "kpi": { "avg_required_skills":{"value","unit"}, "out_of_role_pct":{"value","unit"},
           "entry_label_gap_pct":{"value","unit","highlight":true},
           "promoted_to_required_cnt":{"value","unit"}, "advanced_mention_pct":{"value","unit"} },
  "scope_expansion": [ {"tag","label","desc","count","pct"} ],
  "inflation": { "items":[{"item_id","name","prev_ratio","recent_ratio","delta"}], "stable": false },
  "trend3": { "increase":[...], "stable":[...], "decrease":[...] },
  "labels": { "edu":[{"label","pct"}], "career":[{"label","pct"}] },
  "advanced": [ {"type","label","count","pct","quote","more_count"} ],
  "combos": [ {"id","name","desc","level","count","pct","interpretation_source":"synthetic"} ],
  "reality": [ {"tag","label","pct"} ],
  "cluster_axes": { "axes":[...5개 라벨...], "rows":[{"cluster","n","cells":[{"axis","pct","level"}]}] },
  "tech_freq": [ {"name","slug","count","pct","required_ratio"} ],
  "items": [ {"item_id","name","aliases","category","scope","is_advanced","freq_overall",
              "required_ratio","freq_by_cluster","trend":{"prev_pct","recent_pct","direction",
              "requirement_shift"},"impl_level","evidence":[{"text","posting_id","source_url"}],
              "support":{"n_overall","n_by_cluster"},"confidence"} ],
  "error": null
}
```

`scope_expansion[].tag`, `advanced[].type`, `combos[].id`, `reality[].tag`, `cluster_axes.axes` 는
**직무마다 다르다.** 백엔드 전용 상수를 다른 직무에 쓰지 않는다.
라벨은 payload 안에 함께 담으므로 서버 코드에 별도 상수를 두지 않는다.

`cluster_axes.rows[].cluster` 는 기업군 **표시명**(`company_clusters.display_name`)을 쓴다.
`cells[].level` 은 `강`(100) · `중`(21~99) · `약`(0~20)이며, `—`는
`pct` 가 null인 결측값에만 쓴다.

### B. `interpretation` payload

```jsonc
{
  "job", "scope": {"level","cluster_tag","posting_id"},
  "baseline": [ {"item_id","title","desc","freq_pct","required_ratio"} ],
  "deviations": [ {"item_id","topic","baseline","deviation","evidence","explanation",
                   "confidence","ratio","related_stat"} ],
  "unchanged": [ {"item_id","title","note"} ],
  "posting": null | {"posting_id","company","title","summary":{...},
                     "raw_sections":[{"section","lines":[{"text","mark_n","note_n","base_n","base_ref"}]}],
                     "interpretations":[{"n","title","body","confidence","ratio","sources":[{"type","url"}]}],
                     "baseline_notes":[{"n","base_ref","body"}],
                     "signal_notes":[{"n","title","body"}], "unchanged_note"},
  "agent_version": "1.0.0", "source": "stored"
}
```

`scope.cluster_tag` 는 기업군 **표시명** 문자열이다(React 가 표시명으로 보낸다).
`baseline` 은 7~9개, `deviations` 는 기업군마다 2~4개, `unchanged` 는 3~4개.
`confidence` 는 `high`·`mid`·`low`.

`source` 값은 `stored`(저장된 활성 결과) · `cache`(사용자 공고 해시 적중) · `agent`(온디맨드 실행) 세 가지다.
`fixture` 는 더 쓰지 않는다.

### C. `strategy` payload

```jsonc
{
  "job", "scope",
  "checklist": [ {"item_id","title","subtitle","reason","evidence_needed","channels",
                  "kind","is_deviation","dev_n","required","have"} ],
  "portfolio": { "highlights":[{"title","body","tips","linked_item_ids"}],
                 "intro_orders":[{"cluster","steps"}] },
  "essay": [ {"kind","title","body","narrative":{"problem","solve","growth"},
              "sample_sentence","tips","linked_item_ids"} ],
  "interview": [ {"kicker","question","followups","point","linked_item_ids"} ],
  "agent_version": "1.0.0", "source": "stored"
}
```

`checklist[].item_id` 는 **`checklist_concepts.concept_id`** 다(`cc_<job>_<slug>`).
체크 상태의 키가 개념 식별자이므로 여기서 어긋나면 로드맵 재조합이 깨진다.
`channels` 는 `essay`·`portfolio`·`interview` 부분집합. `kind` 는 `project`·`story`·`study`.
`have` 는 항상 `false` 로 저장한다(사용자 상태는 브라우저에 있다).

### D. `roadmap` payload

```jsonc
{
  "job", "scope",
  "project_steps": [ {"n","phase","weeks","priority","title","body","deliverable",
                      "fills":[{"item_id","label","kind"}],"reason_title","reason","tags"} ],
  "study_tracks": [ {"phase","priority","title","depth","reason_title","reason","fills"} ],
  "check_rows": [ {"item_id","title","kind","is_deviation","dev_n","required","source_step"} ],
  "agent_version": "1.0.0", "source": "stored"
}
```

`priority` 는 `vhigh`·`high`·`mid`(`study_tracks` 는 `track` 도 허용).
`fills[].kind` 와 `check_rows[].kind` 는 `dev`·`normal`·`study`.
`fills[].item_id` 와 `check_rows[].item_id` 는 `checklist_concepts.concept_id` 다.

## 6. 공고 직접 입력

### 6.1 사용자 공고 테이블

통계 테이블과 외래키로 연결하지 않는다. 사용자 입력이 모집단에 섞이면 모든 지표가 오염된다.

```sql
CREATE TABLE user_postings (
  user_posting_id text PRIMARY KEY,          -- up_<hash 앞 16자>
  content_hash    text NOT NULL,             -- 정규화 원문의 SHA-256 hex 64
  normalized_text text NOT NULL,
  char_length     integer NOT NULL,
  job_role_id     text NOT NULL,             -- FK 없음. 값만 담는다
  detected_by     text NOT NULL CHECK (detected_by IN ('user_selected','rule','model')),
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_hash),
  CHECK (char_length(content_hash) = 64)
);

CREATE TABLE user_posting_analyses (
  user_analysis_id  text PRIMARY KEY,        -- ua_<hash 앞 16자>_<type>
  user_posting_id   text NOT NULL REFERENCES user_postings ON DELETE RESTRICT,
  analysis_version  text NOT NULL,           -- FK 없음. 어느 활성 버전을 기준 삼았는지 기록
  taxonomy_version_id text NOT NULL,
  output_type       text NOT NULL CHECK (output_type IN ('interpretation','strategy','roadmap')),
  payload           jsonb NOT NULL,
  produced_by       text NOT NULL CHECK (produced_by IN ('agent','seed')),
  generated_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_posting_id, analysis_version, output_type)
);
CREATE INDEX ON user_posting_analyses (user_posting_id, output_type);
```

### 6.2 원문 정규화 (Express 와 FastAPI 가 같은 규칙을 쓴다)

1. 앞뒤 공백 제거
2. 줄바꿈을 `\n` 으로 통일 (`\r\n`, `\r` → `\n`)
3. 각 줄의 앞뒤 공백 제거
4. 연속 빈 줄을 하나로
5. 연속 공백(스페이스·탭)을 하나로
6. 개인정보 패턴 제거 — 이메일, 전화번호(`0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}`), 주민등록번호 형태
7. NFC 정규화
8. `sha256(normalized_text.encode("utf-8")).hexdigest()`

길이 제한은 200자 이상 12000자 이하. 빈도 제한은 IP 당 분당 5회.

### 6.3 흐름

```
Express POST /api/postings/analyze  { raw_text, job }
  → 길이·빈도 검사 → 정규화 → SHA-256
  → FastAPI POST /postings/analyze  { content_hash, normalized_text, job_role_id }
      user_postings 조회
        적중  → user_posting_analyses 3종 반환, source = "cache"
        미적중 → 온디맨드 체인 실행 후 저장, source = "agent"
  → { interpretation, strategy, roadmap, source, job, matched }
```

생성 시드는 샘플 공고 3건과 해석·전략·로드맵 결과를 함께 넣어 해당 요청이 캐시에 적중하도록 한다.

## 7. FastAPI 라우터

`agent/main.py`는 `careersignal.api`의 앱을 재노출하는 진입점이다.

```python
from careersignal.api import app

__all__ = ["app"]
```

라우터는 `agent/src/careersignal/api/` 에 둔다.

| 파일 | 내용 |
| --- | --- |
| `__init__.py` | `app` 생성, 라우터 등록, `/health` |
| `schemas.py` | 요청·응답 Pydantic 모델 |
| `deps.py` | `unit_of_work` 를 여는 의존성, 저장소 조립 |
| `routes_analysis.py` | `POST /reverse` `/conditions` `/roadmap` `/extract` |
| `routes_user_posting.py` | `POST /postings/analyze` |

분석 라우트 4개의 **요청·응답 형태를 유지한다.** fixture 대신 저장소를 읽는다.
저장된 활성 결과가 없으면 `503` 과 `{"error":{"code":"NO_ACTIVE_ANALYSIS","message":...}}` 을 낸다.
조용히 빈 배열을 반환하지 않는다.

## 8. 에이전트 4종 계약

각 에이전트 디렉터리는 `agents/statistics/`와 같은 구조를 갖는다.

```
agents/<name>/
  __init__.py      공개 심볼 재노출
  contract.py      Pydantic 입출력 모델 + Protocol
  agent.py         실행 골격. RunContext 를 받고 Outcome 을 낸다
  prompts.py       프롬프트 문자열과 응답 스키마 상수
  adapter.py       OpenAI* 와 Stub* 구현
```

공통 규칙

- 포트는 `Protocol`, 구현은 `OpenAI<X>` 와 `Stub<X>` 두 벌.
- `agent.py` 는 저장소를 `Protocol` 로 받는다. `psycopg` 를 import 하지 않는다.
- 결과 모델은 `BaseModel` + `ConfigDict(frozen=True, extra="forbid")`.
- `Outcome` 은 `gained_evidence` 프로퍼티를 갖는다.
- 실행 봉투는 `orchestration/envelope.ensure_envelope` 로 얻는다.
- 모델 호출은 `providers/concurrency.map_ordered` 로 묶어 던진다. 순차 호출을 쓰지 않는다.

| 에이전트 | 모듈 | 입력 | 출력 테이블 |
| --- | --- | --- | --- |
| 지식 구축 Wiki | `agents/knowledge/` | `RunContext`, capability 목록 | `wiki_pages`, `wiki_revisions`, `wiki_evidence` |
| 채용공고 해석 | `agents/interpretation/` | `RunContext`, 통계 사실, 그래프 경로 | `analysis_outputs(interpretation)`, `analysis_claims`, `analysis_claim_evidence`, `coverage_assertions` |
| 합격 전략 | `agents/strategy/` | `RunContext`, 해석 산출물 | `analysis_outputs(strategy)`, `checklist_concepts`, `checklist_items` |
| 준비 로드맵 | `agents/roadmap/` | `RunContext`, 전략 산출물, 깊이 프로파일 | `analysis_outputs(roadmap)`, `roadmap_items`, `roadmap_item_fills`, `study_tracks` |

## 9. CSV 규약

### 9.1 파일 위치

각 직무 모듈은 자기 직무의 조각만 쓴다.

```
agent/data/demo_seed/parts/<job_role_id>/<table>.csv
agent/data/demo_seed/parts/user_postings/<table>.csv
```

`agent/scripts/build_demo_seed.py` 가 조각을 합쳐 `agent/data/demo_seed/<table>.csv` 를 만든다.
일반 빌드는 직무별 15건 또는 30건 상태만 허용한다. 최종 산출 전에는
`python scripts/build_demo_seed.py --check --final` 로 모든 직무가 30건이고 직무별
`analysis_outputs` 가 112행인지 검사한다.

### 9.2 형식

- UTF-8, 헤더 1줄 포함, RFC 4180 (`csv.writer` 기본값).
- 줄바꿈은 `\n`. 값 안의 줄바꿈은 따옴표로 감싼다.
- `NULL` 은 **빈 칸이 아니라 `\N`**. `COPY ... WITH (FORMAT csv, NULL '\N')` 로 적재한다.
- `jsonb` 컬럼은 `json.dumps(value, ensure_ascii=False)` 문자열.
- `text[]` 컬럼은 PostgreSQL 배열 리터럴 `{a,b,c}`. 빈 배열은 `{}`.
- `boolean` 은 `true` / `false`.
- `timestamptz` 는 `2026-06-01T09:00:00+09:00`, `date` 는 `2026-06-01`.
- `numeric(6,5)` 는 소수점 5자리 이하. 1을 넘지 않는다.
- `created_at` 컬럼은 **CSV 에 담지 않는다.** 기본값이 채운다.

### 9.3 적재 순서와 컬럼 순서

`load_demo_seed.py` 는 아래 순서로 테이블당 `COPY` 를 한 번씩 실행한다.
CSV 헤더의 컬럼 순서는 이 표와 정확히 같아야 한다.

순서는 외래키가 정한다. `COPY` 는 한 테이블을 통째로 넣으므로 참조 대상 테이블이
참조하는 테이블보다 앞에 있어야 한다. 실행 봉투(`analysis_versions`·`agent_runs`)가
원본보다 앞에 오는 이유는 `source_assessments.assessed_by_run_id` 가 `agent_runs` 를
참조하기 때문이다. 이 순서는 `tests/unit/test_demo_seed_build.py` 가 마이그레이션의
외래키에서 다시 계산해 검사한다. 되돌리기는 이 표의 역순이다.

| # | 테이블 | 컬럼 순서 |
| --- | --- | --- |
| 1 | `dataset_versions` | `dataset_version, job_role_id, as_of_date, note, sealed_at` |
| 2 | `requirement_taxonomies` | `taxonomy_id, job_role_id` |
| 3 | `requirement_taxonomy_versions` | `taxonomy_version_id, taxonomy_id, version_number, taxonomy_policy_version, published_at, superseded_at` |
| 4 | `knowledge_versions` | `knowledge_version, job_role_id, taxonomy_version_id, published_at` |
| 5 | `analysis_versions` | `analysis_version, job_role_id, dataset_version, taxonomy_version_id, knowledge_version, model_version, prompt_version, retrieval_policy_version, metric_policy_version, scope_spec, status, tokens, cost, started_at, ended_at` |
| 6 | `agent_runs` | `agent_run_id, analysis_version, agent_name, objective_id, iteration, stop_reason, tokens, cost, started_at, ended_at` |
| 7 | `sources` | `source_id, source_type, url, publisher, author, robots_policy, license_note, job_role_ids, company_id, first_seen_at` |
| 8 | `source_snapshots` | `snapshot_id, source_id, content_hash, raw_content, published_at, fetched_at, dataset_version, supersedes_snapshot_id` |
| 9 | `source_observations` | `observation_id, snapshot_id, observed_at, fetch_status, canonical_url, http_status, notes` |
| 10 | `source_assessments` | `assessment_id, snapshot_id, source_tier, allowed_uses, reliability_score, assessment_version, assessed_at, assessed_by_run_id` |
| 11 | `postings` | `posting_id, source_id, company_id, job_role_id, first_posted_at` |
| 12 | `posting_versions` | `posting_version_id, posting_id, snapshot_id, title, career_label_raw, edu_label_raw, entry_label_raw, entry_label, posted_at, closed_at, dataset_version` |
| 13 | `source_chunks` | `chunk_id, snapshot_id, section, ordinal, text, context, embedding_text, token_count, dataset_version` |
| 14 | `requirement_dimensions` | `dimension_id, taxonomy_id, dimension_kind` |
| 15 | `requirement_dimension_versions` | `dimension_version_id, dimension_id, taxonomy_version_id, internal_canonical_label, display_label, definition, lifecycle_status, standard_mapping_status, standard_id, mapping_confidence, mapping_evidence, review_status, role_boundary_eligible` |
| 16 | `requirement_aliases` | `alias_id, dimension_id, taxonomy_version_id, alias_text, alias_source` |
| 17 | `requirement_dimension_relations` | `relation_id, taxonomy_version_id, src_dimension_id, dst_dimension_id, relation_type` |
| 18 | `capabilities` | `capability_id, job_role_id, canonical_label, definition, is_active` |
| 19 | `capability_dimension_links` | `capability_id, dimension_id, taxonomy_version_id` |
| 20 | `requirement_mentions` | `mention_id, posting_version_id, snapshot_id, chunk_id, raw_expression, evidence_span_start, evidence_span_end, stated_requiredness, section, extraction_confidence, extraction_run_id, dataset_version` |
| 21 | `chunk_extractions` | `chunk_id, dataset_version, extraction_run_id, mention_count, extracted_at` |
| 22 | `posting_requirement_assignments` | `assignment_id, mention_id, taxonomy_version_id, dimension_id, normalized_label, requiredness, depth_level, assignment_confidence, assignment_method, verifier_status` |
| 23 | `dimension_metric_applicability` | `taxonomy_version_id, dimension_id, metric_family, applicable, reason` |
| 24 | `statistics_facts` | `fact_id, analysis_version, metric_family, metric_policy_version, scope_level, scope_id, entry_segment, period_id, dimension_id, secondary_dimension_id, measure, numerator, denominator, value, sample_size, sample_status, uncertainty` |
| 25 | `capability_depth_profiles` | `profile_id, capability_id, taxonomy_version_id, scope_level, scope_id, entry_segment, period_id, depth_distribution, expected_depth, sample_size, evidence_support, confidence, analysis_version` |
| 26 | `saturation_observations` | `observation_id, analysis_version, job_role_id, scope_id, posting_count, new_candidate_count, cumulative_dimension_count, marginal_gain, observed_at` |
| 27 | `knowledge_nodes` | `node_id, graph_layer, node_type, ref_table, ref_id, label, ontology_version, dataset_version, taxonomy_version_id, analysis_version` |
| 28 | `knowledge_edges` | `edge_id, graph_layer, edge_type, src_node_id, dst_node_id, weight, evidence_id, produced_by_run_id, verification_status, ontology_version, dataset_version, taxonomy_version_id, analysis_version, valid_from, valid_to` |
| 29 | `graph_paths` | `path_id, path_type, node_sequence, edge_sequence, taxonomy_version_id, knowledge_version, analysis_version, graph_policy_version, computed_at` |
| 30 | `wiki_pages` | `page_id, capability_id, knowledge_version, status` |
| 31 | `wiki_revisions` | `revision_id, page_id, definition, why_required, depth_criteria, prerequisites, common_misconceptions, interview_verification, learning_sequence, produced_by_run_id` |
| 32 | `wiki_evidence` | `revision_id, field_name, chunk_id, source_tier` |
| 33 | `analysis_outputs` | `output_id, analysis_version, job_role_id, scope_level, scope_id, output_type, payload, produced_by_agent, verification_status, generated_at` |
| 34 | `analysis_claims` | `claim_id, analysis_version, output_id, claim_type, requirement_kind, scope_level, scope_id, claim_text, structured_slots, confidence, confidence_components, verification_status` |
| 35 | `analysis_claim_evidence` | `claim_id, support_type, support_id, relation, weight` |
| 36 | `coverage_assertions` | `assertion_id, analysis_version, scope_level, scope_id, dimension_id, population_n, checked_n, matched_n, assertion, coverage_complete` |
| 37 | `checklist_concepts` | `concept_id, job_role_id, canonical_title, kind` |
| 38 | `checklist_items` | `item_id, concept_id, analysis_version, scope_level, scope_id, title, subtitle, reason, evidence_needed, channels, required, is_deviation` |
| 39 | `roadmap_items` | `roadmap_item_id, analysis_version, scope_level, scope_id, step_order, phase_label, weeks, priority, title, body, deliverable, reason, tags` |
| 40 | `roadmap_item_fills` | `roadmap_item_id, concept_id, fill_kind` |
| 41 | `study_tracks` | `track_id, analysis_version, scope_level, scope_id, capability_id, phase_label, priority, depth_reference` |
| 42 | `verification_results` | `result_id, analysis_version, target_type, target_id, check_name, autonomy_level, verdict, severity, reason_code, repair_action, judge_model, detail` |
| 43 | `active_analysis_versions` | `job_role_id, analysis_version, activated_at` |
| 44 | `user_postings` | `user_posting_id, content_hash, normalized_text, char_length, job_role_id, detected_by, first_seen_at` |
| 45 | `user_posting_analyses` | `user_analysis_id, user_posting_id, analysis_version, taxonomy_version_id, output_type, payload, produced_by, generated_at` |

`companies`, `company_clusters`, `company_cluster_memberships`, `job_roles`, `periods`,
`metric_templates`, `metric_policy_versions`, `ontology_versions` 는 마이그레이션이 넣는다.
시드는 이 표들에 쓰지 않는다.

### 9.4 되돌리기와 보호

`load_demo_seed.py --rollback` 은 `dataset_version = 'ds_demo_v1'` 또는
`analysis_version LIKE 'an_demo_%'` 인 행만 지운다. 실 데이터 테이블 보호 목록을 유지한다.
`source_snapshots` 와 `source_observations` 는 트리거로 삭제가 막혀 있으므로
되돌리기 전에 트리거를 `ALTER TABLE ... DISABLE TRIGGER` 로 잠시 내리고 다시 올린다.

## 10. 값 어휘

### 10.1 `entry_label`

`entry`, `junior`, `entry_junior`, `experienced`, `unspecified`.
데모 공고는 recent 18건 중 10건이 `entry_junior`, 8건이 `experienced`.
prev 12건 중 6건이 `entry_junior`, 6건이 `experienced`.

### 10.2 `requiredness` · `depth_level`

`required` · `preferred` · `responsibility` · `unknown` / `foundation` · `application` · `tradeoff`.

### 10.3 `sample_status`

`analysis_ready` · `low_confidence` · `not_comparable` · `not_computable`.
데모의 `overall` 지표는 `analysis_ready`, 기업군 지표는 표본이 작으므로 `low_confidence`.

### 10.4 `verification_status`

`analysis_outputs` · `analysis_claims` · `knowledge_edges` 는 `verified` 또는
`verified_with_warning` 만 담는다. 비공개 판정은 활성 버전에 넣지 않는다.

### 10.5 `assessment` 기본값

데모 공고 출처는 `source_type = 'job_posting'`, `source_tier = 'A'`,
`allowed_uses = {statistics,interpretation_context,strategy,roadmap}`,
`reliability_score = 0.95000`, `assessment_version = 'sa_v1'`.

값은 `0001_initial_schema.sql` 의 `allowed_uses_known` CHECK 가 허용하는 열한 개
안에서만 고른다. 목록은 12절 2항에 있다.

## 11. 검증 게이트

검사 1~4 는 모델 없이 돌고 통과해야 한다.

1. **스키마** — `analysis_claims.confidence_components` 가 7개 구성값을 갖는다.
2. **자료 정책** — 주장의 근거 계층이 `allowed_uses` 안에 있다.
3. **근거 위치** — `requirement_mentions.evidence_span_start/end` 가
   `source_chunks.text` 의 실제 위치와 일치하고, 잘라낸 문자열이 `raw_expression` 과 같다.
   공고 본문에 해당 문장을 두고 오프셋을 계산해 넣는다.
4. **수치** — `statistics_facts` 의 `numerator`·`denominator` 가 할당 행을 다시 세어 나온 값과 같다.

검사 5·6·7은 판정자 포트가 비어 있으면 `skip`과 `CHECK_NOT_REGISTERED`가 아니라
`not_applicable`로 기록한다. 판정자를 주입한 실행에서는 등록된 검사가 실제 판정을 저장한다.

`confidence_components` 7개 키:
`evidence_count`, `independent_companies`, `source_tier_score`, `sample_status_score`,
`entailment_score`, `contradiction_penalty`, `coverage_score`. 값은 0~1 실수.

## 12. 생성 시 반드시 지킬 것

직무 조각(`scripts/demo_seed/<job>.py`)을 만들 때 아래 열 가지를 지킨다.

1. 적재 순서는 `scripts/demo_seed/_csv.py` 의 `LOAD_ORDER` 가 정한다. 직무 모듈은 순서를
   정하지 않고 `build()` 가 돌려주는 사전의 키만 채운다.
2. `source_assessments.allowed_uses` 는 `0001_initial_schema.sql` 의 `allowed_uses_known`
   CHECK 가 허용하는 값만 쓴다. 허용값은 `statistics`, `interpretation_context`,
   `strategy`, `roadmap`, `wiki_definition`, `wiki_why_required`, `wiki_depth_criteria`,
   `wiki_prerequisites`, `wiki_common_misconceptions`, `wiki_interview_verification`,
   `wiki_learning_sequence` 다.
3. 기간은 `0010_calendar_year_periods.sql` 이 넣는 `y2026`·`y2024_2025` 두 행이다.
   새 `period_id` 를 만들지 않는다.
4. `metric_family = 'entry_label_advanced_signal_rate'` 인 `statistics_facts` 행은
   `entry_segment = 'entry_junior'` 만 저장한다. `entry_signal_rate_segment` CHECK 다.
5. `dataset_versions` 행은 `scripts/demo_seed/backend.py` 만 만든다. `ds_demo_v1` 은
   아홉 직무가 함께 쓰는 한 행이므로 다른 조각은 이 표를 채우지 않는다.
6. `knowledge_nodes.node_id` 와 `knowledge_edges.edge_id` 는 `build_demo_seed.py` 가
   `graph/identifiers.py` 의 `node_identifier`·`edge_identifier` 로 다시 계산한다.
   모듈은 자연키 `graph_layer`·`node_type`·`ref_table`·`ref_id`·`ontology_version` 을
   정확히 채운다.
7. `requirement_mentions` 의 `evidence_span_start`·`evidence_span_end` 는
   `source_chunks.text` 에서 `raw_expression` 을 실제로 찾아 계산한다.
8. `statistics_facts` 의 `numerator`·`denominator` 는 `posting_requirement_assignments`
   행을 다시 세어 만든다.
9. `postings.company_id` 는 회사 카탈로그(부록 A 와 `0013`·`0014`)에 있는 법인만 쓴다.
10. 실 데이터가 이미 가진 신원은 `load_demo_seed.py` 가 채택한다. `requirement_taxonomies`
    의 `taxonomy_id` 와 참조 노드·엣지가 여기에 해당하며, 모듈은 계약이 정한 값을 그대로 쓴다.

## 부록 A. 회사 카탈로그 확대분

마이그레이션의 회사 카탈로그 24개(`0013_backend_company_catalog.sql`, `0014_enki_company.sql`)와
아래 18개를 사용한다. `company_cluster_memberships` 의 `valid_from` 은 `2024-01-01`,
`valid_to` 는 NULL, `assigned_by` 는 `operator` 다. `membership_id` 는 `mem_<슬러그>_<기업군 약칭>`.

| `company_id` | `display_name` | `cluster_id` | `careers_url` |
| --- | --- | --- | --- |
| `co_naver` | 네이버 | `bigtech_platform` | https://recruit.navercorp.com/ |
| `co_kakao` | 카카오 | `bigtech_platform` | https://careers.kakao.com/ |
| `co_coupang` | 쿠팡 | `bigtech_platform` | https://www.coupang.jobs/kr/ |
| `co_lineplus` | 라인플러스 | `bigtech_platform` | https://careers.linecorp.com/ |
| `co_musinsa` | 무신사 | `bigtech_platform` | https://corp.musinsa.com/ |
| `co_viva` | 비바리퍼블리카 | `fintech_finance` | https://toss.im/career |
| `co_kakaobank` | 카카오뱅크 | `fintech_finance` | https://recruit.kakaobank.com/ |
| `co_kbank` | 케이뱅크 | `fintech_finance` | https://www.kbanknow.com/ |
| `co_ncsoft` | 엔씨소프트 | `game` | https://careers.ncsoft.com/ |
| `co_krafton` | 크래프톤 | `game` | https://careers.krafton.com/ |
| `co_smilegate` | 스마일게이트 | `game` | https://careers.smilegate.com/ |
| `co_samsungsds` | 삼성에스디에스 | `si_enterprise` | https://www.samsungsds.com/kr/index.html |
| `co_skcnc` | 에스케이씨앤씨 | `si_enterprise` | https://www.skcc.co.kr/ |
| `co_poscodx` | 포스코디엑스 | `si_enterprise` | https://www.poscodx.com/ |
| `co_navercloud` | 네이버클라우드 | `b2b_saas` | https://www.ncloud.com/ |
| `co_sendbird` | 센드버드 | `b2b_saas` | https://sendbird.com/careers |
| `co_upstage` | 업스테이지 | `startup` | https://www.upstage.ai/careers |
| `co_wantedlab` | 원티드랩 | `startup` | https://www.wanted.co.kr/ |

`co_toss` 라는 식별자를 쓰지 않는다. 법인명이 비바리퍼블리카이므로 `co_viva` 다.
`toss.im` 은 도구 차단 도메인이므로 접속하지 않는다. URL 은 문자열로만 담는다.

## 부록 B. 생성 모듈 인터페이스

각 직무는 아래 형태의 생성 모듈 하나를 사용한다.

```python
# agent/scripts/demo_seed/<job_role_id>.py
from ._csv import demo_seed_root, sha256_hex, write_part

JOB_ROLE_ID = "backend"

def build() -> dict[str, list[dict]]:
    """테이블명 → 행 목록. 데이터베이스에 접속하지 않는다."""

def main() -> None:
    counts = write_part(demo_seed_root(), JOB_ROLE_ID, build())
    ...

if __name__ == "__main__":
    main()
```

실행은 `cd agent` 후 `python -m scripts.demo_seed.<job_role_id>` 다.
사용자 공고 조각은 `part` 이름으로 `user_postings`를 쓴다.

각 모듈은 `main()` 에서 자기 검사를 수행하고 실패하면 `SystemExit(1)` 로 끝낸다.

1. `requirement_mentions` 의 `evidence_span_start`·`evidence_span_end` 로
   해당 `source_chunks.text` 를 잘랐을 때 `raw_expression` 과 정확히 같다.
2. `statistics_facts` 의 `numerator`·`denominator` 가 `posting_requirement_assignments` 를
   다시 세어 나온 값과 같다.
3. 모든 외래키 참조 대상이 같은 조각 안이나 마이그레이션 기준 데이터 안에 있다.
4. `analysis_outputs` 의 payload 가 CONTRACT 5장의 키를 전부 갖는다.
5. `checklist_items.concept_id` 와 payload 의 `item_id` 가 서로 맞는다.
6. 공고가 30건이고 `recent` 18건·`prev` 12건이다. recent 는 여섯 기업군마다 3건,
   prev 는 기업군마다 2건이며 `posted_at` 이 기간의 `starts_on`~`ends_on` 안에 있다.
   `cluster_axes` 는 두 기간을 합산해 여섯 기업군 모두 `n=5`로 계산한다.
   진행 중 6건은 모두 recent 이고 나머지 recent 12건과 prev 12건은 마감 상태다.
7. `analysis_outputs` 가 52행이다. `statistics` 1 · `interpretation` 37 ·
   `strategy` 7 · `roadmap` 7 이며, `interpretation` 의 posting 범위 30행은 전체 공고와
   하나씩 짝을 이룬다.
8. 12장 열 가지 가운데 모듈이 값을 직접 담는 2·3·4·5·9 를 행마다 확인한다.
