---
id: ADR-0005
title: 익명 세션과 분리된 공유·주최자 capability 사용
type: adr
status: accepted
date: 2026-07-13
owners:
  - placepick-team
related:
  - ../roadmap.md
  - ../archive/work-records/WI-0002-service-completion-backlog.md
---

# ADR-0005 익명 세션과 분리된 공유·주최자 capability 사용

## 맥락과 문제

MVP는 가입 없이 링크로 투표할 수 있어야 하지만 클라이언트가 임의 `sessionId`나
`voterId`를 보내게 하면 다른 참여자의 표를 덮어쓸 수 있다. 공개 방 식별자에 내부
순차 ID를 사용하면 열거가 가능하고, 하나의 공유 링크에 주최자 권한까지 포함하면
링크를 받은 모든 참여자가 최종 장소를 바꿀 수 있다.

## 판단 기준과 검토 대안

기준은 가입 없는 접근성, 권한 최소화, 추측·위조 저항성, 투표 변경·삭제의 일관성과
서버에서의 강제 가능성이다.

- 클라이언트 제공 voter ID는 구현이 단순하지만 신뢰 경계가 없다.
- 공개 링크에 주최자 secret을 포함하면 공유는 쉽지만 권한 분리가 무너진다.
- 서버 세션, 공개 share token과 주최자 capability를 분리하면 상태가 늘지만 각
  권한을 독립적으로 검증할 수 있다.

## 결정

서버가 UUID v4 기반 익명 세션을 만들고 불투명한 `HttpOnly`, `SameSite=Lax`
cookie로 전달한다. 운영에서는 `Secure`를 강제하며 상태 변경 요청은 CSRF token을
검사한다. 공개 방은 충분한 entropy를 가진 share token으로 조회한다.

여러 브라우저 탭은 session cookie를 공유하지만 CSRF token 저장소는 탭별일 수 있다.
새 탭의 세션 갱신으로 기존 token이 무효화되면 클라이언트가 `CSRF_INVALID`를 받은
최초 한 번만 세션을 다시 동기화하고 원래 멱등성 key로 요청을 재전송한다. 탭 간
복구를 지원하되 무한 재시도와 중복 mutation은 허용하지 않는다.

방 생성자에게만 별도의 organizer capability를 cookie로 발급하고 서버에는 원문
대신 hash를 저장한다. 같은 브라우저가 여러 방을 만들 수 있으므로 cookie 이름은
유지하되 Path를 `/api/v1/rooms/{shareToken}`으로 방마다 격리한다. 참여자는 자기
세션의 후보별 투표만 `PUT`으로 생성·교체하고 `DELETE`로 제거한다. DB unique
constraint가 세션·방·후보당 한 표를 보장한다.
최종 확정은 organizer capability가 있어야 하며 같은 후보 재요청은 성공, 다른 후보
변경은 409로 처리한다.

## 결과와 트레이드오프

공개 링크를 유지하면서 투표 소유권과 주최자 권한을 분리하고, 클라이언트 식별자
위조를 제거한다. 브라우저 cookie 삭제 시 같은 사람을 복구할 계정이 없고, 여러
기기는 서로 다른 참여자로 보인다. 이는 익명 MVP의 의도된 한계이며 개인정보
수집을 늘려 해결하지 않는다.

## 검증과 재검토 조건

두 browser context의 투표 격리, 변조·만료 token, CSRF, share token만 가진 최종
확정 거부, 동시 투표 unique constraint와 로그 secret 제거를 테스트한다. 계정 기반
동기화, 초대 멤버 권한이나 여러 주최자 기능이 범위에 들어오면 capability 모델과
데이터 migration을 새 ADR에서 재검토한다.
