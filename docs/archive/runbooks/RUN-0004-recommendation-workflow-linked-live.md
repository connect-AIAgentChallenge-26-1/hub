---
id: RUN-0004
title: 종료된 Naver→Elice Linked Live Gateway 절차
type: runbook
status: retired
date: 2026-07-16
owners:
  - placepick-team
related:
  - ../../case-studies/CASE-0002-naver-elice-linked-live-user-flow.md
  - ../../adr/ADR-0013-naver-elice-linked-live-boundary.md
  - ../../adr/ADR-0014-mvp-direct-provider-and-simplified-trust-boundary.md
  - ../work-records/WI-0042-naver-elice-linked-live-workflow.md
---

# RUN-0004 종료된 Naver→Elice Linked Live Gateway 절차

## 종료 이유

이 Runbook은 Loopback Gateway와 allowlist 시나리오로 실제 Naver 결과를 실제 Elice 이유
생성까지 연결하던 검증 절차였다. 세 합성 사용자 흐름의 목적, 단계와 결과는
[CASE-0002](../../case-studies/CASE-0002-naver-elice-linked-live-user-flow.md)에 보존됐다.

PP-041은 제품 Java adapter와 별도인 Gateway·launcher·중복 schema의 유지 비용을 줄이기
위해 이 경로를 제거한다. `make workflow-live-linked*` 명령은 현재 실행 인터페이스가
아니며 이 문서를 따라 재실행하지 않는다.

## 역사적 안전 경계

과거 절차는 검토된 SHA, gitignored `.env.live.local`, 고정 합성 입력, 최대 9회 호출,
retry·redirect 0회, 일회성 local credential과 report secret scan을 요구했다. 실제 응답은
메모리에서만 처리하고 장소명·주소·링크·prompt·completion을 문서에 남기지 않았다.

이 절차의 성공은 동기 추천 Core와 실제 Provider 호환성만 증명했다. 공개 API, DB,
Outbox·Worker·SSE, 프런트엔드, 실제 사용자 데이터와 클라우드 배포는 증명하지 않았다.

## 대체 경로

- 현재 자동 회귀는 Mock 기반 `make check`를 사용한다.
- 개발 실행은 `make dev`, 실제 Provider 개발 실행은 명시적 `make dev-live`를 사용한다.
- 안전한 실행 증거 생성은 `make live-evidence`를 사용한다.
- 사람이 실제 입력·조건·후보·Top 3·근거 이유를 확인하는 절차는 PP-042 구현과 함께
  새 Runbook으로 작성한다.

Provider 자격 노출이 의심되면 보존된 [Naver 자격 교체](RUN-0001-naver-local-live-and-credential-rotation.md)와
[Elice token 교체](RUN-0002-elice-llm-local-live-and-token-rotation.md) 절차를
따른다.
