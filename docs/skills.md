# Agent 스킬 계약 — 근거 검증 시스템 전체 구현 범위

이 문서는 기능 A~D를 구성하는 S1~S23의 입력·출력·제약을 정의하는 **구현 계약의 단일 진실 소스**다. 제품 전체 범위는 [plan.md](plan.md), 구현 순서는 [backlog.md](backlog.md), 검증 가능한 완료 조건은 [checklist.md](checklist.md)를 따른다.

등록된 모든 스킬은 최종 완료 범위에 포함된다. 단계와 선행조건은 구현 순서를 정할 뿐 기능을 범위에서 제거하지 않는다. 계약을 바꿀 때는 이 문서를 먼저 수정한 뒤 코드·테스트·관련 문서를 함께 갱신한다.

## 공통 원칙

1. **추천 금지** — 목표가, 매수·매도 지시, `관망·분할매수·보류` 같은 행동 라벨을 생성하지 않는다. 데이터 판정과 가격 위치 설명까지만 제공한다.
2. **환각 금지** — 원문에 없는 수치·사실·출처를 만들지 않는다. 결측값을 0으로 채우지 않는다.
3. **기준시점 필수** — 모든 데이터 출력에 `as_of(YYYY-MM-DD)`와 사용한 공시 접수일을 포함한다.
4. **출처 동반** — 수치와 판정은 `rcept_no`, 계정, 대상 기간, 원문 위치 또는 공식 URL을 포함한다.
5. **결정론 우선** — 수치 계산·비교·단위 변환·판정은 코드가 수행한다. LLM은 자연어 구조화와 서술형 근거 해석에만 사용한다.
6. **정합성 우선** — 기업·기간·단위·연결/별도·누적/단일 값이 일치하지 않으면 결합하지 않는다.
7. **실패 구분** — 데이터 부재, 지원 범위 밖, 외부 API 장애, 구현 오류를 서로 다른 `reason_code`로 반환한다.
8. **보안 경계** — 사용자 입력과 공시 원문은 데이터로 취급한다. LLM 출력은 schema와 허용 필드 검사를 통과해야 한다.
9. **사용자 격리** — 로그·분석·주문 데이터는 인증 주체별로 분리하며 다른 사용자의 결과를 재사용하지 않는다.
10. **추적 가능성** — 각 요청은 입력, 데이터 기준시점, 검색·계산 단계, 외부 호출, 비용과 최종 판정을 trace로 남긴다. 주문·인증 trace에는 credential·계좌 원문·secret을 기록하지 않고 마스킹된 식별자만 허용한다.
11. **LLM 단일 보안 경로** — S4·S7·S8·S11을 포함한 모든 LLM 호출은 공통 S23 middleware를 반드시 통과한다. 각 스킬이 보안 게이트를 우회해 provider를 직접 호출하지 않는다.

## 공통 데이터 계약

모든 스킬 출력은 다음 generic envelope를 공통으로 갖는다. 아래 각 스킬 표의 `출력`은 `data`에 들어가는 payload만 축약해 표시하며, bare object나 array로 직접 반환하지 않는다.

```text
Envelope<T> {
  schema_version, request_id, trace_id, as_of,
  status, reason_code?, warnings[],
  source_provider?, source_ids[],
  model_or_rule_version, started_at, completed_at,
  data?: T
}
```

`as_of`는 `YYYY-MM-DD` 달력 날짜 문자열이다. `started_at`/`completed_at`과 모든 timestamp 필드는 **RFC3339이며 UTC/offset designator(`Z` 또는 `±HH:MM`)가 필수**다 — naive(시간대 없는) 문자열이나 날짜만 있는 값은 거부한다. `contracts/fixtures/timestamps.json`이 이 규칙의 정상·실패 fixture이며 `contracts/envelope.test.js`와 `backend/tests/test_envelope_contract.py` 양쪽이 동일 fixture로 같은 판정을 내리는지 검증한다.

`status`는 다음 enum만 사용한다.

| Status | 의미 |
|---|---|
| `SUCCESS` | 요청한 payload가 계약대로 생성됨 |
| `PARTIAL_SUCCESS` | 일부 독립 source/항목만 성공했으며 누락과 warning을 명시 |
| `VALIDATION_ERROR` | 요청 또는 schema가 유효하지 않음 |
| `AUTHENTICATION_ERROR` | 사용자 인증이 없거나 만료됨 |
| `AUTHORIZATION_ERROR` | 인증 주체에게 해당 자원·동작 권한이 없음 |
| `NOT_FOUND` | 요청 자원이나 기업을 찾지 못함 |
| `CONFLICT` | idempotency·버전·상태 전이가 충돌함 |
| `RATE_LIMITED` | 우리 서비스의 사용자·tenant·비용 한도 초과 |
| `EXTERNAL_ERROR` | provider timeout·점검·rate limit·인증·응답 오류로 필요한 처리를 완료하지 못함 |
| `INTERNAL_ERROR` | 구현·저장소·예상하지 못한 내부 오류 |

도메인 verdict와 주문 상태는 envelope `status`에 넣지 않고 `data` 안의 별도 enum으로 반환한다. 검증에 필요한 데이터가 정상 조회됐지만 부족하면 envelope는 `SUCCESS`이고 verdict는 `INSUFFICIENT_EVIDENCE`다. provider 장애 때문에 필요한 조회를 완료하지 못하면 `EXTERNAL_ERROR`이며 이를 부족 verdict로 바꾸지 않는다.

### Verdict

| 값 | 의미 |
|---|---|
| `SUPPORTED` | 필요한 근거가 있고 원자 Claim의 비교식이 참 |
| `PARTIALLY_SUPPORTED` | 같은 그룹의 원자 verdict가 `SUPPORTED`와 `REFUTED`로만 구성되고 두 값이 모두 존재하는 집계 결과 |
| `REFUTED` | 필요한 근거가 있고 원자 Claim의 비교식이 거짓 |
| `INSUFFICIENT_EVIDENCE` | 검증 가능한 유형이지만 필요한 값·기간·출처가 부족 |
| `UNVERIFIABLE` | 의견·미래 예측·비사실 주장 또는 비교식을 정의할 수 없는 주장 |

원자 수치 Claim은 크기가 일부만 맞는다는 이유로 `PARTIALLY_SUPPORTED`를 사용하지 않는다. 예를 들어 `배수 >= 2`인데 실제 1.38배면 `REFUTED`다. 흑자전환·적자지속은 verdict가 아니라 `reason_code`다.

그룹 집계 우선순위는 다음과 같으며 원자 결과는 항상 함께 보존한다.

