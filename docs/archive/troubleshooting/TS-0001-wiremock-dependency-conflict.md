---
id: TS-0001
title: WireMock과 Spring Boot Jackson 의존성 충돌
type: troubleshooting
status: verified
date: 2026-07-13
owners:
  - placepick-backend
related:
  - ../work-records/WI-0001-agentic-development-environment.md
---

# TS-0001 WireMock과 Spring Boot Jackson 의존성 충돌

## 증상과 영향

통합 테스트에 `org.wiremock:wiremock:3.13.2`를 추가한 뒤 Gradle 의존성 해석이
실패했다. 저장소는 버전 충돌을 조용히 선택하지 않도록 `failOnVersionConflict()`를
사용하므로, 통합 테스트 컴파일과 lockfile 생성이 중단되었다.

## 조사 기록

Spring Boot 3.5.16의 dependency management와 WireMock 일반 모듈이 전달하는
Jackson BOM을 비교했다. 애플리케이션과 테스트가 같은 Jackson 구성 요소에 서로 다른
버전을 요구하는 것이 확인되어 저장소나 Testcontainers 문제가 아니라 WireMock의
전이 의존성 경계 문제로 판정했다.

버전 충돌 검사를 끄거나 특정 Jackson 버전을 강제하는 대안도 검토했다. 전자는 이후
충돌을 숨기고, 후자는 Spring Boot가 검증한 BOM 정합성을 훼손하므로 제외했다.

## 근본 원인과 해결

일반 WireMock 모듈의 전이 의존성이 Spring Boot 관리 의존성 그래프에 합쳐진 것이
원인이었다. 의존성을 `org.wiremock:wiremock-standalone:3.13.2`로 교체해 WireMock의
실행 의존성을 테스트 애플리케이션 classpath와 격리했다. 롤백은 일반 모듈로 되돌리는
것이지만, 그 경우 충돌 해소 근거와 회귀 검증을 먼저 제시해야 한다.

## 검증과 재발 방지

`./gradlew :backend:integrationTestClasses --no-daemon`으로 통합 테스트 의존성 해석과
컴파일 성공을 확인했다. `backend/gradle.lockfile`과 Gradle verification metadata에
standalone 좌표와 checksum을 고정했다. 전역 `failOnVersionConflict()`는 유지해 같은
유형의 BOM 충돌이 다시 들어오면 CI가 즉시 실패하도록 했다.
