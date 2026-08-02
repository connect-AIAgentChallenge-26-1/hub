# CareerSignal ERD

## 1. 문서 목적

이 문서는 저장소 테이블의 컬럼, 타입, 기본키, 외래키, 인덱스, 제약을 정의한다. 이 문서는 물리 스키마의 기준 문서이며 `agent/migrations/`가 이 정의를 구현한다.

데이터 계층의 의미와 테이블을 나눈 이유는 [지식·저장 구조](knowledge-schema.md), 지표 수식은 [지표 명세](metric-spec.md), 그래프 유형 목록은 [온톨로지 v1](ontology-v1.md)에 있다.

## 2. 공통 규약

### 2.1 타입

| 용도 | 타입 |
| --- | --- |
| 식별자 | `text` |
| 자유 문장 | `text` |
| 열거값 | `text` + `CHECK` |
| 정수 카운트 | `integer` |
| 비율·점수 | `numeric(6,5)` |
| 금액 | `numeric(12,4)` |
| 시각 | `timestamptz` |
| 날짜 | `date` |
| 구조화 값 | `jsonb` |
| 임베딩 | `vector(1536)` |
| 키워드 인덱스 | `tsvector` |

식별자는 `uuid`가 아니라 `text`를 쓴다. 실행 봉투와 로그에 `run_...`, `an_...` 같은 접두사가 붙은 값이 그대로 나타나며, 사람이 읽고 추적하는 것이 디버깅에 필요하다.

임베딩 차원은 1536이다.

### 2.2 식별자 접두사

| 접두사 | 대상 |
| --- | --- |
| `src_` | `sources` |
| `snap_` | `source_snapshots` |
| `chunk_` | `source_chunks` |
| `mention_` | `requirement_mentions` |
| `assign_` | `posting_requirement_assignments` |
| `dim_` | `requirement_dimensions` |
| `cand_` | `requirement_candidates` |
| `cap_` | `capabilities` |
| `node_` / `edge_` | `knowledge_nodes` / `knowledge_edges` |
| `fact_` | `statistics_facts` |
| `claim_` | `analysis_claims` |
| `out_` | `analysis_outputs` |
| `run_` | `agent_runs` |
| `an_` | `analysis_versions` |
| `up_` | `user_postings` |
| `ua_` | `user_posting_analyses` |
| `ds_` | 데이터셋 버전 |
| `tx_` | 분류체계 버전 |
| `kn_` | 지식 버전 |

### 2.3 버전 컬럼

버전 컬럼은 값의 유효 범위를 나타내며 전용 테이블을 참조한다.

| 컬럼 | 참조 |
| --- | --- |
| `dataset_version` | `dataset_versions` |
| `taxonomy_version_id` | `requirement_taxonomy_versions` |
| `knowledge_version` | `knowledge_versions` |
| `analysis_version` | `analysis_versions` |
| `ontology_version` + `graph_layer` | `ontology_versions` |
| `metric_policy_version` | `metric_policy_versions` |

### 2.4 공통 제약

- 모든 테이블은 `created_at timestamptz NOT NULL DEFAULT now()`를 가진다. 아래 정의에서 생략한다.
- 열거값 컬럼은 `CHECK` 제약으로 허용 값을 고정한다. 애플리케이션 검증에만 의존하지 않는다.
- 외래키는 `ON DELETE RESTRICT`를 기본으로 한다. 계보가 끊기는 삭제를 막는다.
- 시간 범위를 가진 테이블은 `valid_from <= valid_to` 또는 `valid_to IS NULL`을 `CHECK`로 강제한다.

## 3. 기준 테이블

분석 범위와 시간 축을 정의한다. 다른 모든 테이블이 참조한다.

### 3.1 `job_roles`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `job_role_id` | `text` | PK. `backend` 같은 slug |
| `display_name` | `text` | NOT NULL |
| `description` | `text` | |
| `is_active` | `boolean` | NOT NULL DEFAULT false |

`is_active`가 거짓인 직무는 화면 선택지에 나타나지 않는다. 분석은 실행할 수 있다.

이 표는 목표 직무 아홉 종을 담는다. `backend`, `frontend`, `ai_engineer`, `data_engineer`, `fullstack`, `devops`, `mobile`, `security`, `game_client`다. 직무 판정이 아홉 중 하나를 고르는 문제이므로 후보 전량을 기준 데이터로 둔다. 판정 규칙은 [지표 명세](metric-spec.md) 2.8에 있다.

아홉 직무 전부 `is_active`가 참이다.

### 3.2 `companies`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `company_id` | `text` | PK |
| `display_name` | `text` | NOT NULL |
| `official_site_url` | `text` | |
| `careers_url` | `text` | |

카탈로그는 아홉 직무 데이터셋이 참조하는 법인 42개를 담는다. 같은 채용 호스트를 쓰더라도 법인이 다르면 별도 행이다. 기업군 성향 지표의 분모가 법인 단위이기 때문이다.

### 3.3 `company_clusters`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `cluster_id` | `text` | PK |
| `display_name` | `text` | NOT NULL |
| `definition` | `text` | NOT NULL. 이 군에 넣는 기준 |
| `sort_order` | `integer` | NOT NULL |

초기 6종은 `bigtech_platform`, `startup`, `b2b_saas`, `fintech_finance`, `si_enterprise`, `game`이다. 기업군은 사람이 정한 태그이며 자동 분류는 [개발 백로그](backlog.md)의 `EXT-05`에서 다룬다.

### 3.4 `company_cluster_memberships`

회사와 기업군 소속의 유일한 원천이다.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `membership_id` | `text` | PK |
| `company_id` | `text` | NOT NULL, FK → `companies` |
| `cluster_id` | `text` | NOT NULL, FK → `company_clusters` |
| `valid_from` | `date` | NOT NULL |
| `valid_to` | `date` | NULL이면 현재까지 유효 |
| `assigned_by` | `text` | NOT NULL. 판정 주체 |

```sql
CHECK (valid_to IS NULL OR valid_from <= valid_to)
EXCLUDE USING gist (
  company_id WITH =,
  cluster_id WITH =,
  daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]') WITH &&
)
CREATE INDEX ON company_cluster_memberships (company_id, valid_from, valid_to);
```

`EXCLUDE` 제약이 같은 회사·기업군 조합의 기간 중복을 막는다. 한 회사가 서로 다른 기업군에 동시에 속하는 것은 허용한다.

집계는 실행 봉투의 `as_of_date`로 소속을 해석한다.

```sql
WHERE valid_from <= :as_of_date
  AND (valid_to IS NULL OR valid_to >= :as_of_date)
```

### 3.5 `periods`

통계의 기간 축이다.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `period_id` | `text` | PK |
| `label` | `text` | NOT NULL |
| `starts_on` | `date` | NOT NULL |
| `ends_on` | `date` | NOT NULL |
| `is_baseline` | `boolean` | NOT NULL DEFAULT false |

```sql
CHECK (starts_on <= ends_on)
```

기간은 달력 연도를 따른다. 요구 수준의 변화가 연 단위로 읽히고, 기준일이 움직여도 같은 공고가 같은 기간에 남는다.

MVP는 두 기간을 사용한다. `y2026`은 2026년이고 `y2024_2025`는 2024년과 2025년이다. `temporal_delta`는 이 두 기간을 비교한다. `is_baseline`이 참인 기간이 화면의 기본 표시 기간이며, 그 `ends_on`은 기준일보다 뒤에 있어 해가 끝날 때까지 분모가 늘어난다.

이전 기간의 하한은 2024-01-01이다. 그보다 앞선 공고는 기술 구성이 달라 기간 비교에 쓰지 않는다.

기간 정의를 수정하지 않고 새 `period_id`를 추가해 확장한다. `statistics_facts.period_id`가 이 표를 참조하므로, 기존 행의 `starts_on`과 `ends_on`을 바꾸면 이미 저장된 지표가 다른 기간을 가리킨다.