| 원자 결과 구성 | 그룹 verdict |
|---|---|
| 하나 이상 `INSUFFICIENT_EVIDENCE` | `INSUFFICIENT_EVIDENCE` |
| 부족은 없고 하나 이상 `UNVERIFIABLE` | `UNVERIFIABLE` |
| `SUPPORTED`와 `REFUTED`가 모두 존재 | `PARTIALLY_SUPPORTED` |
| 전부 `SUPPORTED` | `SUPPORTED` |
| 전부 `REFUTED` | `REFUTED` |

타입 표기: `필드:타입`, `?`는 선택 필드, `[]`는 배열, `이름(A/B/C)`는 그 이름의 값이 A/B/C 중 하나인 문자열 enum, `as_of`·날짜류 문자열은 Envelope와 동일한 `YYYY-MM-DD` 형식이다. `contracts/schemas.js`의 `*_SPEC`이 이 타입을 그대로 강제하는 executable mirror다.

### Structured Claim

```text
claim_id:string, claim_group_id?:string, original_span:string,
corp_code:string, stock_code:string, claim_type:string, metric:string,
evidence_domain:string(financial/market/flow/valuation/peer),
comparison_entity_ref?:string, peer_universe_ref?:string,
comparator:object{op:string, target_value:number, target_unit:string,
                   tolerance_value?:number, tolerance_unit?:string},
direction:string, current_period:string, comparison_period:string,
as_of:string, verifiable:boolean, ambiguity_flags:string[], condition?:string
```

### Financial Fact

```text
corp_code:string, stock_code:string, account_id:string, account_name:string,
raw_value:number, raw_unit:string, normalized_value:number, normalized_unit:string,
fiscal_period:string, reprt_code:string, report_type:string,
fs_div:string(CFS/OFS), is_cumulative:boolean, is_provisional:boolean,
rcept_no:string, filed_at:string, source_url:string, collected_at:string
```

### Raw Source Record

`RawDisclosureRecord`, `RawMarketRecord`, `RawExternalRecord`는 다음 공통 metadata를 가진 immutable provider record다. provider별 원문 필드는 `raw_payload`에 그대로 보존한다.

```text
raw_record_id:string, source_provider:string, source_url?:string, source_native_id?:string,
corp_code?:string, stock_code?:string, published_at?:string, revised_at?:string, target_period?:string,
raw_payload:object, checksum:string, collected_at:string
```

### Evidence

```text
evidence_id:string, corp_code:string, claim_id?:string, presentation_item_id?:string,
evidence_type:string, document_id:string, rcept_no:string, filed_at:string, target_period:string,
source_url:string, quote:string, chunk_offset:number, retrieval_score:number,
relation:string(SUPPORTS/REFUTES/NEUTRAL/CONFLICTS),
relation_reason:string, relation_rule_version:string,
integrity_status:string, as_of:string
```

`claim_id`와 `presentation_item_id` 중 정확히 하나가 필수다. 기능 A의 공시·리포트 provenance는 `presentation_item_id`와 `relation=NEUTRAL`, 기능 C의 검증 근거는 `claim_id`와 판정된 relation을 사용한다.

### Numeric Evidence

```text
numeric_evidence_id:string,
evidence_domain:string(financial/market/flow/valuation/peer),
corp_code:string, comparison_entity_ref?:string, peer_universe_ref?:string,
metric:string, value:number, unit:string, target_period:string, as_of:string,
formula?:string, source_ids:string[], provenance:object(구조 미정 — 계산 근거를 담되 필드 형태는 각 skill이 정의), integrity_status:string
```

근거 기반 verdict에는 계산식 또는 인용문, 사용 값, 기업, 기간, `as_of`, 출처가 필수다. `INSUFFICIENT_EVIDENCE`와 `UNVERIFIABLE`에는 `reason_code`, `missing_fields`, 확인한 데이터 범위를 포함한다.

## 스키마 버전·migration 정책

Envelope는 `schema_version`, Claim·Fact·Evidence·Numeric Evidence 등 개별 타입은 `contracts/schemas.js`의 `SCHEMA_VERSIONS`로 각각 semver를 관리한다. 이 문서(skills.md)가 타입의 진실 소스이며, [contracts/](../contracts/)의 코드는 이 문서를 실행 가능한 형태로 미러링한 contract test 대상이다.

- **문서 먼저**: 계약을 바꿀 때는 이 문서를 먼저 수정하고, 같은 변경에서 `contracts/`의 필드 목록·enum·버전과 관련 테스트를 동기화한다 (AGENTS.md "계약 변경은 문서 먼저").
- **additive(하위호환) 변경**: 선택 필드 추가, enum 값 append는 PATCH 또는 MINOR를 올린다. 기존 소비자는 변경 없이 계속 동작해야 한다.
- **breaking 변경**: 필드 이름 변경·삭제, 새 필수 필드 추가, 기존 필드 의미 변경은 MAJOR를 올린다. 과거 immutable snapshot(원본 raw record, 복기 스냅샷 등)은 저장된 `schema_version`을 그대로 보존하며 새 버전으로 소급 rewrite하지 않는다.
- **호환 기간**: MAJOR 변경 이후 과거 버전 데이터를 읽는 경로는 T13 migration tooling이 공식 폐기 절차를 정의하기 전까지 유지한다. 조기 폐기하지 않는다.
- **DB migration 도구**(Alembic 등 실제 스키마 마이그레이션 실행)는 T01 범위다. 이 정책은 그 이전에도 문서·contract test 수준에서 버전 호환 규칙을 고정하기 위한 것이며, T01에서 DB migration이 생기면 동일 규칙을 참조해 구현한다.

### migration 기록

버전 번호를 실제로 올릴지, 아니면 아직 pre-release(외부 소비자·저장된 데이터 없음) 상태에서의 명세 보정으로 취급할지는 사후에 판단 근거가 남아야 한다. 이 표가 그 판단 기록이다.

| 날짜 | 대상 | 변경 | 판단 |
|---|---|---|---|
| 2026-07-12 | `contracts/schemas.js` (StructuredClaim·FinancialFact·RawSourceRecord·Evidence·NumericEvidence) | 필드 존재만 검사하던 것을 타입·enum·날짜 형식·comparator 중첩 구조까지 검증하도록 강화 | **pre-release 보정, 버전 유지(1.0.0)**. 아직 어떤 실제 provider·DB row·저장된 snapshot도 이 schema로 생성되지 않았다(T02 이후 착수). 소급 적용될 기존 데이터가 없으므로 이번 강화는 "breaking 변경"이 아니라 최초 명세의 누락을 메우는 보정이다. T02에서 실제 데이터가 쌓이기 시작한 뒤 같은 종류의 강화가 필요하면 그때는 MAJOR를 올린다. |
| 2026-07-12 | Envelope `started_at`/`completed_at` | RFC3339 timestamp에 offset(`Z`/`±HH:MM`) 필수 조건을 명시하고 JS/Python 양쪽에 강제 | **pre-release 보정, 버전 유지(1.0.0)**. 위와 동일 사유 — 저장된 실제 응답이 없다. |

