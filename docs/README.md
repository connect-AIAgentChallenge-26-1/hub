# 플레이스픽 AI 문서 인덱스

`docs/`는 현재 구현·계약·결정과 반복 절차의 운영 정본이다. 최초 기획과 참고 자료는
`documents/`, 종료된 작업의 상세 실행 증거는 [`archive/`](archive/README.md)에 둔다.

## 현재 정본

- [Roadmap](roadmap.md): Task 선행 관계만 담는 DAG
- [계약](contracts.md): 현재 API·이벤트·Provider 계약과 구현 상태
- [아키텍처](architecture.md): 현재 책임 경계와 목표 구조
- [개발 환경](development-environment.md): Java 17 실행·검증 명령
- [문서화 표준](standards/documentation.md): Issue·WI·ADR·증거의 역할
- [GitHub Flow](standards/github-flow.md): branch·PR·merge 기준

Task 상태, 담당자와 완료 조건의 정본은 `gdh0730/hub`의 GitHub Issue다. Roadmap이나
Work Record에 같은 상태표를 복제하지 않는다. Work Record는 실제 작업이 시작될 때만
만든다.

## 현재 Work Record

- [WI-0043 저장소·검증·문서 단순화](work-records/WI-0043-repository-validation-documentation-simplification.md)
- [WI-0044 실제 값 Live Playground](work-records/WI-0044-live-playground.md)
- [WI-0045 무료 클라우드 데모 배포](work-records/WI-0045-free-cloud-demo-deployment.md)

## 유효한 결정

- [ADR-0001 Java 17 기술 기준](adr/ADR-0001-java17-baseline.md)
- [ADR-0002 Compose와 Testcontainers 책임 경계](adr/ADR-0002-compose-testcontainers-boundary.md)
- [ADR-0003 GitHub Flow와 문서 추적성](adr/ADR-0003-github-flow-documentation-traceability.md)
- [ADR-0004 MVP 경계와 조건 확인](adr/ADR-0004-service-boundary.md)
- [ADR-0005 익명 세션과 주최자 capability](adr/ADR-0005-anonymous-session-room-capability.md)
- [ADR-0006 API·Worker와 transactional outbox](adr/ADR-0006-api-worker-outbox-events.md)
- [ADR-0007 폐기된 staging-live 경계](adr/ADR-0007-provider-and-live-boundary.md)
- [ADR-0008 Next.js same-origin 경계](adr/ADR-0008-frontend-same-origin-boundary.md)
- [ADR-0009 폐기된 Gate·Gateway 신뢰 경계](adr/ADR-0009-mock-local-live-gateway-boundary.md)
- [ADR-0010 무료 포트폴리오 데모 배포 경계](adr/ADR-0010-free-demo-deployment-boundary.md)
- [ADR-0011 Elice Chat Completions Provider 경계](adr/ADR-0011-elice-chat-completions-provider-boundary.md)
- [ADR-0012 동기 추천 Core 검증 경계](adr/ADR-0012-recommendation-core-and-split-live-boundary.md)
- [ADR-0013 종료된 Linked Live Gateway 경계](adr/ADR-0013-naver-elice-linked-live-boundary.md)
- [ADR-0014 MVP 직접 Provider와 단순화한 신뢰 경계](adr/ADR-0014-mvp-direct-provider-and-simplified-trust-boundary.md)

`superseded` ADR은 과거 결정의 이유를 보존하기 위해 인덱스에 남긴다. 현재 선택은
가장 최근의 대체 ADR을 따른다.

## 현재 Runbook

과거 Provider별 canary와 Split/Linked Gateway 실행 절차는 archive로 이동했다.

- [RUN-0005 직접 Provider 개발과 Live Playground](runbooks/RUN-0005-direct-live-development.md)
- [RUN-0006 무료 데모 배포와 롤백](runbooks/RUN-0006-free-demo-deployment-and-rollback.md)
- [RUN-0007 MVP 보호·관측성 운영](runbooks/RUN-0007-mvp-protection-observability.md)

각 절차는 실제 실행과 복구가 확인된 뒤에만 `verified`로 바꾼다. RUN-0005는 2026-07-16
직접 Live Evidence, Live Playground 브라우저와 정식 제품 API 로컬 Live 흐름으로
검증됐고 cloud 배포 절차는 별도 상태를 유지한다.

## Case Study

- [CASE-0001 Java 17 Agentic 개발 환경](case-studies/CASE-0001-agentic-development-environment.md)
- [CASE-0002 실제 Naver→Elice 추천과 정식 서비스 사용자 여정](case-studies/CASE-0002-naver-elice-linked-live-user-flow.md)

CASE-0002가 현재 직접 Java adapter Live Evidence, 실제 값 브라우저 확인과 로컬 정식
서비스 Live 흐름의 포트폴리오 정본이다. 같은 실행 수치와 서사를 계약·ADR·Runbook에
반복하지 않는다.

## 문서 유형

| 종류 | 작성 시점 | 위치 |
| --- | --- | --- |
| Work Record | 중요한 Task를 실제로 시작할 때 | `work-records/` |
| ADR | 장기 영향을 주는 선택을 확정할 때 | `adr/` |
| Troubleshooting | 비직관적 장애가 재현되고 다시 발생할 수 있을 때 | `troubleshooting/` |
| Experiment | 가설을 반복 측정해 비교할 때 | `experiments/` |
| Runbook | 현재 시스템에서 반복 수행할 절차가 검증됐을 때 | `runbooks/` |
| Case Study | 검증 완료 성과를 사용자 문제 중심으로 설명할 때 | `case-studies/` |

## 검증

```bash
npm ci
npm run docs:check
npm run docs:test
```

활성 문서는 frontmatter, 중복 ID, 내부 링크, 임시 문구, 비밀과 Task 추적성을 검사한다.
`archive/`는 변경 불가능한 과거 증거로 취급해 활성 상태·인덱스·추적성 검사에서 제외한다.