### 3.6 `dataset_versions`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `dataset_version` | `text` | PK. `ds_` 접두사 |
| `job_role_id` | `text` | FK → `job_roles`. NULL이면 전 직무 |
| `as_of_date` | `date` | NOT NULL |
| `note` | `text` | |
| `sealed_at` | `timestamptz` | 봉인 이후 소속 변경 불가 |

### 3.7 `knowledge_versions`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `knowledge_version` | `text` | PK. `kn_` 접두사 |
| `job_role_id` | `text` | NOT NULL, FK → `job_roles` |
| `taxonomy_version_id` | `text` | NOT NULL, FK → `requirement_taxonomy_versions` |
| `published_at` | `timestamptz` | |

## 4. D0 원본

### 4.1 `sources`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `source_id` | `text` | PK |
| `source_type` | `text` | NOT NULL. `CHECK IN ('job_posting','company_official','public_standard','external_expert','learning_material')` |
| `url` | `text` | NOT NULL, UNIQUE |
| `publisher` | `text` | |
| `author` | `text` | |
| `robots_policy` | `text` | |
| `license_note` | `text` | |
| `job_role_ids` | `text[]` | NOT NULL DEFAULT `'{}'` |
| `company_id` | `text` | FK → `companies` |
| `first_seen_at` | `timestamptz` | NOT NULL |

```sql
CREATE INDEX ON sources USING gin (job_role_ids);
```

### 4.2 `source_snapshots`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `snapshot_id` | `text` | PK |
| `source_id` | `text` | NOT NULL, FK → `sources` |
| `content_hash` | `text` | NOT NULL. SHA-256 hex 64자 |
| `raw_content` | `text` | NOT NULL |
| `published_at` | `timestamptz` | |
| `fetched_at` | `timestamptz` | NOT NULL |
| `dataset_version` | `text` | NOT NULL, FK → `dataset_versions` |
| `supersedes_snapshot_id` | `text` | FK → `source_snapshots` |

```sql
UNIQUE (source_id, content_hash)
CHECK (char_length(content_hash) = 64)
CREATE INDEX ON source_snapshots (dataset_version);
CREATE INDEX ON source_snapshots (source_id, fetched_at DESC);
```

`raw_content`의 변경과 삭제를 트리거로 차단한다.

```sql
CREATE FUNCTION block_append_only_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_snapshots_append_only
  BEFORE UPDATE OR DELETE ON source_snapshots
  FOR EACH ROW EXECUTE FUNCTION block_append_only_mutation();
```

정정은 새 행 삽입과 `supersedes_snapshot_id` 연결로만 표현한다.

### 4.3 `source_observations`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `observation_id` | `text` | PK |
| `snapshot_id` | `text` | NOT NULL, FK → `source_snapshots` |
| `observed_at` | `timestamptz` | NOT NULL |
| `fetch_status` | `text` | NOT NULL. `CHECK IN ('ok','not_found','forbidden','timeout','changed','parse_error')` |
| `canonical_url` | `text` | |
| `http_status` | `integer` | |
| `notes` | `text` | |

```sql
CREATE INDEX ON source_observations (snapshot_id, observed_at DESC);
```

append-only다. `UPDATE`와 `DELETE`를 트리거로 차단한다.

### 4.4 `source_assessments`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `assessment_id` | `text` | PK |
| `snapshot_id` | `text` | NOT NULL, FK → `source_snapshots` |
| `source_tier` | `text` | NOT NULL. `CHECK IN ('A','B','C','D','E')` |
| `allowed_uses` | `text[]` | NOT NULL |
| `reliability_score` | `numeric(6,5)` | `CHECK BETWEEN 0 AND 1` |
| `assessment_version` | `text` | NOT NULL |
| `assessed_at` | `timestamptz` | NOT NULL |
| `assessed_by_run_id` | `text` | FK → `agent_runs` |

```sql
UNIQUE (snapshot_id, assessment_version)
CHECK (allowed_uses <@ ARRAY[...11종...]::text[])
CREATE INDEX ON source_assessments USING gin (allowed_uses);
```

`allowed_uses`의 허용 값은 [데이터 전략](data-strategy.md) 3.1의 11종이며 `CHECK`가 그 목록 밖의 값을 막는다. 자료 계층별 기본 조합은 같은 문서 3장의 표를 따른다.

### 4.5 `postings`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `posting_id` | `text` | PK |
| `source_id` | `text` | NOT NULL, FK → `sources` |
| `company_id` | `text` | NOT NULL, FK → `companies` |
| `job_role_id` | `text` | NOT NULL, FK → `job_roles` |
| `first_posted_at` | `timestamptz` | |

```sql
CREATE INDEX ON postings (job_role_id, company_id);
```

`job_role_id` 판정 규칙은 [지표 명세](metric-spec.md) 2.8에 있다.

### 4.6 `posting_versions`

분석의 모집단 단위다. 모든 지표의 중복 제거 단위가 `posting_version_id`다.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `posting_version_id` | `text` | PK |
| `posting_id` | `text` | NOT NULL, FK → `postings` |
| `snapshot_id` | `text` | NOT NULL, FK → `source_snapshots` |
| `title` | `text` | NOT NULL |
| `career_label_raw` | `text` | 원문 표현 |
| `edu_label_raw` | `text` | 원문 표현 |
| `entry_label_raw` | `text` | 원문 표현 |
| `entry_label` | `text` | NOT NULL. `CHECK IN ('entry','junior','entry_junior','experienced','unspecified')` |
| `posted_at` | `timestamptz` | |
| `closed_at` | `timestamptz` | |
| `dataset_version` | `text` | NOT NULL, FK → `dataset_versions` |

```sql
UNIQUE (posting_id, snapshot_id)
CHECK (closed_at IS NULL OR posted_at IS NULL OR posted_at <= closed_at)
CREATE INDEX ON posting_versions (dataset_version, posted_at);
CREATE INDEX ON posting_versions (entry_label);
```

`*_raw` 컬럼은 공고 문구를 해석하지 않고 그대로 담는다. `entry_label`은 집계용 정규화 값이며 정규화 규칙은 [지표 명세](metric-spec.md)에 있다. 기업군은 이 표의 컬럼이 아니다. `company_cluster_memberships`를 `as_of_date`로 해석한다.

### 4.7 `legacy_posting_samples`

Express의 폴백 조회가 읽는 평면 표다. 이 표를 따로 둔 이유는 [지식·저장 구조](knowledge-schema.md) 2장, 결정 근거는 [ADR 0014](adr/0014-legacy-posting-samples.md)에 있다.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `posting_id` | `text` | PK |
| `title` | `text` | NOT NULL |
| `company` | `text` | NOT NULL. 회사명 문자열 |
| `cluster_tag` | `text` | NOT NULL. 기업군 6종 |
| `snapshot` | `text` | NOT NULL. `CHECK IN ('recent','prev')` |
| `posted_at` | `date` | |
| `source` | `jsonb` | NOT NULL DEFAULT `'{}'` |
| `raw_text` | `text` | 공고 원문 |
| `entry_label` | `text` | |
| `edu_label` | `text` | |
| `career_label` | `text` | |
| `skills` | `jsonb` | NOT NULL DEFAULT `'[]'` |
| `out_of_role_tags` | `jsonb` | NOT NULL DEFAULT `'[]'` |
| `advanced_spans` | `jsonb` | NOT NULL DEFAULT `'[]'` |
| `impl_level_signals` | `jsonb` | NOT NULL DEFAULT `'[]'` |
| `axis_mentions` | `jsonb` | NOT NULL DEFAULT `'[]'` |
| `reality_tags` | `jsonb` | NOT NULL DEFAULT `'[]'` |
| `job_role_id` | `text` | NOT NULL DEFAULT `'backend'` |

```sql
CREATE INDEX ON legacy_posting_samples (job_role_id, snapshot);
CREATE INDEX ON legacy_posting_samples (cluster_tag);
```