## 금융 데이터 정합성 계약

- `filed_at <= as_of`인 데이터만 사용한다.
- 정정공시는 `as_of` 안의 동일 보고서 체인에서 가장 최근 접수분을 선택하고 원본·정정 이력을 보존한다.
- 잠정·확정 실적을 구분하고 충돌 시 확정 실적을 우선하되 사용 여부를 출력한다.
- 두 기간 모두 CFS가 있으면 CFS를 사용한다. 그렇지 않고 두 기간 모두 OFS가 있으면 OFS를 사용하고 별도재무제표임을 표시한다. CFS와 OFS를 기간 사이에 섞지 않는다.
- 사업보고서·분기·반기·3분기 보고서를 구분한다. 손익계산서의 당기 단일값과 누적값을 필드 수준에서 구분한다.
- 누적분기를 단일분기로 변환할 때 사용한 산식과 원본값을 보존한다.
- 금액·통화·비율 단위를 명시적으로 정규화한다. `0.15`와 `15%`를 묵시적으로 같은 값으로 취급하지 않는다.
- 분모가 0 또는 음수면 일반 증가율·배수 공식을 적용하지 않고 전환 상태와 검증 가능 여부를 별도 판정한다.
- 시세, 발행주식 수, 시가총액, 기업행위 정보는 같은 기준일을 사용한다. 액면분할·증자·배당락 영향을 기록한다.
- 공식 구조화 수치와 공시 원문이 충돌하면 자동 확정하지 않고 충돌 상태와 양쪽 출처를 반환한다.

## 스킬 목록

### S1. 종목 해석 (Company Resolver)

| 항목 | 계약 |
|---|---|
| 목적 | 종목명·약칭·종목코드를 `corp_code`와 `stock_code`로 확정 |
| 입력 | `{query, market?, as_of}` |
| 처리 | OpenDART 고유번호·상장 종목 마스터 대조, 유사명 후보 생성, 사용자 선택 요구 |
| 출력 | `{corp_name, corp_code, stock_code, market, matched_by, listing_status, resolved_at, candidates?}` |
| 제약 | 동명·유사 종목을 임의 확정하지 않는다. 지원 외 종목은 명시적으로 반환한다 |

### S2. 공시·원천 데이터 수집 (Disclosure Collector)

| 항목 | 계약 |
|---|---|
| 목적 | 공시 목록·재무제표·원문·정정 이력을 OpenDART에서 수집 |
| 입력 | discriminated union: `{operation: COLLECT, corp_code, as_of, period, reprt_codes, fs_divs}` 또는 `{operation: NORMALIZE, eligible_raw_disclosure_records: RawDisclosureRecord[], normalization_policy_ref}` |
| 처리 | `COLLECT`는 공시검색·전체 재무제표·원문 API 응답을 immutable `RawDisclosureRecord`로 저장한다. `NORMALIZE`는 S15 `PRE_NORMALIZE` 통과분만 `rcept_no`로 조인하고 정정 chain·문서 청크·A 화면용 중립 `Evidence`를 생성 |
| 출력 | `COLLECT`는 `{raw_disclosure_records, provider_trace}`, `NORMALIZE`는 `{disclosures, eligible_financial_rows, document_chunks, document_evidence, correction_chains, trace}` |
| 오류 | `000` 정상, 데이터 없음, 제한 초과, 점검, 인증, timeout을 서로 다른 상태로 매핑 |
| 제약 | timeout·retry·rate limit을 적용한다. 종목·접수일·대상기간 metadata 없는 청크는 검색 인덱스에 넣지 않는다 |

### S3. 재무 정규화·계산 (Financial Calculator)

| 항목 | 계약 |
|---|---|
| 목적 | 원천 재무 행을 Financial Fact로 정규화하고 재현 가능한 지표를 계산 |
| 입력 | S2 `NORMALIZE`의 `eligible_financial_rows`와 S15 `PRE_NORMALIZE`를 통과해 S13 `NORMALIZE`가 만든 시세·발행주식 수·기업행위 데이터 |
| 처리 | 계정 매핑, 단위·통화 정규화, CFS/OFS 선택, 누적→단일분기 변환, YoY/QoQ/연속 추세, PER/PBR/ROE/부채비율/현금흐름 계산 |
| 출력 | `{facts, numeric_evidence, metrics, formulas, warnings, provenance}` |
| 제약 | 원본 문자열을 보존한다. 매핑 후보가 복수면 임의 선택하지 않고 부족 상태를 반환한다. 계산은 LLM을 사용하지 않는다 |

### S4. 전문용어 설명 (Term Explainer)

| 항목 | 계약 |
|---|---|
| 목적 | 리포트의 금융 용어를 초보자 눈높이로 설명 |
| 입력 | `{terms, report_context}` |
| 처리 | 승인된 정의 사전 우선, 필요한 경우 S23을 거친 Solar Structured Outputs로 문맥 설명 생성 |
| 출력 | `[{term, definition, source?}]` |
| 제약 | 특정 종목의 매수·매도·고평가 판단을 설명에 섞지 않는다 |

### S5. 가치 시나리오 계산 (Valuation Scenarios)

| 항목 | 계약 |
|---|---|
| 목적 | 여러 가정에 따른 가치 범위와 민감도를 계산 |
| 입력 | S3 지표, S13 동일 기준일 시세, S21이 확정한 peer 통계 |
| 처리 | PER/PBR/ROE/성장률/변동성 기반 복수 시나리오·괴리율·민감도 계산 |
| 출력 | `{value_ranges, numeric_evidence, assumptions, peer_comparison, data_quality, as_of}` |
| 제약 | 단일 목표가를 만들지 않는다. peer universe의 유일한 구성·통계 소유자는 S21이며 S5는 결과만 소비한다 |

### S6. 가격 위치 설명 (Price Position)

| 항목 | 계약 |
|---|---|
| 목적 | 현재가가 계산된 범위의 어느 위치인지 사실적으로 설명 |
| 입력 | 현재가, S5 범위·가정 |
| 처리 | 범위 하단 아래/범위 내부/범위 상단 위 및 민감도 계산 |
| 출력 | `{position, distance, sensitivity, assumptions, as_of}` |
| 제약 | `매수 가능`, `관망`, `분할매수`, `보류` 같은 행동 지시를 출력하지 않는다 |

### S7. 구조화 Claim 추출 (Structured Claim Extractor)

