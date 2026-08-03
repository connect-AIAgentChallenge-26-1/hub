# CareerSignal 지표 명세

## 1. 문서 목적

이 문서는 지표 family 일곱 종과 시간 연산자의 분자·분모, 중복 제거 단위, 결측 처리, 불확실성 계산을 정의한다. 집계 파이프라인이 이 정의를 구현한다.

발견과 승격 절차, 지표가 화면 블록에 연결되는 방식은 [통계 모델](statistics-model.md), 테이블 정의는 [ERD](erd.md)에 있다.

## 2. 공통 규약

### 2.1 모집단

모든 지표의 분모 모집단은 `posting_versions`다. 범위와 기간으로 거른다.

```sql
FROM posting_versions pv
JOIN postings p ON p.posting_id = pv.posting_id
JOIN periods pd ON pd.period_id = :period_id
WHERE p.job_role_id = :job_role_id
  AND pv.dataset_version = :dataset_version
  AND pv.posted_at::date BETWEEN pd.starts_on AND pd.ends_on
```

`job_role_id` 판정 규칙은 2.8에 있다.

기간 축은 달력 연도다. `period_id`는 `y2026`과 `y2024_2025` 두 값이며 공고의 `posted_at` 날짜가 그 구간에 드는지로 가른다. 기간 정의는 [ERD](erd.md) 3.5가 소유하므로 여기에 날짜를 다시 적지 않는다. 기간을 늘릴 때 `periods`에 행을 더하고 이 문서의 수식은 그대로 둔다.

`scope_level`에 따라 조건을 더한다.

| `scope_level` | 추가 조건 |
| --- | --- |
| `overall` | 없음 |
| `cluster` | `as_of_date` 기준 `company_cluster_memberships`로 해석한 소속이 `scope_id`와 일치 |
| `posting` | `p.posting_id = :scope_id` |

기업군 조건은 다음으로 표현한다.

```sql
AND EXISTS (
  SELECT 1 FROM company_cluster_memberships m
  WHERE m.company_id = p.company_id
    AND m.cluster_id = :scope_id
    AND m.valid_from <= :as_of_date
    AND (m.valid_to IS NULL OR m.valid_to >= :as_of_date)
)
```

### 2.2 중복 제거

모든 지표의 중복 제거 단위는 `posting_version_id`다. 한 공고 버전에서 같은 차원이 여러 mention으로 나타나도 한 번 센다.

```sql
COUNT(DISTINCT pv.posting_version_id)
```

### 2.3 할당 조인

차원을 받는 지표는 활성 분류체계의 할당만 사용한다.

```sql
JOIN requirement_mentions rm ON rm.posting_version_id = pv.posting_version_id
JOIN posting_requirement_assignments a ON a.mention_id = rm.mention_id
JOIN requirement_dimension_versions dv
  ON dv.dimension_id = a.dimension_id
 AND dv.taxonomy_version_id = a.taxonomy_version_id
WHERE a.taxonomy_version_id = :taxonomy_version_id
  AND dv.lifecycle_status = 'active'
```

`lifecycle_status`가 `active`가 아닌 차원은 집계에 포함하지 않는다.

### 2.4 결측 처리

| 상황 | 처리 |
| --- | --- |
| 분모가 0 | `sample_status = 'not_computable'`, `value`는 NULL |
| 분모가 `minimum_n` 미만 | `sample_status = 'low_confidence'`, `value` 저장 |
| 분모가 `minimum_n` 이상이나 `minimum_n_comparison` 미만 | `sample_status = 'not_comparable'`, `value` 저장 |
| 분모가 `minimum_n_comparison` 이상 | `sample_status = 'analysis_ready'` |
| 적용 불가 조합 | 행을 만들지 않는다 |

`not_comparable`인 행은 기간 비교와 기업군 비교의 입력으로 쓰지 않는다. 단일 값 표시는 허용한다.

`not_computable` 상태의 행도 저장한다. 계산하지 못했다는 사실 자체가 화면의 정보이며, 값을 지우면 "아직 안 돌렸다"와 "돌렸는데 표본이 없다"를 구분할 수 없다.

