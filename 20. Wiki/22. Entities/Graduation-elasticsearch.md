---
type: wiki-page
aliases:
  - Graduation Elasticsearch
description: JavaParser-based source-test traceability analysis repository for Elasticsearch Java Client sources.
author:
  - Codex
date created: 2026-07-10
date modified: 2026-07-10
tags:
  - project
  - research
  - java
  - elasticsearch
source:
  - https://github.com/gyutaetae/Graduation-elasticsearch
  - https://raw.githubusercontent.com/gyutaetae/Graduation-elasticsearch/master/README.md
related:
  - "[[김규태]]"
  - "[[MOC-Portfolio]]"
confidence: high
layer: entities
explored: true
claimType: project-evidence
evidenceScope: github-readme
verificationStatus: github-readme-verified
status: active
---

# Graduation-elasticsearch

## Overview

`Graduation-elasticsearch`는 JavaParser 기반 source-test traceability 분석을 위한 연구/학습 저장소다. Elasticsearch Java Client source tree를 대상으로 test Java file에서 source Java file로 이어지는 strict `TEST FILE -> SOURCE FILE` link set을 추출한다.

---

## Research And Backend Signal

- JavaParser AST 분석, `MethodCallExpr` 추출, Symbol Solver resolution을 사용한다.
- parser는 Java로 구현되어 있으며, PowerShell runner가 JavaParser jar를 내려받고 `javac`로 컴파일해 실행한다.
- output은 `source_list_generated.csv`, `test_list_generated.csv`, `source_test_generated.csv`, `method_call_edges.csv`, `unresolved_calls.csv`, `parser_summary.json` 등으로 나뉜다.
- README 기준 verified summary는 source files `3460`, test files `114`, method calls `5486`, resolved calls `3479`, final test-source links `694`다.

---

## Portfolio Use

백엔드/데이터 직무에서는 대규모 Java 코드베이스를 분석하고, AST와 symbol resolution을 통해 구조화된 link data를 생성한 경험으로 포지셔닝한다. 학부연구생 경험과 연결하기 좋다.

면접 핵심 문장:

> Elasticsearch Java Client 코드를 대상으로 JavaParser와 Symbol Solver를 사용해 테스트 파일과 소스 파일 간 trace link를 추출하고, 694개의 최종 source-test link를 CSV와 진단 파일로 검증했습니다.

---

## Evidence Gaps

- 연구실에서 이 프로젝트가 맡은 역할
- 논문/졸업 연구와의 연결
- 본인이 작성한 parser 코드 범위
- unresolved call 처리 기준
- 결과를 어떤 분석 또는 논문 방향으로 사용할지

---

## Sources

- https://github.com/gyutaetae/Graduation-elasticsearch
- https://raw.githubusercontent.com/gyutaetae/Graduation-elasticsearch/master/README.md