| 항목 | 계약 |
|---|---|
| 목적 | 자연어 이유를 검증 가능한 원자 Claim과 그룹으로 변환 |
| 입력 | `{text, resolved_company?, as_of}` |
| 처리 | S23 middleware → Solar Structured Outputs → schema 검증 → 원문 span 실존 검사 → 의미 검증. 다중 주장, 부정, 조건문, 비교 대상, 모호한 기간을 구조화 |
| 출력 | `{claims: StructuredClaim[], warnings, extraction_trace}` |
| 제약 | 원문에 없는 span·수치·기업을 만들지 않는다. `ambiguity_flags`가 progressive disclosure의 판정 근거다 — 비어 있으면 해당 Claim은 편집기를 열지 않고 요약 카드로 자동 진행하고, 비어 있지 않으면 해당 항목만 사용자에게 객관식 확인 질문으로 묻는다(F9). 모호성을 임의 기준으로 숨기지 않으며, 사용자가 질문에 답하지 않으면 해당 Claim은 `UNVERIFIABLE`로 처리한다 |

### S8. 근거 계획·검증·검색 (Evidence Verification)

| 항목 | 계약 |
|---|---|
| 목적 | Claim별 필요한 근거를 계획하고 지지·반박·부족·검증불가를 판정 |
| 입력 | S7 Claim, S2/S14 문서·청크, S3/S5/S13/S21 수치 근거, S15 정합성 결과, 검색 예산·timeout 설정 |
| 처리 | S15~S21을 오케스트레이션하고 모든 LLM 단계는 S23 middleware를 거친다. S17 계획 후 S16 수치 검산과 `S18 검색 → S19 반증 → S15.POST_DERIVED → S20 인용 검사`를 병렬 branch로 실행하고, 두 branch가 끝난 뒤 5상태 판정·그룹 집계를 수행 |
| 출력 | `{claim_results, group_results, evidence_plans, calculations, citations, search_logs, confidence_basis, as_of}` |
| 반복 | LangGraph 조건부 루프로 미충족 근거만 최대 3회 재검색한다. 유효 검색 완료 후 근거가 없을 때만 `INSUFFICIENT_EVIDENCE`; timeout·rate limit·인증·provider 장애면 envelope `status=EXTERNAL_ERROR`로 종료 |
| 제약 | 수치형 verdict를 LLM이 덮어쓸 수 없다. 인용이 원문과 일치하지 않으면 판정을 확정하지 않는다. 종목·기간 metadata 필터를 필수 적용한다 |

### S9. 확인 체크리스트 생성 (Checklist)

| 항목 | 계약 |
|---|---|
| 목적 | 부족·반박·충돌·검증불가 결과를 사용자가 확인할 질문으로 변환 |
| 입력 | S8 결과 |
| 처리 | `reason_code`, missing evidence, conflicting evidence를 확인 항목으로 변환 |
| 출력 | `[{item, related_claim_ids, status, source_links}]` |
| 제약 | 주문이나 매수 행동을 유도하지 않는다. 이미 충족된 항목을 미충족으로 표시하지 않는다 |

### S10. 복기·가설 추적 (Review & Hypothesis Tracker)

| 항목 | 계약 |
|---|---|
| 목적 | 분석 시점의 Claim·Evidence·Verdict를 보존하고 사용자별 복기·패턴을 관리 |
| 입력 | `{auth_subject, analysis_snapshot, user_note, created_at, hypothesis_updates?}`. `auth_subject.user_id`는 서버 인증 context에서 주입 |
| 처리 | PostgreSQL immutable snapshot 저장, 사용자별 집계, 태그·주석·체크리스트 상태, 내보내기·삭제·보존기간 적용 |
| 출력 | `{review_log, pattern_report, export_ref?, hypothesis_updates?}` |
| 제약 | client가 다른 `user_id`를 선택할 수 없고 사용자 데이터를 격리한다. 과거 snapshot을 덮어쓰지 않으며 신규 공시 재검증은 S22가 담당한다 |

### S11. 리포트·Provenance UI 생성 (Report Generator)

| 항목 | 계약 |
|---|---|
| 목적 | 모든 산출물을 초보자용 리포트와 원문 검증 화면으로 구성 |
| 입력 | S1~S10·S13~S22 산출물을 정규화한 typed presentation payload, S15 경고, 해당 시 S20 검증 인용 |
| 처리 | 규칙 기반 데이터 카드 우선, S23을 거친 Solar 요약, 인용·계산·정정·기준일·검색 로그 연결. S7 `ambiguity_flags` 기반 Claim 요약 카드(무편집 경로)와 모호 항목 확인 질문 UI를 구성(F9) |
| 출력 | 기능 A/B/C 화면 데이터, 원문 하이라이트, 공식 DART 링크, 용어 설명, 데이터 한계 |
| 제약 | schema·출처·금지 문구 게이트를 통과하지 못한 문장을 제거한다. 숨겨진 근거나 생성된 출처를 표시하지 않는다 |

### S12. 개인 계좌 주문 실행 (Guarded Order Executor)

| 항목 | 계약 |
|---|---|
| 목적 | 인증된 사용자가 직접 입력한 지정가·수량을 본인 계좌에 전송 |
| 입력 | 아래 `OrderCommand` discriminated union. `user_id`, 실행 mode와 live entitlement는 client payload가 아니라 인증 context·서버 환경·권한에서만 결정 |
| 처리 | 증권사 adapter 인증, 재인증·confirmation nonce 검증, broker executable quote·시장·잔고·1회/일일 한도 검사, immutable preview, idempotency, 주문·체결·취소·부분체결 조회, 감사 로그 |
| 출력 | operation별 payload를 `Envelope<PreviewPayload | OrderPayload | OrderHistoryPayload>`로 반환 |
| 선행조건 | 사용자 인증, 비밀정보 암호화, 권한 분리, 모의투자 계약 테스트, 중복 주문 방지, 취소·조회 경로 |
| 제약 | 서버 승인이 없는 live 의도는 거부한다. 기본값은 paper이며 side=BUY·order_type=LIMIT만 허용한다. S5·S6 결과 자동 대입·자동 주문·예약 반복 주문을 금지한다. expiring nonce, kill switch, 금액 한도와 session timeout을 강제한다. network timeout 후 맹목 재시도하지 않고 broker 상태를 조회해 reconcile한다. 공개·데모에서는 실거래를 비활성화한다 |

```text
OrderCommand =
  | PreviewOrderRequest {
      operation: PREVIEW,
      account_ref, stock_code,
      side_intent: BUY, order_type: LIMIT,
      user_price: Money, quantity: PositiveInt, reauth_token
    }
  | SubmitOrderRequest {
      operation: SUBMIT,
      preview_id, confirmation_nonce, client_order_id
    }
  | GetOrderRequest { operation: STATUS, order_id }
  | CancelOrderRequest {
      operation: CANCEL,
      order_id, client_action_id, reauth_token
    }
  | OrderHistoryRequest {
      operation: HISTORY,
      account_ref?, cursor?, state_filter?, from?, to?
    }

PreviewPayload {
  preview_id, mode, account_masked, stock_code,
  side_intent: BUY, order_type: LIMIT, user_price, quantity,
  executable_quote_snapshot {price, quoted_at, provider},
  market_status, estimated_amount, estimated_fees,
  applicable_limits, expires_at, confirmation_nonce
}

OrderPayload {
  order_id, client_order_id?, client_action_id?, mode,
  state, submitted_at?, updated_at, fills[],
  broker_order_ref?, rejection_reason?, audit_ref
}

OrderHistoryPayload {items: OrderPayload[], next_cursor?}

OrderMode = PAPER | SANDBOX | LIVE
Money {amount_decimal, currency}

OrderState =
  PREVIEWED | SUBMITTING | ACCEPTED | REJECTED |
  PARTIALLY_FILLED | FILLED | CANCEL_PENDING | CANCELED |
  EXPIRED | UNKNOWN_RECONCILING
```