`company`와 `cluster_tag`는 문자열이며 `companies`·`company_clusters`를 참조하지 않는다. `job_role_id`도 `job_roles`로 가는 외래키를 두지 않는다. 이 표는 분석 모집단이 아니므로 기준 테이블의 계보에 들어가지 않는다.

## 5. D1 검색 표현

### 5.1 `source_chunks`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `chunk_id` | `text` | PK |
| `snapshot_id` | `text` | NOT NULL, FK → `source_snapshots` |
| `section` | `text` | 원문 섹션명 |
| `ordinal` | `integer` | NOT NULL |
| `text` | `text` | NOT NULL |
| `context` | `jsonb` | NOT NULL. 회사·기업군·문서유형·섹션·직무·게시시점 |
| `embedding_text` | `text` | NOT NULL |
| `tsv` | `tsvector` | 생성 컬럼. `to_tsvector('simple', embedding_text)` |
| `token_count` | `integer` | NOT NULL |
| `dataset_version` | `text` | NOT NULL, FK → `dataset_versions` |

```sql
UNIQUE (snapshot_id, ordinal)
CREATE INDEX ON source_chunks USING gin (tsv);
CREATE INDEX ON source_chunks (dataset_version);
CREATE INDEX ON source_chunks USING gin (context jsonb_path_ops);
```

`tsv`는 `embedding_text`에서 생성한다. `to_tsvector`의 사전 설정을 바꾸면 `retrieval_policy_version`을 올린다.

### 5.2 `chunk_embeddings`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `chunk_id` | `text` | NOT NULL, FK → `source_chunks` |
| `embedding_model` | `text` | NOT NULL |
| `embedding_dimension` | `integer` | NOT NULL |
| `embedding` | `vector(1536)` | NOT NULL |
| `embedding_version` | `text` | NOT NULL |

```sql
PRIMARY KEY (chunk_id, embedding_version)
CREATE INDEX ON chunk_embeddings USING hnsw (embedding vector_cosine_ops);
```

복합 기본키가 한 청크에 여러 임베딩 모델의 결과를 함께 보관한다. 모델 비교 평가가 청크 재생성 없이 가능하다.

## 6. D2 mention

### 6.1 `requirement_mentions`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `mention_id` | `text` | PK |
| `posting_version_id` | `text` | NOT NULL, FK → `posting_versions` |
| `snapshot_id` | `text` | NOT NULL, FK → `source_snapshots` |
| `chunk_id` | `text` | NOT NULL, FK → `source_chunks` |
| `raw_expression` | `text` | NOT NULL |
| `evidence_span_start` | `integer` | NOT NULL, `CHECK >= 0` |
| `evidence_span_end` | `integer` | NOT NULL |
| `stated_requiredness` | `text` | NOT NULL. 원문 라벨 그대로 |
| `section` | `text` | |
| `extraction_confidence` | `numeric(6,5)` | `CHECK BETWEEN 0 AND 1` |
| `extraction_run_id` | `text` | NOT NULL, FK → `agent_runs` |
| `dataset_version` | `text` | NOT NULL, FK → `dataset_versions` |

```sql
CHECK (evidence_span_start < evidence_span_end)
CREATE INDEX ON requirement_mentions (posting_version_id);
CREATE INDEX ON requirement_mentions (chunk_id);
CREATE INDEX ON requirement_mentions (dataset_version);
CREATE INDEX ON requirement_mentions (chunk_id, dataset_version);
```

`stated_requiredness`는 열거값이 아니다. 공고가 쓴 표현을 그대로 담고 해석하지 않는다. 필수·우대의 판정은 할당 단계에서 수행한다.

`evidence_span_*`은 `source_chunks.text` 기준 오프셋이다. 검증의 근거 위치 검사가 이 구간을 원문과 대조한다.

`(chunk_id, dataset_version)` 인덱스는 증분 재실행의 `NOT EXISTS` 조회가 두 컬럼을 인덱스만으로 판정하게 한다.

### 6.2 `chunk_extractions`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `chunk_id` | `text` | NOT NULL, FK → `source_chunks` |
| `dataset_version` | `text` | NOT NULL, FK → `dataset_versions` |
| `extraction_run_id` | `text` | NOT NULL, FK → `agent_runs` |
| `mention_count` | `integer` | NOT NULL, `CHECK >= 0` |
| `extracted_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

```sql
PRIMARY KEY (chunk_id, dataset_version)
CREATE INDEX ON chunk_extractions (dataset_version);
```

이 테이블을 둔 이유는 [지식·저장 구조](knowledge-schema.md) 5장에 있다.

증분 재실행의 대상 조회가 이 테이블을 `NOT EXISTS`로 읽는다. 조회 위치는 `LIMIT` 앞이다(6.1과 같은 규칙).

복합 기본키가 "한 데이터셋 버전에서 한 청크는 한 번 처리한다"를 강제한다. 청크는 스냅샷에서 결정적으로 나오고 스냅샷은 변경되지 않으므로 같은 데이터셋 버전 안에서 다시 뽑을 이유가 없다. 데이터셋 버전이 다르면 다시 뽑는다. 식별자 컬럼이 없으므로 2.2의 접두사 규약은 이 테이블에 적용되지 않는다.

기록은 mention 저장과 같은 트랜잭션에서 이루어진다. 트랜잭션이 되돌아가면 표현과 기록이 함께 사라지므로 "표현은 없는데 처리됨으로 남는" 상태가 생기지 않는다. 모델 호출이 예외로 끝난 청크는 기록하지 않는다. 답하지 못한 것을 표현 없음으로 굳히면 다시 시도할 수 없다.

## 7. D3a 분류체계

### 7.1 `requirement_taxonomies`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `taxonomy_id` | `text` | PK |
| `job_role_id` | `text` | NOT NULL, FK → `job_roles`, UNIQUE |

직무마다 분류체계가 하나다.

### 7.2 `requirement_taxonomy_versions`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `taxonomy_version_id` | `text` | PK. `tx_` 접두사 |
| `taxonomy_id` | `text` | NOT NULL, FK → `requirement_taxonomies` |
| `version_number` | `integer` | NOT NULL |
| `taxonomy_policy_version` | `text` | NOT NULL |
| `published_at` | `timestamptz` | |
| `superseded_at` | `timestamptz` | |

```sql
UNIQUE (taxonomy_id, version_number)
CREATE UNIQUE INDEX ON requirement_taxonomy_versions (taxonomy_id)
  WHERE published_at IS NOT NULL AND superseded_at IS NULL;
