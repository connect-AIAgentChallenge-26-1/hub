---
id: WI-0011
title: PP-009 조건 추출 Port Schema Eval
type: work-record
status: done
date: 2026-07-13
owners:
  - placepick-team
related:
  - ../roadmap.md
  - ../adr/ADR-0004-service-boundary.md
  - ../adr/ADR-0007-provider-and-live-boundary.md
  - ../adr/ADR-0012-recommendation-core-and-split-live-boundary.md
  - WI-0041-recommendation-core-split-live-workflow.md
paths:
  - backend/src/main/java/com/placepick/recommendation/condition/**
  - backend/src/main/java/com/placepick/infrastructure/external/llm/EliceConditionExtractionClient.java
  - backend/src/test/java/com/placepick/recommendation/condition/**
  - backend/src/test/java/com/placepick/infrastructure/external/llm/EliceConditionExtractionClientSecurityTest.java
  - backend/src/integrationTest/java/com/placepick/infrastructure/external/llm/EliceConditionExtractionClientIntegrationTest.java
  - backend/src/evalTest/java/com/placepick/recommendation/condition/**
  - backend/src/evalTest/resources/evals/condition-extraction/**
  - docs/contracts.md
---

# WI-0011 PP-009 조건 추출 Port Schema Eval

> GitHub Issue: [PP-009 #11](https://github.com/gdh0730/hub/issues/11)

## 문제와 근거

자연어 조건은 위치, 장소 유형, 인원, 예산과 선호·제외 항목이 섞여 있으며 일부 값이
누락되거나 모호하다. 자유 형식 LLM 응답을 그대로 사용하면 필드 누락, 타입 변동,
prompt injection과 근거 없는 보완이 Draft와 검색 조건으로 들어간다. 현재 Eval은
환경 안전 fixture만 검증하고 조건 추출의 schema와 품질 정책은 없다.

## 목적과 성공 기준

목적은 provider-neutral condition extraction port와 versioned strict output schema를
정의하고 Mock과 결정론적 Eval로 정책 실패를 차단하는 것이다.

- 입력은 1자 이상 1000자 이하의 한국어 또는 영어 requestText와 session에서 파생한
  비식별 safety identifier를 가지며 instruction과 사용자 데이터가 분리된다.
- 출력 schema ID는 placepick.condition-extraction.v1이고 추가 필드를 거부한다.
- normalized condition은 `locationQuery`, `placeType`, `placeTypeDetail`, `partySize`,
  `budgetPerPersonMin`, `budgetPerPersonMax`, `preferences`, `exclusions`, `warnings`를
  가진다. 예전 `location`, `preferredKeywords`, `excludedKeywords` 이름을 사용하지
  않는다.
- `locationQuery`와 `placeType`은 추천 시작 전 필수다. `placeTypeDetail`은
  `placeType=OTHER`일 때 1~30자로 필수이고 그 외에는 null이다.
- Draft의 `partySize`와 두 예산 field는 nullable이다. 값이 있으면 `partySize`는
  1~100, 예산은 0~10,000,000의 원 단위 정수이며 min이 max보다 클 수 없다.
- `preferences`는 최대 10개의 `{value, priority}`다. Draft priority는 nullable이지만
  사용자가 확정한 조건에서는 1~10 정수여야 한다. `exclusions`는 최대 10개다.
- 인원·예산 누락은 임의로 채우지 않고 null과 안정적인 warning으로 반환한다.
  preference priority의 null은 Draft에 보존해 사용자 확인을 요구한다. 위치 또는 장소
  유형이 없으면 추천 가능한 초안으로 성공 처리하지 않고 `UNPROCESSABLE_CONDITION`으로
  종료한다.
- malformed JSON, schema 위반, refusal, incomplete, timeout과 provider 오류가
  구분된 application 결과로 변환된다.
- 정상, 모호성, 경계값, 상충 조건, prompt injection과 금지 추론 fixture가
  반복 실행에서 같은 정책 결과를 낸다.

## 범위, 비범위와 제약

범위는 extraction port, input·output value, JSON Schema, deterministic Mock adapter,
응답 parser·validator, 오류 taxonomy와 Eval fixture다. 실제 Elice Chat Completions
runtime adapter는 PP-029, Draft persistence와 HTTP는 PP-010, 추천 검색·점수는 후속
Task에 둔다. PP-038의 합성 canary는 이 기능 구현을 대신하지 않는다.

키워드는 trim·Unicode normalization 후 각 1자 이상 50자 이하, 목록당 최대 10개로
제한하고 중복을 제거한다. 모델 응답의 `locationQuery`를 외부 지리 사실로 확정하지
않고 사용자에게 검토할 초안으로만 취급한다. 추출 결과를 자동 추천 입력으로 연결하지
않고, 사용자가 확인·수정한 `ConfirmedRecommendationCondition`만 추천 core에 전달한다.
전체 prompt나 provider 응답 전문을 문서와 로그에 저장하지 않는다.

## 판단 기준과 대안

기준은 사용자 통제권, schema 안정성, 환각 억제, 결정론적 검증, provider 독립성과
비용 상한이다.

- regex만으로 모든 조건을 파싱하면 비용은 낮지만 다양한 표현과 모호성 처리 범위가
  제한되어 LLM port와 구조 검증을 사용한다.
- 자유 JSON과 관대한 parser는 초기 성공률이 높아 보이지만 계약 오류를 숨기므로
  strict schema와 추가 필드 거부를 선택한다.
- 누락값을 일반적인 기본값으로 보완하면 흐름은 빠르지만 사용자 의도 왜곡이 있어
  warning과 직접 확인을 선택한다.
- LLM 응답을 한 번 더 자동 수정하는 방식은 비용과 비결정성을 늘려 schema 실패를
  명시적으로 반환하고 사용자가 원문을 수정하도록 한다.

Mock adapter는 fixture key가 아니라 의미 있는 request 조건으로 정상·오류를
결정하며 local·test에서 실제 provider를 호출할 수 없다. Eval 합격은 정확한 문장
일치가 아니라 schema, 불변식, 누락 표현과 금지 추론으로 판단한다.

## 문제 해결 기록

1. PP-003 normalized condition과 PP-010 Draft 입력을 동일한 field 이름으로 맞추되,
   Draft의 nullable 값과 확정 조건의 priority 필수 규칙을 명시적으로 구분한다.
2. schema의 required, nullable, enum, 수치·길이 상한과 추가 필드 금지를 정의한다.
3. provider response를 parse, schema validate, domain validate 순서로 처리한다.
4. 정상·모호·상충·경계·injection·refusal·timeout fixture를 JSONL로 구성한다.
5. Mock adapter와 Eval runner가 외부 network 없이 같은 결과를 내는지 검증한다.
6. 실패 fixture가 정책을 실제로 위반할 때 Eval이 실패하는 음성 검사를 추가한다.

## 구현 결과와 검증 증거

provider-neutral Draft·확정 조건, strict schema, 결정론적 Mock adapter와 제품형
`EliceConditionExtractionClient`를 구현했다. Elice client는 runtime bean으로 등록하지
않아 PP-029 전에는 서비스가 실제 endpoint를 호출하지 않는다. 위치·유형 누락은
`UNPROCESSABLE_CONDITION`, 인원·예산 누락은 null과 안정적인 warning, nullable
preference priority는 사용자 확인 전 Draft에만 허용한다.

2026-07-15 Java 17에서 조건·추천 전체 단위 86건, 추천 통합 21건과 Eval 7건이 모두
실패 0건으로 통과했다. 조건 전용 보안·WireMock 검증은 추가 field, refusal,
incomplete, malformed, 400·401·403·429·5xx·timeout·응답 상한과 승인 host/model을
검사한다. 전체 Mock workflow 테스트는 Draft를 직접 `confirm()`한 뒤에만 core를 호출해
자동 추천 연결이 없음을 증명한다. 최종 저장소 전체 결과는 WI-0041의 `make check`
증거와 함께 관리하며, fixture 통과를 실제 자연어 정확도 수치로 표현하지 않는다.

## AI 사용과 사람의 검증

AI는 schema 초안, 한국어 표현 변형, 경계·공격 fixture와 parser test 생성을 지원할
수 있다. 사람은 필드 의미, 필수 조건, 모호성 표현, prompt와 실제 사용자 데이터
최소화를 검토한다. AI가 원문에 없는 위치·예산·인원·선호를 추가하거나 injection
문구를 지시로 수행한 fixture는 실패로 판정한다.

## 남은 위험과 학습

결정론적 fixture는 실제 표현의 다양성을 모두 대표하지 않으며 Mock 통과는 live
model 호환성을 보증하지 않는다. Approval Gate 기반 배포 Live에서 schema 실패나 특정 표현의 체계적
누락이 관찰되면 개인정보가 제거된 최소 회귀 fixture를 추가하고, schema version
호환성과 비용을 검토한 뒤 prompt·model 설정을 변경한다.
