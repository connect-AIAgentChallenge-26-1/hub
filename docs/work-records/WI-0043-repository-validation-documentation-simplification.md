---
id: WI-0043
title: PP-041 저장소·검증·문서 단순화
type: work-record
status: done
date: 2026-07-16
owners:
  - placepick-team
related:
  - https://github.com/gdh0730/hub/issues/55
  - ../roadmap.md
  - ../architecture.md
  - ../contracts.md
  - ../adr/ADR-0014-mvp-direct-provider-and-simplified-trust-boundary.md
  - ../case-studies/CASE-0002-naver-elice-linked-live-user-flow.md
paths:
  - .codex/**
  - .dockerignore
  - .github/**
  - .env.example
  - .env.live.local.example
  - AGENTS.md
  - Dockerfile
  - Makefile
  - README.md
  - backend/build.gradle
  - backend/src/**
  - build.gradle
  - docker-compose*.yml
  - docs/**
  - edge/**
  - frontend/**
  - k6/**
  - package.json
  - package-lock.json
  - render.yaml
  - scripts/**
  - tools/docs/**
---

# WI-0043 PP-041 저장소·검증·문서 단순화

## 문제와 근거

실제 추천 Core 검증을 확장하는 과정에서 Split·Linked Live launcher, Loopback Gateway,
Edge Gate·Gateway, 개별 Provider canary와 여러 문서가 같은 책임과 결과를 반복했다.
표준 검증은 제품 구현보다 검증 하네스 자체를 더 많이 유지하게 됐고, 30개의 시작하지
않은 Work Record가 GitHub Issue 상태와 중복됐다. 완료된 Linked Live 결과도 계약,
아키텍처, ADR, Runbook, Experiment와 Case Study에 반복돼 현재 정본을 찾기 어려웠다.

## 목적과 성공 기준

- GitHub Issue를 Task 상태·담당자·완료 기준의 단일 정본으로 만든다.
- Roadmap은 선행 관계 DAG만 유지하고 시작 전 Work Record를 제거한다.
- 완료 증거는 archive와 Case Study로 분리하고 활성 문서는 현재 계약만 설명한다.
- 사용하지 않는 Gate·Gateway와 중복 Live 검증 경로를 제거해 표준 명령을 줄인다.
- Mock CI, Java 17, 비밀 비노출과 실제 Provider의 명시적 수동 실행 경계는 유지한다.
- 문서·구성·테스트가 새 명령과 구조에 맞고 `make check`를 통과한다.

## 범위, 비범위와 제약

범위는 저장소 실행 명령, 중복 검증 코드, 문서 체계, Issue/PR 양식과 검증 정책이다.
실제 사용자 값이 보이는 Live Playground는 PP-042, 무료 cloud 배포는 PP-043에서
추적한다. 비즈니스 HTTP API, DB·Worker·SSE와 프런트 사용자 여정의 구현·검증 증거는
각 계약과 WI-0044·WI-0045에 기록하며, 이 문서에서는 단순화 자체의 완료만 판정한다.

사용자 `plans/`, 원본 `documents/`, HTML prototype과 `ProjectIntro.jsx`는 변경하지 않는다.
실제 비밀과 Provider 응답 원문은 diff·로그·문서에 넣지 않는다.

## 판단 기준과 대안

판단 기준은 현재 사용 여부, 사용자 가치, 실패 진단 가능성, 비밀 경계, 로컬·CI 재현성,
문서 정본의 수다.

- 기존 모든 검증 경로를 유지하면 과거 재현성은 높지만 같은 계약을 여러 runtime에서
  중복 검증하고 새 기능 변경마다 유지 비용이 누적된다.
- 문서만 줄이면 코드·명령 중복과 CI 비용은 남는다.
- Mock 자동 회귀와 한 개의 명시적 직접 Live 경로만 남기면 실제성·안전성은 유지하면서
  구조가 단순해진다. 이 대안을 선택한다.

공유 Fork 관리자가 repository를 변경할 수 있다는 위험을 외부 Gate로 완전히 제거하려던
PP-037은 MVP의 운영 복잡도에 비해 효용이 낮다. MVP는 GitHub에 Provider key를 두지 않고,
로컬은 gitignored env, 배포는 Render secret store를 사용한다. GitHub Actions에는 배포에
필요한 최소 자격만 두는 명시적이고 이해 가능한 경계를 채택한다.

## 문제 해결 기록

2026-07-16에 실행 명령, Gradle source set, Edge workspace, scripts, 문서 artifact와 GitHub
양식을 inventory로 만들었다. 활성 문서 97개 중 시작하지 않은 Work Record 30개와 과거
실행 증거의 중복을 확인했다. GitHub 원격 label과 Issue Form도 비교해 존재하지 않는
`feature`, `engineering`, `decision` label과 Work Record 선생성 요구를 제거 대상으로
분류했다.

구현은 `표준 명령 축소 → 중복 검증 경로 제거 → 문서 정본 재배치 → 정책·양식 정리 →
전체 검증` 순서로 수행한다. 과거 Linked Live 결과는 삭제하지 않고 archive와 CASE-0002에
보존한다.

## 구현 결과와 검증 증거

문서·정책 범위에서는 GitHub Issue를 Task 상태 정본으로 선언하고 Roadmap을 PP-001~043
DAG로 축소했다. 시작하지 않은 `planned` WI 30개를 제거하고 종료된 WI 12개, TS 18개,
EXP 1개와 RUN 4개를 archive로 이동했다. Linked Live의 사용자 여정·결과는 CASE-0002를
서술 정본으로 남기고 계약·아키텍처·ADR·Runbook의 반복 실행 이력을 제거했다.

PP-037은 MVP 미사용으로 종료하고 ADR-0009·ADR-0013을 superseded 처리했으며, 직접 Java
Provider와 로컬·Render secret 경계를 ADR-0014로 확정했다. Issue Form은 존재하는 GitHub
label을 쓰는 Task·Bug 두 종류로 축소하고 WI 선생성 요구를 제거했다. PR template은 연결
Issue, 결과, 검증, 위험·rollback 중심으로 줄였다. 매 Stop마다 dirty tree를 경고하던
저장소 Codex hook도 제거했다.

활성 문서와 GitHub YAML 검사는 오류 없이 parsing된다. 레거시 제거와 새 실행 경로를 모두
합친 뒤 `make check`와 최종 강제 재실행을 통해 Java 단위 162개와 통합 158개,
프런트 단위 29개가
통과했다. Mock 브라우저 E2E 4개도 통과했다. CI 경로는 `.env.live.local`을 읽지 않았고
실제 Provider를 호출하지 않았다.

단순화한 직접 Java adapter 경로는 2026-07-16의 세 합성 시나리오 Live Evidence에서
각각 7·6·6회, 합계 19회 호출로 통과했고 report secret scan도 통과했다. 이어 실제
Live Playground 브라우저와 정식 API·PostgreSQL·Redis Worker·두 SSE·투표·최종 확정의
로컬 실제 Provider 흐름도 완료했다. 상세 사용자 여정과 실패 진단은
[CASE-0002](../case-studies/CASE-0002-naver-elice-linked-live-user-flow.md)를 정본으로 삼는다.
이로써 중복 Gateway를 제거한 뒤에도 Mock 회귀, 실제 adapter, 사람이 확인하는 화면과
정식 서비스 경로가 각각 검증됐으므로 이 Work Record를 `done`으로 닫는다.

## AI 사용과 사람의 검증

AI에는 중복 경로 inventory, 문서 링크·상태 검사, 기계적 정리와 회귀 테스트 후보 생성을
위임한다. 사람은 삭제 범위, 실제 사용 명령, 비밀 저장 위치, GitHub 설정과 최종 diff를
검토한다. 내부 추론이나 전체 prompt는 기록하지 않는다.

## 남은 위험과 학습

직접 Live 경로가 기존 Mock 변환·오류 계약을 우회하거나 배포 secret이 로그에 노출되면
단순화가 안전성을 낮출 수 있다. PP-042는 실제 값 화면과 redacted 자동 증거를 분리해
검증했다. PP-043은 배포 환경별 secret scope, 실제 URL, cold start와 rollback을 아직
검증해야 한다.

문서 수를 줄이는 것만으로 정본이 생기지 않는다. Issue·Roadmap·WI·ADR·Runbook·Case
Study가 각각 하나의 질문에만 답하도록 작성 규칙과 자동 검증을 함께 바꿔야 한다.