```

부분 유니크 인덱스가 직무마다 활성 분류체계 버전을 하나로 강제한다.

### 7.3 `requirement_dimensions`

차원의 정체성이다. 라벨이 바뀌어도 이 식별자는 유지된다.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `dimension_id` | `text` | PK. `dim_` 접두사 |
| `taxonomy_id` | `text` | NOT NULL, FK → `requirement_taxonomies` |
| `dimension_kind` | `text` | NOT NULL. `CHECK IN ('technology','practice','domain','collaboration','tooling')` |

`Technology` 그래프 노드는 `dimension_kind = 'technology'`인 행에서 만든다.

### 7.4 `requirement_dimension_versions`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `dimension_version_id` | `text` | PK |
| `dimension_id` | `text` | NOT NULL, FK → `requirement_dimensions` |
| `taxonomy_version_id` | `text` | NOT NULL, FK → `requirement_taxonomy_versions` |
| `internal_canonical_label` | `text` | NOT NULL |
| `display_label` | `text` | NOT NULL |
| `definition` | `text` | NOT NULL |
| `lifecycle_status` | `text` | NOT NULL. `CHECK IN ('proposed','collecting_evidence','under_review','approved','active','merged','split','deprecated')` |
| `standard_mapping_status` | `text` | NOT NULL. `CHECK IN ('exact','broader','narrower','related','unmapped')` |
| `standard_id` | `text` | FK → `standards` |
| `mapping_confidence` | `numeric(6,5)` | |
| `mapping_evidence` | `jsonb` | |
| `review_status` | `text` | NOT NULL |
| `role_boundary_eligible` | `boolean` | NOT NULL DEFAULT false |

```sql
UNIQUE (dimension_id, taxonomy_version_id)
CHECK (standard_mapping_status = 'unmapped' OR standard_id IS NOT NULL)
CREATE INDEX ON requirement_dimension_versions (taxonomy_version_id, lifecycle_status);
```

`lifecycle_status`가 `active`인 차원만 집계에 포함한다. `role_boundary_eligible`이 참인 차원만 `scope_expansion` 지표의 대상이다.

### 7.5 `requirement_aliases`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `alias_id` | `text` | PK |
| `dimension_id` | `text` | NOT NULL, FK → `requirement_dimensions` |
| `taxonomy_version_id` | `text` | NOT NULL, FK → `requirement_taxonomy_versions` |
| `alias_text` | `text` | NOT NULL |
| `alias_source` | `text` | NOT NULL. `CHECK IN ('discovered','manual','standard')` |

```sql
UNIQUE (taxonomy_version_id, alias_text)
```

버전 안에서 하나의 표현이 두 차원에 붙지 않는다.

### 7.6 `requirement_dimension_relations`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `relation_id` | `text` | PK |
| `taxonomy_version_id` | `text` | NOT NULL, FK → `requirement_taxonomy_versions` |
| `src_dimension_id` | `text` | NOT NULL, FK → `requirement_dimensions` |
| `dst_dimension_id` | `text` | NOT NULL, FK → `requirement_dimensions` |
| `relation_type` | `text` | NOT NULL. `CHECK IN ('broader','narrower','related')` |

```sql
UNIQUE (taxonomy_version_id, src_dimension_id, dst_dimension_id, relation_type)
CHECK (src_dimension_id <> dst_dimension_id)
```

### 7.7 `requirement_candidates`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `candidate_id` | `text` | PK. `cand_` 접두사 |
| `taxonomy_id` | `text` | NOT NULL, FK → `requirement_taxonomies` |
| `proposed_label` | `text` | NOT NULL |
| `lifecycle_status` | `text` | NOT NULL. 7.4와 같은 값 집합 |
| `nearest_dimension_id` | `text` | FK → `requirement_dimensions` |
| `relation_judgment` | `text` | `CHECK IN ('synonym','broader','narrower','related','none')` |
| `proposed_dimension_kind` | `text` | `CHECK IN ('technology','practice','domain','collaboration','tooling')` |
| `judged_against_taxonomy_version_id` | `text` | FK → `requirement_taxonomy_versions` |
| `judgment_rationale` | `text` | 판정을 고른 이유 한 문장 |
| `discovered_in_run_id` | `text` | NOT NULL, FK → `agent_runs` |

```sql
CREATE INDEX ON requirement_candidates (taxonomy_id, judged_against_taxonomy_version_id);
```

`relation_judgment`는 판정에 건 기존 차원 목록에 상대적이며 그 목록은 분류체계 버전의 활성 어휘에서 나온다. `judged_against_taxonomy_version_id`가 그 버전을 가리키고, 승격 심사는 판정이 가리킨 차원이 활성 버전에 있는지 확인한다. 근거는 [ADR 0011](adr/0011-candidate-judgment-context.md)에 있다.

세 컬럼은 NULL을 허용한다.

`proposed_dimension_kind`는 후보를 명명한 판정이 함께 낸 차원 종류이며 값 집합은 7.3의 `dimension_kind`와 같다. 승격이 이 값을 새 차원에 옮기고, 값이 없으면 `practice`로 떨어뜨린다. 이 컬럼이 없으면 승격이 만드는 차원이 모두 `practice`가 되어 `Technology` 그래프 노드가 하나도 생기지 않는다.

### 7.8 `requirement_candidate_mentions`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `candidate_id` | `text` | NOT NULL, FK → `requirement_candidates` |
| `mention_id` | `text` | NOT NULL, FK → `requirement_mentions` |

```sql
PRIMARY KEY (candidate_id, mention_id)
CREATE INDEX ON requirement_candidate_mentions (mention_id);
```

기본키의 선두 컬럼이 `candidate_id`이므로, `mention_id` 하나로 판정하는 발견의 `NOT EXISTS` 조회가 별도 인덱스를 쓴다.

### 7.9 `requirement_candidate_decisions`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `decision_id` | `text` | PK |
| `candidate_id` | `text` | NOT NULL, FK → `requirement_candidates` |
| `decision` | `text` | NOT NULL. `CHECK IN ('promote','hold','reject','merge')` |
| `independent_posting_count` | `integer` | NOT NULL |
| `independent_company_count` | `integer` | NOT NULL |
| `representative_sentences` | `jsonb` | NOT NULL |
| `distance_to_existing` | `numeric(6,5)` | |
| `standard_mapping_status` | `text` | |
| `relation_judgment` | `text` | |
| `eval_set_comparison` | `jsonb` | |
| `verification_result_id` | `text` | FK → `verification_results` |
| `decided_by` | `text` | NOT NULL |
| `taxonomy_policy_version` | `text` | NOT NULL |
| `promoted_to_version_id` | `text` | FK → `requirement_taxonomy_versions` |

```sql
CHECK (decision <> 'promote' OR promoted_to_version_id IS NOT NULL)
```

결정 행은 후보와 심사가 기준 삼은 분류체계 버전으로 식별한다. 후보 하나가 버전마다 결정 행 하나를 갖는다. `hold`는 종결이 아니므로 새 버전이 발행되면 그 후보는 새 어휘로 다시 심사되고 결정 행이 하나 더 쌓인다.

### 7.10 `capabilities`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `capability_id` | `text` | PK. `cap_` 접두사 |
| `job_role_id` | `text` | NOT NULL, FK → `job_roles` |
| `canonical_label` | `text` | NOT NULL |
| `definition` | `text` | |
| `is_active` | `boolean` | NOT NULL DEFAULT true |

```sql
UNIQUE (job_role_id, canonical_label)
```

### 7.11 `capability_dimension_links`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `capability_id` | `text` | NOT NULL, FK → `capabilities` |
| `dimension_id` | `text` | NOT NULL, FK → `requirement_dimensions` |
| `taxonomy_version_id` | `text` | NOT NULL, FK → `requirement_taxonomy_versions` |

```sql
PRIMARY KEY (capability_id, dimension_id, taxonomy_version_id)
```

### 7.12 `standards`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `standard_id` | `text` | PK |
| `standard_body` | `text` | NOT NULL |
| `code` | `text` | NOT NULL |
| `title` | `text` | NOT NULL |
| `description` | `text` | |
| `source_id` | `text` | FK → `sources` |

```sql
UNIQUE (standard_body, code)
```

### 7.13 `posting_requirement_assignments`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `assignment_id` | `text` | PK. `assign_` 접두사 |
| `mention_id` | `text` | NOT NULL, FK → `requirement_mentions` |
| `taxonomy_version_id` | `text` | NOT NULL, FK → `requirement_taxonomy_versions` |
| `dimension_id` | `text` | NOT NULL, FK → `requirement_dimensions` |
| `normalized_label` | `text` | NOT NULL |
| `requiredness` | `text` | NOT NULL. `CHECK IN ('required','preferred','responsibility','unknown')` |
| `depth_level` | `text` | NOT NULL. `CHECK IN ('foundation','application','tradeoff')` |
| `assignment_confidence` | `numeric(6,5)` | `CHECK BETWEEN 0 AND 1` |
| `assignment_method` | `text` | NOT NULL. `CHECK IN ('alias_exact','vector_match','model_judgment','manual')` |
| `verifier_status` | `text` | NOT NULL |

```sql
UNIQUE (mention_id, taxonomy_version_id)
CREATE INDEX ON posting_requirement_assignments (taxonomy_version_id, dimension_id);
```

`requiredness`는 `requirement_mentions.stated_requiredness`의 원문 표현을 열거값으로 정규화한 결과다. 원문은 mention에 남고 해석 결과는 할당에 담긴다.

한 mention은 분류체계 버전당 하나의 차원에만 할당된다. 집계의 중복 제거가 이 제약에 의존한다.

## 8. D3a 지식 그래프

### 8.1 `ontology_versions`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `ontology_version` | `text` | NOT NULL |
| `graph_layer` | `text` | NOT NULL. `CHECK IN ('semantic','provenance')` |
| `node_types` | `jsonb` | NOT NULL |
| `edge_types` | `jsonb` | NOT NULL |
| `allowed_connections` | `jsonb` | NOT NULL |
| `required_evidence_by_edge_type` | `jsonb` | NOT NULL |
| `effective_from` | `timestamptz` | NOT NULL |

```sql
PRIMARY KEY (ontology_version, graph_layer)
```

유형 목록의 내용은 [온톨로지 v1](ontology-v1.md)에 있다.

### 8.2 `knowledge_nodes`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `node_id` | `text` | PK. `node_` 접두사 |
| `graph_layer` | `text` | NOT NULL. `CHECK IN ('semantic','provenance')` |
| `node_type` | `text` | NOT NULL |
| `ref_table` | `text` | NOT NULL |
| `ref_id` | `text` | NOT NULL |
| `label` | `text` | NOT NULL |
| `ontology_version` | `text` | NOT NULL |
| `dataset_version` | `text` | FK → `dataset_versions` |
| `taxonomy_version_id` | `text` | FK → `requirement_taxonomy_versions`. nullable |
| `analysis_version` | `text` | FK → `analysis_versions` |

```sql
FOREIGN KEY (ontology_version, graph_layer) REFERENCES ontology_versions
UNIQUE (graph_layer, node_type, ref_table, ref_id, ontology_version)
CREATE INDEX ON knowledge_nodes (ref_table, ref_id);
CREATE INDEX ON knowledge_nodes (graph_layer, node_type);
```

`taxonomy_version_id`는 `RequirementDimension`과 `Technology` 노드만 채운다.

### 8.3 `knowledge_edges`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `edge_id` | `text` | PK. `edge_` 접두사 |
| `graph_layer` | `text` | NOT NULL. `CHECK IN ('semantic','provenance')` |
| `edge_type` | `text` | NOT NULL |
| `src_node_id` | `text` | NOT NULL, FK → `knowledge_nodes` |
| `dst_node_id` | `text` | NOT NULL, FK → `knowledge_nodes` |
| `weight` | `numeric(6,5)` | nullable. 집계 이후 채움 |
| `evidence_id` | `text` | |
| `produced_by_run_id` | `text` | FK → `agent_runs` |
| `verification_status` | `text` | NOT NULL |
| `ontology_version` | `text` | NOT NULL |
| `dataset_version` | `text` | FK → `dataset_versions` |
| `taxonomy_version_id` | `text` | FK → `requirement_taxonomy_versions`. nullable |
| `analysis_version` | `text` | FK → `analysis_versions` |
| `valid_from` | `timestamptz` | |
| `valid_to` | `timestamptz` | |

```sql
FOREIGN KEY (ontology_version, graph_layer) REFERENCES ontology_versions
CHECK (src_node_id <> dst_node_id OR edge_type = 'PREREQUISITE_OF')
CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_from <= valid_to)
CREATE INDEX ON knowledge_edges (src_node_id, edge_type);
CREATE INDEX ON knowledge_edges (dst_node_id, edge_type);
CREATE INDEX ON knowledge_edges (graph_layer, analysis_version);
```

`weight`가 nullable인 이유는 [지식·저장 구조](knowledge-schema.md) 2장에 있다.

`taxonomy_version_id`는 `REQUIRES`, `REQUIRES_CAPABILITY`, `ASSIGNED_TO`만 채운다.

### 8.4 `graph_paths`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `path_id` | `text` | PK |
| `path_type` | `text` | NOT NULL |
| `node_sequence` | `text[]` | NOT NULL |
| `edge_sequence` | `text[]` | NOT NULL |
| `taxonomy_version_id` | `text` | FK → `requirement_taxonomy_versions` |
| `knowledge_version` | `text` | FK → `knowledge_versions` |
| `analysis_version` | `text` | FK → `analysis_versions` |
| `graph_policy_version` | `text` | NOT NULL |
| `computed_at` | `timestamptz` | NOT NULL |

```sql
CHECK (array_length(edge_sequence, 1) = array_length(node_sequence, 1) - 1)
CREATE INDEX ON graph_paths
  (path_type, taxonomy_version_id, knowledge_version, analysis_version, graph_policy_version);
