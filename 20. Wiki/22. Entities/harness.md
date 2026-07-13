---
type: wiki-page
aliases:
  - Codex harness
description: Python-based Codex CLI autonomous implementation harness customized for staged app development workflows.
author:
  - Codex
date created: 2026-07-10
date modified: 2026-07-12
tags:
  - project
  - codex
  - automation
  - python
source:
  - https://github.com/gyutaetae/harness
  - https://raw.githubusercontent.com/gyutaetae/harness/main/README.md
  - "[[2026-07-11-Kim-Gyutae-Personal-Raw-Context-v1]]"
  - "[[2026-07-12-YouTube-Inspiration-Bundle-User-Reflections]]"
  - "[[2026-07-12-YouTube-코딩몰라도-가능한-앱개발-클로드코드-하네스]]"
related:
  - "[[김규태]]"
  - "[[MOC-Portfolio]]"
  - "[[AI-Augmented Developer Positioning]]"
  - "[[AI 자동화는 개인 생산성 레버리지다]]"
  - "[[경제적 자유는 나의 북극성이다]]"
confidence: high
layer: entities
explored: true
claimType: project-evidence
evidenceScope: multi-source-mixed
verificationStatus: partial
status: active
---

# harness

## Overview

`harness`는 Codex CLI 기반 자율 구현 하네스다. 사용자의 한 줄 요구를 받아 단계별 sub-agent가 artifact를 통해 결과를 전달하고, phase 파일을 따라 직렬 구현까지 진행하는 파이프라인이다.

사용자 제공 원본 맥락에 따르면, 김규태는 Codex를 토큰 효율적이고 자동화 workflow를 만들기에 적합한 도구로 보았다. 이 관점은 harness뿐 아니라 Threads 자동 리서치/업로드 workflow에도 이어진다.

2026-07-12 YouTube inspiration bundle reflection에서 사용자는 바이브마피아의 하네스 레포를 보고 Codex 맞춤형으로 변형한 것이 자신의 `harness`이며, 이 `harness`를 사용해서 만든 것이 [[cuee]]라고 정리했다.

---

## Workflow Signal

- Python 기반 `scripts/run_phases.py` runner를 사용한다.
- `initial-plan`, `clarify`, `context-gather`, `plan`, `generate`, `evaluate` 단계로 작업을 나눈다.
- `.codex/skills/plan-and-build`, stage별 sub-agent prompt, task/phase artifact 구조를 갖는다.
- Codex CLI 실행 권한 플래그와 timeout, git skip 등을 환경 변수로 제어한다.
- 앱 개발과 제품화 실험에 맞게 개인화한 workflow로 이해한다.

---

## Threads Automation Evidence

김규태는 Codex와 토큰 기반 자동화 흐름을 활용해 Threads 계정에서 매일 저녁 6시에 AI agent 논문 활용 예시를 리서치하고 업로드하는 workflow를 구축했다고 기록했다.

- **Account**: https://www.threads.com/@arxiv.ai?hl=koo
- **Content concept**: 논문 작성에 AI agent를 어떻게 사용할 수 있는지 매일 설명하고, 좋은 예시와 나쁜 예시를 제시해 흥미를 유도
- **Reported outcome**: 만든 지 한 달 동안 팔로워 약 400명 확보
- **Verification status**: 사용자 제공 원문 기반. 실제 계정 지표, 코드, 스케줄러 설정, 실패 처리 로그는 추가 ingest 필요

이 사례는 `harness`와 별개 프로젝트로 분리할 수도 있지만, 현재는 Codex 기반 자동화와 AI 활용 포지셔닝을 보여주는 보조 증거로 연결한다.

---

## Portfolio Use

백엔드 취업 포트폴리오에서는 보조 프로젝트로 둔다. 직접 제품 기능보다 "AI를 활용해 개발 프로세스를 구조화하고, 요구사항에서 구현까지의 흐름을 artifact로 남기는 개발 습관"을 보여주는 프로젝트다.

면접 핵심 문장:

> Codex를 단순 코드 생성 도구로 쓰는 데서 그치지 않고, 요구사항 정리부터 phase별 구현까지 이어지는 Python 기반 개발 harness로 구조화했습니다.

---

## Evidence Gaps

- 커서맛피아님 harness에서 어떤 구조를 참고했는지
- 앱 개발에 맞게 수정한 구체 지점
- 개발 시간, 오류 감소, 문서화 품질 같은 효과
- Threads 자동 리서치/업로드 workflow의 실제 코드 위치
- 토큰 발급, 예약 실행, 업로드 실패 처리, 계정 성장 지표 증빙
- AI agent 논문 활용 콘텐츠에서 본인이 직접 기획한 부분과 자동화가 처리한 부분의 분리

---

## Sources

- https://github.com/gyutaetae/harness
- https://raw.githubusercontent.com/gyutaetae/harness/main/README.md
- [[2026-07-11-Kim-Gyutae-Personal-Raw-Context-v1]]
- [[2026-07-12-YouTube-Inspiration-Bundle-User-Reflections]]
- [[2026-07-12-YouTube-코딩몰라도-가능한-앱개발-클로드코드-하네스]]
- https://www.threads.com/@arxiv.ai?hl=koo
