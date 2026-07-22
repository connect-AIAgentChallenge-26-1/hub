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
Prometheus endpoint를 공개할 수 없다. 기존 임의 UUID 응답 trace ID도 실제 span, Outbox,
Redis와 Worker로 이어지지 않아 비동기 사용자 실패를 상관 분석할 수 없었다. Render Free에
별도 collector를 항상 실행하는 방식은 비용과 운영 복잡도가 데모 범위를 넘는다.

## 결정

로컬 scrape 환경은 유지하고 Render production은 애플리케이션에서 Grafana Cloud Free로
OTLP metric·trace·구조화 log를 비동기 push한다. collector sidecar는 Render Free에 두지
않는다. exporter 실패는 business path를 실패시키지 않는다.

Spring Boot 3.5의 Micrometer Observation과 OpenTelemetry bridge/exporter를 사용한다.
production은 `GRAFANA_OTLP_ENDPOINT`의 `/v1/metrics`, `/v1/traces`, `/v1/logs`로 직접
전송하고 Prometheus registry와 `/actuator/prometheus`를 비활성화한다. 시작 guard는 endpoint가
HTTPS Grafana Cloud `/otlp` base인지, Authorization이 Basic 형식인지, release가 정확한
40자리 SHA인지, role이 `api|worker|all`인지 확인한다. exporter endpoint의 실제 접속 성공까지
시작 조건으로 만들지는 않는다.

HTTP에서 소비한 W3C context의 active span ID를 `X-Trace-Id`와 Problem Details에 사용한다.
추천 생성 시 Outbox envelope v2에 `traceparent`와 선택적인 `tracestate`를 저장하고 Redis
Streams Worker가 이를 복원해 consumer child span을 만든다. 과거 envelope v1은 context 없는
root consumer span으로 계속 읽는다. Naver·Elice outbound adapter는 Provider·operation·
outcome만 쓰는 수동 CLIENT span을 만들고 같은 context의 W3C header만 주입한다. 자동 HTTP
instrumentation이 URL·query나 예외 원문을 수집하지 않게 한다. 후보별 이유 생성 executor는
호출 시점의 OpenTelemetry context를 복원해 Elice CLIENT span이 Worker trace에서 분리되지
않게 한다.

resource에는 service, environment, release SHA와 role을 넣고 개별 ID는 metric label에 넣지
않는다. JSON console log는 ECS 형식과 Basic/Bearer·Grafana·DB·Redis·Provider 환경값의
최종 redaction을 적용하고, OTLP log appender는 폐쇄형 event code를 쓰는 전용 safe logger만
수집한다. readiness, Outbox·Stream backlog와 stuck Job, Worker·relay 결과, LLM token,
비식별 client event도 유한한 label로 계측한다.

자연어, 검색어, 장소·주소·URL, Provider 요청·응답, 인증 Header, cookie와 share token은
metric·log·trace에서 금지한다. trace/log에는 안전한 event code와 필요한 correlation ID만,
metric에는 폐쇄형 stage·outcome·reason과 count·duration·token 수만 허용한다. 실제 정제 값은
로컬 Live Playground 화면에서만 확인한다.

로컬 dashboard는 사용자 여정, 검색 funnel, Provider, Outbox·Worker, runtime, SSE·보안,
프런트의 일곱 영역으로 고정한다. 15개 alert는 즉시 운영 신호 10개와 최소 20표본을 요구하는
품질·지연 신호 5개로 구분하며, dashboard query와 rule은 정적 검사와 `promtool` rule/unit
test를 통과해야 한다.

## 결과와 재검토

무료 데모 초기 trace는 100% 수집하되 환경 변수로 조정한다. Grafana 자격은 Render secret에만
두며 GitHub·Vercel에는 저장하지 않는다. 무료 quota가 반복 포화되거나 유료 SLA·다중 instance가
필요해지면 Alloy/collector와 sampling·retention을 재검토한다.

애플리케이션의 direct exporter는 별도 collector queue나 디스크 buffer가 없다. exporter 장애가
사용자 요청을 실패시키지 않는 대신, 네트워크 단절·프로세스 종료·무료 quota 포화 때 telemetry가
유실될 수 있다. 따라서 이 결정은 포트폴리오 데모의 fail-open 관측 경계이며 감사 로그나
무손실 전송 보장이 아니다. 코드·Mock·`promtool` 검증과 실제 Grafana Cloud 수집은 별도 증거로
구분하고, 실제 metric·trace·log가 배포 revision에서 확인되기 전에는 운영 관측을 검증 완료로
표시하지 않는다.