```

캐시다. 네 버전이 캐시 키를 이룬다.

## 9. D3b Wiki

### 9.1 `wiki_pages`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `page_id` | `text` | PK |
| `capability_id` | `text` | NOT NULL, FK → `capabilities` |
| `knowledge_version` | `text` | NOT NULL, FK → `knowledge_versions` |
| `status` | `text` | NOT NULL. `CHECK IN ('draft','published','superseded')` |

```sql
UNIQUE (capability_id, knowledge_version)
```

### 9.2 `wiki_revisions`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `revision_id` | `text` | PK |
| `page_id` | `text` | NOT NULL, FK → `wiki_pages` |
| `definition` | `text` | |
| `why_required` | `text` | |
| `depth_criteria` | `jsonb` | 깊이 등급별 판정 기준 문장 |
| `prerequisites` | `jsonb` | |
| `common_misconceptions` | `jsonb` | |
| `interview_verification` | `jsonb` | |
| `learning_sequence` | `jsonb` | |
| `produced_by_run_id` | `text` | NOT NULL, FK → `agent_runs` |

모든 필드가 nullable이다. 근거가 없는 필드는 채우지 않는다.

### 9.3 `wiki_evidence`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `revision_id` | `text` | NOT NULL, FK → `wiki_revisions` |
| `field_name` | `text` | NOT NULL. `CHECK IN ('definition','why_required','depth_criteria','prerequisites','common_misconceptions','interview_verification','learning_sequence')` |
| `chunk_id` | `text` | NOT NULL, FK → `source_chunks` |
| `source_tier` | `text` | NOT NULL. `CHECK IN ('A','B','C','D')` |

```sql
PRIMARY KEY (revision_id, field_name, chunk_id)
```

E 계층은 Wiki 근거가 될 수 없어 `CHECK`에서 제외한다. 필드별 허용 계층은 [지식·저장 구조](knowledge-schema.md) 8.5를 따르며 자료 정책 검사가 강제한다.

## 10. D4 통계

### 10.1 `metric_templates`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `metric_family` | `text` | NOT NULL |
| `formula_version` | `text` | NOT NULL |
| `input_arity` | `text` | NOT NULL. `CHECK IN ('scope_only','one_dimension','two_dimensions','dimension_cluster')` |
| `output_unit` | `text` | NOT NULL. `CHECK IN ('ratio','count','distribution','difference')` |

```sql
PRIMARY KEY (metric_family, formula_version)
```

### 10.2 `metric_template_parameters`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `metric_family` | `text` | NOT NULL |
| `formula_version` | `text` | NOT NULL |
| `parameter_name` | `text` | NOT NULL |
| `parameter_type` | `text` | NOT NULL |
| `required` | `boolean` | NOT NULL |

```sql
PRIMARY KEY (metric_family, formula_version, parameter_name)
FOREIGN KEY (metric_family, formula_version) REFERENCES metric_templates
```

### 10.3 `metric_policy_versions`

임계값을 상수가 아니라 행으로 둔다. 실데이터 분포를 본 뒤 새 버전을 발행한다.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `metric_policy_version` | `text` | PK |
| `metric_family` | `text` | NOT NULL |
| `formula_version` | `text` | NOT NULL |
| `minimum_n` | `integer` | NOT NULL |
| `minimum_n_comparison` | `integer` | NOT NULL |
| `suppression_policy` | `text` | NOT NULL. `CHECK IN ('hide','label_low_confidence','label_not_comparable')` |
| `uncertainty_method` | `text` | NOT NULL. `CHECK IN ('wilson_95','none')` |
| `effective_from` | `timestamptz` | NOT NULL |

```sql
FOREIGN KEY (metric_family, formula_version) REFERENCES metric_templates
CHECK (minimum_n <= minimum_n_comparison)
```

`metric_family`가 NOT NULL이므로 한 행은 정책 세대와 지표 family의 짝이다. 한 세대는 family마다 행을 하나씩 갖는다.

`analysis_versions.metric_policy_version`(11.1)은 실행 하나가 선 정책 세대를 가리키는 단일 값이다. `statistics_facts.metric_policy_version`(10.5)은 그 행의 지표 family에 해당하는 정책 행을 가리킨다. 표본 판정과 억제는 family별 정책 행의 값으로 수행한다.

v1 세대는 family 일곱 행이며 모두 `minimum_n = 5`, `minimum_n_comparison = 10`이다. `uncertainty_method`는 `cluster_contrast`가 `none`이고 나머지 여섯은 `wilson_95`다. `cluster_contrast`는 서로 다른 두 모집단의 비율에서 파생해 한 이항 분포의 구간으로 표현되지 않는다. 어떤 `measure`에 구간이 성립하는지는 [지표 명세](metric-spec.md)가 정한다.

### 10.4 `dimension_metric_applicability`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `taxonomy_version_id` | `text` | NOT NULL, FK → `requirement_taxonomy_versions` |
| `dimension_id` | `text` | NOT NULL, FK → `requirement_dimensions` |
| `metric_family` | `text` | NOT NULL |
| `applicable` | `boolean` | NOT NULL |
| `reason` | `text` | |

```sql
PRIMARY KEY (taxonomy_version_id, dimension_id, metric_family)
```

### 10.5 `statistics_facts`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `fact_id` | `text` | PK. `fact_` 접두사 |
| `analysis_version` | `text` | NOT NULL, FK → `analysis_versions` |
| `metric_family` | `text` | NOT NULL |
| `metric_policy_version` | `text` | NOT NULL, FK → `metric_policy_versions` |
| `scope_level` | `text` | NOT NULL. `CHECK IN ('overall','cluster','posting')` |
| `scope_id` | `text` | NOT NULL |
| `entry_segment` | `text` | NOT NULL. `CHECK IN ('all','entry_junior','experienced','unspecified')` |
| `period_id` | `text` | NOT NULL, FK → `periods` |
| `dimension_id` | `text` | FK → `requirement_dimensions` |
| `secondary_dimension_id` | `text` | FK → `requirement_dimensions` |
| `measure` | `text` | NOT NULL |
| `numerator` | `integer` | |
| `denominator` | `integer` | |
| `value` | `numeric(12,6)` | |
| `sample_size` | `integer` | NOT NULL |
| `sample_status` | `text` | NOT NULL. `CHECK IN ('not_computable','low_confidence','not_comparable','analysis_ready')` |
| `uncertainty` | `jsonb` | 하한·상한·방법 |

```sql
CREATE UNIQUE INDEX ON statistics_facts (
  analysis_version, metric_family, measure, scope_level, scope_id, period_id,
  entry_segment,
  COALESCE(dimension_id, ''), COALESCE(secondary_dimension_id, ''));
