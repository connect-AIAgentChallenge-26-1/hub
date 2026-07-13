---
type: wiki-page
aliases:
  - AI-written vs Human-known Boundary
  - Human AI Knowledge Separation
  - 인간 AI 지식 경계
description: The boundary between knowledge that an AI has generated and knowledge that the user has actually read, understood, and can explain.
author:
  - Codex
date created: 2026-07-07
date modified: 2026-07-07
tags:
  - llm-wiki
  - epistemology
  - learning
source:
  - "[[2026-07-07-에이전트를-위한-지식-베이스-LLM-Wiki-활용]]"
related:
  - "[[LLM Wiki as Learning Base]]"
  - "[[Mothership-Satellite Vault Pattern]]"
  - "[[3-Layer Architecture]]"
confidence: medium
layer: concepts
explored: false
claimType: interpretive
evidenceScope: single-source
verificationStatus: unverified
status: active
---

# Human-AI Knowledge Boundary

> [!tip] Key Insight
> AI가 만들어 준 결과물을 사용자가 이미 아는 지식처럼 착각하지 않도록, LLM이 쓴 지식과 사용자가 읽고 설명할 수 있는 지식을 구조적으로 분리해야 한다.

---

## Overview

LLM Wiki 운영의 위험 중 하나는 "AI가 만든 결과물을 내가 이미 아는 것처럼 행세하는 문제"다. 이 문제를 줄이는 장치가 [[Mothership-Satellite Vault Pattern]]이다. 사용자가 직접 알고 설명할 수 있는 지식은 mothership에, 아직 학습 중인 source-backed 지식은 LLM Wiki에 둔다.

이 vault의 `explored`와 `verificationStatus`도 같은 경계 관리를 위해 존재한다.

---

## Operational Meaning

| State | Meaning |
|-------|---------|
| `explored: false` | LLM이 컴파일했지만 사용자가 아직 충분히 읽거나 검증하지 않음 |
| `verificationStatus: unverified` | claim이 source-backed 형태로 정리되었지만 별도 검증은 안 됨 |
| `confidence: medium/low` | source 수나 검증 범위가 제한적임 |
| `explored: true` | 사람 또는 별도 검증 루프가 읽고 확인함 |

이 경계를 명시하면 Wiki가 "아는 척하는 산출물"이 아니라 "공부해야 할 지도"가 된다.

> [!note] Bias Check
> Counter-argument: 구조적 분리만으로 사용자의 과신을 완전히 막을 수는 없다.
> Data gap: `explored` 상태가 실제 이해도를 얼마나 잘 반영하는지는 별도 학습 기록이 있어야 확인할 수 있다.

---

## Related

- [[LLM Wiki as Learning Base]] — 아직 모르는 개념을 공부 가능한 형태로 둔다
- [[Mothership-Satellite Vault Pattern]] — 볼트 단위로 경계를 만든다
- [[3-Layer Architecture]] — Raw/Wiki/Schema도 소유권 경계다

---

## Sources

- [[2026-07-07-에이전트를-위한-지식-베이스-LLM-Wiki-활용]]
