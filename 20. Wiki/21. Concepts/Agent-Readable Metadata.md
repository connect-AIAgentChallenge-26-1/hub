---
type: wiki-page
aliases:
  - Agent Metadata
  - YAML Metadata for Agents
  - 에이전트가 읽는 메타데이터
description: The practice of writing concise YAML frontmatter so agents can quickly decide what a note is, where it belongs, and which sources or related pages matter.
author:
  - Codex
date created: 2026-07-07
date modified: 2026-07-07
tags:
  - metadata
  - yaml
  - obsidian
  - llm-wiki
source:
  - "[[2026-07-07-에이전트를-위한-지식-베이스-LLM-Wiki-활용]]"
related:
  - "[[3-Layer Architecture]]"
  - "[[Obsidian Tooling for LLM Wiki]]"
  - "[[Ingest-Query-Lint Cycle]]"
confidence: medium
layer: concepts
explored: false
claimType: prescriptive
evidenceScope: single-source
verificationStatus: unverified
status: active
---

# Agent-Readable Metadata

> [!tip] Key Insight
> YAML frontmatter는 사람을 위한 장식이 아니라, 에이전트가 먼저 읽고 note의 의미, 출처, 연결을 빠르게 판단하게 하는 routing surface다.

---

## Overview

이 vault는 Obsidian note의 상단 metadata를 컨텍스트 윈도우 관리와 연결한다. 에이전트는 모든 본문을 처음부터 다 읽기보다 title, description, source, category, related 같은 frontmatter를 먼저 읽고 관련성을 판단할 수 있다.

이것은 [[LLM Wiki Pattern]]의 progressive disclosure와 맞닿아 있다. 짧은 metadata가 note의 "빙산의 일각" 역할을 하고, 필요할 때만 본문으로 drill down한다.

---

## Useful Fields

| Field | Agent-facing role |
|-------|-------------------|
| `description` | 페이지가 무엇인지 영어로 빠르게 파악 |
| `source` | claim의 근거 raw source 추적 |
| `related` | 연결된 개념으로 탐색 확장 |
| `collectionPurpose` | 왜 수집했는지와 나중에 어디에 쓸지 보존 |
| `verificationStatus` | 단언 가능한 지식인지 확인 |
| `explored` | 사용자가 읽었거나 별도 검증했는지 확인 |

---

## In This Vault

이 vault의 [[AGENTS]]는 YAML frontmatter 7개 필수 필드와 layer별 필드를 강제한다. 이는 에이전트가 파일을 단순 텍스트 더미가 아니라 schema가 있는 지식 단위로 다루게 하기 위한 장치다.

> [!note] Bias Check
> Counter-argument: metadata 작성 비용이 너무 크면 ingest 속도가 떨어질 수 있다.
> Data gap: 이 강의는 metadata의 질적 장점을 설명하지만, metadata 품질과 agent retrieval 정확도의 관계는 별도 검증이 필요하다.

---

## Related

- [[3-Layer Architecture]] — metadata가 layer 경계를 표현하는 방식
- [[Obsidian Tooling for LLM Wiki]] — metadata를 활용하는 Obsidian tooling
- [[Ingest-Query-Lint Cycle]] — ingest와 lint에서 metadata가 쓰이는 방식

---

## Sources

- [[2026-07-07-에이전트를-위한-지식-베이스-LLM-Wiki-활용]]