CHECK (denominator IS NULL OR denominator >= 0)
CHECK (numerator IS NULL OR denominator IS NULL OR numerator <= denominator)
CHECK (sample_status <> 'not_computable' OR value IS NULL)
CHECK (metric_family <> 'entry_label_advanced_signal_rate'
       OR entry_segment = 'entry_junior')
CREATE INDEX ON statistics_facts
  (analysis_version, scope_level, scope_id, entry_segment, period_id, metric_family);
CREATE INDEX ON statistics_facts (dimension_id);
```

유일 인덱스가 두 차원 컬럼을 `COALESCE`로 감싼다. NULL은 서로 같지 않으므로, 감싸지 않으면 차원을 갖지 않는 지표가 같은 키로 여러 행 저장된다.

`scope_id`는 `scope_level`이 가리키는 대상의 식별자다.

| `scope_level` | `scope_id` |
| --- | --- |
| `overall` | `job_roles.job_role_id` |
| `cluster` | `company_clusters.cluster_id` |
| `posting` | `postings.posting_id` |

`overall`은 직무 모집단을 더 좁히지 않는다. 컬럼이 NOT NULL이므로 어느 직무의 전체인지를 담는다. `scope_level`별 모집단 조건은 [지표 명세](metric-spec.md) 2.1에 있다.

`entry_segment`는 지표의 대상군 축이다. `all`은 대상군으로 제한하지 않은 모집단 전체이며 화면에서 직무 공통 기대치를 계산하는 범위다. 정의와 `entry_label` 대응은 [지표 명세](metric-spec.md) 2.7에 있다. 마지막 `CHECK`는 분모에 이미 대상군이 반영된 지표가 다른 대상군으로 저장되는 것을 막는다.

`numerator`와 `denominator`는 정수 카운트만 담는다. `cluster_contrast`처럼 비율에서 파생하는 지표는 `measure`를 나눠 저장하고 `numerator`·`denominator`에는 원본 카운트를 담는다. 수식은 [지표 명세](metric-spec.md)에 있다.

`numerator <= denominator` 제약이 깊이 분포의 등급별 합이 분모를 넘는 오류를 저장 단계에서 막는다.

### 10.6 `capability_depth_profiles`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `profile_id` | `text` | PK |
| `capability_id` | `text` | NOT NULL, FK → `capabilities` |
| `taxonomy_version_id` | `text` | NOT NULL, FK → `requirement_taxonomy_versions` |
| `scope_level` | `text` | NOT NULL. `CHECK IN ('overall','cluster','posting')` |
| `scope_id` | `text` | NOT NULL |
| `entry_segment` | `text` | NOT NULL. `CHECK IN ('all','entry_junior','experienced','unspecified')` |
| `period_id` | `text` | NOT NULL, FK → `periods` |
| `depth_distribution` | `jsonb` | NOT NULL. 등급별 비율 |
| `expected_depth` | `text` | NOT NULL. `CHECK IN ('foundation','application','tradeoff')` |
| `sample_size` | `integer` | NOT NULL |
| `evidence_support` | `jsonb` | |
| `confidence` | `numeric(6,5)` | |
| `analysis_version` | `text` | NOT NULL, FK → `analysis_versions` |

```sql
UNIQUE (analysis_version, capability_id, scope_level, scope_id,
        entry_segment, period_id)
