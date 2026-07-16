---
id: TS-0005
title: Gradle dependency verification의 플랫폼별 metadata artifact
type: troubleshooting
status: verified
date: 2026-07-13
owners:
  - placepick-build
related:
  - ../work-records/WI-0001-agentic-development-environment.md
  - ../adr/ADR-0001-java17-baseline.md
---

# TS-0005 Gradle dependency verification의 플랫폼별 metadata artifact

## 증상과 영향

Windows 호스트에서 strict dependency verification을 통과한 동일한 Gradle 빌드가
Linux Dev Container의 `make check`에서는 plugin classpath 구성 단계에서 중단됐다.
누락 항목은 `org.junit:junit-bom:5.11.4`의 POM이 아니라 Gradle module metadata
파일이었으며 단위·통합 테스트를 시작하기 전 종료됐다.

## 조사 기록

Gradle HTML report에서 실제 cache 경로와 요청 repository를 확인했다. 기존
`verification-metadata.xml`에는 같은 버전의 POM checksum만 있었고 Linux 빌드가
선택한 `junit-bom-5.11.4.module` 항목은 없었다.

검증을 끄거나 lenient 모드로 낮추면 공급망 변조를 탐지할 수 없어 제외했다. Gradle의
자동 metadata 생성 명령을 검토했지만 전체 파일을 맹목적으로 채택하지 않고, 실패한
단일 artifact를 독립 검증한 뒤 최소 변경하는 기준을 선택했다.

## 근본 원인과 해결

기존 metadata를 생성한 환경과 Linux plugin classpath 해석에서 요청한 artifact 형식이
달랐던 것이 원인이다. Dev Container cache의 module 파일과 Maven Central 원본을 각각
SHA-256으로 계산했고 두 값이 아래와 같이 일치함을 확인했다.

```text
a9a4f27be94e99b9d570162d246a80f686d277d5d31aeb5481047cf51daf46e4
```

일치한 checksum만 `verification-metadata.xml`의 정확한 component에 추가했다. 기존
POM·JAR checksum과 strict 검증 모드는 그대로 유지한다.

## 검증과 재발 방지

Linux Dev Container에서 `make check`를 다시 실행해 plugin classpath, 전체 dependency
graph와 Testcontainers 통합 테스트까지 strict verification으로 통과했다. 누락
checksum 추가 후 다른 artifact의 verification 누락이나 불일치는 발생하지 않았다.

Gradle·Spring Boot plugin 또는 실행 플랫폼을 바꿀 때는 생성된 metadata diff를 그대로
승인하지 않는다. 누락 artifact의 좌표·repository·cache 파일을 확인하고 독립된 원본의
SHA-256과 일치한 항목만 채택한다.
