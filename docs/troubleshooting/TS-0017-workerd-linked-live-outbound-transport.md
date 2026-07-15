---
id: TS-0017
title: workerd Linked Live outbound 전송 실패
type: troubleshooting
status: draft
date: 2026-07-15
owners:
  - placepick-team
related:
  - ../work-records/WI-0042-naver-elice-linked-live-workflow.md
  - ../runbooks/RUN-0004-recommendation-workflow-linked-live.md
  - TS-0016-linked-live-provider-error-flattening.md
---

# TS-0017 workerd Linked Live outbound 전송 실패

## 증상과 영향

전용 검증 branch의 실제 Linked Live가 조건 추출 첫 단계에서 반복 중단됐다. 안전 오류
분류를 보강한 뒤 관찰된 code는 `LINKED_PROVIDER_UNAVAILABLE`였다. 이는 Elice upstream이
반환한 5xx가 아니라 로컬 Loopback Gateway의 workerd `fetch`가 응답을 완료하지 못한
경로다. 사용자 확인, Naver Local·Blog, 순위·Top 3와 이유 생성에는 도달하지 않았다.

같은 로컬 환경에서 Java 17 Elice Chat·Embedding 실제 계약은 직전에 성공했다. 따라서
API key·endpoint 전체 불능과 workerd outbound 전송 실패를 같은 원인으로 취급하지 않는다.
Provider 원문, URL routing ID와 credential은 진단에 출력하지 않았다.

## 조사와 원인 범위

1. 최초 오류는 Java에서 일반 `PROVIDER_UNAVAILABLE`로 평탄화돼 upstream 5xx와 전송
   실패를 구분하지 못했다.
2. Gateway의 allowlist safe code를 loopback Java 진단에 보존한 뒤 같은 경로가
   `LINKED_PROVIDER_UNAVAILABLE`임을 확인했다.
3. Gateway 구현은 `redirect=error`, 30초 timeout, 1MiB 상한과 재시도 0회를 사용한다.
   이 code는 fetch rejection·timeout·redirect를 하나의 transport 범주로 묶는다.
4. Java의 실제 개별 계약 성공은 endpoint와 자격이 적어도 Java HTTP stack에서 사용
   가능하다는 증거다. workerd의 정확한 DNS·TLS·network 내부 원인은 원문 예외를 저장하지
   않는 정책 때문에 더 세분화하지 않았다.

확정된 원인은 현재 Dev Container의 workerd 실행 경로가 이 Provider outbound 요청을
완료하지 못한다는 런타임 비호환이다. Elice 장애나 key 오류로 단정하지 않는다.

## 해결과 의도

Gateway의 상태·provenance·호출 예산 코드는 변경하지 않고 로컬 HTTP 실행 adapter만
Node 24로 교체한다.

- Node runner는 Git에 포함된 고정 entrypoint만 esbuild 0.28.1로 임시 bundle한다.
- `.env.live.local`을 읽지 않는다. launcher가 만든 권한 제한 임시 env file만 직접
  파싱하고 정확한 10개 변수 외 unknown·duplicate·empty·제어문자를 거부한다.
- raw Naver·Elice 자격은 Node Gateway process에만 전달하고 Java에는 기존 일회성 local
  자격만 전달한다.
- 127.0.0.1 임의 port만 listen하며 요청 body는 1MiB로 제한한다.
- retry·redirect 0회, Provider별 timeout, 호출 최대 9회와 report scan은 Worker 코드와
  launcher에서 그대로 유지한다.
- bundle, env file, process와 port는 invocation 종료 시 제거한다.

Cloudflare 배포용 Worker 코드를 Node용으로 복제하지 않고 같은 class를 bundle해 실행한다.
따라서 보안 규칙의 두 구현이 분기하는 위험을 줄이고, 로컬 transport runtime만 교체한다.

## 검증과 재발 방지

- Node runner syntax와 exact dependency pin을 검사한다.
- launcher 합성 guard에서 env 격리, pushed SHA, 반복 invocation, process lock과 cleanup을
  검증한다.
- Edge 155개 보안 테스트로 Gateway 상태·provenance·timeout·no-retry를 유지한다.
- 실제 Linked Live에서 조건 추출을 넘어 Naver Local·Blog와 Elice 이유 생성까지 같은
  Node Gateway를 통과해야 이 문서를 `verified`로 바꾼다.
- Gateway log나 JUnit에 자유 예외 message, Provider body, credential 또는 routing URL이
  나타나면 즉시 실패하고 RUN-0001·RUN-0002의 교체 절차를 따른다.

Node runner가 실패하거나 보안 경계가 달라지면 workerd로 자동 fallback하지 않는다.
실행을 중단하고 Mock에서 재현한 뒤 별도 검토한다.
