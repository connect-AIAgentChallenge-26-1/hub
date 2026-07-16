---
id: ADR-0017
title: Grafana Cloud OTLP 운영 관측과 민감정보 경계
type: adr
status: accepted
date: 2026-07-16
owners:
  - placepick-team
related:
  - ../architecture.md
  - ../work-records/WI-0046-recommendation-quality-v2.md
  - ../runbooks/RUN-0007-mvp-protection-observability.md
---

# ADR-0017 Grafana Cloud OTLP 운영 관측과 민감정보 경계

## 맥락

로컬 Prometheus/Grafana는 JVM과 일부 도메인 metric을 보여 주지만 production profile은
Prometheus endpoint를 공개하지 않고 외부 수집 경로도 없다. 임의 응답 trace ID는 로그,
Outbox, Redis와 Worker로 이어지지 않아 비동기 사용자 실패를 상관 분석할 수 없다.

## 결정

로컬 scrape 환경은 유지하고 Render production은 애플리케이션에서 Grafana Cloud Free로
OTLP metric·trace·구조화 log를 비동기 push한다. collector sidecar는 Render Free에 두지
않는다. exporter 실패는 business path를 실패시키지 않는다.

W3C trace context를 HTTP에서 Outbox envelope v2와 Redis Streams를 거쳐 Worker child span으로
복원한다. 기존 v1 event도 계속 읽는다. resource에는 service, environment, release SHA와 role을
넣고 개별 ID는 metric label에 넣지 않는다.

자연어, 검색어, 장소·주소·URL, Provider 요청·응답, 인증 Header, cookie와 share token은
metric·log·trace에서 금지한다. trace/log에는 안전한 event code와 필요한 correlation ID만,
metric에는 폐쇄형 stage·outcome·reason과 count·duration·token 수만 허용한다. 실제 정제 값은
로컬 Live Playground 화면에서만 확인한다.

## 결과와 재검토

무료 데모 초기 trace는 100% 수집하되 환경 변수로 조정한다. Grafana 자격은 Render secret에만
두며 GitHub·Vercel에는 저장하지 않는다. 무료 quota가 반복 포화되거나 유료 SLA·다중 instance가
필요해지면 Alloy/collector와 sampling·retention을 재검토한다.
