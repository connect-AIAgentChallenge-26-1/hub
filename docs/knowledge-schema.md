# CareerSignal 지식·저장 구조

## 1. 문서 목적

이 문서는 CareerSignal이 다루는 데이터의 계층, 테이블을 나눈 이유, 지식 그래프, Wiki, 근거 계보의 정의를 담는다. 이 문서는 데이터 구조의 기준 문서이며, 다른 문서는 구조를 다시 설명하지 않고 이 문서를 참조한다.

컬럼의 타입, 기본키, 외래키, 인덱스, 제약은 [ERD](erd.md)가 소유한다. 이 문서의 `text` 블록은 어떤 값이 어느 테이블에 속하는지를 보이는 요약이며 물리 정의가 아니다. 두 문서가 어긋나면 ERD를 따른다.

실행 구조와 버전 활성화는 [아키텍처](architecture.md), 에이전트의 입출력과 검증은 [에이전트 설계](agent-design.md), 요구 분류체계의 발견과 지표 정의는 [통계 모델](statistics-model.md), 자료의 출처와 허용 용도는 [데이터 전략](data-strategy.md)에서 다룬다.

## 2. 데이터 성숙도

데이터는 원본에서 사용자 제공 결과까지 D0부터 D6까지 일곱 계층을 거친다. D3은 생성 순서가 다른 두 묶음으로 갈린다. 각 계층은 앞 계층에 대한 계보를 가진다.

| 계층 | 데이터 | 버전 축 | 생산 |
| --- | --- | --- | --- |
| D0 | 변경하지 않는 source snapshot | `dataset_version` | 데이터 수집 에이전트 |
| D1 | source chunk와 구조적 위치, 검색 인덱스 | `dataset_version` | 인덱싱 파이프라인 |
| D2 | 원문에 근거한 mention과 observation | `dataset_version` | 통계 분석 에이전트 |
| D3a | 분류체계, 정규화 할당, 지식 그래프 | `taxonomy_version_id`, `knowledge_version` | 통계 분석·지식 구축 에이전트 |
| D4 | 집계 통계, 패턴, 깊이 프로파일 | `analysis_version` | 집계 파이프라인 |
| D3b | Wiki | `knowledge_version` | 지식 구축 에이전트 |
| D5 | 해석·전략·로드맵 주장 | `analysis_version` | 해석·전략·로드맵 에이전트 |
| D6 | 활성화된 사용자 제공 결과 | `analysis_version` | 통합 Verifier |

D3a와 D3b는 지식을 정규화하는 같은 성격의 계층이나 생성 순서가 다르다. D3a는 집계의 입력이고, D3b는 집계의 결과를 입력으로 받는다. Wiki의 생성 대상을 통계적 우선순위로 판정하므로 D3b는 D4 뒤에 온다.

지식 그래프는 할당만 있으면 구축할 수 있으므로 D3a에 둔다. 엣지의 `weight`는 통계에서 계산하는 후행 값이며 D4 이후에 채운다. `weight`가 비어 있는 동안 경로 탐색은 가능하고 순위만 정해지지 않는다.

사용자의 체크 상태와 그에 따른 재조합 결과는 데이터 성숙도 계층에 속하지 않는다. 이는 Express가 요청 시점에 계산하는 런타임 결과다.

사용자가 직접 입력한 공고(`user_postings`)와 그 공고 하나에 대한 분석 결과(`user_posting_analyses`)도 어느 계층에도 속하지 않는다. 두 표는 통계 테이블과 외래키로 잇지 않으며 지표의 모집단 밖에 있다. 사용자 입력이 모집단에 섞이면 지표의 분모가 오염된다. 컬럼은 [ERD](erd.md) 11.8, 흐름은 [아키텍처](architecture.md) 11장에 있다.

`legacy_posting_samples`는 서빙 폴백이며 지식 계층에 속하지 않는다. 공고 하나의 화면 표시값을 한 행에 펼친 평면 표이고 Express의 폴백 조회만 읽는다. 분석의 모집단은 `posting_versions`가 세고 이 표는 세지 않는다. 컬럼은 [ERD](erd.md) 4.7, 결정 근거는 [ADR 0014](adr/0014-legacy-posting-samples.md)에 있다.

