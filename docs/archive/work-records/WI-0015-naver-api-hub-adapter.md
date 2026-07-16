---
id: WI-0015
title: PP-013 Naver API Hub 장소·블로그 검색 어댑터
type: work-record
status: done
date: 2026-07-14
owners:
  - placepick-team
related:
  - ../roadmap.md
  - ../adr/ADR-0009-mock-local-live-gateway-boundary.md
  - ../runbooks/RUN-0001-naver-local-live-and-credential-rotation.md
  - ../troubleshooting/TS-0012-provider-response-metadata-compatibility.md
paths:
  - backend/src/main/java/com/placepick/recommendation/application/port/out/**
  - backend/src/main/java/com/placepick/infrastructure/external/naver/**
  - backend/src/main/java/com/placepick/infrastructure/external/http/**
  - backend/src/test/java/com/placepick/infrastructure/external/naver/**
  - backend/src/integrationTest/java/com/placepick/infrastructure/external/naver/**
  - backend/src/liveContractTest/java/com/placepick/infrastructure/external/naver/**
  - backend/src/naverLiveContractTest/**
  - backend/build.gradle
  - backend/gradle.lockfile
  - mock-api/naver/**
  - .env.live.local.example
  - scripts/naver-live-contract*.sh
  - scripts/check.sh
  - Makefile
  - docs/contracts.md
---

# WI-0015 PP-013 Naver API Hub 장소·블로그 검색 어댑터

> GitHub Issue: [PP-013 #15](https://github.com/gdh0730/hub/issues/15)

## 문제와 근거

기존 저장소에는 mock endpoint가 loopback인지 확인하는 안전장치와 구형 Naver
Developer Center 경로의 단순 WireMock fixture만 있었다. 추천 application이 사용할
typed 검색 port, 현행 NAVER API HUB Local·Blog 경로, 인증 header, HTML 정규화와
provider 오류 계약은 없었다. Mock만 통과해도 발급한 Application과 현재 API가 실제로
호환되는지는 알 수 없다.

반대로 일반 테스트에 실제 key를 넣으면 실패 fixture를 안정적으로 재현할 수 없고
외부 장애·quota·데이터가 merge 결과를 바꾼다. Java adapter의 결정적 자동 검증과
실제 인증 canary를 별도 증거로 구현해야 한다.

## 목적과 성공 기준

추천 application이 공급자 DTO를 알지 않고 장소와 블로그 근거를 검색하는 outbound
port와 NAVER API HUB adapter를 만든다.

- `PlaceSearchPort`와 `BlogSearchPort`는 provider-neutral 입력·결과를 사용하고 Naver
  request·response DTO와 인증은 infrastructure adapter 안에 둔다.
- base URL은 `https://naverapihub.apigw.ntruss.com`, 경로는 `/search/v1/local`과
  `/search/v1/blog`, 인증 header는 `X-NCP-APIGW-API-KEY-ID`와
  `X-NCP-APIGW-API-KEY`로 고정한다.
- HTML 강조 태그를 adapter 경계에서 제거하고 원문 body는 변환 후 폐기한다.
- 400, 401·403, 429, schema 오류, 5xx·timeout을 안정적인 application 오류로
  정규화하고 adapter 자체는 자동 재시도하지 않는다.
- WireMock으로 정상·0건·HTML·오류·timeout·malformed JSON과 구 endpoint 거부를
  자동 검증한다.
- Local Live task는 고정된 비개인성 입력과 `display=1`로 Local·Blog를 각각 한 번만
  호출하고 safe summary만 출력한다.

## 범위, 비범위와 제약

범위는 장소·Blog port, Spring `RestClient` adapter, 고정 origin·credential 검증, DTO·mapper,
오류 분류, redacted logging, 현행 WireMock fixture와 격리된 Local Live 계약 task다.
일반 Spring runtime에는 원본 Naver key를 읽는 자동 구성이나 bean을 등록하지 않는다.

후보 중복 제거·근거 결합은 PP-014, 점수·Top 3는 PP-015, 재시도·quota 보호는
PP-028이 담당한다. 실제 배포 Gateway와 Elice adapter는 포함하지 않는다. Naver
원문 response, 검색어와 credential을 DB·log·JUnit report·artifact에 저장하지 않는다.

Naver 약관과 표시 의무를 사람이 확인하기 전에는 Local·Blog 결과 결합, room 수명까지
저장, 자체 점수화 결과에 포함하거나 Elice 등 제3자 LLM에 전달하는 기능을 활성화하지
않는다.
이번 Local Live는 메모리에서 폐기하는 인증·schema 확인으로 제한한다.

## 판단 기준과 대안

기준은 최신 공식 계약, domain 독립성, 결정적 실패 재현, 비밀 차단, 실제 drift 탐지와
호출 최소화다.

- 외부 DTO를 application에 직접 노출하면 schema 변경이 핵심 규칙에 전파되어
  provider-neutral typed port를 선택했다.
- 범용 map은 변화에 느슨하지만 compile-time 검증과 오류 위치를 잃어 전용 DTO와
  mapper를 선택했다.
- HTTP client와 Worker 양쪽 재시도는 호출 수를 증폭하므로 adapter는 재시도하지 않고
  향후 Worker 정책 한 곳에서만 처리한다.
- 실제 API만 테스트하면 경계 실패를 재현하기 어려워 WireMock 계약을 자동 gate로,
  Local Live 두 호출을 별도 호환성 증거로 사용한다.

## 문제 해결 기록

1. 공식 API HUB 문서에서 base URL, Local·Blog 경로, 인증 header와 요청 제한을 다시
   확인한다.
2. application port와 adapter DTO·mapper를 분리하고 query·credential·원문 body가
   로그에 들어가지 않는 관측 경계를 먼저 설계한다.
3. 현행 경로의 정상·경계·오류 fixture와 이전 `/v1/search/*.json` 경로 음성 테스트를
   작성한다.
4. `local`, `test`, `load`, CI에서 live mode와 실제 host·key가 HTTP client 생성 전에
   거부되는지 확인한다.
5. 자동 검증 통과 뒤 사람이 교체된 credential, diff와 SHA를 확인하고 RUN-0001로
   Local Live를 수행했다.
6. 2026-07-14 두 endpoint가 모두 `INVALID_RESPONSE`로 실패해 application에서
   재호출하지 않고,
   응답 원문 없이 adapter schema·parser 차이의 진단을 후속으로 남겼다.
7. 공식 Local·Blog 계약이 item의 link·설명·주소·작성자 같은 상세 field를 필수로
   보장하지 않는데 기존 validator가 모두 존재해야 한다고 요구한 차이를 확인했다.
   선택 field는 빈 문자열로 정규화하고 제품이 사용할 최소 제목만 필수로 유지하는
   합성 회귀 테스트를 추가했다. 실제 재검증 전에는 이 차이를 실패의 확정 원인으로
   단정하지 않는다.
8. Elice 첫 Live에서 선행 capability의 전송 실패가 같은 connection manager를 쓰는 다음
   capability 증거를 오염시킬 수 있음을 확인했다. Naver 재검증도 Local과 Blog에 각각
   독립 adapter를 사용해 한 endpoint 실패가 다음 결과에 전파되지 않도록 보강했다.
9. 안전한 실패 stage를 추가한 SHA에서 실제 Local·Blog를 각각 한 번 호출해 두 응답이
   모두 2xx 이후 `MEDIA_TYPE` 단계에서만 거부됨을 확인했다. header 원문과 body는
   출력하지 않았고 같은 코드로 반복 호출하지 않았다.
10. 공식 계약이 JSON 응답 형식을 정의하지만 성공 `Content-Type`을 필수 조건으로
    명시하지 않는 점을 기준으로 `Accept: application/json`을 요청하고 header는 보조
    신호로 전환했다. 1MiB 제한, 중복 key·trailing token 거부, 엄격 JSON·envelope·item
    검증은 유지하고 비표준·누락 header의 합성 정상·malformed 응답을 회귀 테스트했다.
11. 검토·push된 SHA `128692bdcaa8ef4e5e00a06362c02f25da223a4b`에서 Local·Blog를
    각각 한 번 재검증해 모두 2xx·schema를 통과했다.

## 구현 결과와 검증 증거

Java adapter, Mock 자동 검증과 실제 인증 canary가 모두 성공 기준을 통과했다. 최초
실패를 지우지 않고, 진단 stage와 합성 회귀를 추가한 뒤 새 SHA에서만 재호출했다.

| 증거 | 현재 상태 | 완료 기준 |
| --- | --- | --- |
| Java·Mock 자동 검증 | 완료 | Naver 단위 5개·통합 28개, 비표준·누락 media type·malformed JSON·HTTP 오류·timeout·구 endpoint·호출 1회 회귀 통과 |
| Local Live canary | 통과 | 2026-07-14 Local item 1개·5615ms, Blog item 1개·1071ms, 모두 2xx·schema, 논리 호출 2회 |
| 배포 Gateway | 배포 안 됨 | PP-037 foundation 뒤 PP-033의 승인 SHA E2E |

최종 실행 시각은 2026-07-14T14:18:00.433Z이고 테스트 1개가 failures·errors 0으로
통과했다. Local·Blog application 호출은 각각 한 번이며 Apache HttpClient의 automatic
retry와 redirect는 비활성화됐다. provider console의 wire 사용량은 이 작업에서 독립
대조하지 않았으므로 논리 호출 2회와 transport 정책까지만 증거로 주장한다.

최종 문서·코드 트리의 `make check`는 279.6초, exit 0이었다. Java 17 단위 27개·통합
79개·Eval 5개, Edge 74개와 문서 음성 테스트 8개가 모두 failures·errors 0이었고 test
report 81개 안전 scan을 통과했다. 이 명령은 Live class를 compile만 하고 실제 provider를
호출하지 않았다.

응답 body는 HTTP 처리 과정의 메모리에서 역직렬화됐지만 console에 출력하거나 DB·파일·
JUnit artifact에 영구 보존하지 않았다. 장소명, 주소, link, query와 인증 header도
기록하지 않았다. 전용 report 10개도 비밀·원문 안전 scan을 통과했다. 반복 절차는
검증된 [RUN-0001](../runbooks/RUN-0001-naver-local-live-and-credential-rotation.md)을
따른다.

## AI 사용과 사람의 검증

AI에는 공식 계약에서 테스트 조합 추출, port·DTO·mapper·WireMock fixture와 redaction
음성 테스트 초안을 위임할 수 있다. 사람은 공식 Naver 문서의 현재성, 약관상
저장·표시·제3자 전달, credential 교체와 실제 호출을 직접 확인한다.

자동 fixture가 실제 응답과 같다고 가정하지 않고 Local Live가 통과해도 오류·timeout
회귀가 검증됐다고 간주하지 않는다. 두 증거를 모두 연결하되 서로 대신하지 않는다.

## 남은 위험과 학습

API HUB schema, quota와 오류 body는 변경될 수 있고 Local의 작은 결과 상한은 후속
후보 수에 영향을 줄 수 있다. 실제 2xx는 Naver 데이터의 결합·저장·LLM 전달을
허용한다는 뜻이 아니다. 공식 문서·약관 변경, schema drift나 401·403 증가가 감지되면
live를 중지하고 fixture와 계약을 함께 갱신한다.

현재 Naver Local·Blog 인증·전송·최소 schema 호환성은 확인됐다. 그러나 실제 2xx는
검색 결과 결합·저장·Elice 전달 약관 승인, 추천 품질, quota 보호, 제품 runtime이나
클라우드 배포 완료를 뜻하지 않는다. 이 후속 범위는 PP-014·PP-028·PP-029가 담당한다.
