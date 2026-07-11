---
type: core-context
aliases:
  - User Context
  - 핵심 맥락
description: The user's active standalone LLM Wiki context for portfolio evidence management, learning, and knowledge compilation. LLM must read this before ingest, query, or lint so operations align with the user's purpose, not just structure.
author:
  - "[[김규태]]"
date created: 2026-07-07
date modified: 2026-07-12
tags:
  - system
  - schema
  - core-context
operationMode: standalone
source-vault: null
source:
  - "[[2026-07-11-Kim-Gyutae-Personal-Raw-Context-v1]]"
  - "[[2026-07-12-Kim-Gyutae-Leadership-Product-Context-v2]]"
version: "1.2"
snapshot_date: 2026-07-12
status: active
---

# 🧭 Core Context — LLM Wiki 사용자 맥락

> 이 노트는 김규태가 Codex에서 단독 운영하는 LLM Wiki의 활성 Core Context다.
> 별도 mothership vault 없이 이 vault 안에서 수집, 컴파일, 질의, 검증을 수행한다.

---

## 1. Who — 사용자 정체성

### 기본 정체성

- **이름**: `김규태`
- **현재 상태**: `개발자 취업을 준비하는 경상국립대학교 소프트웨어공학과 3학년 학부생 / SEALAB 학부연구생`
- **기본 프로필**: `2003년생, 남성, 대한민국 경남 진주시 거주`
- **목표 직무**: `아직 단일 직무로 확정하지 않았지만 개발자가 되고 싶고, 백엔드 / 금융 / 드론 / 반도체 도메인에 관심`
- **직함 / 역할**: `학부연구생 / 개발자 취업준비생 / LLM Wiki 운영자`
- **주 언어**: `Python`
- **GitHub 기반 기술 경험**: `Python 서버/자동화, JavaParser·Elasticsearch 분석, Kotlin Android 앱, TypeScript/React 프로토타입, C 서버 MVP, Shell/PowerShell 자동화`
- **전문 분야 후보**: `백엔드 성능 실험, 금융 시스템, 드론, 반도체, 데이터베이스/검색 분석, Codex 기반 개발, AI 에이전트 워크플로, 앱 개발, 포트폴리오 증거화`
- **주 활동 영역**: `프로젝트 설계, 성능 개선, 백엔드/앱 개발 구현, 팀 리딩, 백엔드 세션 교육, 동아리 운영, 학습 노트 컴파일, 취업 포트폴리오·면접 자료 재활용`

### 연속성 선언 (Continuity Statement)

> 김규태의 LLM Wiki는 개발자 취업 준비를 위해 프로젝트와 학습 자료를 일회성 메모가 아니라 재사용 가능한 증거, 설명, 의사결정 기록으로 컴파일한다. 현재 목표 직무는 하나로 확정하지 않았지만 백엔드·금융·드론·반도체 도메인에 관심이 있으며, 답변과 산출물은 성능·데이터 처리·시스템 사고·AI 활용의 검증 가능성을 우선한다. 취업준비생의 입장에서 열정, 성장가능성, 직접 설계·개발·성능개선한 경험이 드러나는 톤을 유지한다.

---

## 2. Why — 지식을 수집하는 목적 (재활용 축)

**미래의 나에게 보내는 편지**: "이 소스가 아래 어느 축에 재활용될지" 를 수집 시점에 명시하지 못하면 수집하지 않는다.

현재 기본 재활용 축은 개발자 취업 준비와 프로젝트 증거화를 최우선으로 둔다. 단, 목표 직무는 아직 탐색 중이므로 백엔드 하나로 과도하게 고정하지 않고 금융·드론·반도체 도메인 가능성을 함께 열어둔다.

1. **취업/포트폴리오**: 이력서 bullet, 자기소개서, 면접 답변, GitHub 포트폴리오 스토리
2. **프로젝트 증거**: 설계 판단, 성능 개선, 구현 범위, 팀 리딩, 검증 방법
3. **백엔드/성능/금융 시스템**: p99 latency, 부하 테스트, 병목 분석, 로그/IO/GPU 호출 경합, 서버 구조, 금융 주문 처리 관심
4. **학부연구생/학술**: 연구실 활동, JavaParser, Elasticsearch Java Client 분석, traceability, 논문 읽기
5. **강의/수업/교육**: 학교 수업 프로젝트, 발표, 과제, 데이터베이스 학습, 멋쟁이사자처럼 백엔드 세션, 실리콘밸리 영어 모의면접 운영
6. **Codex 개발 워크플로**: Codex로 개발한 과정, agent harness 개선, Threads 자동 리서치/업로드 자동화, AI 활용과 본인 판단 분리
7. **제품/창업**: 사용자 문제 정의, 앱 기능 설계, 프로토타입, 창업동아리 산출물
8. **에세이/블로그**: Velog 글, 회고, 기술 학습 정리, 성장 서사, 개발 도메인 영어 학습 기록

