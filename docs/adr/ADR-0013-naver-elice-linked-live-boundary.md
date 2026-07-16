---
id: ADR-0013
title: Naver→Elice Linked Live Gateway 경계
type: adr
status: superseded
date: 2026-07-15
owners:
  - placepick-team
related:
  - ../case-studies/CASE-0002-naver-elice-linked-live-user-flow.md
  - ../archive/work-records/WI-0042-naver-elice-linked-live-workflow.md
  - ADR-0012-recommendation-core-and-split-live-boundary.md
  - ADR-0014-mvp-direct-provider-and-simplified-trust-boundary.md
---

# ADR-0013 Naver→Elice Linked Live Gateway 경계

## 당시 문제와 결정

실제 Naver 결과가 실제 Elice 이유 생성까지 연결되는지를 검증하면서 원본 자격과 응답
본문을 Java test process·로그에서 격리해야 했다. 이를 위해 로컬 Loopback Gateway,
allowlist 시나리오, 호출 순서·예산과 일회성 local credential을 사용했다.

Gateway는 provenance와 비밀 격리를 강하게 검증했고 세 합성 사용자 흐름이 실제
Provider를 끝까지 통과하는 증거를 만들었다. 과정과 결과의 정본은
[CASE-0002](../case-studies/CASE-0002-naver-elice-linked-live-user-flow.md)다.

## 대체 결정

이 경계는 제품 runtime이 아니라 일회성 검증 하네스였다. 검증 완료 뒤에도 별도 Edge
runtime, launcher와 중복 schema를 유지해야 했으므로 [ADR-0014](ADR-0014-mvp-direct-provider-and-simplified-trust-boundary.md)가
대체한다. 제품과 로컬 Live는 같은 Java Provider adapter를 직접 사용하고 Mock 회귀로
오류·redaction을 검증한다.

과거 Gateway 실행은 더 이상 현재 명령이 아니다. 실제 값 단위 확인은 PP-042 Live
Playground, 배포 검증은 PP-043에서 별도 수행한다. 과거 성공은 API·DB·Worker·SSE·UI나
클라우드 배포 완료를 뜻하지 않는다.
