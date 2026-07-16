---
id: ADR-0016
title: 후보별 claim 기반 이유 v3와 제한된 복구
type: adr
status: accepted
date: 2026-07-16
owners:
  - placepick-team
related:
  - ../contracts.md
  - ../work-records/WI-0046-recommendation-quality-v2.md
  - ADR-0011-elice-chat-completions-provider-boundary.md
---

# ADR-0016 후보별 claim 기반 이유 v3와 제한된 복구

## 맥락

현재 batch schema는 각 항목에 Top 3 전체 place/evidence ID를 허용하므로 strict schema를
통과한 교차 참조를 application validator가 뒤늦게 거부한다. 장소명이나 일반 유형 token
하나만 공유해도 근거 있음으로 판정할 수 있고, 한 후보의 오류가 전체 후보 fallback을 만든다.

## 결정

각 후보를 독립 Elice 요청으로 생성하고 LLM에는 서버 slot과 해당 후보의 claim ID만 제공한다.
Local claim은 장소명·유형·주소 영역, Blog claim은 출처 귀속 표현으로 제한한다. 점수·순위,
다른 후보 ID와 Provider 자격·원문은 전달하지 않는다.

후보별 schema·claim 검증 실패와 일시적 Provider 오류는 application/Worker 경계에서 한 번만
재시도한다. HTTP adapter retry는 0회다. 두 번째 실패는 해당 후보만 검증된 claim 기반 서버
문장으로 대체한다. root envelope 실패는 전체 fallback하고, 예상하지 못한 RuntimeException과
null outcome은 정상 저하로 숨기지 않고 Job 실패·DLQ·경보로 전파한다.

Embedding은 메모리 batch shadow 평가만 허용한다. 고정 holdout에서 선호 매칭 F1이 5%p 이상
개선되고 false positive가 증가하지 않을 때만 lexical matcher의 보조 신호로 승격하며 벡터와
입력은 저장하지 않는다.

## 결과와 재검토

호출 수는 후보당 최대 두 번으로 증가하지만 교차 참조를 schema에서 제거하고 유효한 후보
이유를 보존한다. unsupported claim이 adversarial Eval에서 한 건이라도 통과하거나 Provider
latency·quota가 사용자 흐름을 훼손하면 claim 표현, 병렬도와 재시도 예산을 재검토한다.
