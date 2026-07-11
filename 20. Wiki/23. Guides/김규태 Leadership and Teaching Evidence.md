---
type: wiki-page
aliases:
  - 김규태 리더십 교육 증거
  - Leadership and Teaching Evidence
description: "Reusable evidence page for Kim Gyutae's leadership, teaching, club operation, hackathon preparation, and team-enabling work."
author:
  - Codex
date created: 2026-07-12
date modified: 2026-07-12
tags:
  - leadership
  - teaching
  - portfolio
  - evidence
source:
  - "[[2026-07-12-Kim-Gyutae-Leadership-Product-Context-v2]]"
  - "[[2026-07-12-Velog-Leadership-Product-Hackathon-Bundle]]"
  - https://velog.io/@gyutaetae/what-is-leadership
  - https://velog.io/@gyutaetae/week2.-silicon-valley
  - https://velog.io/@gyutaetae/%EC%8B%A4%EB%A6%AC%EC%BD%98%EB%B0%B8%EB%A6%AC-1%EC%A3%BC%EC%B0%A8
  - https://velog.io/@gyutaetae/%EC%8B%A4%EB%A6%AC%EC%BD%98%EB%B0%B8%EB%A6%AC2
  - https://github.com/gyutaetae/GNU_hackathon_templete
related:
  - "[[김규태]]"
  - "[[MOC-Portfolio]]"
  - "[[cuee]]"
  - "[[AI-Augmented Developer Positioning]]"
confidence: medium
layer: guides
explored: false
claimType: mixed
evidenceScope: multi-source-mixed
verificationStatus: partial
status: active
---

# 김규태 Leadership and Teaching Evidence

## Summary

김규태의 리더십 증거는 "앞에서 지시하는 리더"보다 팀원이 실행과 학습에 집중할 수 있도록 환경을 정리하는 운영형/지원형 리더십에 가깝다. 실리콘밸리 취업동아리 대표, 경상국립대학교 멋쟁이사자처럼 14기 부대표, 해커톤 백엔드 템플릿 준비 경험이 이 축을 구성한다.

---

## Silicon Valley Club

- **Role**: `실리콘밸리` 취업동아리 대표
- **Term**: 2026년 1년
- **Scale**: 총 20명, 학부생 15명 + 교수 5명
- **Activities**:
	- 매주 활동 기록
	- 영어 모의면접 운영
	- Velog 글 정리 및 공유
	- 교수들과 영어 모의면접 진행
	- 다음 주 활동 결정 및 공지
	- 예산/지원금 관리
	- 간식 준비
	- 회의록 작성
	- 책 수요조사 및 예산 내 구매 지원

### Pending Evidence

> [!todo] 회의록/운영 자료 보강 예정
> 사용자가 회의록 파일은 다음에 제공하겠다고 했다. 추후 회의록, 예산/지원금 관리 문서, 책 수요조사, 공지 캡처, 교수 피드백 자료를 Raw Source로 ingest해야 한다.

---

## English Interview Practice

Velog 기록 기준으로 실리콘밸리 활동에서는 영어 인터뷰 질문을 준비하고, Meta식 행동 질문과 STAR 답변 구조를 연습했다.

대표 질문:

- 빠르게 프로젝트를 ship해야 했던 경험과 속도/품질 균형
- 단기적 이득과 장기 목표 사이에서 선택한 경험
- 동료에게 tough feedback을 줘야 했던 경험
- AI보다 사람이 잘할 수 있는 것
- AI 대신 나를 뽑아야 하는 이유

교수 피드백:

- 발표할 때 대본을 읽듯이 읽는 경향이 있다.
- 다음부터는 눈을 마주치고 영어로 말하는 연습이 필요하다.

---

## LikeLion Backend Teaching

- **Organization**: 경상국립대학교 멋쟁이사자처럼 14기
- **Role**: 부대표
- **Term**: 2026년 1년
- **Teaching activities**:
	- 백엔드 세션에서 매주 수업
	- 저녁에 만나 서로 한 일을 공유하고 평가하는 1시간 세션 운영
	- Codex 사용법 공유
	- 각자 공부하거나 조사한 내용 공유
	- 해커톤을 위한 백엔드 boilerplate와 framework 선택 및 배포

---

## GNU Hackathon Template

김규태는 해커톤에서 팀이 환경 구축보다 핵심 기능 개발에 집중하도록 `GNU_hackathon_templete`를 준비했다.

- **Purpose**: 24시간 해커톤에서 프로젝트 생성, 인증, API 라우팅, DB 연결, 폴더 구조 결정에 드는 시간을 줄이고 바로 핵심 기능 개발에 들어가게 하기
- **Planned use**: 다음 달 해커톤 대회에서 사용 예정
- **Repository**: https://github.com/gyutaetae/GNU_hackathon_templete

### Stack Rationale

| Area | Stack | Rationale |
|------|-------|-----------|
| Framework | Next.js 16 App Router | 프론트엔드, API Route, 배포 구조를 하나의 프로젝트에서 관리 |
| Language | TypeScript | API 응답, 폼 데이터, DB 모델을 타입으로 관리해 해커톤 막바지 실수 감소 |
| Runtime | Bun | 설치와 실행 속도 개선 |
| API Server | Hono | 가볍고 라우팅 구조가 명확함 |
| Auth | Supabase Auth | 이메일 인증과 세션 관리 빠른 구성 |
| Database | PostgreSQL | 실제 서비스 확장 고려 |
| ORM | Drizzle ORM | TypeScript 코드 기반 스키마 관리 |
| Validation | Zod | API 요청값과 폼 입력값 검증 |
| Form/State | React Hook Form, TanStack Query | 폼 상태, API 데이터 로딩, 캐싱 관리 |
| UI | Tailwind CSS 4, shadcn/ui, Base UI, lucide-react | 빠르게 발표 가능한 화면 구성 |

---

## Portfolio Use

면접 핵심 문장:

> 저는 팀이 반복적인 설정과 운영 문제에 시간을 쓰지 않고 핵심 학습과 구현에 집중하도록 환경을 정리하는 리더십을 지향합니다. 실리콘밸리 동아리에서는 영어 모의면접과 운영을 맡았고, 멋쟁이사자처럼에서는 백엔드 세션과 해커톤 템플릿을 준비해 팀의 실행 비용을 줄였습니다.

---

## Evidence Gaps

- 실리콘밸리 동아리 회의록 파일
- 예산/지원금 관리 자료
- 책 수요조사 기록
- 영어 모의면접 진행 사진/공지/피드백
- 백엔드 세션 주차별 수업 자료
- GNU 해커톤 템플릿의 실제 대회 사용 결과
- 팀원 피드백 또는 사용 후기

---

## Source Bundle

- [[2026-07-12-Velog-Leadership-Product-Hackathon-Bundle]] preserves the relevant Velog post bodies and GNU hackathon template README as raw evidence.

---

## Bias Check

> [!note] Bias Check
> Counter-argument: 리더십과 교육 활동은 운영 사실만으로는 충분하지 않고, 참여율, 팀원 성장, 해커톤 결과 같은 효과 증거가 있어야 강해진다.
> Data gap: 회의록, 수업 자료, 팀원 피드백, 실제 해커톤 사용 결과는 아직 Raw Source로 ingest되지 않았다.

---

## Related

- [[김규태]]
- [[MOC-Portfolio]]
- [[cuee]]
- [[AI-Augmented Developer Positioning]]