```

기대 깊이는 대상군에 따라 다르다. 신입·주니어에게 기대하는 깊이와 경력에게 기대하는 깊이를 한 행에 담지 않는다.

### 10.7 `saturation_observations`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `observation_id` | `text` | PK |
| `analysis_version` | `text` | NOT NULL, FK → `analysis_versions` |
| `job_role_id` | `text` | NOT NULL, FK → `job_roles` |
| `scope_id` | `text` | NOT NULL |
| `posting_count` | `integer` | NOT NULL |
| `new_candidate_count` | `integer` | NOT NULL |
| `cumulative_dimension_count` | `integer` | NOT NULL |
| `marginal_gain` | `numeric(12,6)` | |
| `observed_at` | `timestamptz` | NOT NULL |

## 11. D5 분석 산출물

### 11.1 `analysis_versions`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `analysis_version` | `text` | PK. `an_` 접두사 |
| `job_role_id` | `text` | NOT NULL, FK → `job_roles` |
| `dataset_version` | `text` | NOT NULL, FK → `dataset_versions` |
| `taxonomy_version_id` | `text` | NOT NULL, FK → `requirement_taxonomy_versions` |
| `knowledge_version` | `text` | FK → `knowledge_versions` |
| `model_version` | `text` | NOT NULL |
| `prompt_version` | `text` | NOT NULL |
| `retrieval_policy_version` | `text` | NOT NULL |
| `metric_policy_version` | `text` | NOT NULL, FK → `metric_policy_versions` |
| `scope_spec` | `jsonb` | NOT NULL |
| `status` | `text` | NOT NULL. `CHECK IN ('draft','running','validating','gated','active','failed','superseded')` |
| `tokens` | `integer` | |
| `cost` | `numeric(12,4)` | |
| `started_at` | `timestamptz` | |
| `ended_at` | `timestamptz` | |

```sql
CREATE INDEX ON analysis_versions (job_role_id, status);
```

### 11.2 `active_analysis_versions`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `job_role_id` | `text` | PK, FK → `job_roles` |
| `analysis_version` | `text` | NOT NULL, FK → `analysis_versions` |
| `activated_at` | `timestamptz` | NOT NULL |

직무를 기본키로 두어 활성 버전이 직무마다 하나임을 강제한다. 전환은 한 행의 `UPDATE`이므로 원자적이다.

### 11.3 `analysis_outputs`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `output_id` | `text` | PK. `out_` 접두사 |
| `analysis_version` | `text` | NOT NULL, FK → `analysis_versions` |
| `job_role_id` | `text` | NOT NULL, FK → `job_roles` |
| `scope_level` | `text` | NOT NULL. `CHECK IN ('overall','cluster','posting')` |
| `scope_id` | `text` | NOT NULL |
| `output_type` | `text` | NOT NULL. `CHECK IN ('statistics','interpretation','strategy','roadmap')` |
| `payload` | `jsonb` | NOT NULL |
| `produced_by_agent` | `text` | NOT NULL |
| `verification_status` | `text` | NOT NULL |
| `generated_at` | `timestamptz` | NOT NULL |

```sql
UNIQUE (analysis_version, scope_level, scope_id, output_type)
CHECK (
  (output_type = 'interpretation' AND produced_by_agent = 'interpretation')
  OR (output_type = 'strategy' AND produced_by_agent = 'strategy')
  OR (output_type = 'roadmap' AND produced_by_agent = 'roadmap')
  OR (output_type = 'statistics' AND produced_by_agent = 'aggregation')
)
```

세 에이전트가 같은 표에 쓰므로 테이블 단위 `GRANT`로 분리하지 못한다. `CHECK` 제약이 `output_type`과 실행 주체의 불일치를 데이터베이스에서 막는다.

### 11.4 `analysis_claims`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `claim_id` | `text` | PK. `claim_` 접두사 |
| `analysis_version` | `text` | NOT NULL, FK → `analysis_versions` |
| `output_id` | `text` | NOT NULL, FK → `analysis_outputs` |
| `claim_type` | `text` | NOT NULL. `CHECK IN ('posting_explicit','statistic','cluster_generalization','inferred_requirement','company_context_signal','strategy','no_deviation')` |
| `requirement_kind` | `text` | `CHECK IN ('explicit_requirement','inferred_requirement','company_context_signal')` |
| `scope_level` | `text` | NOT NULL |
| `scope_id` | `text` | NOT NULL |
| `claim_text` | `text` | NOT NULL |
| `structured_slots` | `jsonb` | NOT NULL |
| `confidence` | `numeric(6,5)` | |
| `confidence_components` | `jsonb` | NOT NULL |
| `verification_status` | `text` | NOT NULL. `CHECK IN ('verified','verified_with_warning','insufficient_evidence','contradicted','policy_violation','schema_invalid','needs_research')` |

```sql
CREATE INDEX ON analysis_claims (analysis_version, scope_level, scope_id);
CREATE INDEX ON analysis_claims (output_id);
```

`confidence_components`는 [에이전트 설계](agent-design.md) 8장의 일곱 구성값을 담는다. 화면 등급은 이 값에서 파생하며 생성 모델의 자기 보고를 담지 않는다.

### 11.5 `analysis_claim_evidence`

주장과 근거 연결의 진실의 원천이다. Provenance 엣지는 이 표에서 파생한다.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `claim_id` | `text` | NOT NULL, FK → `analysis_claims` |
| `support_type` | `text` | NOT NULL. `CHECK IN ('chunk','statistic_fact','graph_path','wiki_revision')` |
| `support_id` | `text` | NOT NULL |
| `relation` | `text` | NOT NULL. `CHECK IN ('supports','contradicts')` |
| `weight` | `numeric(6,5)` | |

```sql
PRIMARY KEY (claim_id, support_type, support_id, relation)
CREATE INDEX ON analysis_claim_evidence (support_type, support_id);
```

### 11.6 `coverage_assertions`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `assertion_id` | `text` | PK |
| `analysis_version` | `text` | NOT NULL, FK → `analysis_versions` |
| `scope_level` | `text` | NOT NULL |
| `scope_id` | `text` | NOT NULL |
| `dimension_id` | `text` | FK → `requirement_dimensions` |
| `population_n` | `integer` | NOT NULL |
| `checked_n` | `integer` | NOT NULL |
| `matched_n` | `integer` | NOT NULL |
| `assertion` | `text` | NOT NULL |
| `coverage_complete` | `boolean` | NOT NULL |

```sql
CHECK (checked_n <= population_n AND matched_n <= checked_n)
CHECK (coverage_complete = (checked_n = population_n))
```

`coverage_complete`를 계산식으로 강제한다. 추가 요구 없음 주장은 이 값이 참일 때만 출력한다.

### 11.7 체크리스트와 로드맵

```text
checklist_concepts
  concept_id PK, job_role_id FK NOT NULL, canonical_title NOT NULL
  kind NOT NULL CHECK IN ('project','story','study')
  UNIQUE (job_role_id, canonical_title)

checklist_items
  item_id PK, concept_id FK NOT NULL, analysis_version FK NOT NULL
  scope_level NOT NULL, scope_id NOT NULL, title NOT NULL, subtitle
  reason NOT NULL, evidence_needed NOT NULL
  channels text[] NOT NULL, required boolean NOT NULL
  is_deviation boolean NOT NULL DEFAULT false
  UNIQUE (analysis_version, scope_level, scope_id, concept_id)
  CHECK (channels <@ ARRAY['essay','portfolio','interview'])

checklist_item_mappings
  from_item_id FK, to_item_id FK, analysis_version FK NOT NULL
  relation NOT NULL CHECK IN ('split_into','merged_from','renamed_to')
  PRIMARY KEY (from_item_id, to_item_id, relation)

roadmap_items
  roadmap_item_id PK, analysis_version FK NOT NULL
  scope_level NOT NULL, scope_id NOT NULL, step_order integer NOT NULL
  phase_label, weeks integer, priority CHECK IN ('vhigh','high','mid')
  title NOT NULL, body, deliverable, reason, tags text[]
  UNIQUE (analysis_version, scope_level, scope_id, step_order)

roadmap_item_fills
  roadmap_item_id FK, concept_id FK
  fill_kind NOT NULL CHECK IN ('dev','normal','study')
  PRIMARY KEY (roadmap_item_id, concept_id)

study_tracks
  track_id PK, analysis_version FK NOT NULL
  scope_level NOT NULL, scope_id NOT NULL, capability_id FK NOT NULL
  phase_label, priority CHECK IN ('vhigh','high','mid','track')
  depth_reference CHECK IN ('foundation','application','tradeoff')
  UNIQUE (analysis_version, scope_level, scope_id, capability_id)
