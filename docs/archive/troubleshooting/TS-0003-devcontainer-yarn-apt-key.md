---
id: TS-0003
title: Dev Container 기반 이미지의 Yarn APT 공개키 만료
type: troubleshooting
status: verified
date: 2026-07-13
owners:
  - placepick-platform
related:
  - ../work-records/WI-0001-agentic-development-environment.md
  - ../adr/ADR-0001-java17-baseline.md
---

# TS-0003 Dev Container 기반 이미지의 Yarn APT 공개키 만료

## 증상과 영향

Docker Desktop을 시작한 뒤 Dev Container를 최초 빌드하자 패키지 설치 전
`apt-get update`가 종료 코드 100으로 실패했다. 오류는 Yarn 저장소 서명을 검증할
공개키 `62D54FD4003F6525`가 없다는 내용이었으며, 이 상태에서는 Dev Container와
후속 Testcontainers 인수 검증을 시작할 수 없었다.

## 조사 기록

고정한 Java 17 기반 이미지를 직접 실행해 `/etc/apt/sources.list.d/yarn.list`와 관련
keyring을 조사했다. Yarn 저장소는 등록되어 있지만 이를 검증할 keyring 파일은
존재하지 않았다. Debian 공식 저장소의 metadata는 정상적으로 검증됐으므로 Docker
엔진, 네트워크나 전체 APT 체인의 문제가 아니라 기반 이미지에 남은 Yarn source의
불완전한 상태로 범위를 좁혔다.

누락된 공개키를 다시 가져오는 대안은 외부 key 배포 상태에 빌드가 의존하고, 이번
환경은 Yarn을 APT로 설치하지 않으므로 불필요한 신뢰 대상을 늘린다. APT의 서명
검사를 완화하는 방법은 공급망 검증 기준을 훼손하므로 제외했다.

## 근본 원인과 해결

기반 이미지에 Yarn APT source만 남고 대응 keyring이 없는 것이 원인이었다. Node.js
24는 고정한 Dev Container Node feature로 설치하며 이 feature의 Yarn APT 설치 옵션도
사용하지 않는다. 따라서 Dockerfile에서 `apt-get update` 전에 해당 source 파일만
제거했다. Debian 저장소의 서명 검증은 그대로 유지한다.

롤백하려면 source 제거를 되돌리는 대신 먼저 Yarn APT 저장소가 필요한 요구사항과
고정·검증 가능한 key 배포 방식을 ADR로 확정해야 한다.

## 검증과 재발 방지

수정 전 기반 이미지 조사로 source와 keyring 불일치를 재현했다. 수정 후 같은 digest
기반 Dev Container를 다시 빌드해 APT 단계, Docker CLI 28.3.3, GitHub CLI와 Node
24.18.0 feature 설치가 모두 통과하는 것을 확인했다. 후속 `postCreate`가 Gradle cache
검증까지 진행하면서 발견한 별도 권한 문제는 TS-0004로 분리했다.

기반 이미지 digest를 갱신할 때는 Dev Container 전체 빌드를 CI smoke와 로컬 인수
검증에서 다시 수행해 상속된 APT source 상태까지 확인한다.
