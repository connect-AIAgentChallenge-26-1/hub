# 플레이스픽 AI 문서 인덱스

`docs/`는 구현과 함께 갱신되는 운영 정본이다. 최초 기획과 긴 참고 자료는
`documents/`에 보존하되, 현재 실행 방법·계약·결정은 이 디렉터리를 따른다.

## 현재 기준

- [개발 환경](development-environment.md): Java 17, 실행 명령, 프로필, 포트
- [아키텍처](architecture.md): 현재 모듈과 인프라 책임 경계
- [계약](contracts.md): 공개 API·이벤트·프롬프트 계약의 구현 상태
- [서비스 완성 Roadmap](roadmap.md): PP-001~PP-040 Task DAG와 release gate
- [문서화 표준](standards/documentation.md): 기록 조건, 필드, 검증과 보안
- [GitHub Flow](standards/github-flow.md): 브랜치·PR·병합·보호 규칙

## 작업과 의사 결정

- [CASE-0001 Java 17 기반 재현 가능한 Agentic 개발 환경 구축](case-studies/CASE-0001-agentic-development-environment.md)
- [WI-0001 Agentic 개발 환경 구축](work-records/WI-0001-agentic-development-environment.md)
- [ADR-0001 Java 17 기술 기준](adr/ADR-0001-java17-baseline.md)
- [ADR-0002 Compose와 Testcontainers의 책임 경계](adr/ADR-0002-compose-testcontainers-boundary.md)
- [ADR-0003 GitHub Flow와 문서 추적성](adr/ADR-0003-github-flow-documentation-traceability.md)
- [ADR-0004 완성형 MVP 경계와 조건 확인 후 추천 시작](adr/ADR-0004-service-boundary.md)
- [ADR-0005 익명 세션과 공유·주최자 capability](adr/ADR-0005-anonymous-session-room-capability.md)
- [ADR-0006 API·Worker와 transactional outbox](adr/ADR-0006-api-worker-outbox-events.md)
- [ADR-0007 폐기된 GitHub staging-live 경계](adr/ADR-0007-provider-and-live-boundary.md)
- [ADR-0008 Next.js와 same-origin 경계](adr/ADR-0008-frontend-same-origin-boundary.md)
- [ADR-0009 Mock·Local Live·배포 Gateway 경계](adr/ADR-0009-mock-local-live-gateway-boundary.md)
- [ADR-0010 무료 포트폴리오 데모 배포 경계](adr/ADR-0010-free-demo-deployment-boundary.md)
- [ADR-0011 Elice Chat Completions MVP Provider와 데이터 경계](adr/ADR-0011-elice-chat-completions-provider-boundary.md)
- [ADR-0012 동기 추천 Core와 Split Live 검증 경계](adr/ADR-0012-recommendation-core-and-split-live-boundary.md)
- [ADR-0013 Naver→Elice Linked Live 신뢰·데이터 경계](adr/ADR-0013-naver-elice-linked-live-boundary.md)
- [TS-0001 WireMock 의존성 충돌](troubleshooting/TS-0001-wiremock-dependency-conflict.md)
- [TS-0010 Elice Local Live HTTP 응답 전 전송 실패](troubleshooting/TS-0010-elice-live-no-http-response.md)
- [TS-0011 GitHub runner ripgrep 누락](troubleshooting/TS-0011-github-runner-ripgrep.md)
- [TS-0012 실제 Provider 응답 메타데이터 호환성](troubleshooting/TS-0012-provider-response-metadata-compatibility.md)
- [TS-0013 Windows bind mount의 Gradle task output cache mode 실패](troubleshooting/TS-0013-gradle-test-output-cache-bind-mount-mode.md)
- [TS-0014 Java·TypeScript canonical URL의 근거 ID 불일치](troubleshooting/TS-0014-cross-runtime-canonical-url-evidence-id.md)
- [TS-0015 Java·TypeScript Naver HTML plain text 불일치](troubleshooting/TS-0015-cross-runtime-naver-html-plain-text.md)
- [TS-0016 Linked Live Provider 오류 분류 평탄화](troubleshooting/TS-0016-linked-live-provider-error-flattening.md)
- [TS-0017 workerd Linked Live outbound 전송 실패](troubleshooting/TS-0017-workerd-linked-live-outbound-transport.md)
- [TS-0002 Testcontainers PostgreSQL tag와 digest 호환성](troubleshooting/TS-0002-testcontainers-digest-compatibility.md)
- [TS-0003 Dev Container Yarn APT 공개키](troubleshooting/TS-0003-devcontainer-yarn-apt-key.md)
- [TS-0004 Dev Container Gradle cache 권한](troubleshooting/TS-0004-devcontainer-gradle-cache-permission.md)
- [TS-0005 Gradle 플랫폼별 verification metadata](troubleshooting/TS-0005-gradle-cross-platform-verification-metadata.md)
- [TS-0006 Spring Boot 테스트 Prometheus observability](troubleshooting/TS-0006-spring-boot-actuator-access.md)
- [TS-0007 비대화형 k6 권한](troubleshooting/TS-0007-k6-non-root-script-permission.md)
- [TS-0008 GitHub Actions Gitleaks PR 권한](troubleshooting/TS-0008-gitleaks-pr-token-permission.md)
- [TS-0009 Node 24 컨테이너 Edge 검증 재현성](troubleshooting/TS-0009-node24-edge-test-reproducibility.md)

