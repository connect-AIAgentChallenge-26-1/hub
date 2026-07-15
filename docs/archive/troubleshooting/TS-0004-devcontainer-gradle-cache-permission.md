---
id: TS-0004
title: Dev Container Gradle cache named volume 소유권
type: troubleshooting
status: verified
date: 2026-07-13
owners:
  - placepick-platform
related:
  - ../work-records/WI-0001-agentic-development-environment.md
  - ../adr/ADR-0001-java17-baseline.md
---

# TS-0004 Dev Container Gradle cache named volume 소유권

## 증상과 영향

Dev Container 이미지와 기본 서비스 기동에는 성공했지만 `postCreate`의 Gradle JVM
검증에서 Wrapper가 `/home/vscode/.gradle/wrapper/dists` 아래 lock 파일의 부모
디렉터리를 만들지 못했다. 결과적으로 Java·Node·Docker 검증이 성공해도 개발 환경
초기화가 종료 코드 1로 끝났다.

## 조사 기록

호스트 bind mount인 workspace에는 개발 사용자가 쓸 수 있었지만, 별도 named volume으로
마운트한 Gradle cache의 최상위 디렉터리는 root 소유였다. `postCreate`와 일상 명령은
보안 경계를 위해 `vscode` 사용자로 실행하므로 Wrapper의 쓰기 실패가 재현됐다.

Gradle cache volume을 제거하면 당장 통과하지만 컨테이너 재생성 때 같은 문제가 다시
발생할 수 있고 dependency cache도 잃는다. 애플리케이션을 root로 실행하는 방법은
최소 권한 기준을 훼손하므로 제외했다. 호스트 Gradle 디렉터리 bind mount도 호스트
상태·경로·권한에 의존하므로 사용하지 않는다.

## 근본 원인과 해결

Docker가 새 named volume의 root를 생성한 소유권과 Dev Container의 `remoteUser`가
다른 것이 원인이다. `postCreate` 시작 시 passwordless sudo로 cache 디렉터리만 만들고
현재 개발 사용자의 UID·GID로 재귀 소유권을 맞춘다. 이후 setup과 모든 Gradle 명령은
계속 비-root 사용자로 실행한다.

롤백은 소유권 보정 세 줄을 제거하는 것이지만, 그 전에 named volume이 모든 지원
호스트에서 `vscode` 소유로 초기화된다는 검증 증거가 필요하다.

## 검증과 재발 방지

동일한 기존 root 소유 cache volume을 보존한 상태에서 수정한 `postCreate`를 다시
실행했다. Gradle Wrapper 8.14.4 배포물 다운로드·lock 생성, Java 17 launcher 검사와
`npm ci`가 비-root 사용자로 통과했다. 이어진 전체 `make check`도 같은 named volume의
dependency cache를 재사용해 성공했다.

Dev Container smoke CI는 새 volume 조건을 매번 재현하므로 이 권한 회귀를 감지한다.
