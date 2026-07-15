---
id: TS-0016
title: Linked Live Provider 오류 분류 평탄화
type: troubleshooting
status: draft
date: 2026-07-15
owners:
  - placepick-team
related:
  - ../work-records/WI-0042-naver-elice-linked-live-workflow.md
  - ../runbooks/RUN-0004-recommendation-workflow-linked-live.md
  - ../adr/ADR-0013-naver-elice-linked-live-boundary.md
  - TS-0010-elice-live-no-http-response.md
  - TS-0012-provider-response-metadata-compatibility.md
---

# TS-0016 Linked Live Provider 오류 분류 평탄화

## 증상과 영향

2026-07-15 21:10 KST, 병합 `main` SHA
`541a98b3b73bfdaa3a1c7396aaea32ce410a7237`의 첫 Linked Live가
`conditionExtraction / PROVIDER_UNAVAILABLE`로 종료됐다. JUnit은
`1 test / 1 failure`, 2.949초였고 생성 report 10개 안전 scan은 통과했다. 같은 SHA에서
재실행하지 않았다.

조건 추출 application 논리 요청은 한 번이고 코드상 automatic retry는 0회지만 실제 Elice
upstream wire 요청 수는 dashboard·network telemetry 없이 확정할 수 없다. 사용자 확인,
Naver Local·Blog, 점수·Top 3, Elice 이유 생성과 `/complete`에는 도달하지 않았다. 따라서
이 결과는 Elice 서버 장애, 자격 오류 또는 제품형 schema 비호환 중 어느 하나를 확정하지
못하며 실제 Linked 성공도 아니다.

## 조사 기록

1. Linked Gateway는 Elice upstream 5xx를 `PROVIDER_UNAVAILABLE`, fetch 전송 예외를
   `LINKED_PROVIDER_UNAVAILABLE`, 응답 schema 오류를 `INVALID_RESPONSE`, 1MiB 초과를
   `PROVIDER_RESPONSE_TOO_LARGE`로 구분한다.
2. Java `EliceConditionExtractionClient`는 Loopback Gateway의 안전한 Problem Details
   `errorCode`를 읽지 않고 HTTP status와 transport 예외만 사용한다. HTTP 500 이상과
   Java transport 예외는 모두 제품 오류 `PROVIDER_UNAVAILABLE`로 바뀐다.
3. 그 결과 upstream 5xx, DNS·TCP·TLS·redirect 오류, 2xx 뒤 schema·exact 의미 검증 실패,
   oversized 응답과 Gateway 내부 5xx가 JUnit에서 같은 결과로 보일 수 있다.
4. Gateway log는 알려진 비밀·routing·요청·응답 marker를 검사한 뒤 임시 디렉터리와 함께
   제거한다. 실패 summary에는 upstream 도달 여부, Gateway safe code와 provider call
   count가 없어 현재 artifact만으로 더 세분화할 수 없다.
5. 과거 Elice 개별 Local Live의 Java transport 성공은 Worker `fetch` 경로와 복합 제품형
   조건 schema가 성공했다는 증거가 아니다. 반대로 2.949초 실행 시간만으로 2xx 뒤 검증
   실패나 빠른 5xx·전송 예외 중 하나를 선택할 수도 없다.
6. 정상적으로 전달된 401·403은 인증 오류, 429는 rate limit으로 분리돼야 하므로 이번
   결과를 key 오류나 quota 문제로 추정할 근거도 없다.

## 근본 원인과 해결

실제 Provider 실패의 근본 원인은 미확정이다. 확정된 문제는 Gateway가 만든 안전한 오류
taxonomy가 Java 경계에서 HTTP 5xx 하나로 평탄화되어, 원문을 노출하지 않고도 구분할 수
있던 진단 정보가 사라진다는 점이다.

후속 수정은 원본 응답 body나 message를 보존하지 않고 다음 allowlist 정보만 Java와
launcher까지 전달해야 한다.

- `upstreamReached`
- `providerCallCount`
- `http=none|2xx|4xx|5xx`
- Gateway의 고정 `errorCode`
- `schemaValid`
- `durationMs`

조건 응답의 strict 구조 검증과 합성 입력 의미 검증도 구분한다. Gateway는 bounded body,
허용 field와 schema를 검증하고 Java workflow probe가 위치·유형·인원·예산·선호·제외의
의미를 검증한다. 구조는 유효하지만 의미가 다르면 `SEMANTIC_MISMATCH`이며 Provider
unavailable로 기록하지 않는다.

loopback Gateway는 이제 allowlist된 safe error code를 전용 response header에도 싣고,
loopback test factory로 생성된 Java client만 해당 code를 허용 목록으로 매핑한다.
`INVALID_RESPONSE`와 `PROVIDER_RESPONSE_TOO_LARGE`는 더 이상 일반 502 가용성 오류로
평탄화되지 않는다. 직접 Provider runtime client는 이 header를 신뢰하지 않는다.

Gateway 조건 응답 검증은 JSON Schema 인스턴스의 exact field·type·enum·길이·범위·배열
상한으로 제한하고, fixture 의미 동치는 Java Live harness의 NFKC+유한 allowlist가
검사한다. 따라서 구조가 유효한 동치 표현은 Java까지 전달되고 잘못된 의미는
`SEMANTIC_MISMATCH`가 된다. 실제 Linked 성공과 후속 단계 전체 오류 요약은 별도 검증
대상이므로 이 문서는 아직 `draft`다.

## 검증과 재발 방지

실제 Provider 호출 없이 Java→Loopback Gateway 전체 경로에 다음 회귀를 추가한다.

- upstream 5xx와 fetch transport exception
- 2xx malformed JSON과 strict schema 위반
- strict schema는 유효하지만 의미가 다른 합성 표현
- oversized response
- 400·401·403·429
- 실패 summary의 인증, 호출 예산과 raw body·message 비노출

실제 자격을 붙인 임의 `curl`이나 한 invocation 내부 HTTP retry로 진단하지 않는다.
저장소 소유자가 승인한 pushed 검증 SHA에서는 새 Gateway와 독립 호출 예산으로 수동
invocation을 반복할 수 있다. Elice
관리 화면의 같은 시각 사용량을 사람이 대조할 수 있으면 upstream 도달 가설의 보조 증거로
기록하되 token, request, response 또는 Provider 내부 식별자는 저장소에 남기지 않는다.