```mermaid
flowchart TD
    D0[("D0 Source snapshot<br/>변경하지 않는 증거")]
    D1[("D1 Chunk 구조적 위치<br/>lexical vector index")]
    D2[("D2 Grounded mention<br/>분류체계 무관")]
    D3A[("D3a Taxonomy Assignment<br/>Knowledge Graph")]
    D4[("D4 집계 통계 패턴<br/>깊이 프로파일")]
    D3B[("D3b Wiki")]
    D5[("D5 해석 전략 로드맵 주장")]
    D6(["D6 활성 사용자 제공 결과"])

    D0 -->|"인덱싱 파이프라인"| D1
    D1 -->|"mention 추출"| D2
    D2 -->|"분류체계 발견 승격 할당 그래프 구축"| D3A
    D3A -->|"집계 파이프라인"| D4
    D4 -->|"생성 대상 판정 깊이 기준"| D3B
    D4 -->|"엣지 weight 채움"| D3A
    D3A -->|"그래프 탐색"| D5
    D3B -->|"깊이 기준 참조"| D5
    D4 -->|"해석 전략 로드맵"| D5
    D5 -->|"통합 검증"| D6

    D6 -.->|"계보 역추적"| D5
    D5 -.->|"계보 역추적"| D4
    D5 -.->|"계보 역추적"| D1
    D4 -.->|"계보 역추적"| D3A
    D3A -.->|"계보 역추적"| D2
    D2 -.->|"계보 역추적"| D1
    D1 -.->|"계보 역추적"| D0
```

| 도형 | 의미 |
| --- | --- |
| 원통 | 저장소와 데이터 계층 |
| 스타디움 | 사용자 접점과 종료 상태 |

D0은 변경하지 않는 증거 snapshot이며 시스템 산출물의 최종 계보 기준이다. 출처의 내용이 사실임을 보장하지는 않는다. 출처의 신뢰도와 허용 용도는 별도의 평가로 관리한다.

## 3. D0 원본

원본은 논리적 출처, 내용 snapshot, 관찰 사실, 출처 평가의 네 가지로 나눈다. snapshot의 내용은 변경하지 않으며, 시간이 지나며 달라지는 정보는 별도 테이블에 기록한다.

| 테이블 | 책임 |
| --- | --- |
| `sources` | URL과 발행자로 식별되는 논리적 출처 |
| `source_snapshots` | 특정 시점에 수집한 내용. payload 불변 |
| `source_observations` | 수집 시도와 결과의 append-only 이벤트 |
| `source_assessments` | 자료 계층·허용 용도의 버전별 평가 |

### 3.1 `sources`

```text
source_id
source_type
url
publisher
author
robots_policy
license_note
job_role_ids
company_id
first_seen_at
```

### 3.2 `source_snapshots`

```text
snapshot_id
source_id
content_hash
raw_content
published_at
fetched_at
dataset_version
supersedes_snapshot_id
```

`content_hash`가 같은 내용은 새 snapshot을 만들지 않는다. 내용이 달라지면 새 snapshot을 만들고 `supersedes_snapshot_id`로 이전 snapshot을 가리킨다.

`raw_content`에 대한 `UPDATE`와 `DELETE`는 데이터베이스 트리거로 차단한다. 정정은 새 snapshot 생성으로만 표현한다.

### 3.3 `source_observations`

```text
observation_id
snapshot_id
observed_at
fetch_status
canonical_url
http_status
notes
```

접근할 수 없게 된 자료도 기존 분석의 계보 추적을 위해 snapshot과 관찰 기록을 보존한다.

관찰은 특정 snapshot에 대한 관찰이다. 내용을 한 번도 얻지 못한 출처에는 관찰을 기록하지 않는다. URL을 알지만 내용이 없는 상태는 snapshot이 없는 `sources` 행이 표현하고, 수집 시도와 실패는 실행 궤적의 도구 호출 기록이 담는다.

