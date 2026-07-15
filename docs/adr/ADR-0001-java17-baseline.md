---
id: ADR-0001
title: Java 17과 Spring Boot 3.5를 전체 실행 기준으로 사용
type: adr
status: accepted
date: 2026-07-13
owners:
  - placepick-backend
related:
  - ../archive/work-records/WI-0001-agentic-development-environment.md
---

# ADR-0001 Java 17과 Spring Boot 3.5를 전체 실행 기준으로 사용

## 맥락과 문제

호스트에는 Java 17이 설치되어 있었고 사용자는 호스트뿐 아니라 프로젝트 전체를
Java 17로 진행하도록 확정했다. 동시에 원문은 JUnit 5를 요구하므로 최신 Spring
Boot 4의 JUnit 6 기준과 충돌하지 않는 호환 조합이 필요했다.

## 판단 기준과 검토 대안

기준은 사용자 확정, LTS 런타임, JUnit 5 호환, 유지보수되는 Spring Boot 라인,
호스트·컨테이너·CI 간 일관성이다.

- Java 21과 Spring Boot 3.5: 최신 LTS 이점이 있지만 확정된 Java 17과 다르다.
- Java 17과 Spring Boot 4: 최소 Java 요구는 맞지만 JUnit 6 전환 범위가 커진다.
- Java 17과 Spring Boot 3.5: 확정 런타임과 JUnit 5를 함께 만족한다.

## 결정

Java 17, Spring Boot 3.5.16, Gradle Wrapper 8.14.4와 JUnit 5를 사용한다.
Gradle toolchain, compiler release, 테스트 JVM, Dev Container와 CI를 모두 17로
고정한다. Java 21 활성 설정은 자동 정책 검사에서 거부한다.

## 결과와 트레이드오프

개발자와 CI가 같은 bytecode·테스트 런타임을 사용하고 원문의 JUnit 5와 일치한다.
대신 Java 21 이후 언어·런타임 개선은 사용하지 못한다. 향후 업그레이드는 compiler,
테스트, 컨테이너, CI와 문서를 한 ADR에서 함께 변경해야 한다.

## 검증과 재검토 조건

setup과 CI가 Java 버전을 검사하고 Gradle toolchain 테스트가 17 이외 런타임을
거부한다. Spring Boot 3.5 지원 종료, 필수 라이브러리의 Java 17 지원 종료 또는
측정된 런타임 요구가 생기면 재검토한다.
