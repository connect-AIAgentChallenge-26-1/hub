# 데이터·스키마 명세서 (개발용)

plan.md의 부록을 구현 수준으로 푼 문서. 정확한 변수명과 타입, 스크래퍼 원본 포맷,
LLM 프롬프트와 강제할 JSON 구조를 담는다.

우대 조건 처리(단순화): MVP에서는 우대·우선 조건을 매칭에 쓰지 않는다. 필수 조건만 구조화해서
판정하고, 우대 문구는 원문에 있으면 표시만 한다. (우대까지 구조화하면 복잡도만 커지고 정확도가 떨어짐)

---

## 부록 1. DB 테이블 구성 (컬럼명·타입, PostgreSQL)

### profiles — 내 조건
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| age | int null | 만 나이 |
| grade | int null | 1~4 |
| semester | int null | 학기 |
| enrollment_status | text null | 재학 / 휴학 / 졸업예정 |
| major | text null | 전공 계열 |
| university | text null | 소속 대학 |
| university_region | text null | 대학 소재 지역 |
| residence_region | text null | 거주 지역 |
| nationality | text null | 국적 |
| income_bracket | int null | 소득분위 1~10 (잘 모름이면 null) |
| gpa | numeric(3,2) null | 직전 학기 학점 (잘 모름이면 null) |
| updated_at | timestamptz | |

### sources — 수집 소스
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | serial PK | |
| name | text | 예: 위비티 |
| base_url | text | |
| adapter_key | text | 수집기 식별자 |
| active | boolean | |

### raw_postings — 수집 원문
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| source_id | int FK→sources | |
| source_url | text unique | 중복 방지 키 |
| raw_title | text | |
| raw_text | text | 정제된 본문 텍스트 |
| raw_html | text null | 원본 html |
| scraped_at | timestamptz | |
| status | text | raw / parsing / done / failed |

### postings — 완성본(유저가 조회)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| raw_posting_id | uuid FK→raw_postings | |
| track | text | activity / scholarship |
| category | text | 대외활동 / 공모전 / 봉사 / 장학 등 |
| title | text | |
| org | text null | 주최 |
| deadline | date null | 못 읽으면 null → 확인 필요 |
| url | text | 원문 링크 |
| eligibility | jsonb | 부록 3의 구조 |
| schema_version | int | 조건 틀 버전 |
| parse_status | text | curated / needs_review / failed |
| created_at | timestamptz | |

### parse_logs — 파싱 기록
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| raw_posting_id | uuid FK | |
| model | text | 사용 모델 |
| confidence | numeric null | 0~1 |
| error | text null | 실패 사유 |
| created_at | timestamptz | |

---

## 부록 2. 스크래퍼 원본 데이터 포맷 예시

수집기 fetch()가 돌려주는 한 건. 이 상태로 raw_postings에 적재한다.

```json
{
  "source_url": "https://www.wevity.com/?c=find&s=1&gp=1&ix=123456",
  "raw_title": "2026 OO 대학생 서포터즈 12기 모집",
  "raw_text": "모집대상: 전국 4년제 대학 재학생 및 휴학생. 학년 무관. 소득 8분위 이하 우대. 지원마감: 2026-08-05",
  "raw_html": "<div class='view'>...</div>",
  "scraped_at": "2026-07-07T03:01:00+09:00"
}
```

주의: raw_text는 자유 문장이라 조건이 문장 속에 섞여 있다. 구조화는 부록 3의 LLM이 담당한다.

---

## 부록 3. LLM 프롬프트 + 강제 JSON 구조

### 1단계 Classifier — 공고 종류 분류

프롬프트
```
다음 공고를 분류해라. track은 자격 요건의 성격으로 정한다.
- track: activity(대외활동·공모전·봉사) 또는 scholarship(장학·지원금)
- category: 대외활동 / 공모전 / 봉사 / 장학 중 하나
공고: """{raw_title}\n{raw_text}"""
```

강제 JSON 구조
```json
{
  "type": "object",
  "properties": {
    "track": { "type": "string", "enum": ["activity", "scholarship"] },
    "category": { "type": "string", "enum": ["대외활동", "공모전", "봉사", "장학"] }
  },
  "required": ["track", "category"],
  "additionalProperties": false
}
```

### 2단계 Extractor — 조건 추출

프롬프트
```
너는 공고 자격요건 추출기다. 아래 공고에서 지원에 '필수'인 조건만 뽑아라.
- 우대·우선 조건은 무시한다.
- 원문에 없는 조건은 추측하지 말고 빈 배열이나 null로 둔다.
- 각 필드마다 근거가 된 원문 문장을 found_in_text에 그대로 담는다.
- 확신이 낮으면 confidence를 0.5 이하로 준다.
공고: """{raw_text}"""
```

강제 JSON 구조 — track A(activity)
```json
{
  "type": "object",
  "properties": {
    "grades": { "type": "array", "items": { "type": "integer", "enum": [1,2,3,4] } },
    "enrollment_status": { "type": "array", "items": { "type": "string", "enum": ["재학","휴학","졸업예정"] } },
    "majors": { "type": "array", "items": { "type": "string" } },
    "regions": { "type": "array", "items": { "type": "string" } },
    "age_min": { "type": ["integer", "null"] },
    "age_max": { "type": ["integer", "null"] },
    "found_in_text": { "type": "object" },
    "confidence": { "type": "number" }
  },
  "required": ["grades","enrollment_status","majors","regions","age_min","age_max","found_in_text","confidence"],
  "additionalProperties": false
}
```

강제 JSON 구조 — track B(scholarship)
```json
{
  "type": "object",
  "properties": {
    "grades": { "type": "array", "items": { "type": "integer", "enum": [1,2,3,4] } },
    "enrollment_status": { "type": "array", "items": { "type": "string" } },
    "income_max": { "type": ["integer", "null"] },
    "gpa_min": { "type": ["number", "null"] },
    "special": { "type": "array", "items": { "type": "string" } },
    "found_in_text": { "type": "object" },
    "confidence": { "type": "number" }
  },
  "required": ["grades","enrollment_status","income_max","gpa_min","special","found_in_text","confidence"],
  "additionalProperties": false
}
```

빈 배열과 null은 "무관"으로 해석한다. confidence가 낮거나 형식이 깨지면 parse_status를 needs_review로 둔다.

---

## eligibility JSONB 저장 예시

track A
```json
{
  "grades": [],
  "enrollment_status": ["재학", "휴학"],
  "majors": [],
  "regions": [],
  "age_min": null,
  "age_max": null,
  "found_in_text": { "enrollment_status": "전국 4년제 대학 재학생 및 휴학생" },
  "confidence": 0.9
}
```

track B
```json
{
  "grades": [],
  "enrollment_status": ["재학"],
  "income_max": 8,
  "gpa_min": 3.5,
  "special": [],
  "found_in_text": { "income_max": "소득 8분위 이하", "gpa_min": "직전 학기 3.5 이상" },
  "confidence": 0.85
}
```
