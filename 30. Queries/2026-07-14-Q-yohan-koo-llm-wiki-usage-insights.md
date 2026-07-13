---
type: query-result
aliases:
  - Yohan Koo LLM Wiki Usage Insights
description: Summary of Yohan Koo's lecture insights on how to use Obsidian LLM Wiki, including practical tips and his own usage patterns.
author:
  - Codex
date created: 2026-07-14
date modified: 2026-07-14
tags:
  - query
  - llm-wiki
  - obsidian
  - learning
  - yohan-koo
source:
  - "[[2026-07-07-에이전트를-위한-지식-베이스-LLM-Wiki-활용]]"
  - "[[LLM Wiki as Learning Base]]"
  - "[[Mothership-Satellite Vault Pattern]]"
  - "[[Agent-Readable Metadata]]"
  - "[[Obsidian Tooling for LLM Wiki]]"
  - "[[Human-AI Knowledge Boundary]]"
reusableFor:
  - Codex 개발 워크플로
  - 독서/책/학습
  - 에세이/블로그
confidence: medium
---

# 구요한 대표의 LLM Wiki 사용 인사이트

## Query

구요한 대표는 Obsidian LLM Wiki를 어떻게 사용하면 좋다고 말했는가? 사용 팁, 강의 인사이트, 본인의 활용 방식은 무엇인가?

## Name Note

원본 STT에는 `구요한`, `구현`, `구안` 등이 섞여 전사되어 있다. KIST 강의 소개에서는 `컴디 스페이스 구요한 대표님`으로 소개되므로 이 Query에서는 같은 인물로 보고 `구요한 대표`로 표기한다.

## Core Thesis

구요한 대표의 핵심 관점은 LLM Wiki를 "내가 이미 아는 지식 보관소"가 아니라, 내가 관심을 보였지만 아직 완전히 설명할 수 없는 지식을 공부 가능한 구조로 바꾸는 학습 전초기지로 쓰라는 것이다. [[LLM Wiki as Learning Base]]는 이 관점을 `관심 신호 -> Raw Source -> LLM 컴파일 Wiki -> 사용자의 탐색/검증` 흐름으로 정리한다.

이 시스템의 가치는 최신 웹 검색을 대체하는 데 있지 않다. 강의에서는 웹 검색 기능이 강해졌는데도 왜 로컬에 모아야 하느냐는 질문을 던진 뒤, 사람의 기억과 학습 한계를 보완하기 위해 "내가 어디에 관심을 보였는지"를 AI가 알게 해야 한다고 설명한다.

## Main Insights

### 1. 관심을 보였다는 사실 자체가 중요한 데이터다

카카오톡 나에게 보내기에 기사, GitHub repo, 뉴스가 쌓이는 것은 "나중에 볼 자료"라기보다 "내가 이 주제에 관심을 가졌다"는 신호다. LLM Wiki는 이 관심 신호를 그냥 버리지 않고, source-backed 학습 카드로 바꾼다.

### 2. LLM Wiki는 stretch goal을 만든다

강의에서는 교육학의 `stretch goal` 관점이 나온다. 너무 먼 목표가 아니라 조금 더 노력하면 닿을 수 있는 학습 목표가 있어야 학습이 잘 일어난다는 의미다. LLM Wiki는 어려운 자료를 바로 완전히 이해하게 만드는 도구가 아니라, 사용자가 읽고 질문할 수 있는 중간 지도와 카드로 낮춰 주는 역할을 한다.

### 3. AI가 쓴 지식과 내가 아는 지식을 분리해야 한다

구요한 대표는 AI가 만들어 준 결과물을 내가 이미 아는 것처럼 착각하는 문제를 중요하게 본다. 그래서 메인 볼트와 LLM Wiki 볼트를 분리한다. [[Mothership-Satellite Vault Pattern]] 기준으로 메인 볼트는 사용자가 직접 설명할 수 있는 지식, 위성 LLM Wiki는 AI가 raw source를 컴파일한 학습 재료다.

### 4. 메타데이터는 사람용 장식이 아니라 에이전트용 라우팅 표면이다

YAML frontmatter의 `title`, `description`, `source`, `related`, `category`, `collectionPurpose` 같은 필드는 LLM이 먼저 읽는 표지판이다. [[Agent-Readable Metadata]] 관점에서 메타데이터는 모든 본문을 한 번에 읽지 않고 관련 자료만 drill down하게 만드는 progressive disclosure 장치다.

### 5. Query는 질문 결과도 지식으로 남기기 위한 장치다

강의에서 Query 명령은 단순 질의응답이 아니라, 질문 내용과 답변 결과를 `Queries` 폴더에 남기는 방식으로 설명된다. 사용자는 나중에 자신이 어떤 질문을 했는지, 어떤 자료를 근거로 답이 나왔는지 다시 읽을 수 있다. 따라서 Query는 휘발성 대화가 아니라 학습 흔적을 남기는 인터페이스다.

### 6. 많이 쌓여도 메타데이터와 폴더 구조가 있으면 필터링 가능하다

