---
id: TS-0018
title: Elice Structured Output 미지원 배열 keyword
type: troubleshooting
status: verified
date: 2026-07-15
owners:
  - placepick-team
related:
  - ../work-records/WI-0042-naver-elice-linked-live-workflow.md
  - ../adr/ADR-0013-naver-elice-linked-live-boundary.md
  - ../runbooks/RUN-0004-recommendation-workflow-linked-live.md
  - ../experiments/EXP-0001-linked-live-representative-scenario-repeatability.md
  - TS-0012-provider-response-metadata-compatibility.md
---

# TS-0018 Elice Structured Output 미지원 배열 keyword

## 증상과 영향

실제 Linked Live가 Elice 조건 추출, Naver Local·Blog, 정규화·점수·Top 3까지 진행한 뒤
이유 생성 단계에서 HTTP 400 `INVALID_REQUEST`로 중단됐다. `degraded=false`나 서버
template fallback으로 성공을 가장하지 않고 전체 Linked 검증을 실패 처리했다.

같은 자격과 Chat 경로의 조건 추출은 성공했기 때문에 인증이나 Elice Chat 전체 불능으로
분류하지 않았다. Provider 요청·응답 본문, endpoint routing ID와 자격은 로그나 문서에
남기지 않았다.

## 조사 기록

1. 조건 추출과 이유 생성 요청의 공통 transport, 인증, 모델 설정을 비교했다.
2. 이유 schema에만 evidence ID 배열의 `uniqueItems: true`가 있었고, 동시에
   `minItems: 1`, `maxItems: 1`로 정확히 한 원소를 강제하고 있었다.
3. OpenAI Structured Outputs는 JSON Schema 전체가 아닌 지원된 subset만 허용하고,
   지원하지 않는 keyword를 strict schema에 넣으면 요청 오류가 날 수 있다. 지원 배열
   제약 목록에 `uniqueItems`는 포함되지 않는다.
4. 원소가 정확히 하나인 배열은 구조상 중복될 수 없으므로 `uniqueItems`를 제거해도
   제품의 단일 evidence 인용 불변식은 약해지지 않는다.
5. 다른 schema keyword와 인증 설정은 동시에 바꾸지 않아 원인과 수정의 대응 관계를
   유지했다.

참고 기준은 [OpenAI Structured Outputs 가이드](https://developers.openai.com/api/docs/guides/structured-outputs)다.
Elice가 OpenAI-compatible Chat Completions를 제공하더라도 실제 지원 범위는 이 저장소의
Mock 계약과 Local Live에서 별도로 검증한다.

## 근본 원인과 해결

근본 원인은 이유 생성 strict schema가 Provider의 지원 subset 밖인 `uniqueItems`를
전송한 것이다. Elice는 schema를 수락하지 않고 HTTP 400을 반환했으므로 이유 생성까지
이어지지 않았다.

Java 이유 생성 client, Linked Loopback Gateway의 exact schema 검증과 Split Gateway
fixture에서 `uniqueItems`를 제거했다. 다음 제약은 유지했다.

- `evidenceIds`의 `minItems=1`, `maxItems=1`
- 허용된 evidence ID만 선택하는 enum
- 장소별 문장 수와 exact field·`additionalProperties=false`
- Java와 Gateway의 text↔evidence type 사후 검증
- 한 후보라도 위반하면 batch 전체 fail-close 또는 template fallback

따라서 수정은 strict 계약을 자유 JSON이나 일반 text로 완화한 것이 아니라, 중복된
미지원 keyword만 제거한 것이다. 문제가 재발하면 `uniqueItems`를 되돌리거나 Responses
API로 자동 fallback하지 않고 schema diff와 Provider 지원 범위를 다시 확인한다.

## 검증과 재발 방지

- 통합·보안 테스트가 전송 schema에 `uniqueItems`가 없고 단일 evidence 배열 제약은
  유지됨을 검증한다.
- Linked Gateway 테스트가 Java와 Gateway의 reason schema exact 일치를 확인한다.
- 수정 뒤 실제 full Linked Live가 조건 추출부터 이유 생성·서버 사후 검증까지 성공했다.
- 최종 동일 SHA `e789af65e94441aa38a018a2931c3705f7125112`에서 세 대표 시나리오가
  각각 strict 성공했고 `reasonFallback=false`였다. 자세한 사용자 흐름과 한계는
  EXP-0001에 기록한다.
- 실제 호출의 retry는 0회였고 매 invocation 뒤 `cleanup=true`를 확인했다.

세 번의 성공은 원인 수정과 회귀 통과의 증거지만 Provider 가용성이나 SLA의 통계적
증거가 아니다. 모델 또는 Provider schema 지원 범위가 바뀌면 새 keyword를 추정해
추가하지 않고 공식 지원 목록, Mock 음성 테스트와 제한된 Live 검증을 다시 수행한다.