### 2.5 불확실성

비율을 산출하는 지표는 Wilson score 95% 구간을 저장한다.

```text
z  = 1.959964
p  = numerator / denominator
n  = denominator
c  = 1 + z² / n
mid = (p + z² / (2n)) / c
half = z / c * sqrt( p(1-p)/n + z² / (4n²) )

lower = max(0, mid - half)
upper = min(1, mid + half)
```

```json
{ "method": "wilson_95", "lower": 0.412, "upper": 0.734 }
```

정규 근사 대신 Wilson을 쓰는 이유는 분모가 작거나 비율이 0과 1에 가까울 때 구간이 정의역을 벗어나지 않기 때문이다. 기업군과 대상군으로 나눈 범위의 분모가 작으므로 이 성질이 필요하다.

구간을 저장하는 measure는 한 이항 분포의 비율을 산출하는 것뿐이다. 다음 넷은 `uncertainty`를 NULL로 둔다.

| measure | 근거 |
| --- | --- |
| `count` | 비율이 아니다 |
| `association_lift` | 비율의 비율이다 |
| `prevalence_difference` | 서로 다른 두 모집단의 비율에서 파생한다 |
| `prevalence_ratio` | 서로 다른 두 모집단의 비율에서 파생한다 |

`temporal_delta`도 구간을 저장하지 않는다.

### 2.6 `entry_label` 정규화

`posting_versions.entry_label_raw`에서 `entry_label`을 결정한다. 판정의 기준은 표기가 요구하는 대상이며 연차 숫자의 유무가 아니다.

| 요구하는 대상 | 값 | 원문 예 |
| --- | --- | --- |
| 신입만 받는다 | `entry` | `신입`, `신입 채용` |
| 주니어를 하한으로 두고 신입을 받지 않는다 | `junior` | `주니어`, `주니어/시니어`, `경력 1~3년` |
| 신입을 받으면서 경력 상한을 둔다 | `entry_junior` | `신입/주니어`, `신입~5년차`, `경력 3년 이하` |
| 경력을 요구한다 | `experienced` | `경력 3년 이상`, `경력`, `시니어`, `경력 4~7년` |
| 대상군을 특정하지 않는다 | `unspecified` | 표기 없음, `경력무관`, `무관` |

연차 하한을 적지 않아도 경력을 요구하면 `experienced`다. `경력`이나 `시니어`처럼 구분만 표시한 공고도 신입을 배제한다.

`경력무관`은 `unspecified`다. 신입이 지원할 수 있다는 뜻이지 신입을 대상으로 삼는다는 뜻이 아니다.

우대사항의 연차는 판정에 쓰지 않는다. 지원 자격이 대상군을 정한다.

판정은 규칙으로 수행하고 규칙이 결정하지 못한 값만 생성 모델로 분류한다. 판정 결과는 `entry_label`에 담고 원문은 `entry_label_raw`에 보존한다.

### 2.7 대상군

`entry_label`은 공고 하나의 표기이고, 대상군은 지표의 그룹 축이다. 표기 다섯 값을 축 세 값으로 접는다.

| `entry_label` | `entry_segment` |
| --- | --- |
| `entry`, `junior`, `entry_junior` | `entry_junior` |
| `experienced` | `experienced` |
| `unspecified` | `unspecified` |

같은 직무·기업군·기간이라도 신입·주니어에게 요구하는 수준과 경력에게 요구하는 수준이 다르다. 같은 비교 기준에 섞으면 어느 쪽도 맞지 않는다.

`unspecified`를 `entry_junior`에 합치지 않는다. 표기가 없는 공고를 신입·주니어 모집단에 넣으면 비교값이 실제보다 높아진다.

모든 지표 행은 대상군을 갖는다. 서로 다른 대상군의 수치를 같은 비교 기준에 놓지 않는다.

`entry_segment`는 위 세 값에 `all`을 더해 네 값을 갖는다.

| `entry_segment` | 분모 |
| --- | --- |
| `all` | 대상군으로 제한하지 않은 모집단 전체 |
| `entry_junior`, `experienced`, `unspecified` | 해당 대상군으로 제한한 모집단 |

