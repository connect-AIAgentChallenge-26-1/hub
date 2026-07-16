---
id: ADR-0007
title: Provider 중립 core와 통제된 staging-live 경계
type: adr
status: superseded
date: 2026-07-13
owners:
  - placepick-team
related:
  - ../roadmap.md
  - ../archive/work-records/WI-0002-service-completion-backlog.md
  - ADR-0009-mock-local-live-gateway-boundary.md
  - ADR-0011-elice-chat-completions-provider-boundary.md
---

# ADR-0007 Provider 중립 core와 통제된 staging-live 경계

> 2026-07-14에
> [ADR-0009](ADR-0009-mock-local-live-gateway-boundary.md)로 대체됐다. Provider 중립
> port와 Mock/Live 분리 원칙은 유지하지만, 실제 비밀을 공유 Fork의 GitHub
> Environment에 두는 결정은 폐기한다. 이 문서는 결정 변경의 근거를 보존하는
> 역사 기록이다. LLM provider와 API surface의 현재 방향은
> [ADR-0011](ADR-0011-elice-chat-completions-provider-boundary.md)을 따른다.

## 맥락과 문제

추천 core가 Naver나 특정 LLM DTO에 직접 의존하면 공급자 변경, Mock 테스트와 장애
fallback이 어려워진다. 반대로 실제 API를 CI에서 항상 호출하면 비용, quota, 데이터
노출과 비결정적 실패가 merge 안전성을 훼손한다. Mock만 사용하면 공식 API의 인증,
schema와 정책 변경을 장기간 발견하지 못한다.

## 판단 기준과 검토 대안

기준은 결정적 CI, 실제 호환성 탐지, 비용·비밀 최소화, provider 교체 가능성, 근거
보존과 약관 준수다.

- 모든 CI에서 live 호출은 호환성을 자주 보지만 비용과 비결정성이 크다.
- Mock만 영구 사용하면 안전하지만 실제 drift를 검출하지 못한다.
- provider port와 Mock/Live adapter를 분리하고 제한된 staging workflow를 두면 두
  목적을 독립적으로 검증할 수 있다.

## 결정

도메인과 application은 장소·블로그 검색, 조건 추출과 설명 생성 port에만 의존한다.
Naver 신규 연동은 NAVER API HUB와 현재 인증 header를 사용한다. OpenAI adapter는
Responses API와 strict JSON Schema Structured Outputs를 Spring `RestClient`로
호출하며 기본 모델은 exact-pinned `gpt-5.6-luna`, 낮은 reasoning effort,
`store=false`, tool 비활성화와 bounded output을 사용한다.

`local`, `test`, `load`와 필수 CI는 `PLACEPICK_EXTERNAL_MODE=mock`에서만 시작한다.
실제 adapter는 GitHub `staging-live` Environment에서 하루 한 번과 수동 실행만
허용한다. 고정된 비개인성 입력 한 건, 호출·token 상한, host allowlist, kill switch,
redacted artifact와 secret rotation을 적용한다. secret·예산 한도·알림이 준비되기
전에는 schedule을 활성화하지 않는다.

Naver 원문 response의 cache나 영구 저장은 약관·표시 의무를 사람이 확인하기 전까지
금지하고 최소 파생 데이터만 보존한다.

## 결과와 트레이드오프

로컬·CI는 비용 없이 결정적으로 실행되고 실제 schema drift는 별도 통제 경로에서
탐지한다. Mock fixture와 실제 응답 사이의 유지보수 비용, GitHub Environment 운영과
약관 검토 gate가 추가된다. live workflow 실패는 merge 결과나 운영 기능을 자동으로
활성화하지 않는다.

## 검증과 재검토 조건

Mock suite에서 외부 DNS·HTTP가 발생하면 실패시키고, staging-live에서는 key와 원문
응답이 로그·artifact에 없는지 검사한다. Naver·OpenAI 공식 API, 약관, 모델 지원이나
비용 구조가 바뀌거나 두 번째 provider가 필요해지면 adapter와 기본값을 재검토한다.

## 대체 이유

공유 Fork의 관리자는 workflow를 변경할 수 있으므로 repository·environment secret을
직접 읽지 못하더라도 secret을 사용하는 job을 변조할 수 있다. 이는 사용자가 요구한
"별도 저장소 없이 공유 Fork 관리자에게 실제 provider 비밀을 주지 않는다"는 신뢰
경계를 만족하지 못한다. 실제 개발 계약 확인은 Git에서 제외한 로컬 전용 파일로,
배포 호출은 원본 비밀을 보유한 외부 Provider Gateway로 분리하는 ADR-0009가 이
문제와 기존 provider 중립 원칙을 함께 해결한다.
