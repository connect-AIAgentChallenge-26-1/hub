---
id: WI-0001
title: Java 17 기반 Agentic 개발 환경 구축
type: work-record
status: done
date: 2026-07-13
owners:
  - placepick-backend
related:
  - ../../case-studies/CASE-0001-agentic-development-environment.md
  - ../adr/ADR-0001-java17-baseline.md
  - ../adr/ADR-0002-compose-testcontainers-boundary.md
  - ../adr/ADR-0003-github-flow-documentation-traceability.md
  - ../troubleshooting/TS-0001-wiremock-dependency-conflict.md
  - ../troubleshooting/TS-0002-testcontainers-digest-compatibility.md
  - ../troubleshooting/TS-0003-devcontainer-yarn-apt-key.md
  - ../troubleshooting/TS-0004-devcontainer-gradle-cache-permission.md
  - ../troubleshooting/TS-0005-gradle-cross-platform-verification-metadata.md
  - ../troubleshooting/TS-0006-spring-boot-actuator-access.md
  - ../troubleshooting/TS-0007-k6-non-root-script-permission.md
  - ../troubleshooting/TS-0008-gitleaks-pr-token-permission.md
paths:
  - README.md
  - AGENTS.md
  - Makefile
  - settings.gradle
  - build.gradle
  - gradle.properties
  - gradlew
  - gradlew.bat
  - gradle/**
  - backend/**
  - .devcontainer/**
  - .vscode/**
  - .codex/**
  - .github/**
  - docker-compose*.yml
  - scripts/**
  - mock-api/**
  - observability/**
  - k6/**
  - evals/**
  - docs/**
  - tools/docs/**
  - package.json
  - package-lock.json
  - .editorconfig
  - .gitattributes
  - .gitignore
  - .env.example
  - documents/개발 환경.md
  - documents/기획안_spring.md
  - documents/전체 구현 설계.md
---

# WI-0001 Java 17 기반 Agentic 개발 환경 구축

## 문제와 근거

저장소에는 상세 기획과 독립적인 UI 시안만 있었고 실행 가능한 Spring Boot 빌드,
인프라, 테스트, CI와 개발 과정 기록 체계가 없었다. 원문 개발 환경에는 필수와
선택 항목이 뒤섞였고 Java 21, `develop` 브랜치, 오래된 hook schema와 위험한
예약 자동 병합 예시가 확정 요구와 충돌했다.

호스트 점검 결과 Java 17은 설치되어 있었지만 Gradle과 k6는 없고 Docker Desktop
엔진은 중지 상태였다. 따라서 호스트 도구를 늘리는 방식은 재현성과 Agent 실행
가능성을 보장하지 못했다.

## 목적과 성공 기준

목적은 Java 17을 단일 런타임 기준으로 고정하고, Dev Container에서 동일한 명령으로
빌드·테스트·관측·문서 검증을 반복할 수 있는 백엔드 환경을 만드는 것이다.

성공 기준은 다음과 같다.

- 호스트·Dev Container·Gradle toolchain·테스트·CI가 Java 17을 사용한다.
- `./gradlew check`가 단위·통합·Eval을 한 번의 dependency graph로 검증한다.
- Compose의 모든 오버레이 조합이 유효하고 mock 외부 모드를 벗어나지 않는다.
- Actuator, Prometheus, Grafana와 k6 health smoke를 재현할 수 있다.
- 모든 중요한 작업과 결정이 검증 증거까지 추적된다.
- 기존 사용자 수정과 미추적 HTML·기존 UI 시안을 변경하지 않는다.

## 범위, 비범위와 제약

범위는 백엔드 skeleton, PostgreSQL·Redis·WireMock, Dev Container, 관측성, health
smoke, 테스트 계층, 문서 자동검증과 GitHub Flow 안전망이다. 추천·투표 비즈니스
API, 프런트엔드, 실제 Naver·LLM 연동과 운영 배포는 포함하지 않는다.

Docker Desktop 시작과 원격 branch protection 적용은 사용자의 로컬·관리자 동작이
필요하다. 외부 API 비용과 데이터 유출을 막기 위해 local/test/load는 mock 모드로
fail closed한다.

## 판단 기준과 대안

우선순위는 재현성, 실제 실패 검출력, 외부 연동 안전성, 실행 시간, 문서 증거의
추적성 순서로 두었다.

- 호스트 직접 설치는 초기 단계가 짧지만 개발자별 버전 차이가 남아 제외했다.
- Java 21 컨테이너는 장기 지원 장점이 있으나 사용자가 전체 Java 17을 확정해 제외했다.
- Compose만으로 테스트 DB를 관리하면 수동 실행과 CI 환경 결합이 커져 제외했다.
- 모든 판단을 PR 본문에만 쓰면 검색성과 장기 보존성이 낮아 repo 문서와 병행했다.

선택 결과는 Dev Container를 공식 개발 환경으로, Testcontainers를 테스트 생명주기
관리자로, Work Record와 ADR을 포트폴리오 정본으로 사용하는 것이다.

## 문제 해결 기록

1. 저장소와 working tree를 조사해 사용자 변경, 원문 충돌, 실행 파일 부재를 확인했다.
2. 호스트 Java·Docker·Node·VS Code 상태를 확인해 컨테이너 기준의 필요성을 검증했다.
3. Spring Boot 4의 JUnit 6과 원문의 JUnit 5가 충돌함을 확인하고 Java 17·JUnit 5를
   유지하는 Spring Boot 3.5.16을 선정했다.
4. Docker Compose는 사람용 장기 서비스, Testcontainers는 테스트 소유 서비스로
   분리해 중복 포트와 CI 편차를 제거했다.
5. 위험한 예약 자동 병합을 제거하고 필수 CI 후 수동 squash merge로 전환했다.
6. 문서 frontmatter·링크·ID·placeholder·추적성·비밀 검사를 코드화하고 의도적으로
   잘못된 fixture가 각 규칙에서 실패하는지 테스트하도록 설계했다.
7. WireMock 일반 모듈이 가져오는 Jackson BOM과 Spring Boot 관리 버전이 충돌해
   `failOnVersionConflict()`가 빌드를 중단했다. 의존성을 standalone 배포물로 격리하고
   [TS-0001](../troubleshooting/TS-0001-wiremock-dependency-conflict.md)에 원인과 검증을 남겼다.
8. Gradle 8.14.4의 버전 출력이 기존 `JVM:` 대신 `Launcher JVM:`을 사용해 환경
   검사기가 런타임을 찾지 못했다. 실제 출력을 기준으로 두 형식을 처리하도록 수정하고
   Gradle 자체의 Java 17 검증 task와 함께 확인했다.
9. Grafana 데이터 볼륨이 이미지의 `/var/lib/grafana` 아래에 복사한 대시보드를
   가리는 경로 충돌을 확인했다. provisioning 대시보드를 `/etc/grafana/dashboards`로
   분리해 영속 데이터 초기화 여부와 무관하게 읽히도록 수정했다.
10. Testcontainers 1.21.4가 `postgres:<tag>@<digest>` 참조를 기본 PostgreSQL
    이미지와 자동 호환으로 판정하지 않는 것을 확인했다. digest 고정은 유지하고
    `asCompatibleSubstituteFor("postgres")`로 이미지의 의도를 명시했으며 조사 근거를
    [TS-0002](../troubleshooting/TS-0002-testcontainers-digest-compatibility.md)에 남겼다.
11. Prometheus가 호스트 loopback에만 게시된 8080 포트를 host gateway로 우회하면
    컨테이너 네트워크에서 도달성이 달라질 수 있음을 확인했다. 기준 실행 위치인
    Dev Container와 같은 Compose 네트워크의 `dev:8080`을 직접 수집하도록 바꾸고,
    이미 Compose가 게시한 포트의 VS Code 중복 forwarding도 제거했다.
12. CI 실패를 PR 화면의 일시적인 log에만 남기지 않도록 문서 정책·음성 테스트
    출력을 별도 artifact로 보존하고, 백엔드 JUnit·통합 테스트 report와 같은 14일
    증거 보존 기준을 적용했다.
13. Docker Desktop 시작 후 최초 Dev Container 빌드에서 기반 이미지의 Yarn APT
    source와 keyring 불일치로 `apt-get update`가 실패했다. Yarn은 Node feature로
    관리하므로 불필요한 source만 제거하고 APT 서명 검증은 유지했으며 재현·대안·
    해결 기준을 [TS-0003](../troubleshooting/TS-0003-devcontainer-yarn-apt-key.md)에 기록했다.
14. 이미지 빌드 후 새 Gradle cache named volume이 root 소유로 마운트되어 비-root
    개발 사용자의 Wrapper 초기화가 실패했다. cache는 유지하되 `postCreate` 시작 시
    현재 UID·GID로 소유권을 한정 보정하도록 하고, root 실행·호스트 cache bind 대안을
    제외한 근거를 [TS-0004](../troubleshooting/TS-0004-devcontainer-gradle-cache-permission.md)에 기록했다.
15. Windows에서는 통과한 Gradle verification metadata가 Linux plugin classpath에서
    추가로 선택된 JUnit BOM module 파일을 포함하지 않아 strict 검증이 중단됐다.
    cache와 Maven Central 원본 SHA-256의 일치를 독립 확인한 단일 항목만 추가했으며
    검증을 완화하지 않은 과정을 [TS-0005](../troubleshooting/TS-0005-gradle-cross-platform-verification-metadata.md)에 기록했다.
16. 실제 통합 테스트에서 health는 200이지만 Prometheus가 404인 계약 불일치를
    발견했다. 실제 Boot JAR은 200인 반면 `@SpringBootTest` 조건 보고서에는 외부
    metrics export가 비활성화됐음을 확인했다. metrics만 명시적으로 자동 구성하고,
    deprecated enable 설정도 현재 access 모델로 정렬한 근거를
    [TS-0006](../troubleshooting/TS-0006-spring-boot-actuator-access.md)에 기록했다.
17. 비대화형 Dev Container에서 k6 실행이 종료 코드 255로 끝났다. 명시적 no-TTY로
    가려진 오류를 드러내고 최종 이미지에서 `/scripts`가 0444인 것을 확인했다.
    디렉터리 0555·fixture 0444·런타임 UID 12345를 분리한 해결 과정을
    [TS-0007](../troubleshooting/TS-0007-k6-non-root-script-permission.md)에 기록했다.
18. 첫 Draft PR에서 backend와 Dev Container 검증은 성공했지만 Gitleaks Action이
    PR 커밋 목록을 읽는 단계에서 HTTP 403을 반환했다. 응답이 요구한
    `pull_requests=read`만 해당 job에 추가하고 쓰기·전역 권한을 제외한 근거와 원격
    재검증 결과를
    [TS-0008](../troubleshooting/TS-0008-gitleaks-pr-token-permission.md)에 기록했다.
19. YAML parsing만으로는 GitHub Actions의 event key, expression type과 action 입력
    계약 오류를 찾을 수 없었다. 공식 actionlint v1.7.12 image를 multi-architecture
    index digest로 고정하고 실행 version을 대조한 뒤 workflow 디렉터리만 network 없는
    container에 전달하도록 해 공급망 재현성과 로컬 비밀 격리를 함께 적용했다.

## 구현 결과와 검증 증거

Java 17 Spring Boot skeleton, 재현 가능한 Gradle Wrapper, 계층형 테스트 task,
Compose/Dev Container, WireMock fixture, 관측성·k6 smoke, 문서 체계와 GitHub CI를
하나의 표준 명령 집합으로 연결했다.

2026-07-13에 Docker Desktop을 실행한 뒤 확보한 증거는 다음과 같다.

- 호스트 Java는 17.0.15였고, 실제 Dev Container는 Java 17.0.16, Node 24.18.0,
  Docker CLI 28.3.3, Compose 2.40.3을 보고했다. Gradle 8.14.4의 launcher와 daemon도
  같은 Java 17을 사용했다.
- Dev Container를 깨끗하게 build하고 `postCreate`와 `make setup`을 완료했다. 새
  Gradle cache volume을 비-root 사용자가 이용할 수 있었고 기존 `.env`는 덮어쓰지
  않았다.
- `make up --wait`에 해당하는 표준 흐름에서 PostgreSQL, Redis, Mock Naver와 Mock LLM이
  모두 healthy가 됐다. Mock 정상 fixture는 Naver `total=2`, LLM
  `id=chatcmpl-placepick-fixture`를 반환했고 강제 오류 fixture는 각각 503을 반환했다.
- Dev Container의 전체 `make check`가 strict dependency verification을 유지한 채
  성공했다. Docker 없는 단위 테스트 4개, Eval 5개와 실제 Testcontainers PostgreSQL·
  Redis 및 WireMock을 쓰는 통합·계약 테스트 4개가 통과했으며 임시 컨테이너는 자동
  제거됐다. 문서 정책의 음성 fixture 8개와 Compose 4개 조합도 함께 통과했다.
- 실제 `make run`은 PostgreSQL·Redis에 연결된 local 프로필로 기동했다. health와
  Prometheus는 200, Actuator root·info와 아직 계획 상태인 추천 경로는 404를 반환해
  공개 HTTP 표면이 계약과 일치했다.
- `make observe` 후 Prometheus target `http://dev:8080/actuator/prometheus`는 오류 없이
  `up`이었고 `up{job="placepick-backend"}` 값은 1이었다. Grafana 13.1.0은 database
  `ok`, 기본 datasource `placepick-prometheus`와 `PlacePick Runtime Starter` dashboard를
  provisioning했다.
- `make load-smoke`는 비-root k6 2.1.0에서 VU 1·iteration 1, checks 2/2(100%),
  `http_req_failed` 0%와 종료 코드 0으로 끝났다. 단일 health 요청 시간은 성능 목표로
  해석하지 않으며 추천 API 부하 시나리오는 계약 확정 전까지 만들지 않았다.
- 외부 모드를 `real`로 바꾼 격리 실행은 종료 코드 1과
  `PLACEPICK_EXTERNAL_MODE=mock` 요구 메시지로 시작을 거부했다. 외부 Markdown 링크,
  JSON, 셸·ShellCheck, Gitleaks와 사용자 파일 SHA-256 보존 검사도 통과했다.
- 첫 GitHub Actions 실행에서 발견한 Gitleaks Action의 PR read 권한 누락을 job 범위의
  최소 권한으로 수정했다. commit `0b4a5aa`의 CI run `29250283518`에서 repository
  policy와 Java 17 backend check가 성공했고, Dev Container smoke run `29250283422`도
  성공해 세 원격 check가 모두 통과했다.
- 2026-07-14 Dev Container에서 actionlint v1.7.12와 image index digest
  `sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667`을
  대조했다. 현재 workflow 2개는 통과했고 잘못된 `push.branch` 음성 입력은
  `syntax-check` 오류로 거부됐다. 검사 container에는 실제 provider 호출 경로와
  credential을 전달하지 않았다.

검증 완료 결과는 포트폴리오 관점으로
[CASE-0001](../../case-studies/CASE-0001-agentic-development-environment.md)에 요약했다.

## AI 사용과 사람의 검증

AI는 저장소 조사, 대안 비교, 설정·테스트·문서 초안과 정적 검증을 수행했다. 사람은
Java 17 전체 적용, 백엔드 우선 범위, GitHub Flow와 하이브리드 문서화 정책을
확정했다. 생성된 설정은 빌드와 테스트 결과로 검증하며 설명할 수 없는 생성물을
완료 근거로 채택하지 않는다. 전체 프롬프트나 내부 추론은 저장하지 않았다.

## 남은 위험과 학습

원격 branch protection은 관리자 설정이 필요하며 저장소 파일만으로 적용 완료를
주장하지 않는다. Docker Desktop 엔진이 꺼져 있으면 컨테이너 통합·관측성·부하 검증을
재실행할 수 없고, 고정 image digest와 dependency checksum은 의도적인 업데이트
절차가 필요하다. 향후 실제 도메인 API가 추가되면 계약, Eval과 부하 기준을 별도
Work Record에서 측정해 확장한다.

재현 가능한 환경은 도구 설치 목록보다 실행 계약, 생명주기 소유권, fail-closed 외부
정책과 검증 증거를 함께 설계할 때 완성된다는 점을 확인했다.