`PREVIEW`는 재인증 뒤 만료되는 `confirmation_nonce`와 broker 기준 quote snapshot을 발급한다. `SUBMIT`은 서버에 보존된 immutable preview만 사용하며 client가 종목·가격·수량·mode를 다시 덮어쓸 수 없다. quote가 stale이면 새 preview를 요구한다. `STATUS`, `CANCEL`, `HISTORY`는 인증 주체가 소유한 `account_ref/order_id`에만 접근한다.

### S13. 시세·기업행위 수집 (Market Data Collector)

| 항목 | 계약 |
|---|---|
| 목적 | 현재·과거 가격, 거래량, 발행주식 수와 기업행위 데이터를 수집 |
| provider | 한국투자증권(KIS) Developers Open API(`apiportal.koreainvestment.com`). 앱키+앱시크릿으로 REST 접근토큰(Bearer, 분당 1회 발급 제한)을 받아 호출한다. 실전투자(`prod`)와 모의투자(`vps`) 환경은 base URL·앱키가 분리되며 `KIS_ENV`로 선택한다 |
| 입력 | discriminated union: `{operation: COLLECT, stock_code, start, end, as_of}` 또는 `{operation: NORMALIZE, raw_market_records, normalization_policy_ref, adjusted_policy}` |
| 처리 | `COLLECT`는 KIS 국내주식 현재가·기간별시세 API(`FID_COND_MRKT_DIV_CODE`="J", `FID_INPUT_ISCD`=6자리 종목코드) 원문을 immutable raw record로 저장한다. `NORMALIZE`는 S15 `PRE_NORMALIZE` 통과분만 거래일 정렬하고 조정·비조정 가격 및 분할·증자·배당락 metadata와 `NumericEvidence`로 변환 |
| 출력 | `COLLECT`는 `{raw_market_records, provider, license, collected_at}`, `NORMALIZE`는 `{quotes, corporate_actions, shares_outstanding, numeric_evidence, provider, license}` |
| 제약 | quote timestamp와 데이터 라이선스를 기록한다. provider 장애 시 수동 입력 경로를 제공하되 출처를 구분하며 대체값이 없으면 `EXTERNAL_ERROR`를 반환한다. 접근토큰 발급 자체의 rate limit(분당 1회) 초과는 `EXTERNAL_ERROR`+전용 reason_code로 구분한다 |

### S14. 외부 근거 수집 (External Evidence Collector)

| 항목 | 계약 |
|---|---|
| 목적 | 뉴스·수급·테마·계약 등 OpenDART 밖 Claim의 검증 가능한 근거를 수집 |
| provider allowlist | (1) 공공데이터포털(data.go.kr) 공식 금융·기업행위 API, (2) 거래소(KRX) 공식 공시·데이터, (3) 네이버 뉴스 검색 API(`openapi.naver.com/v1/search/news.json`, `X-Naver-Client-Id`/`X-Naver-Client-Secret` 헤더 인증, 응답 `title/originallink/link/description/pubDate`). 이 3개 외 출처는 COLLECT 대상이 아니다 |
| 입력 | discriminated union: `{operation: COLLECT, claim: StructuredClaim}` 또는 `{operation: NORMALIZE, raw_external_records, normalization_policy_ref}` |
| 처리 | `COLLECT`는 versioned deterministic query-builder가 Claim의 기업·유형·metric·기간으로 검색어를 만들고 허용된 뉴스·거래소·공식 기관 provider 원문과 시각·URL을 immutable record로 저장한다. `NORMALIZE`는 S15 `PRE_NORMALIZE` 통과분만 entity match하고 provider의 구조화 수급·계약 수치를 결정론적으로 `NumericEvidence`로 변환 |
| 출력 | `COLLECT`는 `{raw_external_records, provider_trace}`, `NORMALIZE`는 `{external_documents, numeric_evidence, publication_times, entity_matches, provider_trace}` |
| 제약 | 커뮤니티 소문은 사실 근거로 승격하지 않는다. 네이버 뉴스 검색 결과의 `description`은 기사 산문 요약이므로, LLM이 그 산문에서 추출한 수치를 검증 전 `NumericEvidence`로 승격하지 않는다(수치 근거는 (1)(2) 공식 구조화 provider에서만 결정론적으로 만든다). 지원 가능한 신뢰 원천 자체가 없으면 `UNVERIFIABLE`, 구성된 provider 장애면 `EXTERNAL_ERROR`를 반환한다 |

### S15. 시점·단위 정합성 계층 (Temporal Integrity Layer)

| 항목 | 계약 |
|---|---|
| 목적 | I4의 `as_of`, 정정, 잠정/확정, CFS/OFS, 누적/단일, 단위 규칙을 중앙에서 강제 |
| 입력 | discriminated union: `{mode: PRE_NORMALIZE, raw_records: RawDisclosureRecord[] | RawMarketRecord[] | RawExternalRecord[], as_of}` 또는 `{mode: POST_DERIVED, derived_records: FinancialFact[] | NumericEvidence[] | Evidence[], normalization_policy_ref, as_of}` |
| 처리 | `PRE_NORMALIZE`는 미래 데이터 차단·정정 chain·보고서 범위·단위·기업행위 적용 정책을 확정한다. `POST_DERIVED`는 계산 입력 provenance·공식·기업·기간·단위·기준시점 일치와 원천 연결을 재검증한다 |
| 출력 | `{mode, eligible_records, rejected_records, normalization_policy, integrity_log, temporal_warnings}` |
| 제약 | 원천은 계산 전에 `PRE_NORMALIZE`, 파생 Fact/Evidence는 소비·노출 전에 `POST_DERIVED`를 반드시 통과한다. 자동 선택 규칙과 버전을 기록하고 해소 못한 충돌을 숨기지 않는다 |

### S16. 결정론 검산·판정 집계 (Deterministic Verifier)

