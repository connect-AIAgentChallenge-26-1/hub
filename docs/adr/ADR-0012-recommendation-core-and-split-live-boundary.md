---
id: ADR-0012
title: 동기 추천 Core와 사용자 확인 경계
type: adr
status: accepted
date: 2026-07-15
owners:
  - placepick-team
related:
  - ../roadmap.md
  - ../contracts.md
  - ../archive/work-records/WI-0041-recommendation-core-split-live-workflow.md
  - ADR-0006-api-worker-outbox-events.md
  - ADR-0011-elice-chat-completions-provider-boundary.md
  - ADR-0014-mvp-direct-provider-and-simplified-trust-boundary.md
---

# ADR-0012 동기 추천 Core와 사용자 확인 경계

## 맥락과 문제

Provider 개별 계약만으로는 조건 추출, 사용자 확인, 장소 검색, 후보 처리, 점수와 근거
문장이 하나의 제품 규칙으로 맞물리는지 증명할 수 없다. 이 규칙을 비동기 Job·DB·Redis와
동시에 구현하면 추천 정책 실패와 전달·복구 실패도 분리하기 어렵다.

## 판단 기준과 대안

기준은 사용자 확인권, 결정적 추천, domain·Provider 독립성, 근거 추적, 후속 Worker
재사용과 실패 원인의 분리다.

- Provider canary만 유지하면 인증 drift는 찾지만 제품 규칙을 검증하지 못한다.
- 처음부터 Worker에서 구현하면 queue·transaction과 추천 정책의 실패가 결합된다.
- 동기 Core를 먼저 만들면 경계가 하나 늘지만 순수 규칙을 결정적으로 검증하고 Worker가
  같은 use case를 재사용할 수 있다.

## 결정

PP-009·PP-014~PP-016의 추천 규칙을 동기식 application use case로 유지한다.

```text
ConditionExtractionPort
  -> 사용자 확인·수정
    -> RecommendationCoreUseCase(ConfirmedRecommendationCondition)
      -> PlaceSearchPort / BlogSearchPort
      -> 정규화·hard filter·dedup·0~80 점수·Top 3
      -> GroundedReasonGenerationPort
      -> 서버 검증·fallback·공유 문구 조합
```

추출 Draft를 자동 추천에 넣지 않는다. Core는 확인된 조건만 받고 원본 request text를
검색·점수·이유 생성으로 전달하지 않는다. LLM은 점수·순위를 바꾸지 않고 근거 문장만
생성한다. 세부 schema와 실패 규칙은 [계약 정본](../contracts.md)을 따른다.

Mock은 정상, 선호 한 번 완화, 후보 부족, Blog degraded와 LLM batch fallback을 같은 Core
경계에서 검증한다. 실제 Provider 연결의 과거 과정과 결과는
[CASE-0002](../case-studies/CASE-0002-naver-elice-linked-live-user-flow.md)에 보존한다. 현재 직접
Live 신뢰 경계는 ADR-0014를 따른다.

## 결과와 트레이드오프

추천 규칙을 DB·queue 없이 빠르게 검증하고 PP-017 Worker가 그대로 호출할 수 있다.
사용자 확인과 LLM 설명 전용 역할이 코드 구조에 드러난다. 반면 동기 Core 성공은
Job·Outbox·Streams·SSE, 영속화, UI와 배포 성공을 증명하지 않는다.

## 검증과 재검토 조건

Mock Core 흐름, 호출 상한, Provider credential 교차 전달 금지와 표준 검증의 외부 network
0건을 유지한다. 가격 구조화 근거, 사용자 만족 측정 또는 새로운 ranking 요구가 생기면
점수·Top 3 정책을 Experiment와 ADR로 재검토한다.