```

사용자 체크 상태를 담는 테이블은 없다. 비로그인 구간에서 체크 상태는 브라우저에 두고 요청 본문으로 전달한다. 키는 `checklist_concepts.concept_id`다.

### 11.8 사용자 입력 공고

사용자가 직접 넣은 공고 원문과 그 공고 하나에 대한 분석 결과를 담는다. 흐름은 [아키텍처](architecture.md) 11장에 있다.

#### `user_postings`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `user_posting_id` | `text` | PK. `up_` 접두사 |
| `content_hash` | `text` | NOT NULL, UNIQUE. SHA-256 hex 64자 |
| `normalized_text` | `text` | NOT NULL |
| `char_length` | `integer` | NOT NULL |
| `job_role_id` | `text` | NOT NULL. 외래키 없음 |
| `detected_by` | `text` | NOT NULL. `CHECK IN ('user_selected','rule','model')` |
| `first_seen_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

```sql
UNIQUE (content_hash)
CHECK (char_length(content_hash) = 64)
```

`content_hash`의 유일 제약이 캐시 키다. 같은 원문이 다시 들어오면 행을 새로 만들지 않는다.

#### `user_posting_analyses`

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| `user_analysis_id` | `text` | PK. `ua_` 접두사 |
| `user_posting_id` | `text` | NOT NULL, FK → `user_postings` |
| `analysis_version` | `text` | NOT NULL. 외래키 없음 |
| `taxonomy_version_id` | `text` | NOT NULL. 외래키 없음 |
| `output_type` | `text` | NOT NULL. `CHECK IN ('interpretation','strategy','roadmap')` |
| `payload` | `jsonb` | NOT NULL |
| `produced_by` | `text` | NOT NULL. `CHECK IN ('agent','seed')` |
| `generated_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

```sql
UNIQUE (user_posting_id, analysis_version, output_type)
CREATE INDEX ON user_posting_analyses (user_posting_id, output_type);
```

두 표는 통계 테이블과 외래키로 연결하지 않는다. 사용자 입력이 모집단에 섞이면 모든 지표의 분모가 오염되기 때문이다.

`job_role_id`·`analysis_version`·`taxonomy_version_id`는 값만 담는다. 어느 활성 버전을 기준 삼아 만든 결과인지 기록하되 버전 표를 향한 외래키를 두지 않아, 사용자 입력이 분석 버전의 계보에 들어가지 않는다.

## 12. 계측

```text
retrieval_runs
  retrieval_run_id PK, analysis_version FK NOT NULL
  agent_name NOT NULL, agent_run_id FK NOT NULL, started_at NOT NULL

retrieval_queries
  query_id PK, retrieval_run_id FK NOT NULL
  subquery_type NOT NULL, query_text NOT NULL
  strategy NOT NULL CHECK IN ('keyword','vector','graph','sql')
  filters jsonb NOT NULL

retrieval_candidates
  candidate_id PK, query_id FK NOT NULL
  target_type NOT NULL CHECK IN ('chunk','statistic_fact','graph_path','wiki_revision')
  target_id NOT NULL, strategy NOT NULL, strategy_rank integer NOT NULL
  lexical_score, vector_score, graph_score, fusion_score, rerank_score numeric(12,6)
  selected boolean NOT NULL, rejection_reason
  INDEX (query_id, fusion_score DESC)

evidence_sets
  evidence_set_id PK, retrieval_run_id FK NOT NULL
  objective_id NOT NULL, optimization_policy_version NOT NULL

evidence_set_members
  evidence_set_id FK, candidate_id FK, slot_name NOT NULL
  PRIMARY KEY (evidence_set_id, candidate_id)

evidence_usages
  usage_id PK, candidate_id FK NOT NULL
  used_claim_id FK NULL
  usage_type NOT NULL CHECK IN
    ('supports_claim','contradicts_claim','verification_only',
     'normalization','planning','coverage_check','unused')
  recorded_at NOT NULL
  CHECK (usage_type NOT IN ('supports_claim','contradicts_claim')
         OR used_claim_id IS NOT NULL)

agent_runs
  agent_run_id PK, analysis_version FK NOT NULL
  agent_name NOT NULL, objective_id, iteration integer NOT NULL
  stop_reason CHECK IN ('slots_filled','no_new_evidence','frontier_exhausted',
    'budget_exhausted','repair_limit','no_progress','explicit_failure')
  tokens integer, cost numeric(12,4), started_at, ended_at

agent_run_steps
  step_id PK, agent_run_id FK NOT NULL, step_name NOT NULL
  autonomy_level CHECK IN ('A0','A1','A2','A3')
  started_at, ended_at

tool_calls
  call_id PK, agent_run_id FK NOT NULL, tool_name NOT NULL
  arguments jsonb, latency integer, error

research_requests
  request_id PK, requested_by_run_id FK, analysis_version FK NOT NULL
  goal NOT NULL, needed_evidence_type NOT NULL, scope_level NOT NULL, scope_id
  status NOT NULL CHECK IN ('open','scheduled','fulfilled','rejected','expired')
  priority integer NOT NULL, fulfilled_by_snapshot_ids text[]
  resolved_at
  INDEX (status, priority DESC)

verification_results
  result_id PK, analysis_version FK NOT NULL
  target_type NOT NULL, target_id NOT NULL, check_name NOT NULL
  autonomy_level NOT NULL CHECK IN ('A0','A1')
  verdict NOT NULL CHECK IN ('pass','fail','skip')
  severity NOT NULL CHECK IN ('blocking','warning','info')
  reason_code, repair_action, judge_model, detail jsonb
  INDEX (analysis_version, verdict, severity)

repair_orders
  order_id PK, agent_run_id FK NOT NULL, target_claim_id FK
  failed_check NOT NULL, reason NOT NULL
  action NOT NULL CHECK IN ('requery','add_counterevidence','swap_evidence','drop_claim',
    'narrow_scope','lower_confidence','recompute_stat','fix_identifier',
    'request_research')
  missing_evidence jsonb, requery_hint, round integer NOT NULL
```

`evidence_usages.used_claim_id`는 nullable이다. `CHECK`가 주장을 지지하거나 반박하는 용도일 때만 연결을 강제한다.

`citation_utilization`은 `usage_type <> 'unused'`인 후보의 비율로 계산한다.

## 13. 평가

```text
evaluation_sets
  eval_set_id PK, job_role_id FK NOT NULL, source_file NOT NULL, loaded_at NOT NULL

evaluation_cases
  case_id PK, eval_set_id FK NOT NULL, posting_id FK
  case_type NOT NULL CHECK IN ('mention_extraction','dimension_assignment',
    'interpretation','strategy_linkage','coverage')

evaluation_expected_items
  expected_id PK, case_id FK NOT NULL
  expected_field NOT NULL, expected_value jsonb NOT NULL, rubric

evaluation_runs
  eval_run_id PK, eval_set_id FK NOT NULL
  analysis_version FK NOT NULL, started_at NOT NULL

evaluation_metrics
  eval_run_id FK, metric_name NOT NULL, value numeric(12,6) NOT NULL
  PRIMARY KEY (eval_run_id, metric_name)

evaluation_failures
  failure_id PK, eval_run_id FK NOT NULL, case_id FK NOT NULL
  expected_id FK, observed_value jsonb, reason
```

평가 세트의 기대 차원은 분류체계 버전과 독립적인 사람 기준이다. `evaluation_expected_items`는 `requirement_dimensions`를 외래키로 참조하지 않는다.

## 14. 삭제와 보존

| 대상 | 정책 |
| --- | --- |
| `source_snapshots` | 트리거로 `UPDATE`·`DELETE` 차단 |
| `source_observations` | 트리거로 `UPDATE`·`DELETE` 차단 |
| 그 외 계보 대상 | 외래키 `ON DELETE RESTRICT` |
| `graph_paths` | 캐시. 자유롭게 삭제·재계산 |
| `knowledge_edges`의 파생 묶음 | 정규 테이블에서 재빌드 가능 |

접근할 수 없게 된 자료도 스냅샷과 관찰 기록을 보존한다.

## 15. 관련 문서

- [지식·저장 구조](knowledge-schema.md)
- [온톨로지 v1](ontology-v1.md)
- [지표 명세](metric-spec.md)
- [권한 매트릭스](permission-matrix.md)
- [아키텍처](architecture.md)
