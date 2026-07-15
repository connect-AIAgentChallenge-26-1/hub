---
id: WI-0044
title: PP-042 실제 값 Live Playground
type: work-record
status: done
date: 2026-07-16
owners:
  - placepick-team
related:
  - https://github.com/gdh0730/hub/issues/56
  - ../contracts.md
  - ../adr/ADR-0014-mvp-direct-provider-and-simplified-trust-boundary.md
  - ../runbooks/RUN-0005-direct-live-development.md
  - ../case-studies/CASE-0002-naver-elice-linked-live-user-flow.md
paths:
  - backend/src/main/java/com/placepick/livedev/**
  - backend/src/main/java/com/placepick/infrastructure/external/**
  - backend/src/test/java/com/placepick/livedev/**
  - frontend/**
  - scripts/dev.sh
  - scripts/live-evidence.sh
---

# WI-0044 PP-042 실제 값 Live Playground

## 문제와 근거

기존 실제 검증은 안전한 count·상태만 출력해 Provider 연결 가능성은 증명했지만, 사용자가
자신의 자연어가 어떤 조건·후보·근거·점수·추천 이유로 바뀌는지 직접 확인할 수 없었다.
Gateway별 명령도 제품 Java adapter와 실행 경로가 달라 유지 비용이 컸다.

## 목적과 성공 기준

- `make dev`는 외부 호출 없이 같은 추천 Core의 전체 흐름을 화면에 표시한다.
- `make dev-live`는 `.env.live.local`의 Naver·Elice 자격으로 임의 입력을 실제 처리한다.
- Draft 확인 전 추천을 시작하지 않고, 후보 필터·중복·완화·근거·서버 점수와 LLM 이유를
  단계별 실제 값으로 표시한다.
- 실행은 기본 30분 메모리 TTL, 즉시 삭제와 동시 실행 기본 2개를 지원한다.
- 개발 endpoint는 `live-dev` profile에서만 등록되고 production에는 존재하지 않는다.

## 범위, 비범위와 제약

범위는 개발 전용 API·SSE, in-process Mock, direct Provider wiring과 Next.js Playground다.
정식 `/api/v1/**`의 DB Job·Worker·공유방은 별도 제품 흐름이며 개발 API를 재사용하지
않는다. 비밀, 인증 Header와 Provider routing URL은 UI·로그·report에 표시하지 않는다.

## 판단 기준과 대안

고정 합성 로그만 유지하면 재현성은 높지만 사용자가 값을 볼 수 없다. 응답 원문을 그대로
노출하면 이해는 쉽지만 불필요한 자격·payload·저장 위험이 생긴다. 제품 Core가 사용한
정제 DTO와 trace만 메모리에 보관·표시하는 방식을 선택했다.

## 문제 해결 기록

LiveDev DTO와 프런트 transport를 먼저 고정하고 Draft 생성·확정, 비동기 run, SSE terminal
snapshot, 삭제 순서로 구현했다. 프런트가 예상한 status·중첩 결과와 실제 Java 응답 차이를
계약 테스트로 맞췄다.

실제 Provider 응답 차이에서 다음 세 정책을 확정했다.

- `CAFE`, `RESTAURANT`, `BAR`처럼 이미 알려진 유형에 Provider가
  `placeTypeDetail`을 덧붙여도 의미 오류로 보지 않고 서버가 null로 정규화한다.
  `OTHER`만 세부 유형을 필수로 검증한다.
- 누락 인원·예산 warning은 LLM 문구를 신뢰하지 않고 정규화한 조건에서 서버가
  결정적으로 계산한다.
- Elice 이유는 고정 검증 문구 한 종류만 허용하던 v1에서 자연스러운 1~160자 문장과
  같은 후보 evidence 1~3개를 허용하는 v2로 바꿨다. 서버의 place/evidence 소유권,
  금지 속성, 최소 근거 연결 검증과 batch 전체 fallback은 유지했다.

## 구현 결과와 검증 증거

Live Playground의 profile 격리·TTL·삭제·동시 실행·SSE terminal snapshot과 프런트 상태는
백엔드 단위·통합 테스트, 프런트 단위 테스트와 브라우저 E2E로 자동 검증한다. 실제
Provider 경로는 2026-07-16 `make live-evidence`에서 세 고정 합성 사용자 시나리오를 각각
독립 실행했다. 세 실행 모두 `linked=true`, 장소 3개, `degraded=false`,
`reasonFallback=false`였고 호출 수는 각각 7·6·6회, 합계 19회였다. report secret scan도
통과했다.

이 수치는 Provider 원문이나 장소 정보를 기록하지 않은 safe summary다. 입력부터 조건
확인, Naver 후보·Blog 근거, 서버 Top 3, Elice v2 이유와 서버 근거 검증까지의 사용자
여정과 판정 근거는
[CASE-0002](../case-studies/CASE-0002-naver-elice-linked-live-user-flow.md)를 단일 서술
정본으로 삼는다. 이 완료는 로컬 직접 Provider 경로에 한정하며 cloud 배포는 여전히
`planned`다.

같은 날 `make dev-live`의 실제 브라우저에서도 임의 자연어 입력부터 삭제까지 확인했다.
Elice가 추출한 장소 유형은 입력 의미와 맞았지만 위치 표현은 제품의 확정 조건으로 그대로
사용하기에 충분하지 않았다. 화면에서 사용자가 위치를 정규화해 확정한 뒤에만 추천을
시작했고, 실제 Naver 후보·Blog evidence, 서버 Top 3와 검증된 Elice 이유가 표시됐다.
마지막 삭제 뒤 연결 Draft와 실행 결과가 조회되지 않는 것도 확인했다. 이는 사용자 확인
경계가 형식적인 화면이 아니라 실제 Provider 변동을 수정하는 제품 단계임을 보여 준다.

Playground와 별도로 정식 제품 경로도 로컬에서 실제 Provider로 검증했다. 서로 분리된
주최자·참여자 익명 세션으로 조건 추출·확정, `202 + Location`, PostgreSQL Job·Outbox,
Redis Streams Worker, 추천 snapshot-first SSE, 실제 Top 3, 방 생성, 참여자의
`LIKE → DISLIKE → DELETE → LIKE`, 방 SSE, 주최자 최종 확정과 참여자의 결과 조회가
끝까지 통과했다. 이 검증은 개발 전용 API를 정식 제품 API로 재사용하지 않고도 두 경로가
동일 추천 Core와 실제 adapter에서 수렴함을 확인한다.

첫 정식 흐름 시도에서 방 SSE가 90초 timeout으로 끝났지만 서비스의 투표·확정 실패는
아니었다. Next rewrite를 통과한 작은 초기 SSE frame을 smoke client가 받기 전까지
mutation을 시작하지 않았고, frame은 뒤따르는 event가 없어 전달되지 않아 상호 대기했다.
client는 HTTP 200, `text/event-stream`, response body 연결을 확인한 직후 mutation을
시작하도록 수정했다. 첫 non-heartbeat 상태 event가 `snapshot`인지와 이후
`voteUpdated`·`finalized` 수신은 그대로 검증한다. 수정 뒤 Mock과 실제 Provider 정식
흐름이 모두 통과했다.

## AI 사용과 사람의 검증

AI에는 API·화면 구현, schema 정합성 검사와 경계 테스트 생성을 위임한다. 사람은 실제
화면의 값, Provider 비용·정책, redaction과 최종 UI 동작을 확인한다.

## 남은 위험과 학습

Playground의 실제 값은 개발자 화면에 의도적으로 보이므로 화면 공유·브라우저 확장과
로컬 PC 접근 위험은 남는다. 실제 응답 원문이나 자격을 표시하지 않고 TTL·삭제로 범위를
줄인다. 로컬 DB·Worker·제품 API 흐름은 별도 실제 검증으로 확인했지만, 이 성공은 cloud
runtime, cold start, 외부 secret 주입과 rollback 성공을 대신하지 않는다.