이 경계가 표의 뜻을 좁게 유지한다. `source_observations`는 자료의 사실을, `tool_calls`는 실행의 사실을 담는다. 출처를 스스로 발견하는 수집 에이전트는 다수의 후보를 시도하므로, 두 표를 합치면 계보 추적용 표가 탐색 기록으로 덮인다.

### 3.4 `source_assessments`

```text
assessment_id
snapshot_id
source_tier
allowed_uses
reliability_score
assessment_version
assessed_at
assessed_by_run_id
```

`source_tier`와 `allowed_uses`의 정의는 [데이터 전략](data-strategy.md)을 따른다. 평가 기준이 바뀌면 새 `assessment_version`으로 다시 평가하고 이전 평가를 보존한다.

### 3.5 공고

```text
postings
  posting_id, source_id, company_id, job_role_id, first_posted_at

posting_versions
  posting_version_id, posting_id, snapshot_id
  title, career_label_raw, edu_label_raw, entry_label_raw, entry_label
  posted_at, closed_at, dataset_version
```

기업군은 공고 버전의 속성이 아니다. 회사와 기업군의 소속은 `company_cluster_memberships`가 유일한 원천이며, 집계는 실행 봉투의 `as_of_date` 기준으로 소속을 해석한다. 같은 `as_of_date`로 재실행하면 같은 소속을 얻으므로 재현성이 유지된다.

```text
company_cluster_memberships
  company_id, cluster_id, valid_from, valid_to
```

공고의 수정과 마감은 `posting_versions`로 표현한다. 분석의 모집단은 항상 `posting_version` 단위로 센다.

## 4. D1 검색 표현

원문을 검색 단위로 나누고 문맥과 인덱스를 붙인다.

```mermaid
flowchart LR
    A[/"원문 수신"/] --> B["content_hash 계산"]
    B --> C{"기존 해시와 동일"}
    C -->|"동일"| D["snapshot 재사용"]
    C -->|"상이"| E["새 snapshot insert"]
    E --> F["dataset 소속 등록"]
    D --> F
    F --> G["섹션 분할"]
    G --> H["메타데이터 문맥 생성"]
    H --> I{"장문 여부"}
    I -->|"장문"| J{{"문맥 요약 추가"}}
    I -->|"단문"| K["embedding_text 조립"]
    J --> K
    K --> L["임베딩 생성"]
    L --> M["tsvector 생성"]
    M --> N[("source_chunks chunk_embeddings")]
```

| 도형 | 의미 |
| --- | --- |
| 평행사변형 | 외부 자료와 입력 이벤트 |
| 사각형 | 단일 처리 단계 |
| 마름모 | 분기와 판정 |
| 육각형 | 생성 모델을 쓰는 단계 |
| 원통 | 저장소와 데이터 계층 |

### 4.1 `source_chunks`

```text
chunk_id
snapshot_id
section
ordinal
text
context
embedding_text
tsv
token_count
dataset_version
```

`context`는 회사, 기업군, 문서 유형, 섹션, 직무, 게시 시점을 담는 구조화 값이며 메타데이터에서 결정적으로 생성한다. 문서 자체의 장기 문맥이 필요한 경우에만 생성 모델로 요약을 덧붙인다.

`embedding_text`는 `context`를 접두로 붙인 문자열이며 임베딩과 키워드 검색의 입력이다. 섹션 정보가 사라진 청크는 필수와 우대를 구분하지 못하므로 문맥을 분리해 보관한다.

### 4.2 `chunk_embeddings`

```text
chunk_id
embedding_model
embedding_dimension
embedding
embedding_version
```

임베딩을 별도 테이블에 두어 모델을 교체할 때 청크를 다시 만들지 않는다. 여러 임베딩 모델의 비교 평가도 같은 구조로 수행한다.

## 5. D2 근거 기반 mention

공고에 나타난 요구 표현을 분류체계와 무관하게 먼저 추출한다. 분류체계가 확정되기 전에도 원문 근거는 확보할 수 있으며, 새 표현을 기존 분류에 강제로 넣지 않는다.

