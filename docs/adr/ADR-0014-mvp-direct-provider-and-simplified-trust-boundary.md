---
id: ADR-0014
title: MVP 직접 Provider와 단순화한 신뢰 경계
type: adr
status: accepted
date: 2026-07-16
owners:
  - placepick-team
related:
  - ../roadmap.md
  - ../architecture.md
  - ../contracts.md
  - ../work-records/WI-0043-repository-validation-documentation-simplification.md
  - ADR-0009-mock-local-live-gateway-boundary.md
  - ADR-0010-free-demo-deployment-boundary.md
  - ADR-0013-naver-elice-linked-live-boundary.md
---

# ADR-0014 MVP 직접 Provider와 단순화한 신뢰 경계

## 맥락과 문제

초기 검증은 Naver·Elice 개별 canary, Split Live, Linked Live, Edge Approval Gate와 Provider
Gateway를 단계적으로 추가했다. 이 구조는 각 가능성을 증명했지만 제품이 실제로 사용하는
Java adapter와 별도의 TypeScript proxy·launcher·schema를 유지하게 했다. 작은 변경도 여러
검증 경로와 문서를 동시에 갱신해야 했고, 사용자는 실제 값을 눈으로 확인하기 어려웠다.

MVP의 목표는 공유 Fork 관리자를 완전히 불신하는 다중 계정 운영 보안이 아니라, 비밀을
Git에 넣지 않고 실제 추천 사용자 여정을 안전하게 시연하는 것이다.

## 판단 기준과 대안

기준은 사용자 가치, 코드 경로의 동일성, secret 노출면, CI 결정성, 장애 진단 가능성,
무료 배포 가능성과 유지 비용이다.

- 기존 Gate·Gateway를 유지하면 관리자 격리는 강하지만 별도 runtime과 자격 발급 운영이
  필요하고 실제 제품 adapter와 검증 경로가 달라진다.
- 모든 검증을 실제 Provider로 실행하면 단순해 보이지만 CI가 비용·quota·외부 장애에
  종속된다.
- Mock 자동 회귀와 명시적 직접 Live 경로를 분리하면 CI 결정성과 실제성의 역할이
  명확하고 제품 코드와 검증 코드의 차이가 가장 작다.

## 결정

MVP는 다음 두 실행 경계를 사용한다.

| 경계 | 자격 위치 | 목적 |
| --- | --- | --- |
| Mock 자동 검증 | 가짜 값과 WireMock | 변환·오류·fallback·보안 회귀 |
| 명시적 Live | 로컬 `.env.live.local` 또는 Render secret | 실제 Provider와 사용자 여정 확인 |

Cloudflare Approval Gate, Provider Gateway, Split/Linked 전용 Gateway와 개별 canary 명령은
제거한다. 실제 Provider 호출은 표준 `make check`에 포함하지 않는다. 로컬은 개발자가
명시적으로 `make dev-live` 또는 `make live-evidence`를 실행할 때만 gitignored env를 읽는다.
PP-042 Live Playground는 실제 입력·조건·후보·Top 3·근거 이유를 값 단위로 보여 주되,
기본 로그와 영구 문서에는 비밀·응답 원문을 남기지 않는다.

Provider 응답을 제품 의미로 받아들이는 마지막 경계는 Java application server다. 이미
확정된 장소 유형의 불필요한 세부 값은 정규화하고, 누락 조건 warning은 서버가 원본
조건에서 계산한다. LLM 이유는 자연스러운 v2 문장을 허용하되 place/evidence 소유권과
지원되지 않은 속성을 서버가 다시 검증한다. 이 정책은 LLM 출력이 제품 상태의 정본이
되지 않게 한다.

배포에서는 Naver key, Elice token과 routing URL을 Render의 runtime secret store에 둔다.
Vercel browser bundle, Git repository와 GitHub Actions에는 Provider 자격을 두지 않는다.
GitHub Actions가 배포 API를 호출해야 하면 해당 배포에 필요한 최소 scope credential만
사용하고 environment approval·branch 보호·수동 dispatch로 통제한다.

## 결과와 트레이드오프

검증과 제품이 같은 Java adapter를 사용하므로 실제 성공이 제품 호환성을 더 직접적으로
설명한다. Edge runtime, JWT, replay store와 중복 schema가 사라져 장애 지점과 문서 수가
줄어든다.

반면 repository 관리자나 배포 관리자 권한이 탈취되면 악성 코드를 배포해 Render가 가진
자격을 오용할 수 있다. MVP는 이 잔여 위험을 명시적으로 수용한다. Provider quota·사용량
알림, key rotation, 최소 권한과 배포 audit를 적용한다. 상용 서비스, 다수 관리자,
규제 데이터 또는 높은 비용 한도가 생기면 workload identity, 별도 배포 계정과 외부
Gateway를 다시 평가한다.

## 검증과 재검토 조건

PP-041은 중복 경로 제거 뒤 Mock 회귀와 secret scan을 통과해야 한다. PP-042는 실제
Naver→Elice 흐름, 값 단위 표시, 실패·redaction 모드와 cleanup을 검증한다. PP-043은
Vercel·Render 배포와 secret scope, rollback, 대표 E2E를 검증한다.

2026-07-16 직접 Java adapter를 사용한 세 합성 사용자 시나리오가 실제 Naver→Elice
연결, 서버 Top 3와 v2 근거 검증을 모두 통과했고 report secret scan도 통과했다. 자세한
과정과 수치는 [CASE-0002](../case-studies/CASE-0002-naver-elice-linked-live-user-flow.md)에만
기록한다. 이는 이 로컬 신뢰 경계의 실행 가능성을 검증한 것이며 cloud 배포 검증은 아니다.

실제 자격이 Git diff·Actions log·artifact·browser response에 나타나거나, 배포 권한을
가진 사람과 Provider 자격 접근자를 반드시 분리해야 하는 요구가 생기면 이 결정을
재검토한다.
