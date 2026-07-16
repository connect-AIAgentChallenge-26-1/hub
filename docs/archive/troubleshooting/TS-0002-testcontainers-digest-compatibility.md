---
id: TS-0002
title: Testcontainers PostgreSQL tag와 digest 호환성 판정
type: troubleshooting
status: verified
date: 2026-07-13
owners:
  - placepick-backend
related:
  - ../work-records/WI-0001-agentic-development-environment.md
  - ../adr/ADR-0002-compose-testcontainers-boundary.md
---

# TS-0002 Testcontainers PostgreSQL tag와 digest 호환성 판정

## 증상과 영향

PostgreSQL 이미지를 `postgres:<tag>@sha256:<digest>`로 고정한 통합 테스트는 Java
컴파일에는 성공하지만, `PostgreSQLContainer` 생성 시 Docker 연결 전에 이미지
호환성 예외가 발생할 수 있었다. 이 상태에서는 digest 고정이라는 공급망 기준을
지키더라도 CI 통합 테스트가 컨테이너를 시작하지 못한다.

## 조사 기록

Testcontainers 1.21.4의 `DockerImageName.parse` 결과를 직접 비교했다. tag와 digest를
동시에 가진 문자열은 repository와 version을 나누는 과정에서 기본 `postgres`
이미지와 자동 호환으로 판정되지 않았고 `isCompatibleWith`가 `false`를 반환했다.

digest를 제거하면 자동 판정은 되지만 실행 이미지의 불변성이 사라진다. 별도 커스텀
이미지 이름으로 바꾸는 방법은 실제 사용 이미지와 기록이 어긋나므로 제외했다.

## 근본 원인과 해결

원인은 Docker가 허용하는 tag와 digest 결합 참조와 Testcontainers의 이미지 호환성
판정 규칙 사이의 차이다. 정확한 이미지 문자열은 유지하고 파싱 직후
`.asCompatibleSubstituteFor("postgres")`를 적용했다. 이는 해당 digest가 공식
PostgreSQL 이미지라는 테스트 코드의 의도를 명시한다.

롤백 시에는 digest를 제거하지 말고, 사용 중인 Testcontainers 버전에서 tag와 digest
결합 참조를 자동 인식하는지 먼저 재검증해야 한다.

## 검증과 재발 방지

수정 전후 `DockerImageName.isCompatibleWith`를 비교해 `false`에서 `true`로 바뀌는
것을 확인했다. 이어서 다음 명령으로 Testcontainers 1.21.4에 대해 통합 테스트 소스가
컴파일되는지 검증했다.

```bash
./gradlew :backend:integrationTestClasses --no-daemon
```

CI의 `./gradlew check`는 Docker가 가용한 환경에서 실제 PostgreSQL 컨테이너 생성까지
검증한다. PostgreSQL 이미지 좌표나 Testcontainers 버전을 바꿀 때는 이 호환성 선언의
필요성과 정확성을 함께 재검토한다.