`all` 행은 대상군별 행과 분모가 다른 별개의 행이며, 대상군별 값을 더하거나 평균해 만들지 않는다. 비율의 분모가 서로 달라 합산이 성립하지 않는다.

`all`이 화면과 해석 이후 단계에서 직무 공통 기대치를 계산하는 모집단이다. 대상군별 행은 함께 계산해 두고, 표본 상태가 노출 가능한 대상군만 나란히 표시한다.

### 2.8 직무 판정

`postings.job_role_id`는 공고 하나가 어느 직무의 모집단에 들어가는지를 정한다. 2.1의 분모가 이 값으로 걸러진다.

판정은 `job_roles`의 아홉 종 가운데 가장 잘 맞는 하나를 고르는 문제다. 후보 목록은 [ERD](erd.md) 3.1에 있다. `postings.job_role_id`는 단일 값이므로 둘로 나누지 않는다.

판정의 입력은 세 가지이고 순서가 있다. 앞 순위에서 값이 결정되면 뒷 순위를 보지 않으며, 직군 필드와 제목이 어긋나면 직군 필드를 따른다.

| 순위 | 입력 |
| --- | --- |
| 1 | 공고가 제공하는 직군 필드 |
| 2 | 공고 제목 |
| 3 | 업무 내용과 지원자격 본문 |

직군 필드와 제목이 사업 영역만 가리키고 직무를 가리키지 않는 공고는 세 번째 입력으로 판정한다. 수주형 개발과 대기업 내부 시스템을 담당하는 조직의 공고가 여기에 해당한다.

직무와 무관하게 모집단에서 빼는 조건은 둘이다.

| 판정 | 조건 |
| --- | --- |
| 제외 | 직무를 지정하지 않고 상시 접수하는 인재풀이다 |
| 제외 | 업무 내용 본문이 없어 요구를 확인할 수 없다 |

아홉 직무의 포함 조건은 주 업무가 무엇을 만드는가로 적는다.

| `job_role_id` | 주 업무 |
| --- | --- |
| `backend` | 서버 애플리케이션, API, 데이터 저장소의 설계·구현·운영 |
| `frontend` | 웹 화면과 클라이언트 상태의 구현 |
| `ai_engineer` | 모델 학습과 서빙, AI 기능의 구현 |
| `data_engineer` | 데이터 수집·파이프라인·분석 저장소의 구축 |
| `fullstack` | 화면과 서버의 구현을 함께 담당 |
| `devops` | 인프라 구축, 배포 자동화, 운영 |
| `mobile` | iOS·안드로이드 앱과 단말 기능의 구현 |
| `security` | 보안 설계, 점검, 침해 대응 |
| `game_client` | 게임 클라이언트와 엔진의 구현 |

경계 사례는 주 업무의 비중으로 가른다. 해당 직무의 일이 부수 업무인 공고는 그 직무의 모집단에 넣지 않는다.

#### 모집분야를 여럿 담은 출처

출처 하나가 모집분야를 여럿 담는 경우가 있다. `sources`와 `source_snapshots`는 URL 단위이고 `postings`는 `source_id`를 외래키로 가질 뿐 유일성 제약이 없으므로, 한 출처에서 `posting`을 여럿 만들 수 있다.

| 상황 | 처리 |
| --- | --- |
| 모집분야마다 요구사항 본문이 분리된다 | 모집분야마다 `posting`을 만들고 각각 직무를 배정한다 |
| 본문이 하나로 합쳐져 있다 | 모집단에 넣지 않는다 |
| 같은 직무의 모집분야가 둘 이상이다 | 하나의 `posting`으로 합친다 |

본문이 합쳐진 출처를 나누지 않는 이유는 요구 표현을 분야별로 귀속할 수 없기 때문이다. 나누면 한 직무의 비교 모집단에 다른 직무의 요구가 섞인다.

같은 직무의 모집분야를 합치는 이유는 중복 제거 단위가 `posting_version_id`이기 때문이다. 나누면 같은 요구가 두 번 세어져 분자와 분모가 함께 부푼다.

