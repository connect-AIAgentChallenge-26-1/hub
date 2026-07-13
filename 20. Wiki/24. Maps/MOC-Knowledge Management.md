---
type: moc
aliases:
  - 지식 관리
  - KM MOC
  - PKM MOC
description: Map of Content for knowledge management concepts — LLM Wiki pattern, RAG vs compiled wiki, persistent knowledge bases, and historical precursors like Memex.
author:
  - Claude
date created: 2026-04-12T00:00
date modified: 2026-07-12
tags:
  - moc
  - knowledge-management
topic:
  - knowledge-management
  - personal-knowledge-management
related:
  - "[[MOC-LLM Wiki Guide]]"
  - "[[index]]"
status: active
explored: false
verificationStatus: unverified
---

# MOC-Knowledge Management

> 지식 관리(Knowledge Management)에 관한 개념, 패턴, 도구, 역사를 정리하는 Map of Content.

---

## Core Pattern

- [[LLM Wiki Pattern]] — LLM이 raw source를 컴파일하여 persistent wiki를 관리하는 패턴
- [[3-Layer Architecture]] — Raw Sources / Wiki / Schema 3층 구조
- [[Ingest-Query-Lint Cycle]] — Wiki 운영의 세 가지 핵심 작업
- [[LLM Wiki as Learning Base]] — 관심 있지만 아직 모르는 개념을 학습 가능한 형태로 컴파일하는 관점

## Key Concepts

- [[Persistent Knowledge Base]] — Compounding artifact로서의 wiki
- [[RAG vs Compiled Wiki]] — 매번 재검색 vs 한 번 컴파일의 차이
- [[Mothership-Satellite Vault Pattern]] — 메인 지식 볼트와 LLM-managed Wiki 볼트의 역할 분리
- [[Agent-Readable Metadata]] — LLM이 먼저 읽는 YAML metadata 설계
- [[Human-AI Knowledge Boundary]] — AI가 쓴 지식과 사용자가 아는 지식의 경계
- [[Contamination Mitigation]] — 에이전트 playground와 personal vault 분리 (kepano, 저자 축)
- [[Sovereign PKM]] — 원본 Markdown, 레거시 포맷은 출력 어댑터로 (안창현, 포맷 축)
- [[Harness Literacy]] — 외부화 + 기계가독 + 실행 연결 역량 (안창현)
- [[Synthetic Data Generation for Wiki]] — Wiki 기반 파인튜닝 확장 경로 (Karpathy)

## People & History

- [[Andrej Karpathy]] — LLM Wiki 패턴 제안자
- [[김규태]] — 이 standalone LLM Wiki의 소유자이자 운영자
- [[Vannevar Bush]] — Memex 개념 제안자 (1945)
- [[Memex]] — 문서 간 associative trail을 가진 개인 지식 저장소 구상

## Tools

- [[qmd]] — 로컬 markdown 검색 엔진 (Karpathy 권장)

## Practical Guides

- [[Obsidian Tooling for LLM Wiki]] — 실용 도구 가이드
- [[Web Clipper to Inbox Workflow]] — Web Clipper capture에서 purpose-gated ingest까지
- [[Citation Manager Integration for LLM Wiki]] — Zotero/Bookends 서지정보와 LLM Wiki source metadata 연결

---

## Related MOCs

- [[MOC-LLM Wiki Guide]] — 이 볼트 사용 온보딩 가이드
