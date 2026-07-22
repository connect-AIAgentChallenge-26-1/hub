---
id: ADR-0018
title: 조건 추출 제한 복구와 Embedding shadow 비승격 경계
type: adr
status: accepted
date: 2026-07-17
owners:
  - placepick-team
related:
  - ../contracts.md
  - ../work-records/WI-0046-recommendation-quality-v2.md
  - ADR-0011-elice-chat-completions-provider-boundary.md
  - ADR-0016-grounded-reason-v3.md
---

# ADR-0018 조건 추출 제한 복구와 Embedding shadow 비승격 경계

## 맥락

조건 추출은 첫 Provider 오류나 지역·유형 누락을 즉시 API 실패로 바꿨다. 사용자가 직접
수정할 수 있는 조건 화면이 이미 있는데도 Draft가 생성되지 않아 일시적인 schema drift와
명시하지 않은 필수 값이 전체 여정을 막았다. 반대로 무제한 재호출이나 임의 기본값은 비용,
지연과 잘못된 추천을 만든다.

Embedding은 연결 capability만 검증된 상태였다. 고정 corpus와 비교 기준 없이 lexical
matcher에 바로 연결하면 재현 가능한 기본 순위와 false positive 안전성을 훼손할 수 있다.

## 결정

HTTP adapter는 계속 retry 0으로 유지하고 application의
`ConditionExtractionRecoveryService`만 최대 두 번의 호출을 소유한다. JSON·Chat
구조·schema 검증 실패와 429·5xx·timeout만 한 번 재생성한다. 400·401·403, model 불일치,
응답 크기 위반은 재호출하지 않는다. 필수 값 누락은 첫 응답부터 manual Draft로 전환하고,
두 번째 재생성도 retry 가능한 실패나 필수 값 누락이면 같은 전환을 사용한다. null outcome과
예상하지 못한 예외는 성공으로 숨기지 않는다.

manual Draft는 새 DB 상태나 migration을 만들지 않는다. 기존 `EXTRACTED` 상태와 불완전한
`DraftRecommendationCondition`을 저장하고 API의 `manualEntryRequired=true`로 의미를
명시한다. 안전하게 추출된 부분 값은 보존하며 사용자가 전체 조건을 검증해 `PUT`하면 기존
`CONFIRMED` 상태와 `manualEntryRequired=false`가 된다.

조건 추출 user message는 `requestText` 한 필드의 JSON data 문자열로 전달한다. Provider가
결정할 필요가 없는 `warnings`는 LLM schema에서 제거하고 서버가 condition으로 재계산한다.
두 번의 12초 응답 제한으로 동기 Draft 생성의 Provider 대기 상한을 제한한다.

Embedding은 고정 `preference-embedding-shadow.v1` corpus에서만 평가한다. train 10개와
holdout 10개의 preference/evidence 쌍을 한 번의 batch 호출로 전송하고 vector는 메모리에서만
사용한다. threshold는 train에서만 선택하며 holdout F1이 lexical baseline보다 5%p 이상
개선되고 false positive가 증가하지 않을 때만 `promotionEligible=true`다. 결과에는 case ID,
split, label과 집계 metric만 남긴다.

`promotionEligible`은 자동 승격 명령이 아니다. `CandidateScoringPolicy`와 `CandidateRanker`는
Embedding port나 shadow 결과에 의존하지 않는다. 실제 Elice 모델 campaign과 사람의 ADR
검토가 끝나기 전까지 추천 점수·순위·검색·중복 제거에 Embedding을 연결하지 않는다.

## 결과와 재검토

사용자는 조건 추출이 완벽하지 않아도 명시적으로 조건을 완성해 추천을 이어 갈 수 있고,
Provider 재호출 수는 최대 두 번으로 제한된다. attempt별 Provider outcome과 최종
`extracted|manual|failed` resolution을 별도 metric으로 구분한다.

자동 Eval의 deterministic vector fixture가 승격 gate를 통과한 결과는 정책 코드 검증일 뿐
실제 `text-embedding-3-small` 품질 증거가 아니다. 실제 holdout F1 개선이 5%p 미만이거나
false positive가 하나라도 증가하면 lexical matcher를 유지한다. manual Draft 비율이
지속적으로 높거나 동기 응답 지연이 사용자 경험을 훼손하면 extraction timeout과 비동기
Draft 경계를 다시 검토한다.