분리한 `posting`들은 같은 `snapshot_id`를 참조한다. `posting_versions`의 `UNIQUE (posting_id, snapshot_id)`가 이를 허용한다.

#### 인접 직무와 가르는 기준

기술 이름으로는 가르지 못한다. 백엔드 공고에도 컨테이너와 메시지 큐가 거의 항상 나오고, 프론트엔드 공고에도 배포 도구가 나온다. 무엇을 만드는가로 가른다.

| 쌍 | 기준 |
| --- | --- |
| `backend` ↔ `devops` | 서비스 로직과 API를 만들면 `backend`, 서비스가 동작할 환경과 배포 경로를 만들면 `devops` |
| `backend` ↔ `data_engineer` | 처리 대상이 사용자 요청이면 `backend`, 데이터 파이프라인과 분석 저장소면 `data_engineer` |
| `backend` ↔ `fullstack` | 화면 구현이 주 업무에 포함되면 `fullstack` |
| `backend` ↔ `game_client` | 게임의 서버는 `backend`, 클라이언트와 엔진은 `game_client` |
| `backend` ↔ `ai_engineer` | 모델을 호출하는 서비스를 만들면 `backend`, 모델 자체를 학습하고 서빙하면 `ai_engineer` |
| `backend` ↔ `mobile` | 앱 화면과 단말 기능을 구현하면 `mobile` |
| `frontend` ↔ `fullstack` | 서버 구현이 주 업무에 포함되면 `fullstack` |
| `frontend` ↔ `mobile` | 웹 화면이면 `frontend`, 단말 앱이면 `mobile` |
| `ai_engineer` ↔ `data_engineer` | 모델을 학습하고 서빙하면 `ai_engineer`, 모델이 쓸 데이터를 나르고 쌓으면 `data_engineer` |
| `devops` ↔ `security` | 배포와 운영 경로를 만들면 `devops`, 보안 기준을 세우고 점검·대응하면 `security` |
| `game_client` ↔ `frontend` | 게임 엔진 위의 화면과 입력이면 `game_client`, 웹 화면이면 `frontend` |

게임의 서버를 `backend`에 두는 이유는 기업군 축이 게임사를 별도 군으로 두기 때문이다. 게임사가 요구하는 서버 수준을 다른 기업군과 대비하려면 같은 직무 모집단에 있어야 한다.

#### 패키지 플랫폼 위의 개발

패키지나 SaaS 플랫폼 위에서 서버 로직과 연계를 구현하는 공고는 아홉 종 가운데 `backend`에 가장 잘 맞는다. 모집단에 넣고 `platform_bound`로 표시한다.

| 항목 | 값 |
| --- | --- |
| 해당 | 패키지 ERP, CRM, 그룹웨어 위의 서버 로직·인터페이스 개발 |
| 표시 | 수집 매니페스트의 `platform_bound`가 참 |
| 근거 보존 | 플랫폼 이름을 `job_role_raw`에 담는다 |

표시를 남기는 이유는 요구 차원의 성격이 다르기 때문이다. 이 공고들은 플랫폼 종속 기술을 요구하며, 범용 서버 개발의 준비 경로와 겹치지 않는 부분이 있다.

판정은 규칙으로 수행하고 규칙이 결정하지 못한 값만 생성 모델로 분류한다. 판정에 사용한 원문 표기는 수집 매니페스트의 `job_role_raw`에 보존한다. 원문이 없으면 같은 공고를 다시 판정할 수 없다.

## 3. 지표 family

### 3.1 `posting_prevalence`

한 차원이 범위·기간의 공고 중 몇 %에 나타나는가.

| 항목 | 정의 |
| --- | --- |
| 입력 | 차원, 범위, 기간 |
| `input_arity` | `one_dimension` |
| measure | `ratio` |
| 분자 | 해당 차원 할당이 있는 `posting_version` 수 |
| 분모 | 범위·기간의 `posting_version` 수 |
| 출력 단위 | `ratio` |
| 불확실성 | Wilson 95% |

```sql
SELECT
  COUNT(DISTINCT CASE WHEN a.dimension_id = :dimension_id
                      THEN pv.posting_version_id END) AS numerator,
  COUNT(DISTINCT pv.posting_version_id)               AS denominator
```

