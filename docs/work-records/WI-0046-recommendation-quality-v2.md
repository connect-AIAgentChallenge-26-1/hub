---
id: WI-0046
title: PP-044 추천 품질 v2와 운영 진단 기반
type: work-record
status: in-progress
date: 2026-07-16
owners:
  - placepick-team
related:
  - https://github.com/gdh0730/hub/issues/59
  - ../contracts.md
  - ../architecture.md
  - ../adr/ADR-0015-retrieval-ranking-v2.md
  - ../adr/ADR-0016-grounded-reason-v3.md
  - ../adr/ADR-0017-production-otlp-observability.md
  - ../runbooks/RUN-0007-mvp-protection-observability.md
paths:
  - backend/src/main/java/com/placepick/recommendation/**
  - backend/src/main/java/com/placepick/infrastructure/observability/**
  - frontend/src/features/live-playground/**
  - observability/**
---

# WI-0046 PP-044 추천 품질 v2와 운영 진단 기반

## 문제와 근거

실제 Live Playground에서 같은 조건은 결정론적으로 같은 후보를 반환했지만, 일부 입력은
유효 후보가 세 개보다 적어 실패했고 Elice 이유 검증 실패는 전체 템플릿 대체로 끝났다.
Provider 호출 자체는 정상이었으므로 검색 회수·필터·근거 검증의 어느 경계가 원인인지
코드와 metric을 대조했다.

Naver Local은 공식 계약상 한 번에 최대 다섯 항목만 반환하지만 현재 Core는 한두 번만
검색한다. 후보는 link 누락, 위치·유형·제외 조건과 중복 단계에서 제거되지만 탈락 수가
결과에 남지 않는다. Elice client도 상세 boundary code를 계산한 뒤 coarse
`invalid_response`로 축약하고, 이유 service는 예상하지 못한 RuntimeException까지 fallback으로
바꿔 내부 결함과 안전한 저하를 구분하지 못한다.

## 목적과 성공 기준

첫 단계의 목적은 추천 동작을 성급하게 바꾸기 전에 후보 funnel과 LLM 실패 원인을 안전한
폐쇄형 코드로 보존하고 현재 v1 baseline을 재현하는 것이다.

- 후보 수신·탈락·중복·유효 수의 합이 항상 일치한다.
- 조건·이유 진단 코드는 Provider 원문 없이 port, metric과 Live Playground까지 전달된다.
- 예상 Provider·검증 실패만 fallback하고 내부 계약 위반은 실패 경로로 전파된다.
- 동시성 permit 거부가 Provider latency에 0초 표본으로 섞이지 않는다.
- 검색어·장소·주소·URL·prompt·응답·비밀은 일반 telemetry와 test report에 남지 않는다.

후속 단계에서는 승인된 ADR에 따라 다중 검색·부분 결과·다른 추천, 점수 v2, 후보별 이유
생성과 OTLP 운영 관측을 순차 구현한다.

## 판단 기준과 선택

문제를 해결하는 기준은 사용자 영향과 내부 원인을 분리하는가, metric label이 유한한가,
실제 값 없이도 같은 장애를 재현할 수 있는가, 이후 품질 변경의 전후 비교가 가능한가다.

자유 문자열 진단과 응답 body 로깅은 원인 설명은 쉬워도 비밀·개인정보와 cardinality 위험이
커 제외한다. 각 경계의 사유를 enum으로 제한하고 count·duration·token 수만 telemetry에
남긴다. Live Playground는 로컬 개발 화면이므로 실제 정제 값을 계속 보여 주되 일반 로그와
OTLP에는 전달하지 않는다.

## 구현·검증 기록

첫 PR은 기존 검색·랭킹·공개 API 동작을 바꾸지 않고 다음 진단 기반을 구현했다.

- 후보 정규화는 수신, 유효, 식별 불가, 위치, 유형, 제외 조건과 중복 수를 하나의 누적
  funnel로 보존한다. 완화 검색에서는 최종 snapshot만 metric에 한 번 기록해 최초 응답을
  중복 합산하지 않는다. 0개 후보도 Distribution Summary 표본으로 남는다.
- Elice 조건·이유 outcome은 coarse error와 함께 폐쇄형 diagnostic code와 failure stage를
  보존한다. 서버 이유 validator의 거부도 별도 code로 기록한다.
- 이유 service는 예상 Provider·검증 실패만 fallback한다. null outcome과 예상하지 못한
  RuntimeException은 내부 계약 실패로 전파한다.
- Provider permit 대기와 거부를 실제 호출 latency에서 분리했다. 거부 호출의 0초 표본은
  Provider latency와 timeout budget에 포함하지 않는다.
- Live Playground는 후보 탈락 수와 안전 진단 code를 표시하며 실제 응답 원문은 추가로
  노출하지 않는다.
- Grafana runtime dashboard와 RUN-0007은 후보 funnel, LLM 진단과 permit 지표를 사용하도록
  갱신했다. Prometheus scrape 이름을 단위 테스트에서 dashboard 계약과 직접 대조한다.

Java 17·Node 24 Dev Container의 `make check`에서 문서 정책과 여섯 음성 fixture, Java
단위 178개·Testcontainers 통합 159개·Eval 7개, 프런트 typecheck·35개 Vitest·production
build, Compose, ShellCheck, actionlint와 233개 생성 test report의 비밀 검사가 통과했다.
이 검증은 Mock만
사용했으며 `.env.live.local`과 실제 Naver·Elice를 읽거나 호출하지 않았다. 실제 Provider의
품질 전후 비교는 검색·이유 v2 구현 이후 별도 `live-quality-eval` 증거로 남긴다.

## AI 사용과 사람의 검증

AI에는 코드 경로 감사, 진단 taxonomy와 테스트 초안을 위임한다. 사람은 진단 코드의 공개
경계, fallback 의미, metric cardinality, 실제 값·비밀 비노출과 GitHub 증거를 검증한다.

## 남은 위험과 재검토 조건

진단 기반만으로 후보 수와 이유 생성 성공률은 높아지지 않는다. v1 baseline과 실제 원인이
보존된 뒤 ADR-0015~0017의 행동 변경을 적용한다. Provider 계약, 데이터 이용 조건 또는 무료
관측 한도가 바뀌면 호출 예산·telemetry 수집 범위를 다시 검토한다.