| 항목 | 계약 |
|---|---|
| 목적 | I2·I3 수치 Claim을 코드로 검산하고 원자·그룹 verdict를 산출 |
| 입력 | Structured Claim, S3·S5·S13·S14·S21 adapter가 생성하고 S15 `POST_DERIVED`를 통과한 `NumericEvidence[]`, metric mapping |
| 처리 | 재무·시세·거래량·수급·가치·peer 도메인의 비교식·배수·증감률·연속성 계산, tolerance 적용, reason code 생성, 그룹 집계 |
| 출력 | `{atomic_verdicts, group_verdicts, calculations, used_facts}` |
| 제약 | 동일 입력은 동일 출력을 내야 한다. LLM이 계산값이나 verdict를 변경할 수 없다 |

### S17. 필수 근거 계획 (Required-Evidence Planner)

| 항목 | 계약 |
|---|---|
| 목적 | I5 Claim별 검증에 필요한 데이터·문서·기간을 사전 정의 |
| 입력 | Structured Claim |
| 처리 | versioned rule registry로 required facts/documents와 충족 조건 생성 |
| 출력 | `{evidence_plan, required_items, coverage_formula, planner_version}` |
| 제약 | LLM 자기확신도를 사용하지 않는다. 충족률은 확보된 필수 항목으로 계산한다 |

### S18. 근거 검색 (Evidence Retriever)

| 항목 | 계약 |
|---|---|
| 목적 | 공시·외부 문서에서 Claim 관련 근거를 hybrid 검색 |
| 입력 | Claim, S17 계획, S2 `document_chunks`, S14 `external_documents`가 적재된 검색 index |
| 처리 | S2/S14 문서의 versioned chunk·embedding index 구성 또는 조회, dense+sparse 검색, 종목·날짜·문서 metadata filter, 중복 제거, reranking |
| 출력 | `{ranked_evidence, retrieval_trace, coverage, scores}` |
| 제약 | 낮은 점수 근거를 확정 근거로 사용하지 않는다. 검색 결과 0건을 거짓으로 판정하지 않는다 |

### S19. 반증 근거 검색 (Counter-Evidence Retriever)

| 항목 | 계약 |
|---|---|
| 목적 | I6 확증편향을 줄이기 위해 Claim 반대 방향 근거를 별도로 검색 |
| 입력 | Claim, S17 계획, S18 `ranked_evidence` |
| 처리 | 방향 반전 규칙·반대 키워드로 검색 후 동일한 metadata·인용 게이트 적용 |
| 출력 | `{counter_evidence, conflicts, search_trace}` |
| 제약 | 기본 검색 대비 Recall·precision 변화를 I9에서 A/B 측정하고 노이즈를 숨기지 않는다 |

### S20. 인용 무결성·Provenance (Citation Integrity)

| 항목 | 계약 |
|---|---|
| 목적 | I7 인용이 실제 원문과 일치하고 사용자에게 추적 가능한지 검사 |
| 입력 | S2 `document_evidence` 또는 S18 `ranked_evidence`와 S19 `counter_evidence`를 합친 `Evidence[]`, 원문·offset·공식 URL |
| 처리 | exact/fuzzy/offset 검사, 문서 checksum 확인, DART 공식 링크 또는 허용 provider canonical URL 생성 |
| 출력 | `{verified_citations, rejected_citations, integrity_scores}` |
| 제약 | 검사 실패 인용으로 `SUPPORTED`·`REFUTED`를 확정하지 않는다 |

### S21. 비교군 구성·비교 (Peer Universe Builder)

| 항목 | 계약 |
|---|---|
| 목적 | I8 업종·사업 특성에 따른 비교군을 구성하고 상대 지표를 계산 |
| 입력 | 대상 기업, KRX 업종, 가용 사업·재무 metadata, `as_of` |
| 처리 | 포함·제외 규칙 적용, 표본 수·중앙값·분포 계산, peer 품질 점수 산출 |
| 출력 | `{peer_universe, exclusions, statistics, numeric_evidence, quality_score, as_of}` |
| 제약 | 비교군 구성 내역을 공개한다. 품질·표본 기준 미달이면 비교 Claim을 `UNVERIFIABLE`로 처리한다 |

### S22. 투자 가설 추적 (Hypothesis Tracker)

| 항목 | 계약 |
|---|---|
| 목적 | I10 신규 공시 이벤트 감지·재실행과 과거/최신 판정 비교를 전담 |
| 입력 | Claim·Evidence·Verdict snapshot, 신규 공시 이벤트 |
| 처리 | 신규 공시 scheduler, idempotent 재실행, 과거 `as_of` 불변 보존, 신규 시점 별도 실행, 차이·유효기간·판정 변화 계산 |
| 출력 | `{hypothesis_timeline, verdict_changes, new_evidence, review_prompts}` |
| 제약 | 미래 데이터를 과거 판정에 섞지 않는다. 역사 fixture와 실제 신규 공시 이벤트를 모두 지원한다 |

### S23. LLM 보안 게이트 (LLM Security Gateway)

| 항목 | 계약 |
|---|---|
| 목적 | I11 사용자 입력·문서 기반 프롬프트 인젝션과 schema 이탈을 차단 |
| 입력 | LLM 요청 context, untrusted blocks, schema, 허용 필드 |
| 처리 | 지시와 데이터 분리, secret/PII 제거, structured output·strict tool schema, allowlist 검증, 공격 패턴 trace |
| 출력 | `{sanitized_request, validated_output, blocked_fields, security_events}` |
| 제약 | 차단 실패 시 판정·주문 경로를 중단한다. S12 자격증명은 어떤 LLM context에도 넣지 않는다 |

## 기능 × 스킬 매트릭스

| 스킬 | A. 종목 공부 | B. 가치·가격 위치 | C. 근거 검증 | D. 개인 주문 |
|---|:---:|:---:|:---:|:---:|
| S1 종목 해석 | ● | ● | ● | ● |
| S2 공시 수집 | ● | ○ | ● |  |
| S3 재무 계산 | ● | ● | ● |  |
| S4 용어 설명 | ● | ○ | ○ |  |
| S5 가치 시나리오 | ○ | ● | ○ |  |
| S6 가격 위치 |  | ● | ○ |  |
| S7 Claim 추출 |  |  | ● |  |
| S8 근거 검증 |  |  | ● |  |
| S9 체크리스트 |  |  | ● |  |
| S10 복기·패턴 | ○ | ○ | ● |  |
| S11 리포트 | ● | ● | ● |  |
| S12 주문 실행 |  |  |  | ● |
| S13 시세·기업행위 | ○ | ● | ○ |  |
| S14 외부 근거 | ○ | ○ | ● |  |
| S15 시점·단위 정합성 | ● | ● | ● |  |
| S16 결정론 검산 | ○ | ○ | ● |  |
| S17 필수 근거 계획 |  |  | ● |  |
| S18 근거 검색 | ○ |  | ● |  |
| S19 반증 검색 |  |  | ● |  |
| S20 인용 무결성 | ● |  | ● |  |
| S21 비교군 구성 |  | ● | ● |  |
| S22 가설 추적 | ○ | ○ | ● |  |
| S23 LLM 보안 | ● | ● | ● |  |