```text
requirement_mentions
  mention_id
  posting_version_id
  snapshot_id
  chunk_id
  raw_expression
  evidence_span_start
  evidence_span_end
  stated_requiredness
  section
  extraction_confidence
  extraction_run_id
  dataset_version
```

`stated_requiredness`는 공고가 사용한 표현을 그대로 담는다. 필수·우대·주요업무의 판정은 원문 라벨을 따르고 해석하지 않는다.

`raw_expression`은 원문 문장의 부분 문자열이며 `evidence_span_start`와 `evidence_span_end`로 위치를 고정한다. 위치가 원문과 일치하지 않는 mention은 검증에서 폐기한다.

```text
chunk_extractions
  chunk_id
  dataset_version
  extraction_run_id
  mention_count
  extracted_at
```

추출을 마친 청크를 표현이 나왔는지와 무관하게 기록한다. `mention_count = 0`은 정상값이다. 회사 소개·복리후생·전형 절차 청크에는 요구 표현이 없으므로, `requirement_mentions`의 행을 처리 여부의 근거로 삼으면 그 청크가 매 실행마다 다시 대상이 된다. 증분 재실행의 대상 조회가 이 표를 읽는다.

## 6. D3a 분류체계와 할당

### 6.1 할당

```text
posting_requirement_assignments
  assignment_id
  mention_id
  taxonomy_version_id
  dimension_id
  normalized_label
  depth_level
  assignment_confidence
  assignment_method
  verifier_status
```

집계의 키는 `dimension_id`와 `taxonomy_version_id`다. 분류체계 버전이 바뀌면 해당 데이터셋의 mention 전체를 다시 할당한다.

`depth_level`은 `foundation`, `application`, `tradeoff` 중 하나다. 정의는 8장을 따른다.

### 6.2 분류체계 테이블

```text
requirement_taxonomies            직무별 분류체계
requirement_taxonomy_versions     버전과 발행 시점
requirement_dimensions            차원 정체성
requirement_dimension_versions    버전별 정의 라벨 상태
requirement_aliases               별칭
requirement_dimension_relations   broader narrower related
requirement_candidates            승격 전 후보
requirement_candidate_mentions    후보의 근거 mention
requirement_candidate_decisions   승격 결정 기록
capabilities                      역량
capability_dimension_links        차원과 역량 연결
standards                         외부 표준 항목
```

`requirement_dimension_versions`는 외부 표준 연결을 상태로 관리한다.

```text
internal_canonical_label
display_label
standard_mapping_status     exact | broader | narrower | related | unmapped
standard_id
mapping_confidence
mapping_evidence
review_status
role_boundary_eligible
```

발견된 시장 어휘를 외부 표준 용어로 치환하지 않는다. 표준은 직무 간 비교의 기준점으로 연결하고, 연결의 성격을 `standard_mapping_status`로 표시한다.

차원 후보의 발견, 관계 판정, 승격 절차는 [통계 모델](statistics-model.md)에서 정의한다.

## 7. D3a 지식 그래프

그래프는 두 개의 논리 층으로 나눈다. 하나는 직무 지식의 연결을 표현하고, 다른 하나는 산출물이 만들어진 경로를 표현한다. 두 층은 같은 노드·엣지 테이블에 `graph_layer` 속성으로 구분해 저장한다.

### 7.1 Semantic Knowledge Graph

정규화가 끝난 도메인 관계를 표현한다. 생성 시점에 따라 두 묶음으로 나눈다.

#### 7.1.1 사전 semantic

D3a에서 지식 구축 에이전트가 생성한다. 해석·전략·로드맵 에이전트의 탐색 입력이다. 이 묶음의 노드·엣지 유형과 허용 연결은 [온톨로지 v1](ontology-v1.md) 2장에 있다.

`BELONGS_TO_CLUSTER`는 `company_cluster_memberships`에서 파생한 투영이다. 엣지의 `valid_from`과 `valid_to`는 membership의 값을 그대로 옮긴다.

#### 7.1.2 사후 semantic

D5 산출물이 저장될 때 계보 기록 파이프라인이 생성한다. 유형 목록은 [온톨로지 v1](ontology-v1.md) 2장에서 생성 시점이 `D5 이후`인 항목이다.