구요한 대표는 메인 볼트에 만 개가 넘는 노트가 있어도 메타데이터와 폴더 구조로 충분히 필터링할 수 있다고 본다. 노트가 많아지는 것 자체보다 `type`, `category`, `source`, `purpose`, `folder` 같은 슬라이스가 있느냐가 중요하다.

## Practical Tips

1. 웹 자료는 Web Clipper로 바로 Wiki에 쓰지 말고 Inbox에 먼저 넣는다.
2. 캡처할 때 왜 저장했는지 짧게 남긴다.
3. 가능하면 `#` 같은 검색 힌트나 목적 키워드를 함께 남긴다.
4. `/ingest`가 "왜 모았는가?"를 묻게 하고, 그 답을 `collectionPurpose`로 보존한다.
5. 잘 아는 지식은 메인 볼트, 아직 공부 중인 지식은 LLM Wiki에 둔다.
6. LLM이 만든 Wiki를 그대로 아는 척하지 말고 직접 읽고 검증한다.
7. 메타데이터 description은 영어로 쓰면 에이전트가 더 빠르게 파악하기 좋다.
8. Obsidian에는 markdown 중심으로 두고, PDF/HTML/코드/대형 파일을 무작정 넣어 렌더링을 느리게 만들지 않는다.
9. Graph View로 허브와 고립 노드를 확인한다.
10. 규모가 커지면 qmd 같은 로컬 검색/인덱싱 도구를 붙인다.
11. 모든 논문이나 자료를 풀 ingest하지 말고, 중요도와 내가 읽었는지 여부에 따라 full text/abstract/commentary 수준을 조절한다.
12. Query, lint, audit, verify 같은 명령을 만들어 반복 운영을 자동화한다.

## How He Uses It

구요한 대표는 자신의 메인 볼트와 LLM Wiki 볼트를 분리해서 쓴다. 강의에서는 메인 볼트를 `마더십/모선 볼트`, LLM Wiki 볼트를 `세틀라이트/위성`으로 설명한다. 그는 실제로 용도와 공유 대상에 따라 여러 볼트를 쓰며, 강의 transcript 기준으로 약 여덟 개 볼트를 사용한다고 말한다.

그의 메인 볼트에는 직접 설명할 수 있는 개념, 강의 자료의 기반이 되는 성숙한 지식, 산출물, 커리큘럼, 규칙 파일이 들어간다. 반면 LLM Wiki에는 아직 공부하고 싶은 기술 자료, 논문, GitHub repo, Starlink mounting 같은 조사 자료, BM25/qmd/Obsidian plugin/MCP tunnel 같은 탐색 대상이 들어간다.

본인은 LLM Wiki를 다음 방식으로 활용한다.

- 관심 자료를 캡처하고 Inbox에 모은 뒤 ingest한다.
- 위키가 만든 concepts/entities/guides/maps를 직접 읽으면서 공부한다.
- 원본이 필요하면 Raw Source로 내려가 확인한다.
- Query를 날려 학술적 가치, harness engineering, context management, Sakana 관점 평가 같은 질문을 남긴다.
- Query 결과에는 질문 자체와 사용한 검색 방식, 관련 자료가 함께 남도록 한다.
- 메인 볼트와 위키 볼트를 cross-reference해서 위키의 학습 자료와 본인의 성숙한 지식을 연결한다.
- Task management workspace와 LLM Wiki를 함께 써서 우선순위와 공부/연구 헤드를 정리한다.
- lint/audit/verify/status 같은 명령으로 Wiki를 관리한다.

## For This Vault

김규태의 현재 vault는 standalone mode라 완전한 mothership 연결은 없다. 그래도 구요한 대표의 핵심 원칙은 그대로 적용된다.

- Inbox에는 "관심을 보인 자료"를 넣는다.
- Ingest할 때 `왜 저장했는지`를 반드시 남긴다.
- Query는 재사용 가능한 질문만 저장한다.
- AI가 컴파일한 Wiki를 곧바로 "내 지식"으로 착각하지 않고, `explored`와 `verificationStatus`를 통해 학습 상태를 분리한다.
- 독서/책/학습, Codex 개발 워크플로, 경제적 자유/FIRE/레버리지 같은 Core Context 축으로 자료를 라우팅한다.

## Quality Gaps

- 주요 강의 기반 페이지들은 `verificationStatus: unverified`이고, 강의 단일 source 기반이므로 외부 검증은 제한적이다.
- transcript의 STT 품질 때문에 인명과 일부 기술명은 흔들린다.
- 구요한 대표의 현재 실제 운영 방식은 2026-07-07 강의 transcript 기준이며, 이후 바뀌었을 수 있다.

## Reuse Axis

이 답변은 Codex 개발 워크플로, 독서/책/학습, 에세이/블로그에 활용 가능합니다. LLM Wiki를 단순 저장소가 아니라 관심 신호를 학습 가능한 지식 구조로 바꾸는 운영법으로 설명하기 때문이다.

