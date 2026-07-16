---
id: ADR-0011
title: Elice Chat Completions MVP Provider와 데이터 경계
type: adr
status: accepted
date: 2026-07-14
owners:
  - placepick-team
related:
  - ../contracts.md
  - ../archive/work-records/WI-0040-elice-llm-proxy-live-contract.md
  - ../case-studies/CASE-0002-naver-elice-linked-live-user-flow.md
  - ADR-0012-recommendation-core-and-split-live-boundary.md
  - ADR-0014-mvp-direct-provider-and-simplified-trust-boundary.md
---

# ADR-0011 Elice Chat Completions MVP Provider와 데이터 경계

## 맥락과 문제

MVP에는 자연어 조건 추출과 검색 근거 기반 추천 이유가 필요하다. 준비된 Elice ML API는
OpenAI-compatible Chat·Embedding endpoint를 제공하지만, 직접 OpenAI Responses API와
기능·보관 정책이 같다고 가정할 수 없다. LLM이 순위와 사실을 임의로 만들지 못하게 하는
제품 경계도 필요하다.

## 판단 기준과 대안

기준은 현재 사용 가능한 자격, strict structured output, Java 17 통합 난이도, schema
검증, timeout·비용 상한, 제3자 데이터 처리와 Provider 교체 가능성이다.

- 직접 OpenAI Responses API는 공식 기능이 명확하지만 별도 자격·비용과 adapter가 필요하다.
- SDK는 편리하지만 proxy 호환과 전송 세부 제어가 불명확해질 수 있다.
- Spring `RestClient`로 Elice Chat Completions를 직접 호출하면 계약과 redaction을 코드로
  고정하면서 domain port는 Provider 중립적으로 유지할 수 있다.

## 결정

MVP LLM Provider는 Elice OpenAI-compatible Chat Completions와 exact model
`openai/gpt-4.1-mini`를 사용한다. `ConditionExtractionPort`와
`GroundedReasonGenerationPort` 뒤의 Java adapter가 strict JSON Schema,
`additionalProperties=false`, bounded output, timeout, retry 0, `store=false`, tool 미사용을
강제한다. 자유 text, schema 완화나 직접 OpenAI로 자동 fallback하지 않는다.

조건 추출 결과는 사용자가 확인하기 전 추천에 투입하지 않는다. 이유 생성에는 서버가
선정한 Top 3와 후보별 allowlisted evidence만 전달한다. LLM은 점수·순위·주의점·공유
문구를 결정하지 않으며 출력 place/evidence 집합은 서버가 다시 검증한다. 실패하면 batch
전체를 버리고 서버 template을 사용한다.

Embedding `openai/text-embedding-3-small`은 과거 capability만 확인했으며 현재 추천·검색·
중복 제거·점수 runtime에는 사용하지 않는다. 직접 OpenAI Responses API는 자동 fallback이
아니라 별도 검토 대안이다.

실제 자격과 실행 경계는 [ADR-0014](ADR-0014-mvp-direct-provider-and-simplified-trust-boundary.md)를
따른다. `store=false` 요청만으로 Elice나 하위 Provider의 미보관·미학습을 보증하지 않는다.
실제 사용자 입력과 Naver 파생 근거를 제품 runtime에서 전달하기 전 보관 기간, 처리 지역,
하위 처리자, 삭제·열람, abuse monitoring과 개인정보 정책을 사람이 확인한다.

## 결과와 트레이드오프

domain은 Elice 세부 계약에서 분리되고 Mock과 실제 실행이 같은 Java adapter를 사용한다.
strict schema와 서버 사후 검증으로 환각이 결과 순위나 근거 관계를 바꾸는 것을 막는다.

반면 third-party proxy의 가용성, 실제 upstream model과 데이터 처리에는 추가 신뢰가
필요하다. Structured Output 호환 변경은 제품 실패로 나타날 수 있으므로 Mock 계약과
명시적 Live evidence를 모두 유지한다.

## 검증과 재검토 조건

Mock은 정상, refusal, incomplete, malformed, schema 위반, 4xx·429·5xx·timeout,
oversized response와 근거 교차 참조를 자동 검증한다. 과거 실제 Provider 연결 결과의
범위는 [CASE-0002](../case-studies/CASE-0002-naver-elice-linked-live-user-flow.md)를 따른다.

Elice가 strict output을 안정적으로 제공하지 못하거나 보관·비용·지역 정책이 요구와 맞지
않으면 직접 OpenAI 또는 다른 Provider adapter를 비교한다. Embedding을 제품 기능에
사용하려면 사용자 가치, vector 저장·수명, 품질 측정과 별도 ADR이 필요하다.