## 서비스 완성 Task Work Record

- [WI-0002 서비스 완성 Task 백로그 게시](work-records/WI-0002-service-completion-backlog.md)

### M0 제품·계약·아키텍처

- [WI-0003 PP-001 서비스 경계와 사용자 여정](work-records/WI-0003-service-boundary-and-user-journey.md)
- [WI-0004 PP-002 HTTP·보안·오류·멱등성 계약](work-records/WI-0004-http-security-error-idempotency-contract.md)
- [WI-0005 PP-003 도메인·상태·점수·보존 정책](work-records/WI-0005-domain-status-scoring-retention-policy.md)
- [WI-0006 PP-004 API·Worker·Outbox·Streams 구조](work-records/WI-0006-api-worker-outbox-streams-architecture.md)
- [WI-0007 PP-005 Provider·실제 API 검증 정책](work-records/WI-0007-provider-and-live-validation-policy.md)
- [WI-0008 PP-006 프런트 UX·접근성 명세](work-records/WI-0008-frontend-ux-accessibility-specification.md)

### M1 Backend 도메인 기반과 익명 보안

- [WI-0009 PP-007 Flyway·Domain·JPA 경계](work-records/WI-0009-flyway-domain-jpa-boundary.md)
- [WI-0010 PP-008 익명 session·capability·CSRF](work-records/WI-0010-anonymous-session-capability-csrf-problem-details.md)

### M2 조건 Draft와 비동기 Job 기반

- [WI-0011 PP-009 조건 추출 port·schema·Eval](work-records/WI-0011-condition-extraction-port-schema-eval.md)
- [WI-0012 PP-010 추천 Draft API](work-records/WI-0012-recommendation-draft-api.md)
- [WI-0013 PP-011 추천 Job 202·Outbox·멱등성](work-records/WI-0013-recommendation-job-202-outbox-idempotency.md)
- [WI-0014 PP-012 Streams relay·retry·DLQ](work-records/WI-0014-streams-relay-retry-dlq.md)

### M3 추천 Pipeline

- [WI-0015 PP-013 NAVER API HUB adapter](work-records/WI-0015-naver-api-hub-adapter.md)
- [WI-0016 PP-014 후보 정규화·중복 제거·근거](work-records/WI-0016-candidate-normalization-deduplication-evidence.md)
- [WI-0017 PP-015 결정론적 점수·Top 3·완화](work-records/WI-0017-deterministic-scoring-top3-relaxation.md)
- [WI-0018 PP-016 근거 기반 이유와 fallback](work-records/WI-0018-grounded-reason-fallback.md)
- [WI-0019 PP-017 Worker pipeline·복구](work-records/WI-0019-worker-pipeline-recovery.md)
- [WI-0020 PP-018 추천 상태·결과 API](work-records/WI-0020-recommendation-status-result-api.md)
- [WI-0021 PP-019 추천 SSE](work-records/WI-0021-recommendation-sse.md)

### M4 추천 Frontend

- [WI-0022 PP-020 Next.js frontend 기반](work-records/WI-0022-next-frontend-foundation.md)
- [WI-0023 PP-021 홈·조건 Draft UI](work-records/WI-0023-home-draft-ui.md)
- [WI-0024 PP-022 진행·결과·공유 UI](work-records/WI-0024-progress-result-share-ui.md)

### M5 공유방·투표·최종 확정

