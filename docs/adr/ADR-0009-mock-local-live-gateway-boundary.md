---
id: ADR-0009
title: Mock·Local Live·배포 Gateway 신뢰 경계
type: adr
status: superseded
date: 2026-07-14
owners:
  - placepick-team
related:
  - ../roadmap.md
  - ADR-0014-mvp-direct-provider-and-simplified-trust-boundary.md
  - ../archive/work-records/WI-0039-shared-fork-live-security-foundation.md
---

# ADR-0009 Mock·Local Live·배포 Gateway 신뢰 경계

## 당시 문제와 결정

공유 Fork 관리자가 workflow를 변경해도 원본 Provider 자격에 접근할 수 없게 하려는
목적으로 Mock, 로컬 Live, 외부 Approval Gate·Provider Gateway를 분리했다. GitHub는
OIDC만 제출하고 Cloudflare Gateway만 Naver key를 갖는 구조를 선택했다.

이 구조는 위협을 엄격하게 분리했지만 MVP에서 배포하지 않은 Gate, Gateway, replay
저장소, JWT와 다중 runtime 검증을 함께 유지하게 했다. 실제 서비스 경로보다 안전
하네스가 복잡해졌고, GitHub workflow 변경 권한과 배포 운영 권한을 분리하는 비용이
포트폴리오 데모의 위험 수준에 비해 컸다.

## 대체 결정

2026-07-16부터 [ADR-0014](ADR-0014-mvp-direct-provider-and-simplified-trust-boundary.md)가
이 결정을 대체한다. Mock 자동 회귀와 명시적 로컬 Live 경계는 유지하지만, Cloudflare
Approval Gate·Provider Gateway는 MVP에 사용하지 않는다.

로컬 자격은 Git에서 제외한 `.env.live.local`, 배포 자격은 Render secret store에 둔다.
GitHub Actions에는 Provider key를 저장하지 않고 배포에 필요한 최소 자격만 둔다. 더 강한
관리자 격리가 필요한 상용 운영 단계에서는 workload identity 또는 별도 보안 계정을
새 ADR로 재검토한다.

## 보존 범위

PP-037의 구현·검증 기록은 archive에 남기되 현재 아키텍처나 배포 성공 증거로 사용하지
않는다. 당시 실제 Naver·Elice 개별 계약과 Linked Core 실행 결과는 유효한 역사적 증거지만,
Gate·Gateway를 계속 사용해야 한다는 근거는 아니다.
