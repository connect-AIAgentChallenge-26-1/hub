---
id: ADR-0008
title: Next.js 프런트엔드와 same-origin 배포 경계
type: adr
status: accepted
date: 2026-07-13
owners:
  - placepick-team
related:
  - ../roadmap.md
  - ../archive/work-records/WI-0002-service-completion-backlog.md
---

# ADR-0008 Next.js 프런트엔드와 same-origin 배포 경계

## 맥락과 문제

현재 저장소의 HTML과 React component는 독립 프로토타입이며 실제 API, routing,
테스트나 build에 연결되지 않았다. 익명 cookie, CSRF와 SSE를 브라우저에서 안전하게
다루려면 프런트 기술 기준과 backend origin 경계를 구현 전에 고정해야 한다.

## 판단 기준과 검토 대안

기준은 App Router 기반 사용자 흐름, 타입 안정성, 접근성·E2E 도구 생태계, Node 24
개발 환경 호환, cookie·SSE 보안 단순성과 운영 패키징이다.

- 정적 HTML을 확장하면 초기 화면은 빠르지만 route, server proxy와 상태 검증을
  수작업으로 구성해야 한다.
- React SPA와 별도 API origin은 단순 배포가 가능하지만 CORS, credential cookie와
  CSRF 설정이 복잡해진다.
- Next.js와 same-origin proxy는 Node runtime이 추가되지만 route와 보안 경계를
  일관되게 제공한다.

## 결정

프런트엔드는 exact-pinned Next.js 16.2 stable, 보안 patch가 반영된 React 19.2,
TypeScript와 Tailwind CSS 4.3으로 구성하고 lockfile을 커밋한다. 개발에서는 3000의
Next.js와 8080의 backend를 사용하되 브라우저는 Next.js rewrite·proxy를 통해 API와
SSE에 접근한다. 운영 패키징도 same-origin을 유지한다.

route는 홈, draft 검토, 추천 진행, 결과·상세, 공유방과 최종 결과로 한정한다.
관리자 route는 만들지 않는다. 360px 모바일, 키보드 탐색, 명시적 label·focus,
`aria-live` 진행·투표 갱신과 두 browser context E2E를 완료 기준으로 둔다. 기존
프로토타입은 시각 참고 자료이며 bundle이나 가짜 데이터 흐름을 복사하지 않는다.

## 결과와 트레이드오프

cookie·CSRF·SSE origin 정책과 사용자 route가 단순해지고 실제 브라우저 검증이
가능하다. 별도 Node build·runtime과 proxy 장애 지점이 생기며 backend만 실행하던
환경보다 패키징이 복잡해진다. 프런트 도입 뒤에도 Java 17 backend 기준은 바뀌지
않는다.

## 검증과 재검토 조건

새로고침, SSE 재연결, 만료와 오류 상태, 두 세션 투표, 모바일·키보드·자동 접근성,
same-origin cookie와 CSRF를 Playwright에서 검증한다. 정적 배포가 필수가 되거나 별도
도메인 운영 요구가 생기면 BFF·CORS와 인증 경계를 새 위협 모델과 함께 재검토한다.