사후 semantic은 이를 생성한 에이전트의 같은 실행 안에서는 사용할 수 없다. 전략 에이전트는 `ProofArtifact`를 만드는 주체이므로 `PROVEN_BY`를 탐색 입력으로 받지 않는다. 이 묶음은 화면의 근거 경로 표시와 다음 분석 버전의 탐색에 사용한다.

### 7.2 Provenance Lineage Graph

산출물의 생성 경로를 표현한다. 계보 기록 파이프라인이 각 계층의 산출물이 저장될 때 결정적으로 기록한다. 판단이 개입하지 않으므로 에이전트가 쓰지 않는다.

이 층의 엣지는 관계형 테이블에서 빌드한 파생 표현이다. 주장과 근거의 원천은 `analysis_claim_evidence`이며 `SUPPORTED_BY`와 `CONTRADICTED_BY`는 이 테이블에서 만든다. 검증의 근거 위치 검사와 근거 함의 검사는 엣지가 아니라 테이블을 검사한다. 엣지에서 테이블로 향하는 역방향 갱신은 없다. `graph_paths`가 `knowledge_edges`에 대해 갖는 지위와 같다.

이 층의 노드·엣지 유형과 허용 연결은 [온톨로지 v1](ontology-v1.md) 3장에 있다.

원문 표현에서 차원으로 이어지는 정규화는 계보이므로 `ASSIGNED_TO`로 Provenance 층에 기록한다. Semantic 층에는 정규화가 끝난 관계만 넣는다.

### 7.3 층별 생성 주체와 시점

| 묶음 | 생성 | 시점 | 진실의 원천 |
| --- | --- | --- | --- |
| 사전 semantic | 지식 구축 에이전트 | D3a | `knowledge_edges` |
| 사후 semantic | 계보 기록 파이프라인 | D5 산출물 저장 직후 | 산출물 정규 테이블 |
| Provenance | 계보 기록 파이프라인 | 각 계층 산출물 저장 직후 | 산출물 정규 테이블 |

Provenance 엣지와 사후 semantic 엣지는 정규 테이블의 외래키를 그래프 표현으로 옮긴 것이다. `analysis_claim_evidence`와 `SUPPORTED_BY`가 같은 사실을 담을 때 진실의 원천은 `analysis_claim_evidence`이며, 엣지는 경로 탐색을 위한 파생 표현이다. 두 값이 어긋나면 검증에서 엣지를 폐기하고 다시 기록한다.

### 7.4 노드·엣지 테이블

```text
knowledge_nodes
  node_id, graph_layer, node_type, ref_table, ref_id, label
  ontology_version, dataset_version, taxonomy_version_id, analysis_version

knowledge_edges
  edge_id, graph_layer, edge_type, src_node_id, dst_node_id
  weight, evidence_id, produced_by_run_id, verification_status
  ontology_version, dataset_version, taxonomy_version_id, analysis_version
  valid_from, valid_to
```

노드와 엣지의 유형은 `ontology_versions`에 등록한 목록으로 제한한다. 등록되지 않은 유형과 허용되지 않은 연결은 검증에서 폐기한다.

```text
ontology_versions
  ontology_version, graph_layer            복합 기본키
  node_types, edge_types, allowed_connections
  required_evidence_by_edge_type, effective_from
```

`knowledge_nodes`와 `knowledge_edges`는 `(ontology_version, graph_layer)` 두 컬럼으로 이 표를 참조한다.

`taxonomy_version_id`는 nullable이다. 분류체계에 의존하는 노드·엣지만 채우고 나머지는 null로 둔다. 의존하는 노드 유형은 `RequirementDimension`과 `Technology` 둘이다. 엣지의 의존 여부는 [온톨로지 v1](ontology-v1.md) 2.2·3.2의 `taxonomy_version_id` 열이 정한다.

분류체계 버전을 발행하면 의존 노드·엣지를 재구축한다. 이 규칙이 있어야 `graph_paths`의 네 버전 캐시 키가 실제 의존 관계와 일치한다.

