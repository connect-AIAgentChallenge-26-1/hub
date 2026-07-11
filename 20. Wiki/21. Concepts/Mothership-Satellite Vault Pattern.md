---
type: wiki-page
aliases:
  - Mothership Satellite Pattern
  - 모선 위성 볼트 패턴
  - Multi-vault LLM Wiki Pattern
description: A multi-vault knowledge architecture that separates a user's primary authored vault from one or more LLM-managed satellite wiki vaults.
author:
  - Codex
date created: 2026-07-07
date modified: 2026-07-10
tags:
  - obsidian
  - llm-wiki
  - architecture
source:
  - "[[2026-07-07-에이전트를-위한-지식-베이스-LLM-Wiki-활용]]"
related:
  - "[[3-Layer Architecture]]"
  - "[[LLM Wiki as Learning Base]]"
  - "[[Human-AI Knowledge Boundary]]"
confidence: medium
layer: concepts
explored: false
claimType: prescriptive
evidenceScope: single-source
verificationStatus: unverified
status: active
---

# Mothership-Satellite Vault Pattern

> [!tip] Key Insight
> 모선 볼트는 사용자가 직접 이해하고 설명할 수 있는 지식의 중심이고, 위성 LLM Wiki는 LLM이 raw source를 읽어 학습 재료로 컴파일하는 별도 작업 공간이다.

---

## Overview

Mothership-Satellite 패턴은 Obsidian을 단일 vault가 아니라 여러 vault의 생태계로 운영하는 방식이다. 메인 볼트는 사용자가 직접 쓰고 설명할 수 있는 지식을 담고, LLM Wiki vault는 LLM이 raw source를 읽어 학습 재료로 컴파일하는 별도 작업 공간이 된다. 이 구분은 [[Human-AI Knowledge Boundary]]를 지키기 위한 운영 장치다.

이 vault는 현재 `operationMode: standalone`이므로 실제 mothership 연결은 쓰지 않는다. 다만 패턴 자체는 나중에 Mode B로 전환할 때의 설계 기준이 된다.

---

## Roles

| Vault | Primary content | Owner |
|-------|-----------------|-------|
| Mothership | 사용자가 직접 쓰고 설명할 수 있는 지식, 에세이, 커리큘럼, 산출물 | Human |
| Satellite LLM Wiki | 관심 source, 학습 재료, LLM이 컴파일한 개념 페이지 | LLM-managed |

강의의 중요한 주장은 두 vault의 자료가 중복될 수 있지만 목적이 다르다는 점이다. 같은 개념이라도 LLM Wiki에서는 공부용 source-backed page이고, mothership에서는 사용자가 직접 다룰 수 있는 성숙한 지식일 수 있다.

---

## Cross-Vault Linking

Obsidian wikilink는 같은 vault 안에서 가장 잘 작동한다. 외부 vault의 노트를 연결하려면 markdown link나 `obsidian://open` URL 같은 명시적 cross-reference가 필요하다. 이 vault의 `mainVaultRelated`와 `mainVaultCmds` 필드는 그 목적을 위해 설계되어 있다.

Mode A에서는 이 필드를 비워 둘 수 있다. Mode B에서는 `/ingest`가 source 목적을 받은 뒤 mothership 후보를 검색하고 검증된 링크만 기록해야 한다.

> [!note] Bias Check
> Counter-argument: 초보 사용자에게 multi-vault 구조는 단일 vault보다 복잡할 수 있다.
> Data gap: 이 강의는 경험적 운영 사례를 제시하지만, multi-vault와 single-vault의 성능 차이를 실험적으로 비교하지 않는다.

---

## Related

- [[3-Layer Architecture]] — 한 vault 내부의 Raw/Wiki/Schema 분리
- [[LLM Wiki as Learning Base]] — satellite vault의 학습용 역할
- [[Human-AI Knowledge Boundary]] — 볼트 분리의 이유

---

## Sources

- [[2026-07-07-에이전트를-위한-지식-베이스-LLM-Wiki-활용]]