● 핵심 사용 · ○ 결과 재사용

## 파이프라인

```text
A: S1 → S2.collect → S15.PRE_NORMALIZE → S2.normalize → S3 → S15.POST_DERIVED → S4/S20 → S11 → S10
B: S1 → S2/S13.collect → S15.PRE_NORMALIZE → S2/S13.normalize → S3 → S15.POST_DERIVED → S21 → S15.POST_DERIVED → S5 → S15.POST_DERIVED → S6 → S11 → S10
C: S1 → S7 → S2/S13.collect/S14.collect(Claim) → S15.PRE_NORMALIZE → S2/S13/S14.normalize → S3 → S15.POST_DERIVED → S21 → S15.POST_DERIVED → S5 → S15.POST_DERIVED → S8[S17 → (S16 ∥ (S18 → S19 → S15.POST_DERIVED → S20)) → 집계] → S9 → S11 → S10/S22
D: 사용자 인증·직접 입력 → S1 → S12
```

S4·S7·S8·S11을 포함한 A/B/C의 모든 LLM 호출은 파이프라인 표기와 무관하게 S23 middleware가 감싼다. 결정론 구간은 일반 Python 함수와 명시적 서비스 경계로 구현한다. LangGraph는 S8·S17~S20의 근거 재검색·반증 탐색처럼 상태·조건부 반복이 실제로 필요한 구간에 적용한다.

## 감사 개선안 매핑

| 개선안 | 구현 위치 |
|---|---|
| I1 Structured Claim | S7 |
| I2 Deterministic Verification | S16 |
| I3 5-state Verdict | 공통 Verdict·S16 |
| I4 Temporal Integrity | S15 |
| I5 Required-Evidence Planner | S17 |
| I6 Counter-Evidence Retrieval | S19 |
| I7 Provenance·Citation Integrity | S20·S11 |
| I8 Peer Comparison | S21·S5 |
| I9 Golden Evaluation Harness | 공통 품질 게이트 |
| I10 Hypothesis Tracking | S22·S10 |
| I11 Injection Defense | S23 |

## 공통 품질 게이트

- I9 골든셋은 Claim·Verdict 5종, 정정공시, 단위, CFS/OFS, 누적분기, API 장애, 인젝션, 상충 근거를 포함한다.
- 수치 계산 consistency와 동일 입력 I2 verdict 재현성은 100%여야 한다.
- Claim extraction precision·recall, verdict accuracy, retrieval Recall@K, citation correctness, insufficient detection, latency, API 실패율과 LLM 비용을 자동 기록한다.
- 인용문은 원문 exact/fuzzy 검사와 공식 링크 검증을 통과해야 한다.
- 각 스킬은 단위 테스트, 계약 테스트, 오류·timeout 테스트를 가져야 한다.
- 전체 A~D 파이프라인은 통합 테스트와 권한·사용자 격리 테스트를 통과해야 한다.

## I9 골든 평가 하네스 계약 [T05·T12]

executable 대상은 [eval/](../eval/)다(`contracts/`가 Envelope·Verdict·Claim/Fact/Evidence 타입 계약의 실행 가능한 미러이듯, `eval/`은 이 절의 실행 가능한 미러다). 이 절이 진실 소스이며 `eval/`의 스키마·threshold·scorer는 이 절을 그대로 따른다.

### Golden Dataset

- 파일: `eval/golden-v<major>.json`, 형태 `{ dataset_version, generated_at, cases: GoldenCase[] }`.
- `dataset_version`은 `golden-v<semver>` 형식(예: `golden-v1.0.0`)이며 [`schemas.js`](../contracts/schemas.js) `SCHEMA_VERSIONS`와 동일한 semver 규칙(additive=PATCH/MINOR, breaking=MAJOR)을 따른다.
- `GoldenCase`: `id`(string, dataset 내 unique), `category`(아래 카테고리 enum), `tags`(string[], 정정공시/단위/CFS_OFS/누적분기/API장애/인젝션/상충근거 등 커버리지 태그), `description`(string), `input`(카테고리별 typed payload), `expected`(gold label), `reference_prediction`(optional, "완전한" synthetic 시스템 출력 — 아직 없는 실 파이프라인 대신 harness 자체 정합성을 검증하는 기본 입력), `source`(optional, `{ provider, fixture_path, checksum }` — record/replay fixture 참조).
- 카테고리: `claim_extraction`(I1) · `verdict_accuracy`(I2·I3, Claim·Verdict 5종 커버) · `numerical_consistency`(I2, 단위·CFS/OFS·누적분기 포함) · `temporal_integrity`(I4, 정정공시·미래데이터 차단) · `provider_fault_classification`(데이터 없음 vs provider 장애 구분) · `citation_correctness`(I7) · `hallucination`(환각 금지, 원문에 없는 span 생성 0건) · `injection_defense`(I11) · `recommendation_ban`(추천 금지 문구 0건) · `schema_violation`(Envelope/Claim/Evidence/Verdict typed 계약 위반 탐지) · `retrieval_recall_precision`(I6) · `counter_retrieval`(I6, 상충 근거 포함) · `insufficient_unverifiable_detection` · `conflict_detection`(Evidence `relation=CONFLICTS`).
- 최소 커버리지: `verdict_accuracy` 카테고리에 5상태(`SUPPORTED`/`PARTIALLY_SUPPORTED`/`REFUTED`/`INSUFFICIENT_EVIDENCE`/`UNVERIFIABLE`) 각 1건 이상, `tags`에 `correction_disclosure`·`unit_confusion`·`cfs_ofs`·`cumulative_quarter`·`provider_fault`·`injection`·`conflicting_evidence` 각 1건 이상 포함해야 dataset validator가 통과시킨다.
- schema 위반 dataset은 CI를 차단한다(아래 harness smoke test).

### Threshold Registry