`weight`는 통계 지표에서 계산한 값을 담아 경로 순위 계산에 사용한다.

### 7.5 `graph_paths`

```text
graph_paths
  path_id, path_type, node_sequence, edge_sequence
  taxonomy_version_id, knowledge_version, analysis_version, graph_policy_version
  computed_at
```

`graph_paths`는 자주 조회하는 경로의 캐시다. 진실의 원천은 `knowledge_edges`이며 경로는 버전이 고정된 엣지에서 계산한다. 네 개의 버전이 캐시 키에 포함되므로 분류체계나 분석 버전이 바뀌면 이전 경로를 재사용하지 않는다.

### 7.6 근거 경로

로드맵 항목에서 공고 원문까지의 경로는 두 층을 잇는 계보다.

```text
RoadmapItem
  → FILLS → ChecklistItem
  → DERIVED_FROM → AnalysisClaim
  → SUPPORTED_BY → StatisticFact
  → COMPUTED_FROM → Assignment
  → ASSIGNED_TO 역방향 → RequirementMention
  → EVIDENCED_BY → Chunk
  → PART_OF → SourceSnapshot
```

## 8. D3b Wiki

### 8.1 책임

Wiki는 역량을 어느 깊이까지 다뤄야 하는지의 기준을 정의한다. 통계는 무엇을 얼마나 자주 요구하는지, 지식 그래프는 개념이 어떻게 연결되는지, 청크는 원문에 무엇이 적혀 있는지를 담당한다. 깊이의 기준은 여러 자료를 종합해야 얻어지며 Wiki가 이를 담당한다.

Wiki는 개별 공고를 복제하지 않는다. 공고 원문은 D0에 있다.

### 8.2 깊이 등급

| 등급 | 의미 |
| --- | --- |
| `foundation` | 개념·용어·기본 작동 원리를 이해한다 |
| `application` | 코드·도구·프로젝트에 적용한다 |
| `tradeoff` | 설계 선택, 트레이드오프, 장애·운영 상황을 설명한다 |

등급의 구조는 직무와 무관하게 고정한다. 각 등급의 판정 기준 문장은 직무별로 발견하고 버전으로 관리한다.

### 8.3 테이블

```text
wiki_pages
  page_id, capability_id, knowledge_version, status

wiki_revisions
  revision_id, page_id
  definition, why_required
  depth_criteria, prerequisites
  common_misconceptions, interview_verification, learning_sequence
  produced_by_run_id

wiki_evidence
  revision_id, field_name, chunk_id, source_tier
```

모든 필드는 `wiki_evidence`에 근거를 가진다. 근거가 없는 필드는 저장하지 않는다.

### 8.4 생성 조건

```text
활성 capability
AND 필수 필드의 근거 충족
AND (통계적 우선순위 상위 OR research_request 존재)
```

필수 필드는 `definition`, `why_required`, `depth_criteria` 셋이다. 정의가 없으면 무엇에 대한 기준인지, 요구 이유가 없으면 그 기준을 왜 두는지 말할 수 없고, 깊이 기준은 8.1의 책임 자체다. 나머지 네 필드는 근거가 있으면 담고 없으면 비운다.

모든 역량에 대해 Wiki를 만들지 않는다. 생성 조건은 통계 결과와 조사 요청으로 판정하며 하위 산출물의 참조 여부를 조건으로 사용하지 않는다.

### 8.5 필드별 허용 근거

| 필드 | 허용 근거 |
| --- | --- |
| `definition` | 공공 표준, 공식 문서 |
| `why_required` | 채용공고 통계, 회사 공식 자료 |
| `depth_criteria` | 공공 표준, 회사 공식 자료, 검증된 외부 전문가 자료 |
| `prerequisites` | 공공 표준, 공식 학습 자료 |
| `common_misconceptions` | 검증된 외부 전문가 자료 |
| `interview_verification` | 검증된 외부 전문가 자료 |
| `learning_sequence` | 공식 학습 자료, 검증된 실무 자료 |