### 3.2 `requiredness_ratio`

해당 차원이 나타난 공고 중 필수로 표기한 비율.

| 항목 | 정의 |
| --- | --- |
| 입력 | 차원, 범위, 기간 |
| `input_arity` | `one_dimension` |
| measure | `ratio` |
| 분자 | `requiredness = 'required'`인 할당이 있는 `posting_version` 수 |
| 분모 | 해당 차원 할당이 있는 `posting_version` 수 |
| 불확실성 | Wilson 95% |

분모가 `posting_prevalence`의 분자와 같다. 전체 모집단이 아니다.

한 공고에 같은 차원의 `required` 할당과 `preferred` 할당이 함께 있으면 `required`로 센다. 공고가 한 번이라도 필수로 표기했으면 필수 요구다.

### 3.3 `depth_distribution`

해당 차원이 나타난 공고를 깊이 등급으로 나눈 분포.

| 항목 | 정의 |
| --- | --- |
| 입력 | 차원, 범위, 기간 |
| `input_arity` | `one_dimension` |
| measure | `foundation`, `application`, `tradeoff` |
| 분자 | 대표 등급이 해당 등급인 `posting_version` 수 |
| 분모 | 해당 차원 할당이 있는 `posting_version` 수 |
| 불확실성 | 등급별 Wilson 95% |

**대표 등급 규칙.** 한 공고 버전이 같은 차원에 대해 여러 깊이의 할당을 가지면 가장 깊은 등급 하나만 센다. 순서는 `foundation < application < tradeoff`다.

```sql
SELECT pv.posting_version_id,
       MAX(CASE a.depth_level
             WHEN 'tradeoff'   THEN 3
             WHEN 'application' THEN 2
             ELSE 1 END) AS depth_rank
FROM ...
GROUP BY pv.posting_version_id
```

이 규칙이 세 measure의 분자 합을 분모와 정확히 일치시킨다. 백분율로 읽히며 100%를 넘지 않는다. 준비 기준으로도 맞다. 가장 깊은 요구에 맞추면 아래 등급은 따라온다.

### 3.4 `cluster_contrast`

기업군이 직무 전체와 얼마나 다른가.

| 항목 | 정의 |
| --- | --- |
| 입력 | 차원, 기업군, 기간 |
| `input_arity` | `dimension_cluster` |
| measure | `prevalence_difference`, `prevalence_ratio` |
| 불확실성 | 없음 |

두 measure를 각각 한 행으로 저장한다.

```text
cluster_prevalence  = 기업군 범위의 posting_prevalence
baseline_prevalence = overall 범위의 posting_prevalence

prevalence_difference = cluster_prevalence - baseline_prevalence
prevalence_ratio      = cluster_prevalence / baseline_prevalence
```

`baseline_prevalence`가 0이면 `prevalence_ratio` 행을 만들지 않는다. `prevalence_difference` 행만 저장한다. 직무 전체 분모가 0이면 견줄 값 자체가 없으므로 `prevalence_difference`의 `value`도 비운다.

**저장 형태.** 두 measure 모두 `value`에 결과를 담고 `numerator`·`denominator`에는 **기업군 범위의 원본 카운트**를 담는다. `statistics_facts`의 `numerator`·`denominator`는 정수 카운트만 담는다는 규약을 지키기 위해서다. 직무 전체 값은 같은 분석 버전의 `posting_prevalence` 행에서 조회한다.

`sample_status`는 기업군 분모와 직무 전체 분모 **둘 다** `minimum_n_comparison` 이상일 때만 `analysis_ready`다. 한쪽이라도 미달이면 `not_comparable`이다.

### 3.5 `cooccurrence`

두 차원이 함께 요구되는 정도.

| 항목 | 정의 |
| --- | --- |
| 입력 | 차원 두 개, 범위, 기간 |
| `input_arity` | `two_dimensions` |
| measure | `count`, `jaccard`, `conditional_a_given_b`, `conditional_b_given_a`, `association_lift` |

