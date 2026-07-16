---
id: TS-0010
title: Elice Local Live HTTP 응답 전 전송 실패
type: troubleshooting
status: verified
date: 2026-07-14
owners:
  - placepick-team
related:
  - ../work-records/WI-0040-elice-llm-proxy-live-contract.md
  - ../runbooks/RUN-0002-elice-llm-local-live-and-token-rotation.md
  - ../adr/ADR-0011-elice-chat-completions-provider-boundary.md
  - TS-0012-provider-response-metadata-compatibility.md
---

# TS-0010 Elice Local Live HTTP 응답 전 전송 실패

## 증상과 영향

감사한 구현 SHA `7f5657b012ea8cdc2260f1ebbf0d32a50b3f9054`에서 2026-07-14
13:12:14.619Z에 Elice Local Live를 한 번 실행했다. Chat과 Embedding application
호출은 각각 한 번이었지만 둘 다 HTTP 응답을 받기 전에 `PROVIDER_UNAVAILABLE`로
종료했다.

안전한 결과는 Chat `http=none`, `schema=false`, 4415ms와 Embedding `http=none`,
`schema=false`, 4ms였다. test report 10개는 비밀·proxy URL·본문·vector scan을
통과했다. 따라서 최초 실행 당시에는 token, strict output, `store=false`, usage와
1,536차원 계약이 검증되지 않았고 그 실행만으로 Elice Local Live를 성공으로 표시할 수
없었다.

## 조사 기록

인증 endpoint를 재호출하지 않고 host 수준 진단만 수행했다. Dev Container에서
`mlapi.run`은 IPv4 주소 두 개로 해석됐고 각 주소의 비인증 루트 HTTPS 요청, JDK 17
HttpClient, Apache HttpClient와 저장소의 no-retry `RestClient` transport는 모두 HTTP
401 응답을 받았다. 일반 DNS·TCP·TLS·host 접근 불능 가설은 이 관찰과 맞지 않는다.

첫 Live 구현은 Chat과 Embedding이 하나의 connection manager를 공유했다. Chat 실패
직후 Embedding이 4ms에 끝났으므로 두 번째 결과가 독립적인 endpoint 관찰인지 보장할 수
없었다. 반면 Mock의 400·401·403·429·5xx·timeout·malformed 계약과 redaction은 모두
통과했다. 현재 증거만으로 endpoint 상태, credential scope, 서버리스 기동 또는 특정
request field 중 하나를 근본 원인으로 단정하지 않는다.

[Elice 공식 API key 문서](https://help.elice.io/help/docs/elicecloud/ml-api/api-key)는 ML API
호출에 Bearer API key가 필요하고 잘못되거나 만료된 key는 인증 오류를 반환한다고
설명한다. 이번 실행은 HTTP 인증 오류 자체를 받지 못했으므로 key 유효성도 확인되지
않았다.

## 근본 원인과 해결

근본 원인은 아직 미확정이다. 우선 증거 오염을 막기 위해 Chat과 Embedding에 각각
독립된 `RestClient`와 connection manager를 배정했다. 공통 transport는 TLS 기본 구성이
검증된 Apache pooling manager를 최대 연결 한 개로 제한하고 automatic retry와 redirect를
명시적으로 비활성화한다. Naver Local·Blog Live도 한 endpoint의 전송 실패가 다음
capability에 전파되지 않도록 adapter를 분리했다.

이 변경은 실패 격리와 다음 진단의 정확성을 높이지만 Elice endpoint가 복구됐다는 증거가
아니다. 실패 직후 실제 endpoint를 자동 재호출하지 않았으며 직접 OpenAI Responses나
자유 JSON으로 우회하지 않았다.

## 검증과 재발 방지

당시 분리된 transport에서 Elice 60개와 Naver 24개 자동 테스트, 두 Live source set
compile을 통과시켰다. 비인증 루트 진단에서 저장소 transport가 401을 받는지 확인하되
이 결과를 모델 endpoint 성공으로 간주하지 않았다. 최종 metadata 회귀까지 포함한
수치는 Elice 65개와 Naver 33개다.

당시 다음 실제 재검증은 전체 diff와 새 SHA를 사람이 승인한 뒤 Chat·Embedding
application 호출 각 한 번만 수행하도록 계획했다. 다시 `http=none`이면 반복 호출하지
않고 Elice 관리 화면의 endpoint 상태·key 종류와 사용량을 사람이 확인한 뒤 지원 채널에
비밀 없는 시각·오류 category만 전달하도록 했다.

2026-07-14 분리된 transport의 후속 실제 호출은 Chat·Embedding 모두 HTTP 2xx까지
도달했다. 따라서 capability 간 전송 실패 전파는 재현되지 않았고 no-retry·no-redirect
transport의 정상 경로를 확인했다. 이어서 발견된 model metadata 호환 문제와 최종 계약
성공은 [TS-0012](TS-0012-provider-response-metadata-compatibility.md)에 분리했다. 최초
`http=none`의 외부 일시 원인은 원문을 보존하지 않아 단정하지 않지만, 재발 시 안전하게
격리·분류하는 절차와 수정된 transport는 실제 호출로 검증됐다.