자료 계층은 품질의 단일 순서가 아니라 허용 용도의 구분이다. 외부 전문가 자료는 준비 방법과 면접 관점에 사용하고 기업의 요구사항 집계에 사용하지 않는다.

### 8.6 기대 깊이

특정 직무·대상군·기업군·기간에서 실제로 기대되는 깊이는 Wiki의 고정 속성이 아니라 분석 산출물이다. `capability_depth_profiles`는 D4 계층에 속하며 집계 파이프라인이 `depth_distribution` 지표에서 생성한다. Wiki가 참조하는 입력이므로 정의를 이 장에 둔다.

```text
capability_depth_profiles
  profile_id, capability_id, taxonomy_version_id
  scope_level, scope_id, entry_segment, period_id
  depth_distribution, expected_depth
  sample_size, evidence_support, confidence
  analysis_version
```

Wiki는 각 깊이 등급이 무엇을 의미하는지를 저장하고, `capability_depth_profiles`는 어느 등급이 기대되는지를 저장한다.

## 9. D4·D5 분석 산출물

```text
analysis_versions
  analysis_version, job_role_id, dataset_version
  taxonomy_version_id, knowledge_version
  model_version, prompt_version, retrieval_policy_version, metric_policy_version
  scope_spec, status, tokens, cost, started_at, ended_at

active_analysis_versions
  job_role_id, analysis_version, activated_at

analysis_outputs
  output_id, analysis_version, job_role_id
  scope_level, scope_id, output_type, payload
  produced_by_agent, verification_status, generated_at

statistics_facts
  fact_id, analysis_version, metric_family, metric_policy_version
  scope_level, scope_id, entry_segment, period_id
  dimension_id, secondary_dimension_id
  measure, numerator, denominator, value
  sample_size, sample_status, uncertainty

analysis_claims
  claim_id, analysis_version, output_id
  claim_type, scope_level, scope_id
  claim_text, structured_slots
  confidence, confidence_components, verification_status

analysis_claim_evidence
  claim_id, support_type, support_id, relation, weight

coverage_assertions
  assertion_id, analysis_version, scope_level, scope_id
  dimension_id, population_n, checked_n, matched_n
  assertion, coverage_complete
```

`analysis_outputs.payload`는 화면 계약 형태의 JSONB다. 검증·검색·연결에 필요한 값은 정규 테이블에 함께 저장한다.

`coverage_assertions`는 추가 요구 없음 주장의 근거다. `coverage_complete`가 참이 아니면 추가 요구 없음을 출력하지 않고 판단 근거 부족을 출력한다.

### 9.1 체크리스트와 로드맵

```text
checklist_concepts
  concept_id, job_role_id, canonical_title, kind

checklist_items
  item_id, concept_id, analysis_version
  scope_level, scope_id, title, subtitle
  reason, evidence_needed, channels, required, is_deviation

checklist_item_mappings
  from_item_id, to_item_id, relation, analysis_version

roadmap_items
  roadmap_item_id, analysis_version, scope_level, scope_id
  step_order, phase_label, weeks, priority
  title, body, deliverable, reason, tags

roadmap_item_fills
  roadmap_item_id, concept_id, fill_kind

study_tracks
  track_id, analysis_version, scope_level, scope_id
  capability_id, phase_label, priority, depth_reference
```

사용자의 체크 상태는 `checklist_concept_id`에 연결한다. 분석 버전이 바뀌어 문구가 달라져도 개념 식별자가 유지되므로 체크 상태가 잘못된 항목에 붙지 않는다. 개념의 분리·통합은 `checklist_item_mappings`로 표현한다.

## 10. 지표 정책

```text
metric_templates
  metric_family, formula_version, input_arity, output_unit

metric_template_parameters
  metric_family, parameter_name, parameter_type, required

metric_policy_versions
  metric_family, formula_version, minimum_n
  suppression_policy, uncertainty_method, effective_from

dimension_metric_applicability
  taxonomy_version_id, dimension_id, metric_family, applicable, reason
```

지표 family의 수식, 적용 대상, 표본 상태 판정은 [통계 모델](statistics-model.md)에서 정의한다. 화면 블록과 지표의 연결도 같은 문서가 다룬다.

