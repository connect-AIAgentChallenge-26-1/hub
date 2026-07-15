---
id: WI-0002
title: 플레이스픽 AI 서비스 완성 Task 백로그 게시
type: work-record
status: done
date: 2026-07-13
owners:
  - placepick-team
related:
  - ../roadmap.md
  - https://github.com/gdh0730/hub/pull/39
  - https://github.com/gdh0730/hub/issues/3
  - https://github.com/gdh0730/hub/issues/38
  - ../adr/ADR-0004-service-boundary.md
  - ../adr/ADR-0005-anonymous-session-room-capability.md
  - ../adr/ADR-0006-api-worker-outbox-events.md
  - ../adr/ADR-0007-provider-and-live-boundary.md
  - ../adr/ADR-0008-frontend-same-origin-boundary.md
paths:
  - AGENTS.md
  - backend/AGENTS.md
  - README.md
  - docs/README.md
  - docs/roadmap.md
  - docs/contracts.md
  - docs/architecture.md
  - docs/adr/ADR-0004-*.md
  - docs/adr/ADR-0005-*.md
  - docs/adr/ADR-0006-*.md
  - docs/adr/ADR-0007-*.md
  - docs/adr/ADR-0008-*.md
---

# WI-0002 플레이스픽 AI 서비스 완성 Task 백로그 게시

## 문제와 근거

Java 17 기반 개발 환경과 검증 하네스는 구축됐지만 비즈니스 기능은 아직 구현되지
않았다. 기존 계약 문서에는 추천 생성, SSE, 공유방과 투표가 큰 단위의 `planned`
항목으로만 존재해 구현 순서, 선행 조건, 실패 정책과 검증 증거를 Issue 단위로
추적할 수 없었다. 프런트엔드, 실제 provider, 보안·부하·릴리스까지 포함한 서비스
완성 조건도 하나의 실행 가능한 DAG로 연결되지 않았다.

이 상태에서 개별 기능을 바로 구현하면 API 의미, 익명 권한, DB와 Redis 사이의
전달 보장, 실제 외부 호출 경계처럼 장기 영향을 주는 결정을 각 구현자가 다시
추측하게 된다. 따라서 구현에 앞서 승인된 사용자 여정을 계약과 ADR로 고정하고,
모든 후속 작업을 검증 가능한 Task와 Work Record로 분해해야 한다.

## 목적과 성공 기준

목적은 플레이스픽 AI 완성형 MVP를 구현할 수 있는 의사결정 완료 백로그를 저장소와
GitHub에 동일한 식별자로 게시하는 것이다.

성공 기준은 다음과 같다.

- `PP-001`부터 `PP-036`까지 선행 관계가 닫힌 Task DAG가 존재한다.
- 각 Task가 `WI-0003`부터 `WI-0038`까지 하나의 planned Work Record와 연결된다.
- 서비스 경계, 익명 권한, 비동기 처리, provider, 프런트 경계를 다섯 ADR로 고정한다.
- 승인된 HTTP 계약은 `specified`, 실제 코드로 검증된 Actuator 계약은
  `implemented`로 구분한다.
- 36개 Issue를 fork인 `gdh0730/hub`에만 생성하고 roadmap에 실제 URL을 기록한다.
- 문서 검사와 전체 `make check`가 통과하고 미추적 사용자 계획 파일은 변경하거나
  커밋하지 않는다.

## 범위, 비범위와 제약

범위는 roadmap, 계약·아키텍처 문서, ADR, Work Record, 저장소 지침과 README의
현재/목표 구분, GitHub Issue와 Draft PR이다. 각 Task에는 문제, 목적, 선행 조건,
고정 결정, 구현 항목, 실패 조건, 테스트 증거와 사람의 검증 책임을 포함한다.

추천·투표 Controller, Flyway 도메인 migration, 프런트엔드 source, 실제 Naver·OpenAI
호출, 운영 이미지와 부하 시나리오는 이번 변경에서 구현하지 않는다. 유료 클라우드
배포, 회원제, 관리자 UI, 결제, 지도·길찾기와 모바일 앱은 완성형 MVP에서도 제외한다.

Issue와 PR은 fork에만 쓸 수 있으며 upstream parent에는 어떠한 변경도 만들지 않는다.
GitHub Flow의 수동 squash merge 원칙 때문에 PR 병합은 사람이 최종 수행한다.

## 판단 기준과 대안

판단 기준은 구현자가 추가 제품 결정을 하지 않아도 되는 명확성, 의존성에 따른 작은
변경 단위, 문서와 GitHub의 추적성, 자동 검증 가능성, 포트폴리오로서의 재현성이다.

- 하나의 대형 Issue는 관리가 단순하지만 병렬 작업, 부분 검증과 rollback 경계가 없다.
- GitHub Issue만 사용하면 진행 상태는 편리하지만 결정 근거가 코드 버전과 분리된다.
- 저장소 문서만 사용하면 장기 보존은 되지만 담당·리뷰·상태 운영이 약하다.
- 36개 Issue와 36개 Work Record의 1:1 연결은 링크 관리 비용이 있으나 실행 상태와
  문제 해결 증거를 함께 보존한다.

