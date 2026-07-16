---
id: CASE-0001
title: Java 17 기반 재현 가능한 Agentic 개발 환경 구축
type: case-study
status: verified
date: 2026-07-13
owners:
  - placepick-backend
related:
  - ../archive/work-records/WI-0001-agentic-development-environment.md
  - ../adr/ADR-0001-java17-baseline.md
  - ../adr/ADR-0002-compose-testcontainers-boundary.md
  - ../adr/ADR-0003-github-flow-documentation-traceability.md
  - ../archive/troubleshooting/TS-0001-wiremock-dependency-conflict.md
  - ../archive/troubleshooting/TS-0002-testcontainers-digest-compatibility.md
  - ../archive/troubleshooting/TS-0003-devcontainer-yarn-apt-key.md
  - ../archive/troubleshooting/TS-0004-devcontainer-gradle-cache-permission.md
  - ../archive/troubleshooting/TS-0005-gradle-cross-platform-verification-metadata.md
  - ../archive/troubleshooting/TS-0006-spring-boot-actuator-access.md
  - ../archive/troubleshooting/TS-0007-k6-non-root-script-permission.md
  - ../archive/troubleshooting/TS-0008-gitleaks-pr-token-permission.md
---

# CASE-0001 Java 17 기반 재현 가능한 Agentic 개발 환경 구축

## 문제와 중요성

기획 문서와 UI 시안만 있던 저장소에는 실행 가능한 백엔드, 버전 기준, 테스트와
관측 하네스가 없었다. 원문의 Java·브랜치·Agent 운영 예시도 확정 요구와 일부
충돌했다. 이 상태에서는 사람이든 Agent든 각자 다른 환경에서 생성한 결과를 같은
기준으로 재현하거나, 결정의 이유와 실패 해결 과정을 포트폴리오 증거로 설명하기
어렵다.

따라서 이번 단계의 문제를 비즈니스 기능 구현이 아니라 재현성, 실제 실패 검출력,
외부 API 안전성, 의사 결정 추적성을 갖춘 개발 기반 구축으로 한정했다. 프런트엔드,
추천·투표 API, 실제 Naver·LLM 연동과 운영 배포는 성과 범위에서 제외했다.

## 접근과 핵심 결정

판단 우선순위를 재현성, 안전성, 검증 가능성, 유지보수성, 실행 비용 순서로 정했다.
그 결과 Java 17·Spring Boot 3.5.16·Gradle Wrapper 8.14.4를 단일 기준으로 고정하고,
호스트 도구 대신 Dev Container를 공식 실행 환경으로 선택했다. 기술 선택의 대안과
트레이드오프는 [ADR-0001](../adr/ADR-0001-java17-baseline.md)에 남겼다.

사람이 유지하는 장기 인프라는 Compose, 테스트마다 격리해야 하는 PostgreSQL·Redis는
Testcontainers가 소유하도록 분리했다. CI에서 Compose와 service container를 중복
기동하지 않는 이유는 [ADR-0002](../adr/ADR-0002-compose-testcontainers-boundary.md)에
기록했다. local·test·load는 mock 모드로 fail closed하고, GitHub Flow와 Work Record·
ADR·Troubleshooting 추적 정책은
[ADR-0003](../adr/ADR-0003-github-flow-documentation-traceability.md)으로 확정했다.

## 구현과 문제 해결

루트 Gradle 멀티 프로젝트와 Java 17 Spring Boot skeleton, 단위·통합·Eval 계층,
PostgreSQL·Redis·WireMock, Actuator·Prometheus·Grafana, 비-root k6 health smoke를
표준 `make` 명령으로 연결했다. Java toolchain과 compiler release, dependency lock과
verification metadata, image tag·digest를 함께 고정해 선언과 실제 실행의 차이를
검사하게 했다.

정적 설정만으로 완료 처리하지 않고 깨끗한 Dev Container build부터 실제 실행했다.
그 과정에서 기반 이미지의 무효 Yarn APT source, root 소유 Gradle volume, Linux에서만
필요한 검증 metadata, Spring Boot 테스트의 observability 안전 기본값, 비대화형 k6의
TTY·디렉터리 권한 문제가 차례로 드러났다. 각 문제는 관찰 → 가설 → 독립 검증 → 최소
수정 → 회귀 검증 순서로 해결했고 [TS-0003](../archive/troubleshooting/TS-0003-devcontainer-yarn-apt-key.md)부터
[TS-0007](../archive/troubleshooting/TS-0007-k6-non-root-script-permission.md)까지 재현 조건과
제외한 대안을 분리해 기록했다.

## 결과와 증거

2026-07-13에 Docker Desktop이 실행된 Windows 환경에서 다음 결과를 확인했다.

| 검증 대상 | 실행·관찰 결과 | 판정 |
| --- | --- | --- |
| Dev Container | Java 17.0.16, Node 24.18.0, Docker CLI 28.3.3, Compose 2.40.3 | 기준 일치 |
| Gradle | 8.14.4 launcher·daemon 모두 Java 17.0.16 | 기준 일치 |
| 전체 검사 | `make check`에서 단위 4, Eval 5, Testcontainers 통합·계약 4개 통과 | 성공 |
| 런타임 계약 | health·Prometheus 200, Actuator root·info·추천 경로 404 | 공개 표면 일치 |
| Mock 안전성 | Naver·LLM 정상 fixture 200, 강제 오류 503, real 모드 시작 거부 | fail closed |
| Prometheus | `dev:8080` target `up`, 해당 job의 `up` query 값 1 | 실제 수집 성공 |
| Grafana | database `ok`, datasource와 `PlacePick Runtime Starter` dashboard 확인 | provisioning 성공 |
| k6 smoke | VU 1, iteration 1, checks 2/2, HTTP 실패율 0%, 종료 코드 0 | health smoke 성공 |
| 격리 정리 | k6·Testcontainers 임시 컨테이너 잔존 없음 | 생명주기 일치 |
| GitHub Actions | repository policy, Java 17 backend, Dev Container smoke | 세 check 성공 |

k6의 단일 요청 시간은 하네스 실행 증거일 뿐 처리량이나 추천 API 성능 성과가 아니다.
도메인 계약이 아직 없으므로 추천 API 부하 시나리오와 목표 수치를 만들지 않았다.
전체 명령과 상세 문제 해결 로그는
[WI-0001](../archive/work-records/WI-0001-agentic-development-environment.md)에서 추적할 수 있다.

## 개인 기여와 학습

사람은 전체 Java 17 적용, 백엔드 환경 우선 범위, GitHub Flow와 문서화 원칙을
확정하고 Docker Desktop을 시작했다. AI는 저장소 조사, 구현 초안, 실패 재현과 원인
격리, 테스트·문서 갱신을 수행했다. 채택한 결과는 파일 생성 여부가 아니라 실제
build, 테스트, HTTP 응답, metrics query와 container lifecycle로 기계적으로 검증했다.
전체 프롬프트나 비공개 추론은 저장하지 않고 재현 가능한 판단과 증거만 남겼다.

가장 큰 학습은 “버전을 고정했다”는 선언만으로 재현성이 확보되지 않는다는 점이다.
운영체제별 dependency resolution, volume 소유권, 테스트 전용 자동 구성, 비-root
컨테이너 권한처럼 실제 경계를 통과해야 환경 계약을 검증할 수 있다. 남은 위험은
원격 branch protection과 GitHub Actions의 첫 PR 실행, 향후 도메인 계약·성능 기준,
실제 외부 연동과 운영 배포이며 각각 별도 승인과 Work Record가 필요하다.
