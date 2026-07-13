---
type: wiki-page
aliases:
  - Learning Base
  - 학습 전초기지
  - LLM Wiki Learning Base
description: The use of an LLM Wiki as a learning base for concepts that the user cares about but cannot yet explain fully.
author:
  - Codex
date created: 2026-07-07
date modified: 2026-07-10
tags:
  - llm-wiki
  - learning
  - knowledge-management
source:
  - "[[2026-07-07-에이전트를-위한-지식-베이스-LLM-Wiki-활용]]"
related:
  - "[[LLM Wiki Pattern]]"
  - "[[Human-AI Knowledge Boundary]]"
  - "[[Mothership-Satellite Vault Pattern]]"
confidence: medium
layer: concepts
explored: false
claimType: interpretive
evidenceScope: single-source
verificationStatus: unverified
status: active
---

# LLM Wiki as Learning Base

> [!tip] Key Insight
> LLM Wiki는 이미 잘 아는 내용을 보관하는 장소라기보다, 사용자가 관심을 가졌지만 아직 설명할 수 없는 개념을 공부 가능한 형태로 붙잡아 두는 학습 전초기지로 쓸 수 있다.

---

## Overview

이 vault에서는 LLM Wiki를 "학습 전초기지"로 사용한다. 사용자가 어떤 기사, 논문, 영상, GitHub 저장소를 캡처했다는 사실 자체가 관심의 신호다. [[LLM Wiki Pattern]]은 이 관심 신호를 raw source로 보존하고, LLM이 이를 [[Agent-Readable Metadata]]와 cross-reference가 있는 Wiki page로 컴파일하게 만든다.

핵심 구분은 다음과 같다.

| 영역 | 의미 |
|------|------|
| 이미 잘 설명할 수 있는 지식 | 메인 지식 볼트나 직접 작성 노트에 둔다 |
| 관심은 있지만 아직 잘 모르는 지식 | LLM Wiki에 넣고 학습 가능한 단위로 컴파일한다 |
| 완성된 산출물 | 별도 output 또는 메인 작업 공간에서 다룬다 |

---

## Learning Role

LLM Wiki가 학습 전초기지로 작동하려면 source capture 시점에 "왜 수집했는가"를 남겨야 한다. 이 vault의 `/ingest`가 `collectionPurpose`를 요구하는 이유도 여기에 있다. 목적 없는 자료 더미가 아니라, 미래의 사용자가 다시 공부할 수 있는 큐레이션 흔적을 남기는 것이다.

이 관점에서 LLM Wiki의 Wiki page는 최종 지식이 아니라 중간 학습 인터페이스다. 사용자는 직접 읽고, 질문하고, 검증하면서 `explored`와 `verificationStatus`를 올릴 수 있다.

> [!note] Bias Check
> Counter-argument: 모든 관심 자료를 Wiki에 넣으면 학습 backlog가 비대해질 수 있다.
> Data gap: 이 강의는 운영 철학을 설명하지만, 어느 규모에서 backlog pruning이 필요한지는 정량적으로 제시하지 않는다.

---

## Related

- [[LLM Wiki Pattern]] — source를 Wiki로 컴파일하는 기본 패턴
- [[Human-AI Knowledge Boundary]] — AI가 쓴 지식과 사용자가 아는 지식의 경계
- [[Mothership-Satellite Vault Pattern]] — 학습용 Wiki와 메인 지식 볼트의 역할 분리

---

## Sources

- [[2026-07-07-에이전트를-위한-지식-베이스-LLM-Wiki-활용]]
