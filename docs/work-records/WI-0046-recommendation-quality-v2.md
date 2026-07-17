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

전체 목적은 후보 부족을 실패로 숨기지 않으면서 검색 범위와 근거 품질을 높이고, 그 변화가
어느 단계에서 효과를 냈는지 안전하게 관측하는 것이다. 첫 단계에서는 추천 동작을 바꾸기
전에 후보 funnel과 LLM 실패 원인을 폐쇄형 코드로 보존하고 v1 baseline을 재현했다.

- 후보 수신·탈락·중복·유효 수의 합이 항상 일치한다.
- 조건·이유 진단 코드는 Provider 원문 없이 port, metric과 Live Playground까지 전달된다.
- 예상 Provider·검증 실패만 fallback하고 내부 계약 위반은 실패 경로로 전파된다.
- 동시성 permit 거부가 Provider latency에 0초 표본으로 섞이지 않는다.
- 검색어·장소·주소·URL·prompt·응답·비밀은 일반 telemetry와 test report에 남지 않는다.

두 번째 단계에서는 다중 검색·부분 결과·다른 추천과 점수 v2를 구현한다. 후보별 이유 생성과
OTLP 운영 관측은 각각 다음 독립 변경으로 남겨 회귀 원인과 검증 증거를 분리한다.

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

두 번째 PR은 첫 PR의 funnel을 근거로 검색 회수와 결과 계약을 변경한다.

- Local 정확도·인기, 독립 선호, 유형 동의어와 위치 alias를 안정적인 variant ID와
  Provider rank로 보존한다. 기본 6회·다른 추천 8회와 목표 pool 10개는 설정 가능한 보호
  값이고 query+sort 중복은 실행하지 않는다.
- 일반 문자열에서 행정구역 접미사를 제거하지 않고 exact·alias·등록 생활권을 구분한다.
  `여의도`가 `여의`로 변하는 결함을 음성 테스트로 고정한다.
- source link를 identity 필수값에서 표시용 nullable 값으로 바꾸고 이름·주소·좌표로 지점을
  구분한다. 같은 홈페이지를 쓰는 서로 다른 지점은 합치지 않는다.
- Blog는 예비 후보 8개, `display=10`, 후보별 장애 격리와 entity confidence·출처 다양성·
  최신성 기준을 적용한다.
- 점수는 위치 신뢰도 15, weighted RRF 30, 선호 근거 30, 근거 품질 25의 0~100으로
  재정의한다. 같은 fixture의 기본 순위는 계속 결정적이다.
- 1~2개 후보는 `partial=true`로 완료하고 투표방까지 사용할 수 있다. 0개만 실패한다.
  완료 Job의 다른 추천 요청은 기존 candidate fingerprint와 variant 이력을 제외한다.

비동기 202와 즉시 409의 충돌도 구현 전에 명시적으로 해결했다. 검색은 Worker에서만
실행하므로 저장된 variant 소진을 요청 전에 확정한 경우만 POST가 409를 반환한다. 202 뒤
실제 미노출 후보가 0개면 새 Job이 `FAILED/NO_ALTERNATIVE_CANDIDATES`로 종료된다. 외부
호출을 HTTP 요청이나 DB transaction으로 옮기는 대안은 기존 불변식을 깨뜨려 제외했다.

최종 정적 검토와 회귀 과정에서 다음 경계도 함께 보강했다.

- Blog는 후보명만 같아서는 연결하지 않고 요청 위치 또는 후보 주소의 지점 신호까지 있어야
  한다. 다른 지역의 같은 상호가 근거로 들어오는 음성 fixture를 추가했다.
- 한 글자 선호인 `뷰`가 `리뷰`의 부분 문자열로 일치하지 않게 조사 경계를 검사한다.
- Blog pool 설정과 실행 불변식의 상한을 모두 8로 맞춰 quota를 사용한 뒤 내부 예외가 나는
  설정을 차단한다.
- V3 이전 후보에서 원래 CandidateKey를 복원할 수 없으면 같은 장소 재노출보다 보수적인
  탐색 소진을 선택한다. 새 lineage는 DB trigger로 root와 round 연속성도 검증한다.
- 대체 Job은 원 Job의 공개 만료 시각을 연장하지 않는다. 살아 있는 room과 idempotency
  응답 기간은 retention에서 lineage 전체를 별도로 보존한다.
- 실행 중 Redis consumer group이 사라지면 group cache를 무효화하고 `0-0`에서 복구한다.
  재전달은 기존 processed event ID 멱등성으로 무해하게 처리한다.
- 프런트는 즉시 409뿐 아니라 202 뒤 후보 0건으로 실패한 경우에도 원 추천으로 돌아간다.
  Mock API도 동일 Idempotency-Key replay를 같은 Job으로 반환한다.
- Local 실패 호출도 `outcome=failure`로 집계하고, 기존 노출 후보 제외 수와 최종 저장·SSE
  완료 snapshot의 부분 결과·점수를 구분해 기록한다.

Java 17·Node 24 Dev Container의 최종 `make check`에서 문서·Compose·ShellCheck·actionlint,
Java 단위 197개·Testcontainers 통합 170개·Eval 7개, 프런트 Vitest 42개와 production build,
205개 생성 report의 비밀 검사가 통과했다. 별도 Playwright는 desktop/mobile 각각에서
Live Playground와 정식 제품 흐름 4개를 통과했다. 제품 흐름은 빠른 중복 클릭을 한 요청으로
제한하고, 대체 결과 2개와 1개, 템플릿 이유, 비동기 후보 소진 뒤 원 결과 복귀, 저장된 소진
409, 두 세션 투표·확정을 검증했다. 이 자동 검증은 Mock만 사용해 실제 Naver·Elice 호출은
0건이었다.

## AI 사용과 사람의 검증

AI에는 코드 경로 감사, 진단 taxonomy와 테스트 초안을 위임한다. 사람은 진단 코드의 공개
경계, fallback 의미, metric cardinality, 실제 값·비밀 비노출과 GitHub 증거를 검증한다.

## 남은 위험과 재검토 조건

검색·랭킹 v2와 부분·대체 추천의 자동 계약은 완료됐지만 PP-044 전체가 끝난 것은 아니다.
후보별 이유 v3의 독립 retry/fallback, Embedding shadow 평가, production OTLP와 Grafana Cloud,
실제 비개인성 시나리오 품질 campaign은 후속 변경으로 남는다. 실제 campaign 전에는 이번
변경이 실제 후보 성공률·이유 생성률 목표를 달성했다고 주장하지 않는다. Provider 계약,
데이터 이용 조건 또는 무료 관측 한도가 바뀌면 호출 예산·telemetry 수집 범위를 재검토한다.