---

## 3. What — (옵션) 개인 지식 프레임워크

별도 개인 프레임워크가 확정되기 전까지는 이 vault의 3-layer architecture를 따른다.

- **Raw Sources**: 원문, 로그, 초안, 참고자료를 가능한 한 손상 없이 보존한다.
- **Wiki**: 반복해서 쓸 개념, 엔티티, 가이드, MOC로 컴파일한다.
- **Queries**: 이력서 bullet, STAR 답변, 프로젝트 설명처럼 바로 재사용 가능한 산출물을 저장한다.

---

## 4. How — (옵션) 지식 시스템 철학

현재 운영 원칙은 다음과 같다.

1. 수집 전 재활용 목적을 먼저 확인한다.
2. 원문과 해석을 분리해 나중에 검증 가능하게 남긴다.
3. 프로젝트 자료는 "무엇을 만들었는가"보다 "어떤 판단을 했고 어떻게 검증했는가"를 우선한다.
4. Codex가 만든 결과물과 김규태가 직접 판단·설계·검증한 내용을 분리한다.
5. 취업용 문장에서는 열정과 성장가능성을 살리되, 근거 없는 과장은 피한다.
6. 모호한 개인 맥락은 추측하지 않고 Core Context에 확정된 내용만 승격한다.
7. AI 의존 개발자가 아니라 AI를 개발 역량의 증폭기로 활용하는 개발자로 포지셔닝한다.

---

## 5. Standalone Mode

Mode A로 단독 운영한다. 별도 mothership vault는 연결하지 않는다.

- `mainVaultRelated`와 `mainVaultCmds`는 연결할 모선이 없으면 비워둔다.
- `/refresh-context`는 모선 스냅샷 갱신이 아니라 이 Core Context 자체를 갱신할 때만 사용한다.
- 나중에 Mode B로 전환하려면 이 섹션에 mothership 경로와 동적 참조를 추가한다.

---

## 6. Operational Directives (LLM 행동 규칙)

### Ingest 시

1. `/ingest` 는 반드시 "왜 수집했는가?" 를 1회 묻는다 (미래의 나에게 보내는 편지, §2 축 참조).
2. Mode A에서는 mothership 검색을 건너뛴다.
3. Raw Source frontmatter 에 `collectionPurpose` 를 기록하고, `mainVaultRelated` / `mainVaultCmds` 는 비워둘 수 있다.

### Query 시

1. 답변이 §2 7 재활용 축 중 어느 축에 연결되는지 명시.
2. Mode A에서는 이 vault 내부 Wiki / Raw Source / Query 결과만 참조한다.

### Portfolio 운영 시

1. 이 vault는 취업 포트폴리오 Evidence Wiki로 사용한다.
2. 프로젝트 자료를 ingest할 때는 "내가 한 판단", "에이전트에게 맡긴 것", "검증 방법", "수치/결과", "면접에서 말할 한 문장"을 분리한다.
3. 현재 포트폴리오 spine은 `financial-order-latency-lab -> Graduation-elasticsearch -> cuee -> harness`로 유지한다. 다만 목표 직무는 아직 탐색 중이므로 백엔드/금융/드론/반도체 중 어느 방향을 강화하는 자료인지 함께 기록한다.
4. Raw Source에는 README, 설계 문서, 트러블슈팅 로그, 성능 측정, 회고, 발표자료, 자기소개서 초안, 면접 답변 초안을 증거로 보존한다.
5. Query 결과는 이력서 bullet, STAR 답변, 프로젝트 2분 설명, 약한 증거 보강 목록처럼 바로 재사용 가능한 형태로 저장한다.
6. AI 활용 프로젝트는 "내가 판단한 것", "AI가 도운 것", "AI 없이도 설명·수정 가능한 것"을 반드시 분리한다.

### 현재 대표 프로젝트

