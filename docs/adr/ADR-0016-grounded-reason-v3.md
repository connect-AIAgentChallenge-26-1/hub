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
  - ADR-0018-condition-recovery-embedding-shadow.md
---

# ADR-0016 후보별 claim 기반 이유 v3와 제한된 복구

## 맥락

현재 batch schema는 각 항목에 Top 3 전체 place/evidence ID를 허용하므로 strict schema를
통과한 교차 참조를 application validator가 뒤늦게 거부한다. 장소명이나 일반 유형 token
하나만 공유해도 근거 있음으로 판정할 수 있고, 한 후보의 오류가 전체 후보 fallback을 만든다.

## 결정

각 후보를 독립 Elice 요청으로 생성하고 LLM에는 서버 slot과 해당 후보의 claim ID만 제공한다.
전달하는 확정 조건은 `locationQuery`, `placeType`, `placeTypeDetail`, `preferences`,
`exclusions` allowlist로 제한한다. 후보 문맥은 이름·category와 Local·Blog claim만
사용한다. Local claim은 장소명·유형·주소 영역, Blog claim은 출처 귀속 표현으로 제한한다.
DB UUID, 내부 evidence ID, 점수·순위, 다른 후보 ID와 Provider 자격·원문은 전달하지 않는다.
요청 로컬 `p1`~`p3` slot과 `pN-cM` claim은 서버가 내부 place/evidence ID에 매핑한다.

후보 요청은 최대 세 개를 병렬 실행한다. 후보별 schema·claim 검증 실패와
429·5xx·timeout 같은 일시적 Provider 오류는 application 경계에서 한 번만 재생성한다.
400·401·403은 재시도하지 않고 HTTP adapter retry는 모든 경우 0회다. 두 번째 실패는 해당
후보만 검증된 claim 기반 서버 문장으로 대체하고 다른 후보의 생성 결과는 유지한다.
HTTP envelope나 root schema 전체 실패는 전체 fallback한다. 예상하지 못한
`RuntimeException`, null outcome과 내부 계약 위반은 정상 저하로 숨기지 않고 Job
실패·retry·DLQ·경보로 전파한다.

Embedding은 메모리 batch shadow 평가만 허용한다. 고정 holdout에서 선호 매칭 F1이 5%p 이상
개선되고 false positive가 증가하지 않을 때만 lexical matcher의 보조 신호로 승격하며 벡터와
입력은 저장하지 않는다.

## 결과와 재검토

후보별 `reasonSource=GENERATED|TEMPLATE`로 출처를 보존하고, 후보 수가 `N`이면 총 이유
호출 수는 `N..2N`이다. 호출 수는 늘 수 있지만 교차 참조를 schema에서 제거하고 유효한 후보
이유를 보존한다. 2026-07-16 CASE-0002의 실제 Provider 증거는 v2 batch를 검증한 역사적
결과이며 현재 v3의 실제 품질을 대신하지 않는다. unsupported claim이 adversarial Eval에서
한 건이라도 통과하거나 Provider latency·quota가 사용자 흐름을 훼손하면 claim 표현,
병렬도와 재시도 예산을 재검토한다.

Embedding 결정의 구현 계약은 ADR-0018에서 구체화했다. 자동 fixture가 승격 조건을
통과하더라도 실제 모델 campaign과 별도 결정 전에는 runtime 랭킹에 연결하지 않는다.
