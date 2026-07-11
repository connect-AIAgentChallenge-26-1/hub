---
type: moc
aliases:
  - Wiki Index
  - Master Index
description: Master index of the LLM Wiki. Central navigation hub listing all Wiki pages organized by category (Concepts, Entities, Guides, Maps). Updated automatically on every ingest operation.
author:
  - "[[김규태]]"
date created: 2026-07-07
date modified: 2026-07-12
tags:
  - index
  - moc
  - system
status: active
---

# 📖 LLM Wiki — Master Index

> **Architecture**: Karpathy LLM Wiki Pattern
> Raw Sources → **LLM Compiler** → This Wiki

이 볼트는 LLM 이 직접 작성하고 관리하는 **persistent knowledge wiki** 입니다.
매번 query 마다 재합성하지 않고, 한 번 컴파일된 지식이 계속 성장합니다.

---

## 📊 Stats

| Metric | Count |
|--------|-------|
| Raw Sources | 6 |
| Wiki Pages | 31 |
| Concepts | 14 |
| Entities | 8 |
| Guides | 6 |
| MOCs | 3 |
| Queries | 1 |

> *Stats 는 `/ingest` 실행 시 자동 갱신됩니다. 본인 컨텐츠를 채워나가면서 업데이트.*

---

## 🗂 Wiki Pages

아래는 현재 Wiki 페이지 목록입니다. 새 소스를 ingest 할 때마다 이 목록이 자라납니다.

### Concepts

> 추상 개념, 기술, 방법론

- [[LLM Wiki Pattern]] — LLM 이 raw source 를 컴파일하여 persistent wiki 를 관리하는 패턴
- [[RAG vs Compiled Wiki]] — RAG(매번 재검색) vs Compiled Wiki(한 번 컴파일)의 비교
- [[3-Layer Architecture]] — Raw Sources / Wiki / Schema 3층 구조
- [[Ingest-Query-Lint Cycle]] — Wiki 운영의 세 가지 핵심 작업 (Ingest, Query, Lint)
- [[LLM Wiki as Learning Base]] — 관심 있지만 아직 모르는 source를 공부 가능한 지식 지도로 만드는 관점
- [[Mothership-Satellite Vault Pattern]] — 메인 지식 볼트와 LLM-managed Wiki 볼트의 역할 분리
- [[Agent-Readable Metadata]] — 에이전트가 먼저 읽는 YAML metadata 설계
- [[Human-AI Knowledge Boundary]] — AI가 생성한 지식과 사용자가 실제로 아는 지식의 경계
- [[AI-Augmented Developer Positioning]] — AI 의존이 아니라 AI를 개발 역량의 증폭기로 설명하는 포트폴리오 프레임

### Entities

> 사람, 조직, 제품, 모델

- [[Andrej Karpathy]] — AI 연구자, LLM Wiki 패턴 제안자
- [[Vannevar Bush]] — Memex 개념 제안자 (1945)
- [[Memex]] — 문서 간 associative trail 을 가진 개인 지식 저장소 구상
- [[김규태]] — 이 standalone LLM Wiki의 소유자이자 운영자
- [[financial-order-latency-lab]] — 금융 주문 서버 p99 latency 성능 실험 프로젝트
- [[Graduation-elasticsearch]] — JavaParser 기반 Elasticsearch source-test traceability 분석 프로젝트
- [[cuee]] — 노인 모빌리티 예약 길잡이 접근성 앱 프로젝트
- [[harness]] — Codex CLI 기반 개인화 개발 workflow harness

### Guides

> How-to, 튜토리얼, 실전 가이드

- [[Obsidian Tooling for LLM Wiki]] — Web Clipper, Dataview, qmd 등 실용 도구 가이드
- [[Web Clipper to Inbox Workflow]] — Web Clipper capture에서 purpose-gated ingest까지의 실전 절차
- [[Citation Manager Integration for LLM Wiki]] — Zotero/Bookends 서지정보와 Raw Source/Wiki를 연결하기 위한 가이드 stub
- [[김규태 Career Narrative]] — 자기소개, 목표 도메인, 성장 과제, 면접용 내러티브 정리
- [[김규태 Leadership and Teaching Evidence]] — 실리콘밸리 대표, 멋쟁이사자처럼 부대표, 백엔드 세션, 해커톤 템플릿 증거

### Maps (MOC)

> 주제별 Map of Content

- [[MOC-Knowledge Management]] — 지식 관리 개념, 패턴, 역사 종합
- [[MOC-LLM Wiki Guide]] — 이 볼트 사용 온보딩 가이드
- [[MOC-Portfolio]] — 취업 포트폴리오 Evidence Wiki 운영 허브

---

## 🔎 Queries (Synthesized Answers)

> 질의 결과가 wiki 에 역피드백된 합성 페이지. [[Ingest-Query-Lint Cycle|Karpathy 원문 권장]]: "good answers can be filed back into the wiki as new pages."

- [[2026-07-07-Q-LLM-Wiki-vault-academic-value]] — LLM Wiki 볼트의 학술적 가치와 Zotero/Bookends 인용 연동 방향

---

## 📥 Recent Ingests

| Date | Source | Pages Touched |
|------|--------|---------------|
| 2026-07-12 | [[2026-07-12-Velog-Leadership-Product-Hackathon-Bundle]] | 4 pages |
| 2026-07-12 | [[2026-07-12-Kim-Gyutae-Leadership-Product-Context-v2]] | 6 pages |
| 2026-07-11 | [[2026-07-11-Kim-Gyutae-Personal-Raw-Context-v1]] | 7 pages |
| 2026-07-07 | [[2026-07-07-에이전트를-위한-지식-베이스-LLM-Wiki-활용]] | 13 pages |
| 2026-04-12 | [[2026-04-12-Karpathy-LLM-Wiki\|Karpathy LLM Wiki Gist]] | 10 pages (예시) |

→ [[log]] 참조

---

## 🔗 Quick Links

- [[log]] — 전체 변경 이력
- [[CLAUDE]] — Schema (볼트 규칙서)
- [[Core Context]] — 사용자 맥락 (채워서 사용)

---

## 🚀 시작하기

1. [[Core Context]] 에 본인 정체성·목적·철학 채우기
2. Obsidian Web Clipper 로 관심 소스를 `00. Inbox/` 에 저장
3. `/ingest` — 목적 질문에 답하면 Raw Sources + Wiki 페이지 자동 생성
4. `/query` — 쌓인 Wiki 를 바탕으로 질문 답변
5. `/lint` — 주기적으로 건강도 체크

자세한 가이드는 [[LLM-Wiki-Starter-Kit]] 참조.
