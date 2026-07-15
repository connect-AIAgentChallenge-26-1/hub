---
id: ADR-0002
title: Compose와 Testcontainers의 생명주기 책임을 분리
type: adr
status: accepted
date: 2026-07-13
owners:
  - placepick-backend
related:
  - ../archive/work-records/WI-0001-agentic-development-environment.md
---

# ADR-0002 Compose와 Testcontainers의 생명주기 책임을 분리

## 맥락과 문제

PostgreSQL과 Redis는 로컬 실행과 통합 테스트 모두 필요하다. Compose service,
GitHub service container와 Testcontainers를 동시에 사용하면 같은 의존성의 소유자가
여럿이 되어 포트 충돌, 종료 누락과 로컬·CI 차이가 생긴다.

## 판단 기준과 검토 대안

기준은 생명주기 소유권의 명확성, 테스트 격리, 실제 프로토콜 검증, 개발 편의다.

- 모든 상황에서 Compose 사용: 사람이 이해하기 쉽지만 테스트 격리와 병렬성이 낮다.
- 모든 상황에서 Testcontainers 사용: 테스트에는 적합하지만 장기 로컬 서비스와
  관측성 도구를 사람이 운영하기 불편하다.
- 사용 문맥별 분리: 도구는 두 개지만 각 생명주기의 소유자가 한 명으로 명확하다.

## 결정

Compose는 개발자가 실행하는 PostgreSQL, Redis, Mock API와 관측성·부하 오버레이를
소유한다. 통합 테스트는 Testcontainers가 PostgreSQL과 Redis를 직접 생성·종료한다.
Redis는 별도 비관리 모듈 대신 Testcontainers `GenericContainer`를 사용한다.
외부 HTTP 계약은 WireMock으로 격리한다. CI 통합 테스트에서 Compose service나
GitHub service container를 중복 실행하지 않는다.

## 결과와 트레이드오프

테스트는 임의 포트와 독립 데이터로 병렬·재현 가능하고 로컬 서비스는 명시적인
Compose 명령으로 유지된다. Docker daemon이 없는 환경에서는 단위 테스트만 가능하며
이미지 pull 비용이 생긴다. pinned image와 cache로 변동을 줄인다.

## 검증과 재검토 조건

통합 테스트가 사전 실행 서비스 없이 성공하고 종료 후 컨테이너가 남지 않아야 한다.
Compose 모든 오버레이는 `docker compose config`와 healthcheck를 통과해야 한다.
Testcontainers가 지원하지 않는 인프라나 운영과 동일한 다중 서비스 시나리오가
필수 테스트가 되면 경계를 재검토한다.