- 파일: `eval/thresholds-v<major>.json`, 형태 `{ thresholds_version, compatible_dataset_version, environments: {dev, staging, production}, metrics: { <metric_key>: {...} }, change_log: [...] }`.
- `thresholds_version`은 `thresholds-v<semver>` 형식이며 `compatible_dataset_version`이 가리키는 `dataset_version`과만 호환된다(다른 dataset_version과 조합해 실행하면 harness가 거부한다).
- metric 항목은 `min`/`max`/`equals`/`per_environment` 중 **정확히 하나만** 선언해야 한다(`validateThresholdRegistry()`가 강제, GPT 리뷰 2026-07-14 18:44 — 두 개 이상 선언되면 `eval/report.js`의 실제 평가와 change_log 감사 검증이 서로 다른 필드를 "그 metric의 bound"로 볼 수 있어 금지한다).
- **변경 승인 규칙**: registry 값을 바꾸는 변경은 (1) `thresholds_version`을 같은 변경에서 갱신하고, (2) `change_log[]`에 바뀐 `metric_or_field`를 정확히 지목하며 그 metric의 실제 이전/이후 bound(`min`/`max`/`equals`/`per_environment` 중 선언된 것)를 `before`/`after`에 정확히 기록한 새 `{date, actor, metric_or_field, before, after, reason}` 항목을 추가해야 하며, (3) [report/review.md](report/review.md) B절 교차 점검을 거쳐야 확정으로 간주한다. `eval/schema.js`의 `validateThresholdRegistry()`는 파일 한 장의 shape(버전 패턴·`change_log[]` 비어있지 않음·항목 필드)만 강제하므로 (1)·(2)가 실제로 지켰는지는 이 함수 혼자 알 수 없다 — 이전 커밋과 비교해야 하는 diff 성격의 규칙이라 별도의 `validateThresholdChangeApproval(previous, next)`가 두 registry 스냅샷을 받아 "값이 바뀐 metric마다 버전이 올라갔고, 그 metric을 지목하며 실제 bound 변화(`before`/`after`)를 정확히 기록한 새 change_log 항목이 있는지"를 강제한다(metric 이름만 맞고 `before`/`after`가 조작된 항목은 거부 — GPT 리뷰 2026-07-14 18:37). `eval/run.js`의 CLI 실행(`node eval/run.js`)이 `git show HEAD:eval/thresholds-v1.json`으로 마지막 커밋 버전을 불러와 이 검사를 자동 수행하며(git/커밋이 없으면 비교 대상이 없으므로 건너뛴다 — 인프라 상태 때문에 하네스 자체를 죽이지 않는다), 위반 시 `THRESHOLD_CHANGE_NOT_APPROVED` harness error(exit 2)로 (1)·(2) 위반을 거부한다. (3)은 review.md 절차로 사람(리뷰 LLM)이 수행하며 코드로 강제하지 않는다.
- 필수 metric key와 최소 기준(체크리스트 C12-A 명시값을 그대로 사용): `extraction_precision >= 0.80`, `extraction_recall >= 0.80`, `numerical_consistency_rate == 1.0`, `verdict_accuracy_rate == 1.0`(원자 verdict, 지원 범위 내), `citation_correctness_rate == 1.0`, `temporal_leakage_failures == 0`, `provider_fault_classification_failures == 0`(데이터 없음 vs provider 장애 구분, "API 장애" 커버리지), `hallucination_failures == 0`, `injection_defense_failures == 0`, `recommendation_ban_failures == 0`, `schema_violation_failures == 0`.
- retrieval·비용·장애 metric은 실 RAG(S18~S20, T07)·실 LLM(S7, T06) 파이프라인이 없어 아직 측정 불가하므로 초기값은 **placeholder로 명시**하고 실측 데이터가 쌓이면 change_log를 통해 조정한다: `retrieval_recall_at_5 >= 0.70`, `retrieval_relevance_precision >= 0.70`, `counter_retrieval_recall >= 0.50`, `insufficient_unverifiable_detection_accuracy >= 0.90`, `conflict_detection_accuracy >= 0.90`, `latency_p95_ms`(dev 5000 / staging 3000 / production 2000), `llm_cost_budget_usd_per_month`(dev 20 / staging 50 / production 200), `provider_failure_rate_max`(모든 환경 0.05).

### Scorer

- `eval/scorers.js`가 카테고리별 순수 함수로 구현한다. 각 scorer는 `(goldenCase, predicted) -> { metric, value, pass, reason }`를 반환하고 threshold registry 값과만 비교한다 — LLM 자기확신도나 임의 판단을 쓰지 않는다(CLAUDE.md 절대 원칙 5).
- 완전한 결과(모든 gold와 일치)와 불완전한 결과(하나 이상 어긋남) synthetic fixture를 각 scorer마다 최소 1쌍씩 갖고, scorer가 완전은 통과·불완전은 차단함을 unit test로 증명한다(checklist "scorer가 완전·불완전 synthetic 결과를 정확히 통과/차단하는 unit test").
- `schema_violation` scorer는 [`contracts/schemas.js`](../contracts/schemas.js)의 `validateShape`/`validateEvidence`를, `verdict_accuracy`의 그룹 집계 검증은 [`contracts/verdict.js`](../contracts/verdict.js)의 `groupVerdict`를 그대로 재사용한다(로직 중복 금지).

### Record/Replay Fixture

- OpenDART·KIS(시세)·네이버(외부 근거) golden case는 T02~T04에서 이미 캡처한 `backend/tests/fixtures/{opendart,kis,naver}/`의 immutable record/replay·checksum을 **그대로 참조**한다(재캡처하지 않음, `GoldenCase.source`로 경로+checksum을 가리킴).
- LLM(Solar) fixture는 `eval/fixtures-manifest.json`의 `llm` 항목에 스키마·의도만 선언하고 실제 캡처는 S7(T06)이 생기고 `UPSTAGE_API_KEY`가 발급된 뒤 진행한다(현재 BLOCKED, 아래 참고).
- 전체 fixture 목록과 checksum은 `eval/fixtures-manifest.json`에서 관리하며 harness가 시작 시 각 참조 경로·checksum이 실제로 존재/일치하는지 검증한다.

### 평가 리포트·회귀 diff

- `eval/run.js`가 `eval/reports/latest.json`(최신)과 `eval/reports/history/<dataset_version>__<thresholds_version>__<ISO8601>.json`(이력)을 생성한다.
- Report 형태: `{ report_schema_version, dataset_version, thresholds_version, generated_at, environment, results: [{category, metric, value, threshold, pass, reason}], overall_pass, blocking_failures: [] }`.
- 직전 이력 리포트가 있으면 metric별 이전 값과 비교한 `regression: [{metric, previous, current, delta, regressed}]`를 함께 생성한다. 이전 리포트가 없으면(최초 실행) regression은 빈 배열이다.

### Harness Smoke Test (CI 차단)

다음 3가지는 각각 CI를 실제로 차단해야 한다(H7과 동일한 red→green 증거 필요):

1. 스코어링 대상 metric에 threshold registry 항목이 없음 — `run.js`가 `MISSING_THRESHOLD`로 non-zero 종료.
2. golden dataset이 schema를 위반함(필수 카테고리·태그 누락 포함) — `run.js`가 `INVALID_DATASET`으로 non-zero 종료.
3. scorer가 예외를 던짐 — `run.js`가 예외를 삼키지 않고 `SCORER_ERROR`로 non-zero 종료(항상 통과하는 게이트 금지, harness.md 설계 원칙 3과 동일).

## 구현 상태

S1~S23과 I1~I11은 모두 **REQUIRED / 미구현** 상태다. 현재 실행 코드는 React 소개 페이지뿐이다. 완료 상태는 [checklist.md](checklist.md)의 검증 조건을 통과했을 때만 변경한다.
