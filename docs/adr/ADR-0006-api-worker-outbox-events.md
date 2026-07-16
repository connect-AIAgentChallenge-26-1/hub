---
id: ADR-0006
title: API·Worker 역할과 transactional outbox 이벤트 전달
type: adr
status: accepted
date: 2026-07-13
owners:
  - placepick-team
related:
  - ../roadmap.md
  - ../archive/work-records/WI-0002-service-completion-backlog.md
---

# ADR-0006 API·Worker 역할과 transactional outbox 이벤트 전달

## 맥락과 문제

추천은 여러 외부 호출과 재시도를 포함하므로 HTTP 요청 안에서 끝내면 timeout과
중복 실행에 취약하다. Job을 DB에 저장한 뒤 Redis Streams에 별도로 publish하면 두
작업 사이의 장애로 저장됐지만 처리되지 않는 Job이나 존재하지 않는 Job 이벤트가
생길 수 있다. 로컬 편의와 운영 격리를 위해 하나의 프로세스로만 둘지 여러 배포
artifact로 나눌지도 결정해야 한다.

## 판단 기준과 검토 대안

기준은 DB·이벤트 정합성, 장애 복구, 중복 처리 안전성, 로컬 실행 편의, 운영 scale
분리와 배포 복잡도다.

- DB 저장 후 직접 publish는 단순하지만 dual-write 유실 창이 남는다.
- 분산 transaction은 강한 원자성을 제공하지만 PostgreSQL·Redis 조합의 운영 복잡도가
  과도하다.
- transactional outbox는 relay가 추가되지만 DB transaction 하나로 생성 의도를
  보존하고 반복 publish로 복구할 수 있다.
- API와 Worker를 별도 codebase로 나누면 독립성은 높지만 초기 도메인·계약 중복이
  커진다.

## 결정

하나의 Java 17 Spring Boot artifact가 `api`, `worker`, `all` 역할을 지원한다. 로컬은
`all`, 운영 Compose는 같은 이미지를 API와 Worker 역할로 분리한다. Job과 outbox
event를 한 PostgreSQL transaction에 기록하고 relay가 Redis Streams에 publish한다.

전달은 at-least-once로 정의한다. event는 version, event ID, aggregate ID,
idempotency key, 발생 시각과 correlation 정보를 가진다. Worker는 처리 이력과 상태
전이를 조건부 갱신해 중복을 무해하게 만들고 DB commit 후에만 ACK한다. 제한 재시도
후 poison message는 DLQ로 이동한다. DB snapshot이 상태 정본이며 Redis Pub/Sub은
SSE의 일시적 fan-out에만 사용한다.

## 결과와 트레이드오프

API 응답 시간과 외부 처리 시간을 분리하고 Redis 장애 뒤에도 Job 처리 의도를
복구할 수 있다. exact-once를 주장하지 않으며 모든 consumer에 멱등성 비용이 생긴다.
단일 artifact는 공유 모델을 단순화하지만 역할별 의존이 섞일 수 있으므로 profile과
architecture test로 시작 경계를 강제한다.

## 검증과 재검토 조건

DB commit 직후 Redis 중단, relay 재시작, 중복 delivery, pending claim, Worker crash,
poison event와 DLQ 복구를 Testcontainers로 검증한다. 처리량 측정에서 단일 DB outbox가
병목이 되거나 역할별 release cadence가 달라지면 별도 배포 artifact 또는 broker를
새 ADR에서 비교한다.