```text
A  = A 차원 할당이 있는 posting_version 집합
B  = B 차원 할당이 있는 posting_version 집합
N  = 범위·기간의 posting_version 수

count                 = |A ∩ B|
jaccard               = |A ∩ B| / |A ∪ B|
conditional_a_given_b = |A ∩ B| / |B|
conditional_b_given_a = |A ∩ B| / |A|
association_lift      = (|A ∩ B| / N) / ((|A| / N) × (|B| / N))
```

교집합 크기를 `n_ab`, 각 집합 크기를 `n_a`·`n_b`, 합집합 크기를 `n_union`, 모집단을 `n_total`로 적는다.

| measure | 분자 | 분모 | 불확실성 |
| --- | --- | --- | --- |
| `count` | `n_ab` | NULL | 없음 |
| `jaccard` | `n_ab` | `n_union` | Wilson 95% |
| `conditional_a_given_b` | `n_ab` | `n_b` | Wilson 95% |
| `conditional_b_given_a` | `n_ab` | `n_a` | Wilson 95% |
| `association_lift` | `n_ab` | `n_total` | 없음 |

`association_lift`는 비율의 비율이라 Wilson 구간이 성립하지 않는다. `numerator`·`denominator`에는 교집합 수와 모집단 수를 담고 `value`에 lift를 담는다. `n_a`와 `n_b` 중 하나라도 0이면 독립 가정 기대 비율이 0이라 lift가 정의되지 않으므로 `value`를 비운다.

`count`는 분모가 없는 것이 정의이며 `denominator`를 NULL로 둔다. `value`에 교집합 수를 담고 `sample_size`에는 모집단 크기를 담는다. 표본 판정도 분모가 아니라 이 `sample_size`로 한다. 교집합 수 하나만으로는 그 수가 몇 건 가운데 나온 것인지 알 수 없다.

차원 쌍은 `dimension_id < secondary_dimension_id` 순서로 정규화해 한 쌍당 한 행만 저장한다. 방향이 있는 두 조건부 확률은 measure로 구분한다.

### 3.6 `scope_expansion`

역할 경계를 넘어선 요구가 얼마나 나타나는가.

| 항목 | 정의 |
| --- | --- |
| 입력 | 범위, 기간 |
| `input_arity` | `scope_only` |
| measure | `ratio` |
| 분자 | `role_boundary_eligible`이 참인 차원 할당이 하나 이상 있는 `posting_version` 수 |
| 분모 | 범위·기간의 `posting_version` 수 |
| 불확실성 | Wilson 95% |

차원을 받지 않는다. 경계 차원 중 무엇이든 하나라도 있으면 분자에 센다.

```sql
AND dv.role_boundary_eligible = true
```

`role_boundary_eligible`은 `requirement_dimension_versions`의 컬럼이므로 분류체계 버전마다 다시 판정한다. 백엔드 공고의 프론트엔드 요구, 구현 직무의 운영·인프라 요구가 해당한다.

### 3.7 `entry_label_advanced_signal_rate`

신입·주니어라고 표기한 공고 중 심화 신호를 포함한 비율.

| 항목 | 정의 |
| --- | --- |
| 입력 | 범위, 기간 |
| `input_arity` | `scope_only` |
| measure | `ratio` |
| 분자 | `depth_level = 'tradeoff'`인 할당이 하나 이상 있는 `posting_version` 수 |
| 분모 | `entry_label IN ('entry','junior','entry_junior')`인 `posting_version` 수 |
| 불확실성 | Wilson 95% |

```sql
WHERE pv.entry_label IN ('entry','junior','entry_junior')
```

분모가 전체 모집단이 아니라 대상군이 표기된 공고로 제한된다. `unspecified`와 `experienced`는 제외한다.

이 지표는 관측값이며 기대값과의 차이가 아니다. 라벨별 기대 심화 비율을 정의하기 전에는 차이를 계산하지 않는다.

## 4. 시간 연산자

`temporal_delta`는 독립 지표가 아니라 다른 지표에 적용하는 연산자다.

```text
temporal_delta(base_metric, measure, scope, period_a, period_b)
  = value(base_metric, measure, scope, period_b)
  - value(base_metric, measure, scope, period_a)
```

저장 시 다음을 함께 기록한다.

