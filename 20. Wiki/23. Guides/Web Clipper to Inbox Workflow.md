---
type: wiki-page
aliases:
  - Web Clipper Inbox Workflow
  - Inbox Capture Workflow
  - 웹클리퍼 인박스 워크플로
description: A practical workflow for capturing web sources into 00. Inbox with Obsidian Web Clipper and routing them through purpose-gated ingest.
author:
  - Codex
date created: 2026-07-07
date modified: 2026-07-07
tags:
  - guide
  - obsidian
  - web-clipper
  - ingest
source:
  - "[[2026-07-07-에이전트를-위한-지식-베이스-LLM-Wiki-활용]]"
related:
  - "[[Obsidian Tooling for LLM Wiki]]"
  - "[[Ingest-Query-Lint Cycle]]"
  - "[[Agent-Readable Metadata]]"
confidence: medium
layer: guides
explored: false
claimType: prescriptive
evidenceScope: single-source
verificationStatus: unverified
status: active
---

# Web Clipper to Inbox Workflow

> [!tip] Key Insight
> Web Clipper는 자료를 바로 Wiki로 쓰는 도구가 아니라, source를 `00. Inbox/`에 임시 보관한 뒤 목적 질문을 거쳐 Raw Source와 Wiki로 승격시키는 capture layer다.

---

## Workflow

1. Obsidian Web Clipper에서 대상 vault를 지정한다.
2. source 유형에 맞는 template을 import한다.
3. 캡처 결과를 `00. Inbox/{category}/`에 저장한다.
4. Codex에서 `/inbox` 또는 `inbox` 스킬로 pending source를 확인한다.
5. `/ingest`가 `collectionPurpose`를 물으면 사용자가 왜 수집했는지 답한다.
6. Raw Source는 `10. Raw Sources/`로 보존되고, Wiki page는 `20. Wiki/`에 컴파일된다.

---

## Why Inbox Exists

Inbox는 임시 buffer다. capture 순간에는 source가 좋다고 느꼈지만, 아직 어떤 축에 재활용할지 명확하지 않을 수 있다. `/ingest` 전에 purpose gate를 거치면 단순 스크랩과 학습 가능한 지식 source를 구분할 수 있다.

이 강의 transcript도 `00. Inbox/01. Articles/`에 있다가, "내가 앞으로 공부할거야"라는 목적을 받은 뒤 Raw Source와 Wiki page로 승격되었다.

> [!note] Bias Check
> Counter-argument: purpose gate가 너무 엄격하면 빠른 capture의 흐름을 방해할 수 있다.
> Data gap: 어떤 상황에서 auto-infer purpose가 충분한지는 사용자의 장기 사용 로그가 있어야 판단할 수 있다.

---

## Related

- [[Obsidian Tooling for LLM Wiki]] — Web Clipper와 qmd 같은 도구 모음
- [[Ingest-Query-Lint Cycle]] — Inbox 이후의 운영 사이클
- [[Agent-Readable Metadata]] — ingest 결과가 에이전트가 읽기 좋은 형태가 되는 이유

---

## Sources

- [[2026-07-07-에이전트를-위한-지식-베이스-LLM-Wiki-활용]]
