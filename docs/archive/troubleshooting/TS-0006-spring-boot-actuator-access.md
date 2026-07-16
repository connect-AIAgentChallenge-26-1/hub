---
id: TS-0006
title: Spring Boot 통합 테스트의 Prometheus observability
type: troubleshooting
status: verified
date: 2026-07-13
owners:
  - placepick-backend
related:
  - ../work-records/WI-0001-agentic-development-environment.md
  - ../contracts.md
---

# TS-0006 Spring Boot 통합 테스트의 Prometheus observability

## 증상과 영향

Docker가 가용한 Dev Container에서 실제 `make check`를 실행하자 PostgreSQL·Redis,
Flyway/JPA, health와 WireMock 검증은 통과했지만 `/actuator/prometheus`만 404를
반환했다. 로그에는 `/actuator` 아래 endpoint가 하나만 노출됐으며, 계획한 Prometheus
수집과 후속 관측성 검증을 수행할 수 없었다.

## 조사 기록

실패한 통합 테스트 XML과 Spring 시작 로그에서 health만 endpoint bean으로 등록된
사실을 확인했다. 반면 같은 설정으로 생성한 실제 Boot JAR은 local 인프라에 연결되어
health와 Prometheus 모두 200을 반환했다. 따라서 운영 classpath·설정이 아니라
`@SpringBootTest` 문맥으로 원인 범위를 좁혔다.

테스트 조건 평가 보고서에는 `management.defaults.metrics.export.enabled`가 `false`로
간주되어 `PrometheusMetricsExportAutoConfiguration`이 제외됐다고 명시됐다. Spring
Boot 3.5 공식 테스트 문서도 `@SpringBootTest`에서는 in-memory 이외 meter registry를
기본 자동 구성하지 않으며, 외부 metrics backend 검증에는
`@AutoConfigureObservability`를 사용하도록 규정한다.

조사 과정에서 Spring Boot 3.5.16 configuration metadata도 확인했다.
`management.endpoints.enabled-by-default`는 3.4부터 deprecated이고 현재
`management.endpoints.access.default`로 교체됐으므로 실제 설정도 현재 access
모델로 함께 정렬했다.

Prometheus 테스트를 404 기대값으로 낮추는 방법은 공개 계약과 관측 하네스를 깨므로
제외했다. 모든 endpoint를 기본 활성화하는 방법은 불필요한 관리 표면을 늘리므로
보안 기준에 맞지 않는다.

## 근본 원인과 해결

직접 원인은 Spring Boot 테스트 안전 기본값이 외부 Prometheus registry를 비활성화한
것이다. 이 테스트는 scrape endpoint 자체가 공개 계약이므로
`@AutoConfigureObservability(metrics = true, tracing = false)`를 명시했다. metrics만
필요하므로 tracing reporter는 활성화하지 않는다.

애플리케이션 설정은 전역 access 기본값을 `none`으로 두고 health와 Prometheus만
각각 `read-only`로 허용했다. HTTP exposure 목록과 discovery 비활성화도 유지해
외부 표면을 두 endpoint로 제한한다.

## 검증과 재발 방지

Testcontainers 통합 테스트를 다시 실행해 health와 Prometheus는 200, info와 계획
상태의 비즈니스 경로는 404임을 확인했다. 전체 `make check`도 단위 4개, Eval 5개,
통합 4개 테스트를 포함해 통과했다. 실제 `make run`에서도 같은 HTTP 상태를 확인했고,
Prometheus target `dev:8080`은 `up`, `up{job="placepick-backend"}` 값은 1이었다.

Spring Boot minor line을 변경할 때는 테스트의 observability 기본값과 deprecated
configuration metadata를 검사하고, Actuator 공개 표면의 positive·negative HTTP
계약을 같은 통합 테스트로 유지한다.