## 11. 계측

```text
retrieval_runs
  retrieval_run_id, analysis_version, agent_name, agent_run_id, started_at

retrieval_queries
  query_id, retrieval_run_id, subquery_type, query_text, strategy, filters

retrieval_candidates
  candidate_id, query_id, target_type, target_id
  strategy, strategy_rank
  lexical_score, vector_score, graph_score, fusion_score, rerank_score
  selected, rejection_reason

evidence_sets
  evidence_set_id, retrieval_run_id, objective_id, optimization_policy_version

evidence_set_members
  evidence_set_id, candidate_id, slot_name

evidence_usages
  usage_id, candidate_id, used_claim_id
  usage_type, recorded_at

agent_runs
  agent_run_id, analysis_version, agent_name, objective_id
  iteration, stop_reason, tokens, cost, started_at, ended_at

agent_run_steps
  step_id, agent_run_id, step_name, autonomy_level, started_at, ended_at

tool_calls
  call_id, agent_run_id, tool_name, arguments, latency, error

research_requests
  request_id, requested_by_run_id, analysis_version
  goal, needed_evidence_type, scope_level, scope_id
  status, priority, fulfilled_by_snapshot_ids, resolved_at

verification_results
  result_id, analysis_version, target_type, target_id
  check_name, autonomy_level, verdict, severity
  reason_code, repair_action, judge_model, detail

repair_orders
  order_id, agent_run_id, target_claim_id
  failed_check, reason, action, missing_evidence, requery_hint, round

saturation_observations
  observation_id, analysis_version, job_role_id, scope_id
  posting_count, new_candidate_count, cumulative_dimension_count
  marginal_gain, observed_at
```

`evidence_usages.usage_type`의 값 목록과 계측에서의 쓰임은 [아키텍처](architecture.md) 14.2에 있다.

`used_claim_id`는 nullable이다. `usage_type`이 `planning`, `normalization`, `coverage_check`, `verification_only`, `unused`인 경우 대상 주장이 없다.

## 12. 평가

```text
evaluation_sets
  eval_set_id, job_role_id, source_file, loaded_at

evaluation_cases
  case_id, eval_set_id, posting_id, case_type

evaluation_expected_items
  expected_id, case_id, expected_field, expected_value, rubric

evaluation_runs
  eval_run_id, eval_set_id, analysis_version, started_at

evaluation_metrics
  eval_run_id, metric_name, value

evaluation_failures
  failure_id, eval_run_id, case_id, expected_id, observed_value, reason
```

평가 세트의 원본은 `docs/eval/`의 JSON 파일이며 사람이 확정한다. 데이터베이스는 평가 실행과 결과 비교에 사용한다.

평가 세트의 기대 차원은 분류체계 버전과 독립적인 사람 기준이며, 차원 승격 심사의 채점 기준이 된다.

## 13. 접근 권한

구성요소별 읽기·쓰기 범위와 강제 수단 네 층은 [권한 매트릭스](permission-matrix.md)가 소유한다. 계층별 산출물을 어느 구성요소가 쓰는지, 표를 공유하는 구성요소를 무엇으로 가르는지도 같은 문서에 있다.

데이터베이스 스키마의 기준은 `agent/migrations/`다. 공유 데이터베이스의 스키마를 두 서비스가 각각 정의하지 않는다. Express는 조회 계약만 따른다. 근거는 [ADR 0006](adr/0006-migration-ownership.md)에 있다.

## 14. 2차·3차 자료의 사용 범위

자료 계층별 허용 용도는 [데이터 전략](data-strategy.md) 3장에 있다.

회사 공식 자료에서 반복되는 주제는 그 회사의 맥락 신호이며 해당 공고의 명시 요구사항과 구분한다. 구분의 정의는 [데이터 전략](data-strategy.md)을 따른다.

## 15. 관련 문서

- [아키텍처](architecture.md)
- [에이전트 설계](agent-design.md)
- [통계 모델](statistics-model.md)
- [데이터 전략](data-strategy.md)
- [개발 백로그](backlog.md)
- [검증 체크리스트](checklist.md)
