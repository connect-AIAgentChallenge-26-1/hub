---
id: TS-0011
title: GitHub runner의 ripgrep 누락으로 인한 보고서 안전 검사 중단
type: troubleshooting
status: verified
date: 2026-07-14
owners:
  - placepick-platform
related:
  - ../work-records/WI-0040-elice-llm-proxy-live-contract.md
  - https://github.com/gdh0730/hub/pull/41
---

# TS-0011 GitHub runner의 ripgrep 누락으로 인한 보고서 안전 검사 중단

## 증상과 영향

PR #41의 commit `48390b39920ad0971231bb9719d3a8b3f7c74771`에서
`Repository policy and Compose` job이 `Test report safety scan refused: rg is
required.`와 exit 1로 중단됐다. Dev Container의 전체 `make check`는 통과했으므로
애플리케이션 회귀가 아니라 실행 환경의 필수 도구 차이다.

scanner는 텍스트와 binary 테스트 보고서에서 provider token·전체 proxy URL·응답 본문과
vector 흔적을 검사한다. `rg`가 없을 때 검사를 건너뛰면 안전하지 않으므로 fail-closed
동작 자체는 유지해야 한다. 같은 scanner를 `always()`로 실행하는 backend job도 별도
준비가 없으면 보고서 업로드 전에 동일하게 실패할 수 있다.

## 조사 기록

실패한 Actions run `29336934391`, job `87098422052`의 로그에서 Node 의존성 설치와
ShellCheck는 통과했고 첫 scanner 정상 fixture에서 즉시 `rg` 누락이 확인됐다. scanner의
마지막 음성 fixture가 PATH에서 `rg`를 의도적으로 제거한 것이 원인은 아니었다. 그
fixture에 도달하기 전 정상 fixture가 실패했기 때문이다.

Dev Container에는 `ripgrep` 패키지가 명시돼 있지만 `ubuntu-latest` runner의 사전 설치
도구 목록은 저장소 계약이 아니다. runner image에 우연히 존재한다고 가정하는 방식과
버전이 변하는 APT 최신 패키지 설치는 재현성과 공급망 검증 기준을 충족하지 못해
제외했다.

## 근본 원인과 해결

근본 원인은 CI workflow가 scanner의 필수 실행 도구인 `rg`를 직접 준비하지 않고
GitHub-hosted runner 이미지에 암묵적으로 의존한 것이다.

공식 ripgrep 14.1.1 Linux x86_64 musl artifact를 exact version과 SHA-256
`4cf9f2741e6c465ffdb7c26f38056a59e2a2544b51f7cc128ef28337eeae4d8e`로 고정한다.
전용 setup script는 GitHub Actions CI·Linux x86_64·HTTPS만 허용하고 checksum과 실행
버전을 확인한 뒤 `RUNNER_TEMP` 아래 바이너리를 후속 step의 PATH에 추가한다. 저장소나
시스템 디렉터리는 변경하지 않으며 provider credential을 받거나 출력하지 않는다.

`repository-policy`와 `backend-check` job이 checkout 직후 이 setup을 실행한다. scanner가
`rg` 누락 시 실패하는 계약과 해당 음성 테스트는 약화하지 않는다.

## 검증과 재발 방지

ShellCheck, actionlint, scanner 정상·금지 payload·binary·`rg` 누락 fixture와 전체
`make check`를 먼저 로컬 Dev Container에서 실행했다. 수정 SHA를 push한 뒤 PR #41의
`Repository policy and Compose`, `Java 17 backend check`와 Dev Container smoke가
모두 통과하는 것을 `verified` 완료 조건으로 두었다.

수정 commit `cb6213acc044515a2ba484d8ed7be32cba8f03bd`의 CI run
`29337507462`에서 이전에 실패한 `Repository policy and Compose`가 48초,
`Java 17 backend check`가 2분 8초에 성공했다. 같은 commit의 Dev Container smoke run
`29337507340`도 2분 2초에 성공했다. 세 job 모두 provider credential이나
`id-token: write` 없이 실행됐으며 실제 Live task는 호출하지 않았다. 따라서 runner
사전 설치 도구에 의존하지 않고 fail-closed scanner를 유지한다는 완료 기준을 충족했다.

향후 runner image나 CPU architecture를 바꿀 때는 지원 artifact와 SHA-256을 별도로
검토한다. 다운로드나 checksum 검증이 실패하면 CI가 중단되는 것이 의도된 동작이며,
scanner를 생략하는 fallback은 허용하지 않는다.