- [WI-0025 PP-023 방 생성·조회·만료](work-records/WI-0025-room-creation-read-expiry.md)
- [WI-0026 PP-024 투표 변경·삭제·동시성](work-records/WI-0026-vote-change-delete-concurrency.md)
- [WI-0027 PP-025 방 SSE·최종 확정](work-records/WI-0027-room-sse-finalization.md)
- [WI-0028 PP-026 참여자·주최자 방 UI](work-records/WI-0028-room-frontend.md)
- [WI-0029 PP-027 allowlist 제품 event](work-records/WI-0029-allowlisted-analytics.md)

### M6 실제 Adapter·보안·운영성

- [WI-0030 PP-028 Cache·rate limit·quota](work-records/WI-0030-rate-quota-cache.md)
- [WI-0031 PP-029 실제 provider adapter](work-records/WI-0031-live-provider-adapters.md)
- [WI-0032 PP-030 보안·개인정보·수명](work-records/WI-0032-security-privacy-lifecycle.md)
- [WI-0033 PP-031 관측성·Runbook](work-records/WI-0033-observability-runbooks.md)

### M7 시스템 검증·Release

- [WI-0034 PP-032 전체 테스트 matrix](work-records/WI-0034-full-test-matrix.md)
- [WI-0035 PP-033 Approval Gate 기반 배포 Live E2E](work-records/WI-0035-staging-live-workflow.md)
- [WI-0036 PP-034 k6 부하 실험](work-records/WI-0036-k6-load-experiments.md)
- [WI-0037 PP-035 Java 17 운영 packaging](work-records/WI-0037-java17-production-packaging.md)
- [WI-0038 PP-036 최종 release Case Study](work-records/WI-0038-final-release-case-study.md)

### 횡단 Provider·신뢰·배포 기반

- [WI-0039 PP-037 공유 Fork Live 신뢰 경계 기반](work-records/WI-0039-shared-fork-live-security-foundation.md)
- [WI-0040 PP-038 Elice LLM Proxy Local Live 계약](work-records/WI-0040-elice-llm-proxy-live-contract.md)
- [WI-0041 PP-039 핵심 추천 core와 Split Live 검증](work-records/WI-0041-recommendation-core-split-live-workflow.md)
- [WI-0042 PP-040 Naver→Elice 실제 Linked Live 워크플로](work-records/WI-0042-naver-elice-linked-live-workflow.md)

## Runbook

- [RUN-0001 Naver Local Live 검증과 자격증명 교체](runbooks/RUN-0001-naver-local-live-and-credential-rotation.md)
- [RUN-0002 Elice LLM Local Live 검증과 Token 교체](runbooks/RUN-0002-elice-llm-local-live-and-token-rotation.md)
- [RUN-0003 추천 워크플로 Split Live Probe 실행과 중단](runbooks/RUN-0003-recommendation-workflow-split-live-probe.md)
- [RUN-0004 Naver→Elice 실제 Linked Live 실행과 중단](runbooks/RUN-0004-recommendation-workflow-linked-live.md)

## 문제 해결·증거 문서

| 종류 | 작성 조건 | 위치 | 템플릿 |
| --- | --- | --- | --- |
| Work Record | 중요한 모든 작업 | `work-records/` | [템플릿](templates/work-record.md) |
| ADR | 장기 영향·대안 비교가 필요한 결정 | `adr/` | [템플릿](templates/adr.md) |
| Troubleshooting | 비직관적·재발 가능한 장애 | `troubleshooting/` | [템플릿](templates/troubleshooting.md) |
| Experiment | 측정 가능한 가설과 비교 | `experiments/` | [템플릿](templates/experiment.md) |
| Runbook | 반복 가능한 진단·복구 | `runbooks/` | [템플릿](templates/runbook.md) |
| Case Study | 증거가 확보된 포트폴리오 성과 | `case-studies/` | [템플릿](templates/case-study.md) |

## 품질 검사

```bash
npm ci
npm run docs:check
npm run docs:test
```

검사는 Markdown 스타일, frontmatter 필수 필드, ID·상태·날짜, 중복 ID,
내부 링크와 anchor, 미완성 placeholder, Java 17 정책, 변경 파일과 Work Record의
추적 관계, 일반적인 비밀 패턴을 검사한다. 외부 링크 검사는 네트워크 변동으로
필수 CI에서 분리하며 `npm run docs:links:external`로 실행한다.