| 항목 | 값 |
| --- | --- |
| `metric_family` | `temporal_delta` |
| `measure` | `<base_metric>__<measure>` 형태 |
| `period_id` | `period_b` |
| `numerator` | `period_b`의 분자 |
| `denominator` | `period_b`의 분모 |
| `value` | 차이 |
| `sample_size` | 두 기간 분모 중 **작은 값** |
| `uncertainty` | 없음 |

`sample_size`에 작은 쪽을 담는 이유는 비교의 신뢰도가 표본이 적은 기간에 좌우되기 때문이다.

두 기간 중 하나라도 `sample_status`가 `not_comparable` 이하이면 `temporal_delta` 행을 만들지 않는다. 비교 불가로 표시된 값끼리 뺀 결과는 의미가 없다.

어떤 지표의 변화인지를 `measure`에 반드시 남긴다. `temporal_delta` 단독으로는 해석할 수 없다.

`temporal_delta`는 `metric_templates`와 `metric_policy_versions`에 행을 두지 않는다. 연산자에는 전개 축이 없고, 최소 표본·억제 정책·불확실성 방법은 `base_metric`의 정책 행을 따른다. `statistics_facts.metric_policy_version`에는 그 정책 행을 담는다.

## 5. 적용 가능성

지표마다 입력 차수가 다르다. 모든 지표를 모든 차원에 적용하지 않는다.

| family | 차원 필요 | 전개 단위 |
| --- | --- | --- |
| `posting_prevalence` | 하나 | 차원 × 범위 × 대상군 × 기간 |
| `requiredness_ratio` | 하나 | 차원 × 범위 × 대상군 × 기간 |
| `depth_distribution` | 하나 | 차원 × 범위 × 대상군 × 기간 |
| `cluster_contrast` | 하나 | 차원 × 기업군 × 대상군 × 기간 |
| `cooccurrence` | 둘 | 차원 쌍 × 범위 × 대상군 × 기간 |
| `scope_expansion` | 없음 | 범위 × 대상군 × 기간 |
| `entry_label_advanced_signal_rate` | 없음 | 범위 × 기간 |

`entry_label_advanced_signal_rate`는 대상군으로 전개하지 않는다. 분모가 이미 신입·주니어 표시 공고이므로 `entry_junior` 외의 대상군에서는 정의되지 않는다. 저장 시 `entry_segment`는 `entry_junior`를 갖는다.

`dimension_metric_applicability`에 분류체계 버전별로 적용 가능 여부를 기록한다. `applicable`이 거짓인 조합은 계산하지 않으며, 계산된 행이 있으면 검증에서 차단한다.

차원 쌍의 전개는 조합 폭발을 막기 위해 같은 봉투의 `posting_prevalence` 분자가 `minimum_n` 이상인 차원끼리만 수행한다. 임계값은 `posting_prevalence`의 정책 행에서 읽는다. 자르는 근거가 그 지표의 결과이기 때문이다.

## 6. 정책 버전

최소 표본, 억제 정책, 불확실성 방법은 `metric_policy_versions`의 행이다. 코드 상수가 아니다. 정책 행은 family마다 하나이며 `temporal_delta`는 행을 두지 않고 `base_metric`의 행을 따른다.

두 임계값은 일곱 family가 같은 값을 쓴다.

| 항목 | v1 | 근거 |
| --- | --- | --- |
| `minimum_n` | 5 | 5건 미만에서는 한 건이 20%p를 움직여 비율이 의미를 잃는다 |
| `minimum_n_comparison` | 10 | 두 집단 비교에서 각 10건이 최소 판별 규모다 |

`suppression_policy`와 `uncertainty_method`는 family마다 다르다.

| family | `suppression_policy` | `uncertainty_method` |
| --- | --- | --- |
| `posting_prevalence` | `label_low_confidence` | `wilson_95` |
| `requiredness_ratio` | `label_low_confidence` | `wilson_95` |
| `depth_distribution` | `label_low_confidence` | `wilson_95` |
| `cluster_contrast` | `label_not_comparable` | `none` |
| `cooccurrence` | `label_low_confidence` | `wilson_95` |
| `scope_expansion` | `label_low_confidence` | `wilson_95` |
| `entry_label_advanced_signal_rate` | `label_low_confidence` | `wilson_95` |