1. `financial-order-latency-lab`: 운영체제/데이터베이스 수업 맥락의 금융 주문 latency 실험 프로젝트. Python 서버, TCP load test, PyTorch CUDA scoring server, Windows metric 수집, p99 latency 분석을 통해 백엔드 성능 실험 역량을 보여주는 축.
2. `Graduation-elasticsearch`: 학부연구생/졸업 연구 맥락의 JavaParser 기반 Elasticsearch Java source-test traceability 분석 프로젝트. JavaParser AST, MethodCallExpr, Symbol Solver, source-test link CSV, parser output 검증을 보여주는 축.
3. `cuee`: 경남권 창업동아리 대상작. 전신 `배우담`은 노인에게 앱 사용법을 학습시키려는 앱이었고, 실제 노인은 학습 과정 자체도 고통스럽다는 문제를 보고 현재 화면에서 다음 버튼을 안내하는 접근성 오버레이 앱 `cuee`로 전환했다. Kotlin Android 기반 사용자 문제 정의, 제품화, 접근성, 팀 리딩 경험을 보여주는 축.
4. `harness`: 커서맛피아님의 harness를 참고해 앱 개발에 맞게 개인화한 개발 harness. Python 기반 Codex CLI workflow, stage/phase artifact, agent workflow, 생산성 개선을 보여주는 축.
5. `Threads AI research automation`: Codex와 토큰 기반 자동화 흐름을 활용해 매일 18시에 AI agent 논문 활용 예시를 리서치하고 Threads에 업로드하는 자동화 워크플로. 사용자가 제공한 원본 맥락 기준으로 한 달 동안 팔로워 약 400명을 확보한 사례.
6. `Leadership and teaching`: 2026년 `실리콘밸리` 취업동아리 대표(20명: 학부생 15명, 교수 5명), 경상국립대학교 멋쟁이사자처럼 14기 부대표. 영어 모의면접 운영, 백엔드 세션, 해커톤 템플릿 준비, 예산/지원금 관리, 회의록 작성, 책 수요조사 등을 통해 운영형/지원형 리더십을 보여주는 축.

### 프로젝트 역할 기준

- 김규태는 프로젝트에서 설계, 성능, 개발을 맡았고 팀장 역할도 수행했다.
- 포트폴리오 문장에서는 "팀장으로서 어떤 결정을 했는가", "성능을 어떻게 측정/개선했는가", "Codex를 어디까지 도구로 활용했고 본인이 검증한 부분은 무엇인가", "AI 없이도 설명할 수 있는 기본기는 무엇인가"를 분리해서 기록한다.

### 목표 회사 / 도메인 탐색

- 진지하게 살펴본 회사: KB국민은행, 네이버, SK하이닉스, 삼성전자
- 관심 환경: 판교처럼 개발자가 많이 모이는 국내 기술 환경, 장기적으로 싱가포르 또는 미국 실리콘밸리
- 보완할 역량: 코딩테스트, AI 비의존 구현 기본기, 개발자 간 협업에 필요한 개발 도메인 영어

### 리더십 / 교육 활동

- `실리콘밸리` 취업동아리 대표: 2026년 1년, 총 20명(학부생 15명, 교수 5명)
- 경상국립대학교 멋쟁이사자처럼 14기 부대표: 2026년 1년
- 대표/부대표 활동은 회의록, 예산/지원금 자료, 수업 자료, 팀원 피드백을 추후 Raw Source로 보강한다.

### 공개 프로필

- GitHub: https://github.com/gyutaetae
- Velog: https://velog.io/@gyutaetae/posts
- LinkedIn: https://www.linkedin.com/in/%EA%B7%9C%ED%83%9C-%EA%B9%80-90763b407/
- Instagram: https://www.instagram.com/kyu_tae_/

### Lint 시

- Raw Source 에 `collectionPurpose` 없으면 flag.
- Core Context `snapshot_date` 가 30 일 이상 오래되면 `/refresh-context` 추천.

### 이미지 저장

- 모든 이미지·첨부: `80. References/Attachments/` 일원화.

---

## 7. 채우고 나서

- [x] §1 이름 채움
- [x] §2 재활용 축 5~9개 정의
- [x] (옵션) §3 개인 프레임워크
- [x] (옵션) §4 철학 3~5개
- [x] Mode A 단독 운영 설정
- [x] frontmatter `status: active`
- [x] frontmatter `snapshot_date` 오늘 날짜
- [x] frontmatter `source:` 에 본인이 제공한 개인 raw context 추가
- [x] 리더십/교육 활동 원본 context 추가

완료 후 첫 `/ingest` 를 실행해보세요. Core Context 가 작동하면 LLM 이 §2 축을 언급하며 목적 질문을 던집니다.

---

## 8. Related

- [[CLAUDE]] — LLM Wiki Schema
- [[index]] — Master Index
- [[log]] — Change Log
- [[LLM-Wiki-Starter-Kit]] — 외부 공유용 간이 킷

---

*템플릿 v1.0 — Karpathy LLM Wiki pattern + 미래의 나에게 보내는 편지 + CMDSPACE harness*
