---
id: TS-0008
title: GitHub Actions Gitleaks의 PR 커밋 조회 권한
type: troubleshooting
status: verified
date: 2026-07-13
owners:
  - placepick-platform
related:
  - ../work-records/WI-0001-agentic-development-environment.md
---

# TS-0008 GitHub Actions Gitleaks의 PR 커밋 조회 권한

## 증상과 영향

첫 Draft PR의 `Repository policy and Compose` job에서 문서 정책, 음성 fixture와
Compose 검증은 통과했지만 `Scan committed content for secrets` 단계가 HTTP 403으로
중단됐다. 같은 commit의 Java 17 backend check와 Dev Container smoke는 통과했다.

실패한 요청은 `GET /repos/gdh0730/hub/pulls/2/commits`였고 응답은
`Resource not accessible by integration`이었다. 따라서 비밀 탐지 결과가 아니라
Gitleaks Action이 검사 범위를 계산하기 전에 발생한 권한 오류다.

## 조사와 판단 기준

실패 job의 `GITHUB_TOKEN Permissions`에는 `Contents: read`만 있었다. API 응답의
`x-accepted-github-permissions`는 `pull_requests=read`를 요구한다고 명시했다.
workflow에서 일부 권한을 선언하면 나머지는 `none`이 되므로, 현재 토큰에는 PR
커밋 목록을 읽을 권한이 없었다.

판단 기준은 실패 요청에 필요한 최소 권한, 서드파티 Action의 변경 가능 범위와 fork
PR 호환성이다. 다음 대안을 검토했다.

- 저장소 또는 workflow 전체에 쓰기 권한을 주면 해결 범위보다 권한이 넓어 제외했다.
- `pull-requests: write`는 read를 포함하지만 PR 댓글·라벨 등 변경 권한까지 주므로,
  자동 댓글이 요구되지 않은 현재 하네스에는 과도하다.
- Gitleaks Action을 별도 CLI 설치 단계로 교체하면 API 의존성은 줄지만 pinned Action과
  보고 흐름을 동시에 바꾸는 더 큰 변경이므로 이번 장애의 최소 수정에서 제외했다.

## 선택한 해결

Gitleaks가 포함된 `repository-policy` job에만 `contents: read`와
`pull-requests: read`를 지정한다. job 수준 권한은 workflow 수준 권한을 덮어쓰므로
checkout에 필요한 `contents: read`도 함께 반복한다. 다른 job과 저장소 기본 권한,
쓰기 권한은 변경하지 않는다.

## 검증 결과와 재발 방지

로컬에서 YAML을 파싱해 해당 job 권한이 `contents: read`와
`pull-requests: read` 두 개뿐임을 확인했다. 이어서 문서 32개 lint·정책, 음성 fixture
8개, Compose 조합과 Gradle 전체 lifecycle을 포함한 `make check`가 통과했고 Gitleaks
로컬 검사에서도 탐지 결과가 없었다.

commit `0b4a5aa`를 push해 생성된 CI run `29250283518`에서 이전에 실패했던
`Repository policy and Compose`가 성공했다. 같은 SHA의 `Java 17 backend check`와
Dev Container smoke run `29250283422`도 성공했다. 따라서 PR 쓰기 권한 없이 read
권한만으로 검사 목적과 CI 계약을 충족함을 확인했다.

향후 GitHub Action이 API를 호출할 때는 실패 응답의
`x-accepted-github-permissions`와 실제 HTTP method를 기준으로 read와 write를
구분한다. 자동 댓글처럼 원격 상태 변경이 새 요구가 될 때만 별도 결정으로 쓰기
권한을 검토한다.
