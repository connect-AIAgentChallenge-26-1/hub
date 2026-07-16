---
id: ADR-0003
title: GitHub Flow와 저장소 중심 문서 추적성을 사용
type: adr
status: accepted
date: 2026-07-13
owners:
  - placepick-backend
related:
  - ../archive/work-records/WI-0001-agentic-development-environment.md
---

# ADR-0003 GitHub Flow와 저장소 중심 문서 추적성을 사용

## 맥락과 문제

기존 workflow는 CI와 승인 상태를 확인하지 않고 일부 PR을 예약 병합하거나 충돌 PR을
닫을 수 있었다. 기존 PR 템플릿만으로는 문제, 결정 근거, 검증 증거와 AI 사용을
장기적으로 탐색하기 어려웠다. 포트폴리오는 결과뿐 아니라 재현 가능한 문제 해결
과정을 보여줘야 한다.

## 판단 기준과 검토 대안

기준은 변경 단위의 짧은 feedback, 병합 안전성, GitHub 운영 기록과 저장소 정본의
연결, 장기 검색성이다.

- `main`/`develop` 장기 브랜치: 단계 구분은 쉽지만 동기화와 큰 병합 비용이 생긴다.
- PR·Issue에만 기록: 운영 흐름은 좋지만 repo와 버전이 분리되고 템플릿 제약이 크다.
- 저장소 문서에만 기록: 버전 관리는 좋지만 리뷰 대화와 작업 상태 연결이 약하다.
- GitHub Flow와 하이브리드 문서: 두 위치를 연결해야 하지만 운영과 지식 보존을 모두
  만족한다.

## 결정

`main`과 짧은 feature/fix/docs/chore 브랜치를 사용한다. 필수 CI와 리뷰 후 사람이
squash merge하고 예약 자동 병합을 사용하지 않는다. GitHub Issue를 Task 상태·담당자·
완료 기준의 유일한 정본으로 사용한다. Roadmap은 DAG만, PR은 현재 diff와 검증만,
Work Record·ADR·전문 문서는 실제로 생긴 문제 해결 지식만 보존한다.

Work Record는 중요한 Task가 시작될 때만 만들고 시작 전 `planned` 문서를 선생성하지
않는다. 활성 Work Record의 `paths`는 같은 작업의 변경 경로와 자동으로 대조한다.
완료 기록은 archive로 이동하고 검증된 포트폴리오 서사는 Case Study에서 관리한다.

## 결과와 트레이드오프

작은 PR과 일관된 main을 유지하고 결정·검증 증거를 코드 버전과 함께 보존한다.
필요한 판단과 증거는 장기 보존하면서 Issue·Roadmap·WI 사이 상태 중복을 피한다.
문서 생성 기준과 자동검사를 유지하고 전체 프롬프트나 내부 추론은 저장하지 않는다.

## 검증과 재검토 조건

CI가 문서 schema, 링크, 중복 ID, placeholder와 변경 추적을 검사한다. 원격 main에는
관리자가 직접 push 금지, 필수 check, 리뷰와 대화 해결 규칙을 적용해야 한다.
팀 규모나 release cadence 때문에 장기 release branch가 필요해지면 재검토한다.