`label_low_confidence`는 값을 숨기지 않고 낮은 신뢰도로 표시한다. `cluster_contrast`가 `label_not_comparable`을 쓰는 근거는 3.4의 두 분모 규칙이다. 한쪽 분모라도 미달인 값을 비교에 쓰지 않으므로 `low_confidence`를 `not_comparable`로 올려 표시한다.

`uncertainty_method`는 family가 구간을 어떤 방법으로 계산하는지만 정한다. 어느 measure에 구간이 성립하는가는 2.5의 수식이 정하므로, `cooccurrence`의 방법이 `wilson_95`여도 `count`와 `association_lift`는 구간을 갖지 않는다. `cluster_contrast`는 두 measure 모두 구간이 성립하지 않아 방법이 `none`이다.

기업군 6종으로 나눈 범위는 군당 분모가 `overall`의 6분의 1이라 `low_confidence`나 `not_comparable`로 남는 조합이 있다. 이 상태가 정상이며 화면은 표본 수를 함께 표시한다.

정책 버전이 다른 수치는 비교하지 않는다. 임계값 재검토와 다음 정책 버전의 발행 시점은 [백로그](backlog.md)에 있다.

## 7. 검증

집계 산출물은 여섯 검사로 대조한다. 표의 차례가 실행 차례다. 판정 형식은 [에이전트 설계](agent-design.md) 9장을 따른다.

| 검사 | 내용 |
| --- | --- |
| 분모 일치 | 저장된 분모가 모집단 정의를 다시 적용해 만든 크기와 같고, 행의 범위·대상군·기간 표기가 모집단 정의와 일치한다 |
| 중복 제거 | `posting_version_id` 단위로 중복이 제거되었다 |
| 표본 판정 | `sample_size`가 분모와 같고 `sample_status`가 정책 버전의 임계값으로 판정한 값과 같다 |
| 재계산 일치 | 독립 재계산의 분자·분모·값이 저장값과 일치한다 |
| 버전 일치 | 행의 `metric_policy_version`과 `analysis_version`이 선언한 `taxonomy_version_id`가 실행 컨텍스트와 일치한다 |
| 적용 가능성 | 적용 불가로 표시된 차원·지표 조합과 전개하지 않는 대상군의 행이 계산되지 않았다 |

위반이 나와도 남은 검사를 건너뛰지 않는다. 한 번의 실행이 결함 전체를 드러내야 수리 지시를 한 번에 만들 수 있다.

재계산은 저장 집계와 다른 경로로 수행한다. 저장값은 2.1~2.3의 SQL이 만들고, 재계산은 집계되지 않은 원자 행에 모집단 조건·중복 제거·활성 분류체계 조건을 처음부터 다시 적용한다. 같은 질의를 두 번 실행하는 것은 대조가 아니다.

`cluster_contrast`의 표본 판정은 3.4의 두 분모 규칙을 적용하며, 기업군 분모와 직무 전체 분모 중 하나라도 미달이면 `analysis_ready`가 아니다. `temporal_delta`는 입력 두 기간이 `analysis_ready`가 아니면 행 자체를 만들지 않으므로 별도의 검사 항목을 두지 않는다.

`numerator <= denominator`는 `statistics_facts`의 `numerator_within` CHECK가 막고, `depth_distribution` 세 measure의 분자 합과 분모가 어긋나면 집계가 행을 만들지 않고 멈춘다. 제약 정의는 [ERD](erd.md)에 있다.

`statistics_facts`는 분류체계 버전을 컬럼으로 갖지 않는다. 버전 일치 검사는 행이 속한 분석 버전의 `analysis_versions.taxonomy_version_id`를 읽는다. `metric_policy_version`은 행의 지표 family에 유효한 정책 행과 대조한다.

## 8. 관련 문서

- [통계 모델](statistics-model.md)
- [ERD](erd.md)
- [에이전트 설계](agent-design.md)
- [지식·저장 구조](knowledge-schema.md)
