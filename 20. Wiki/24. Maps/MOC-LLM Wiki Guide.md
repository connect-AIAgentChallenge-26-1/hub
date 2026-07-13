---
type: moc
aliases:
  - LLM Wiki 사용 가이드
  - Getting Started
description: Onboarding guide for the CMDS LLM Wiki vault. Explains the 3-layer architecture, how to ingest sources, query knowledge, and maintain wiki health. Start here if you are new to this vault.
author:
  - Claude
date created: 2026-04-10T21:30
date modified: 2026-07-12
tags:
  - moc
  - guide
  - onboarding
topic:
  - llm-wiki
  - knowledge-management
related:
  - "[[index]]"
  - "[[CLAUDE]]"
  - "[[log]]"
  - "[[MOC-Knowledge Management]]"
  - "[[LLM Wiki Pattern]]"
  - "[[LLM Wiki as Learning Base]]"
  - "[[Web Clipper to Inbox Workflow]]"
status: active
explored: false
verificationStatus: unverified
operationMode: standalone
source-vault: null
---

# MOC-LLM Wiki Guide

> 이 볼트는 **Andrej Karpathy의 LLM Wiki 패턴**을 구현한 지식 베이스입니다.
> LLM이 raw source를 컴파일하여 persistent wiki를 직접 관리합니다.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────┐
│                Schema Layer                  │
│            CLAUDE.md (규칙서)                 │
├─────────────────────────────────────────────┤
│              Wiki Layer                      │
│   20. Wiki/ (LLM이 관리하는 지식 페이지)       │
│   ┌──────────┬──────────┬────────┬────────┐ │
│   │ Concepts │ Entities │ Guides │  Maps  │ │
│   └──────────┴──────────┴────────┴────────┘ │
├─────────────────────────────────────────────┤
│           Raw Sources Layer                  │
│   10. Raw Sources/ (불변 원본 자료)            │
│   ┌──────────┬────────┬───────┬───────────┐ │
│   │ Articles │ Papers │ Books │Transcripts│ │
│   └──────────┴────────┴───────┴───────────┘ │
└─────────────────────────────────────────────┘
```

---

## 📥 How to Ingest

1. 새 자료를 `00. Inbox/`에 드롭
2. Claude Code에게 ingest 요청: *"이 자료를 Wiki에 인제스트해줘"*
3. LLM이 자동으로:
	- Raw Source를 `10. Raw Sources/`로 이동 (원본 보존)
	- 관련 Wiki 페이지 10~15개 incremental update
	- `[[log]]`에 기록, `[[index]]` 업데이트

---

## 🔍 How to Query

- Wiki 페이지를 직접 탐색하거나
- Claude Code에게 질문: *"Transformer의 attention 메커니즘을 설명해줘"*
- LLM이 Wiki에서 관련 페이지를 검색하여 합성 답변 생성
- 결과는 `30. Queries/`에 저장 가능

---

## 🔧 How to Maintain (Lint)

주기적으로 Claude Code에게 요청:
- *"Wiki health check 해줘"* — orphan, stale, contradiction 검사
- *"인덱스 동기화해줘"* — `[[index]]`와 실제 구조 일치 확인
- *"broken links 찾아줘"* — 누락된 링크 자동 생성/플래그

---

## 🔗 Standalone Mode

이 vault는 현재 Mode A로 단독 운영한다. 별도 mothership vault를 연결하지 않으므로 `/ingest`는 `mainVaultRelated` 검색을 건너뛰고, 이 vault 내부의 Raw Source / Wiki / Query 결과만 사용한다.

나중에 Mode B로 전환하면 [[Mothership-Satellite Vault Pattern]]에 따라 메인 볼트와 cross-reference를 추가할 수 있다.

## 📚 Study Path

- [[LLM Wiki Pattern]] — 전체 패턴
- [[LLM Wiki as Learning Base]] — 앞으로 공부할 source를 다루는 관점
- [[Agent-Readable Metadata]] — 에이전트가 읽기 좋은 note 설계
- [[Web Clipper to Inbox Workflow]] — 캡처부터 ingest까지
- [[Citation Manager Integration for LLM Wiki]] — 학술 인용을 위한 Zotero/Bookends 연동 설계