따라서 roadmap을 DAG 정본으로 두고 Issue는 실행 상태, Work Record는 문제 해결과
검증 증거의 정본으로 사용한다. 장기 결정은 별도 ADR에 두며 Task는 이를 재논의하지
않고 구현과 검증에 집중한다.

## 문제 해결 기록

1. `origin/main`과 현재 저장소를 비교해 비즈니스 구현이 없고 Actuator 두 경로만
   공개된 사실을 확인했다.
2. 문서 validator를 조사해 Work Record 상태, 필수 frontmatter, 직접 인덱스 링크,
   placeholder와 변경 추적 규칙을 확인했다.
3. GitHub fork의 Issue가 0개이고 `PP-*` 충돌이 없으며 쓰기 권한과 인증 scope가
   충분함을 확인했다.
4. 요구사항 충돌을 분석해 UUID, 서버 발급 익명 세션, organizer capability,
   transactional outbox, at-least-once 처리와 same-origin 경계를 결정했다.
5. 사용자 여정을 제품·기반·추천·프런트·투표·운영·릴리스의 일곱 milestone과
   36개 Task로 분해하고 선행 관계를 고정했다.
6. 미래 구현의 완료 증거와 이번 문서 게시의 검증 증거를 구분해 planned Work
   Record가 완료를 허위 주장하지 않도록 작성했다.
7. 기준 문서를 commit `37c3edf`로 먼저 push한 뒤 fork에 PP-001~PP-036을 Issue
   #3~#38로 생성하고 각 Issue와 Work Record·roadmap을 양방향 연결했다.
8. Issue 링크를 commit `bb0a19e`로 push하고 `main` 대상 한국어 Draft PR #39를
   생성했다.

## 구현 결과와 검증 증거

서비스 완성 Task 게시를 완료해 이 기록의 status를 `done`으로 변경했다. 확보한
증거는 다음과 같다.

- roadmap, 5개 accepted ADR과 WI-0002~WI-0038을 작성했다. 미래 Task 36개는 모두
  `planned`이며 구현 완료를 주장하지 않는다.
- Dev Container의 Java 17.0.16, Node 24.18.0, Docker CLI 28.3.3에서 `make check`가
  성공했다. Gradle unit·integration·Eval과 Compose·shell·문서 검사를 한 번의 표준
  lifecycle로 통과했다.
- 문서 검사에서 75개 Markdown 파일의 lint, frontmatter·링크·ID·placeholder·비밀·
  추적성 정책과 8개 음성 회귀가 성공했다.
- fork `gdh0730/hub`의 Issue를 조회해 [PP-001 #3](https://github.com/gdh0730/hub/issues/3)부터
  [PP-036 #38](https://github.com/gdh0730/hub/issues/38)까지 36개, 누락 0개, 중복
  0개를 확인했다. 각 Issue에는 `enhancement` label과 immutable commit의 WI·ADR
  link가 있다.
- 원격 `docs/service-completion-backlog` 브랜치와 한국어 Draft
  [PR #39](https://github.com/gdh0730/hub/pull/39)을 만들었다.
- `git diff origin/main...HEAD`는 문서·저장소 지침 49개 파일만 포함하고 backend
  source, migration, frontend source와 환경 설정을 변경하지 않는다.
- 사용자 소유 `plans/플레이스픽 AI 서비스 완성 Task 작성 및 실행 계획.md`는
  미추적 상태로 보존했고 어느 commit에도 포함하지 않았다.

## AI 사용과 사람의 검증

AI는 저장소·문서 validator·GitHub 상태 조사, 요구사항 충돌 분석, Task DAG와 문서
초안, 링크·정책 검증을 수행한다. 사람은 완성 범위, 사용자 여정, Java 17 유지,
실제 provider 범위, staging-live 운영과 fork 게시 대상을 승인했다. Issue 생성과
push 전에는 변경 파일을 명시적으로 stage하고, 최종 merge는 사람이 CI 결과와
계약 내용을 확인한 뒤 수행한다.

전체 프롬프트와 내부 추론은 기록하지 않는다. 외부화된 결정, 검증 명령, 채택한
결과와 사람이 확인해야 할 항목만 보존한다.

## 남은 위험과 학습

36개 Task는 구현 중 발견되는 공식 API 변경이나 측정 결과에 따라 세부 구현이 달라질
수 있다. 그러나 공개 계약이나 ADR을 바꾸는 경우 새 근거와 migration·호환 정책을
같은 PR에 기록해야 한다. Naver 데이터 저장과 표시는 약관 검토를 통과하기 전까지
최소 파생 데이터로 제한한다.

큰 제품 목표도 선행 관계, 실패 정책과 검증 증거를 Task마다 고정하면 Agent가 다음
단계를 임의 추측하는 위험을 줄일 수 있다. 반대로 Issue 제목만 나열하면 같은 개수의
Task가 있어도 실행 가능한 백로그가 되지 않으므로 Work Record를 1:1로 유지한다.
