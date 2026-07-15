---
id: TS-0012
title: 실제 Provider 응답 메타데이터 호환성
type: troubleshooting
status: verified
date: 2026-07-14
owners:
  - placepick-team
related:
  - ../work-records/WI-0015-naver-api-hub-adapter.md
  - ../work-records/WI-0040-elice-llm-proxy-live-contract.md
  - ../runbooks/RUN-0001-naver-local-live-and-credential-rotation.md
  - ../runbooks/RUN-0002-elice-llm-local-live-and-token-rotation.md
  - ../adr/ADR-0009-mock-local-live-gateway-boundary.md
  - ../adr/ADR-0011-elice-chat-completions-provider-boundary.md
---

# TS-0012 실제 Provider 응답 메타데이터 호환성

## 증상과 영향

Naver 실제 계약 진단에서 Local과 Blog는 모두 응답을 반환했지만
`INVALID_RESPONSE/MEDIA_TYPE`으로 판정됐다. 자격증명 오류나 provider 장애가 아니라,
응답 본문을 해석하기 전에 HTTP `Content-Type`을 필수 계약으로 검사한 단계에서 두
capability가 함께 차단된 것이다.

Elice 실제 계약 진단에서는 Chat과 Embedding이 모두 2xx를 반환했지만 각각
`CHAT_MODEL`, `EMBEDDING_MODEL` 단계에서 실패했다. 요청에 사용한 provider-qualified
식별자와 응답의 공식 alias 또는 snapshot 식별자를 문자열 완전 일치로 비교해, 정상
응답의 strict content·usage와 embedding vector 검증까지 진행하지 못했다.

두 사례 모두 Mock이 구현자가 예상한 메타데이터만 반환하면 실제 provider와의 차이가
드러나지 않는다는 공통 위험을 확인했다. 반대로 메타데이터 검사를 전부 제거하면 HTML,
임의 모델 또는 계약 외 응답을 정상으로 오인할 수 있으므로 검증을 단순히 완화하는 방식은
허용하지 않았다.

## 조사 기록

Naver는 진단 SHA `17fa1d71d2e081c5373d623af9371becd1883a11`에서 실제 Local과
Blog를 각각 한 번만 호출했다. 최초 관찰은 두 요청 모두
`INVALID_RESPONSE/MEDIA_TYPE`이었다. 응답 본문이나 검색 결과를 출력하지 않고 실패
단계만 보존했기 때문에 인증·전송·HTTP 상태와 본문 해석 실패를 구분할 수 있었다.

공식 계약이 JSON 응답 형식과 필드 구조를 정의한다는 점을 기준으로 `Accept`에 JSON을
명시하고, `Content-Type`은 본문을 읽기 전 차단 조건이 아니라 보조 신호로 재분류했다.
대신 1MiB 응답 상한, 중복 key와 후행 token을 거부하는 엄격 JSON parsing, 필수 envelope와
item schema 검증은 그대로 유지했다. 수정 후 승인된 일회성 재검증에서 Local은 2xx,
`schema=true`, `itemCount=1`, 5615ms였고 Blog는 2xx, `schema=true`, `itemCount=1`,
1071ms였다. 이 성공 실행 SHA는 `128692bdcaa8ef4e5e00a06362c02f25da223a4b`다.

Elice는 진단 SHA `128692bdcaa8ef4e5e00a06362c02f25da223a4b`에서 Chat과
Embedding을 각각 한 번 호출했다. 두 요청 모두 2xx였으므로 transport·인증·HTTP 상태
가설을 제외했고, 안전한 실패 단계가 응답 모델 식별자 비교임을 확인했다. 실제 응답의
식별자 값은 로그와 문서에 남기지 않았다.

임의 문자열이나 접두사 일치를 허용하지 않고, 요청 모델별로 공식 alias와 승인된
snapshot만 포함하는 닫힌 allowlist를 적용했다. 이후 승인된 일회성 재검증에서 Chat은
strict schema와 usage를 통과해 input 69 token, output 5 token, 3207ms였고 Embedding은
item 한 개, 1,536개의 유한한 수치, input 8 token, 1067ms를 확인했다. 이 성공 실행 SHA는
`e6190662c2382304f21c39bdb29375d1b1324733`다. 생성 본문과 vector는 출력하거나 저장하지
않았다.

## 근본 원인과 해결

근본 원인은 provider-neutral 제품 계약과 전송 메타데이터를 같은 강도로 비교한 것이다.
Naver adapter는 실제 제품 계약인 JSON 구조보다 서버의 `Content-Type` 표기를 먼저
신뢰했고, Elice client는 요청 alias와 의미상 같은 승인 모델 식별자를 byte-for-byte로
동일해야 한다고 가정했다.

Naver 해결책은 JSON 응답 선호를 요청에 명시하되 응답 media type만으로 정상 본문을
거부하지 않는 것이다. 보안 경계는 media type 대신 bounded body와 엄격 JSON·schema
검증으로 유지한다. 따라서 비 JSON, malformed JSON, oversized body 또는 필수 필드가
없는 응답은 여전히 실패한다.

Elice 해결책은 capability별 닫힌 모델 allowlist다. 공개된 공식 alias와 사람이 검토해
승인한 snapshot만 통과하며, 관찰된 문자열을 자동 등록하거나 느슨한 부분 문자열 비교를
사용하지 않는다. strict Chat content, 종료 상태, usage, Embedding item 수·차원·유한성
검사는 약화하지 않았다. 두 client 모두 재시도는 0회이며 오류가 발생해도 다른 endpoint나
Responses API로 자동 fallback하지 않는다.

## 검증과 재발 방지

WireMock 회귀 테스트는 Naver의 비표준 또는 누락된 media type에서도 유효한 JSON과
schema만 통과시키고 malformed body는 거부한다. Elice 테스트는 승인된 alias·snapshot은
통과시키되 미승인 모델, 추가 Chat 필드, 불완전 종료, 잘못된 usage, 비유한 vector와 잘못된
차원을 거부한다. 요청별 단일 호출도 검증해 adapter 내부 재시도를 막는다.

일반 `make check`와 CI는 Mock만 사용하며 Live 환경 파일을 읽지 않는다. 실제 검증은
전체 diff와 SHA를 검토한 뒤 전용 명령으로 capability당 한 번만 실행한다. 실패 시 자동
재호출하지 않고 안전한 HTTP 상태와 정규화된 실패 단계만으로 원인을 좁힌다. 비밀값, 전체
provider URL, 응답 본문, 실제 응답 모델 식별자, 검색 결과와 vector는 콘솔·JUnit
보고서·문서에 남기지 않는다.

provider 문서나 지원 모델이 바뀌면 allowlist를 자동 확대하지 않는다. 공식 근거와 Mock
음성 테스트를 먼저 갱신하고, 새 SHA를 검토한 뒤 한 번의 Live 계약 검증으로 다시
확인한다. 이 검증은 Local Live capability의 가용성을 증명할 뿐 제품 runtime 연결이나
실제 사용자·Naver 데이터 전달 승인을 의미하지 않는다.
