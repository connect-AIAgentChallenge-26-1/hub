---
type: log
aliases:
  - Change Log
  - Wiki Log
  - Ingest Log
description: Chronological log of all wiki operations — ingests, queries, lint fixes, and structural changes. Append-only; entries use `## [YYYY-MM-DD] operation | title` prefix for grep-based parsing.
author:
  - "[[김규태]]"
date created: 2026-07-07
date modified: 2026-07-12
tags:
  - system
  - log
status: active
---

# 📝 LLM Wiki — Change Log

> 모든 wiki 변경사항을 시간순으로 기록합니다. **Append-only** — 기존 항목을 수정하지 마세요.
>
> **Entry format (Karpathy-style)**: `## [YYYY-MM-DD] operation | title`
>
> **Quick scan**:
>
> ```bash
> grep "^## \[" log.md | tail -10   # 최근 10개 operation
> grep "^## \[.*\] ingest" log.md   # ingest만 필터
> ```
>
> **Operations**: `ingest`, `update`, `create`, `lint`, `query`, `restructure`, `cleanup`

---

## [2026-04-12] ingest | Karpathy LLM Wiki Gist (example)

- Source: [[2026-04-12-Karpathy-LLM-Wiki]]
- Origin: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- Raw Source 저장: `10. Raw Sources/11. Articles/`
- Wiki 페이지 생성 (10):
	- Concepts (4): [[LLM Wiki Pattern]], [[RAG vs Compiled Wiki]], [[3-Layer Architecture]], [[Ingest-Query-Lint Cycle]]
	- Entities (3): [[Andrej Karpathy]], [[Vannevar Bush]], [[Memex]]
	- Guides (1): [[Obsidian Tooling for LLM Wiki]]
	- Maps (2): [[MOC-Knowledge Management]], [[MOC-LLM Wiki Guide]]
- **예시 ingest** — 이 볼트가 어떻게 성장하는지 보여주기 위한 샘플. 본인 소스 ingest 시작 시 이 entry 아래에 append.

## [2026-07-07] create | Vault initialized

- Cloned from [cmds-llm-wiki template](https://github.com/johnfkoo951/cmds-llm-wiki)
- Core Context 채움 완료 (§1 정체성, §2 재활용 축, ...)
- 첫 ingest 진행 예정

## [2026-07-07] ingest | 에이전트를 위한 지식 베이스 : LLM Wiki 활용

- Source: [[2026-07-07-에이전트를-위한-지식-베이스-LLM-Wiki-활용]]
- Origin: https://www.youtube.com/watch?v=MRTQwBFURJs&t=1317s
- Collection purpose: 학술/CMDS 시스템 — 내가 앞으로 LLM Wiki를 공부하기 위한 학습 자료
- Raw Source 저장: `10. Raw Sources/11. Articles/`
- Mode: A standalone — mothership search skipped, `mainVaultRelated` / `mainVaultCmds` left empty
- Wiki 페이지 생성 (7):
	- Concepts (4): [[LLM Wiki as Learning Base]], [[Mothership-Satellite Vault Pattern]], [[Agent-Readable Metadata]], [[Human-AI Knowledge Boundary]]
	- Entities (2): source-specific lecture entities later removed during local owner cleanup
	- Guides (1): [[Web Clipper to Inbox Workflow]]
- Wiki 페이지 업데이트 (6):
	- Concepts (3): [[LLM Wiki Pattern]], [[3-Layer Architecture]], [[Ingest-Query-Lint Cycle]]
	- Guides (1): [[Obsidian Tooling for LLM Wiki]]
	- Maps (2): [[MOC-Knowledge Management]], [[MOC-LLM Wiki Guide]]
	- Index (1): [[index]]

## [2026-07-07] query | LLM Wiki 볼트의 학술적 가치

- Query: LLM Wiki 볼트의 학술적 가치와 Zotero/Bookends 서지정보 인용 연동 가능성
- Saved: [[2026-07-07-Q-LLM-Wiki-vault-academic-value]]
- Source pages: [[LLM Wiki Pattern]], [[RAG vs Compiled Wiki]], [[3-Layer Architecture]], [[Ingest-Query-Lint Cycle]], [[LLM Wiki as Learning Base]], [[Agent-Readable Metadata]], [[Human-AI Knowledge Boundary]], [[Idea Generation Pipeline]], [[Track Classification and Research Gap Detection]], [[Obsidian Tooling for LLM Wiki]]
- Durable gap captured: [[Citation Manager Integration for LLM Wiki]] guide stub created
- Reuse axis: PhD / 학술 / CMDS 시스템

## [2026-07-07] update | Portfolio Evidence Wiki setup

- Updated: [[Core Context]]
- Created: [[MOC-Portfolio]]
- Purpose: 이 vault를 취업 포트폴리오 관리용 Evidence Wiki로 운영하기 위한 재활용 축, 프로젝트 spine, ingest/query 기준 정렬
- Portfolio spine: `financial-order-latency-lab -> cuee -> harness`
- Reuse axis: 취업/포트폴리오

## [2026-07-10] update | Local setup placeholders filled

- Updated: [[Core Context]], [[AGENTS]], [[CLAUDE]], [[index]], settings templates
- Replaced author placeholder with `김규태`
- Replaced local vault path placeholders with `C:\Users\kym70\OneDrive\Desktop\cmds-llm-wiki-work\cmds-llm-wiki`
- Copied qmd config to `C:\Users\kym70\.config\qmd\index.yml`
- Mode: A standalone — mothership placeholders intentionally left only in optional Mode B documentation/examples

## [2026-07-10] cleanup | Owner identity and inherited entities corrected

- Restored owner display name to [[김규태]]
- Removed inherited lecture/source entity pages from active Wiki
- Created [[김규태]] owner entity draft
- Updated [[index]] and [[MOC-Knowledge Management]] to point to [[김규태]]
- Left raw source transcripts intact unless a separate purge is requested

## [2026-07-10] update | 김규태 취업 포트폴리오 맥락 고도화

- Updated: [[Core Context]], [[김규태]], [[MOC-Portfolio]]
- Added current profile: 개발자 취업준비생, 대학교 3학년, 학부연구생, 경남 진주시 거주
- Added public profiles: GitHub, Velog, LinkedIn, Instagram
- Clarified portfolio purpose: 개발자 취업
- Expanded project spine:
	- `financial-order-latency-lab`: 데이터베이스 수업 프로젝트, 설계·성능 개발
	- `cuee`: 경남권 창업동아리 대상작, 노인 모빌리티 예약 길잡이 앱
	- `harness`: 커서맛피아님 harness를 참고해 앱 개발용으로 개인화한 Codex workflow
- Added positioning tone: 취업준비생 입장에서 열정과 성장가능성이 드러나되, 설계·성능·개발·팀 리딩 근거를 우선

## [2026-07-10] update | GitHub 기반 백엔드 포트폴리오 재정렬

- Updated: [[Core Context]], [[김규태]], [[MOC-Portfolio]], [[index]]
- Created project pages: [[financial-order-latency-lab]], [[Graduation-elasticsearch]], [[cuee]], [[harness]]
- Source reviewed: GitHub profile `gyutaetae` public repositories and README files
- Repositioned target role: 백엔드 개발자 취업, 장기적으로 풀스택 개발자로 성장
- Clarified primary language: Python
- GitHub-based stack: Python, Java, Kotlin, TypeScript/React, JavaScript, C, Shell/PowerShell, Dockerfile, PLpgSQL
- Added `Graduation-elasticsearch` as research/backend evidence between `financial-order-latency-lab` and `cuee`

## [2026-07-11] ingest | 김규태 Personal Raw Context v1

- Source: [[2026-07-11-Kim-Gyutae-Personal-Raw-Context-v1]]
- Origin: User-provided raw terminal/chat text in Codex session
- Collection purpose: 나에 대한 장기 컨텍스트를 축적해 이력서, 면접, 포트폴리오, 블로그, 프로젝트 설명에 반복 재사용하기 위한 개인 원본 프로필
- Raw Source 저장: `10. Raw Sources/15. Clippings/`
- Mode: A standalone — mothership search skipped, `mainVaultRelated` / `mainVaultCmds` left empty
- Wiki 페이지 생성 (2):
	- Concepts (1): [[AI-Augmented Developer Positioning]]
	- Guides (1): [[김규태 Career Narrative]]
- Wiki 페이지 업데이트 (5):
	- [[Core Context]]
	- [[김규태]]
	- [[MOC-Portfolio]]
	- [[financial-order-latency-lab]]
	- [[harness]]
- Key context captured:
	- 목표 직무는 아직 단일 확정이 아니며 백엔드 / 금융 / 드론 / 반도체 도메인 탐색 중
	- 경상국립대학교 소프트웨어공학과 3학년, SEALAB 학부연구생
	- AI 의존 개발자가 아니라 AI를 개발 역량의 증폭기로 활용하는 개발자로 포지셔닝
	- `financial-order-latency-lab`의 시작 동기: 운영체제 수업 CPU latency와 금융 주문 처리 관심
	- Codex 기반 Threads 자동 리서치/업로드 workflow와 팔로워 약 400명 성과는 추가 증빙 필요
- Reuse axis: 취업/포트폴리오, 프로젝트 증거, Codex 개발 워크플로, 에세이/블로그

## [2026-07-12] ingest | 김규태 Leadership Product Context v2

- Source: [[2026-07-12-Kim-Gyutae-Leadership-Product-Context-v2]]
- Origin: User-provided raw chat text in Codex session, plus public Velog/GitHub links
- Collection purpose: 취업/포트폴리오 — 리더십, 교육, 창업/제품 문제정의, 해커톤 템플릿, 향후 보강할 증거를 원본 맥락으로 보존해 이력서와 면접 답변에 재사용
- Raw Source 저장: `10. Raw Sources/15. Clippings/`
- Mode: A standalone — mothership search skipped, `mainVaultRelated` / `mainVaultCmds` left empty
- Wiki 페이지 생성 (1):
	- Guides (1): [[김규태 Leadership and Teaching Evidence]]
- Wiki 페이지 업데이트 (5):
	- [[Core Context]]
	- [[김규태]]
	- [[cuee]]
	- [[MOC-Portfolio]]
	- [[index]]
- Key context captured:
	- `cuee`는 `배우담`의 후속 방향이며, 학습 과정 자체가 고통스럽다는 문제를 보고 현재 화면의 다음 버튼을 마스킹/안내하는 접근성 오버레이로 전환
	- `cuee` 팀 규모는 5명: 디자이너 2명, 기획 2명, 김규태 1명(개발자/팀장)
	- 김규태는 2026년 `실리콘밸리` 취업동아리 대표(20명: 학부생 15명, 교수 5명)
	- 김규태는 2026년 경상국립대학교 멋쟁이사자처럼 14기 부대표
	- GNU 해커톤 템플릿은 다음 달 대회에서 사용할 예정이며, 실제 결과/피드백은 추후 보강
	- 회의록, 예산/지원금 자료, 책 수요조사, 교수 피드백, 백엔드 세션 자료는 추후 Raw Source로 보강 예정
- Reuse axis: 취업/포트폴리오, 프로젝트 증거, 강의/수업/교육, 제품/창업

## [2026-07-12] ingest | Velog Leadership Product Hackathon Bundle

- Source: [[2026-07-12-Velog-Leadership-Product-Hackathon-Bundle]]
- Origin: Public Velog posts and GitHub README
- Collection purpose: 취업/포트폴리오 — 리더십, 제품 문제정의, 해커톤 준비, 백엔드 교육, 실제 고객 문제 해결 경험을 원문 증거로 보존해 이력서와 면접 답변에 재사용
- Raw Source 저장: `10. Raw Sources/15. Clippings/`
- Included sources:
	- `what is leadership?`
	- `실리콘밸리 1주차`
	- `실리콘밸리2`
	- `week2. silicon valley`
	- `멋쟁이사자 아이디어톤(1)`
	- `배우담 개발일지1`
	- `크몽 외주 일지`
	- `GNU_hackathon_templete` README
- Wiki 페이지 업데이트 (4):
	- [[김규태 Leadership and Teaching Evidence]]
	- [[cuee]]
	- [[MOC-Portfolio]]
	- [[index]]
- Reuse axis: 취업/포트폴리오, 강의/수업/교육, 제품/창업, 프로젝트 증거

## [2026-07-12] maintenance | Status count and wiki metadata coverage

- Updated status command docs to exclude `.gitkeep` placeholders from Inbox pending counts
- Added `explored: false` and `verificationStatus: unverified` to 17 legacy Wiki/MOC pages missing Exploration Gate and verification fields
- Updated `date modified` on touched Wiki pages to `2026-07-12`
- Result:
	- Inbox pending count now reports 0 real files when only `.gitkeep` placeholders exist
	- `explored` coverage: 31/31 Wiki pages
	- `verificationStatus` coverage: 31/31 Wiki pages
- Note: verification values were set conservatively to `unverified`; run `/verify` for claim-level confirmation

## [2026-07-12] context | Economic freedom, leverage, and reading axes

- Source: user-provided clarification in Codex session
- Updated: [[Core Context]]
- Purpose: 영상 transcript ingest 전에 취업 포트폴리오 증거와 개인 삶의 운영 지식을 분리하고, 경제적 자유/FIRE/레버리지 및 독서/책/학습 축을 쿼리 라우팅용으로 추가
- Key context captured:
	- 경제적 자유는 단기 은퇴 계획이 아니라 완전한 자유를 향한 북극성
	- 1순위 수단은 개발자 취업과 고연봉 커리어, 2순위는 투자와 자산관리
	- 자본 레버리지를 가장 큰 레버리지로 보며, 현재 약 7천만 원, 1억 원을 첫 임계점으로 인식
	- 투자 운영 가설은 반도체/기술주 2배 레버리지 ETF를 디벨롭몽의 웅덩이 매수법으로 장기 분할매수하는 전략
	- 현금 20% 유지, 생활비 대출은 내년까지 추가 400만 원 범위로 제한
	- 암호화폐는 고위험 성장자산으로 보며 전체 자산의 약 5%를 차지하고, 현재 기록 기준 비트코인 약 215만 원과 이더리움 약 113만 원을 보유
	- Threads는 Codex 자동화 시스템으로 만든 콘텐츠/브랜드 레버리지 사례이며 반복 운영까지 포함
	- `cuee`는 U300 전국 400개 팀 선정, 경남권 창업동아리대회 대상, 교내 창업대회 최우수상 이력이 있으며 Android accessibility 권한 심사가 주요 blocker이고 제품화 경험으로 우선 설명
	- 상위 Wiki 제목 후보는 `경제적 자유는 나의 북극성이다`를 우선으로 둠
	- 최근 감명 깊게 읽은 책은 롭 무어 `레버리지`와 이선 몰릭 `공동지능`
- Reuse axis: 경제적 자유/FIRE/레버리지, 독서/책/학습, Codex 개발 워크플로, 제품/창업

## [2026-07-12] inbox | YouTube inspiration bundle user reflections

- Source: user-provided per-video reflections in Codex session
- Created Inbox note: [[2026-07-12-YouTube-Inspiration-Bundle-User-Reflections]]
- Purpose: 13개 YouTube transcript ingest 전에 영상별로 사용자가 가져가고 싶은 생각을 분리 보존해, 나중에 Raw Source/Wiki 컴파일 시 영상 요약보다 사용자 해석을 중심에 두기 위함
- Key context captured:
	- AI는 기존 업무 보조를 넘어 암 치료 같은 인간의 궁극적 문제 해결로 갈 수 있다는 관점
	- 지식도 복리처럼 쌓이며, 매일 공부해 점을 만들고 나중에 연결하려는 독서 태도
	- 첫 1억 이전의 생활습관, 소비습관, 투자습관이 이후 자산 증가의 기초가 된다는 생각
	- FIRE 가능성을 염두에 두면 오히려 일을 더 잘할 수 있다는 관점
	- 바이브마피아 하네스 레포를 Codex 맞춤형으로 변형한 것이 `harness`이고, 그 하네스로 만든 것이 `cuee`
	- 멀티 에이전트 workflow에서는 직책 부여, 작은 단위 작업 분해, 추상화가 중요하다는 생각
	- 논픽션 중심 독서에서 픽션까지 섞어 읽어야 한다는 독서 균형 과제
	- 아직 0에서 1로 만든 것은 없지만, 개발 커리어와 제품이 세상에 알려지고 실제 사용되는 경험을 하고 싶다는 목표
	- `경제적 자유는 나의 북극성이다`를 이번 묶음의 상위 Wiki 페이지로 확정
	- 샘 올트먼 1인 유니콘 영상은 미래 1인 제품 가능성으로 연결
	- 픽션 독서 후보는 `은하수를 여행하는 히치하이커를 위한 안내서`, `이방인`, `변신`
	- `cuee`는 아직 0에서 1로 만든 경험이 아니라 0 to 1 후보 또는 초기 제품화 경험으로 기록
- Reuse axis: 경제적 자유/FIRE/레버리지, 독서/책/학습, Codex 개발 워크플로, 제품/창업, 취업/포트폴리오

## [2026-07-13] ingest | YouTube Shorts 몸값 높이는 독서법

- Source: [[2026-07-13-YouTube-Shorts-몸값-높이는-독서법]]
- Origin: `00. Inbox/01. Articles/몸값 높이는 독서법.md`
- Collection purpose: 독서와 학습을 취업 포트폴리오보다 경제적 자유/FIRE/레버리지 축에 더 강하게 연결하기 위해 수집. 사용자는 영상의 메시지에 동의하며, 자본주의 사회에서 능력과 시장가치를 키우는 태도를 장기 자유의 기반으로 기록하려고 함
- Raw Source 저장:
	- `10. Raw Sources/11. Articles/2026-07-13-YouTube-Shorts-몸값-높이는-독서법.md`
- Mode: A standalone — mothership search skipped, `mainVaultRelated` / `mainVaultCmds` left empty
- Wiki 페이지 업데이트 (3):
	- [[경제적 자유는 나의 북극성이다]]
	- [[독서는 판단력과 자산관리의 기반이다]]
	- [[레버리지를 당하지 않고 사용하는 삶]]
- Index 업데이트:
	- [[index]]
- Key context captured:
	- 이 쇼츠는 독서를 단순 취미나 취업 스펙이 아니라, 능력과 시장가치를 키워 선택권을 넓히는 수단으로 해석한다
	- 사용자는 개발자 취업 축보다 경제적 자유/FIRE/레버리지 축에 더 강하게 연결하기를 원했다
- Verification boundary:
	- 영상의 시장/능력주의 주장은 외부 관점이므로 검증된 사회과학 명제가 아니라 개인 운영 관점으로 보존한다
- Reuse axis: 경제적 자유/FIRE/레버리지, 독서/책/학습

## [2026-07-14] query | Sales and psychology book recommendations

- Source query: `Clippings/1등이 될 수 없다면 무기를 모아야 합니다 1.md`
- Saved query result: [[2026-07-14-Q-sales-psychology-book-recommendations]]
- Updated Wiki page:
	- [[독서는 판단력과 자산관리의 기반이다]]
- Index 업데이트:
	- [[index]]
- Key context captured:
	- 사용자는 세일즈와 심리학을 사람을 모으는 능력, 사람과 사람을 설득하는 능력으로 공부하고 싶어 한다.
	- 이 관심사는 본업 위에 상위 25% 보조 능력을 쌓는 전략이며, 독서/책/학습, 경제적 자유/FIRE/레버리지, 제품/창업 축에 연결된다.
- Reuse axis: 독서/책/학습, 경제적 자유/FIRE/레버리지, 제품/창업

## [2026-07-14] query | How to read sales and psychology books

- Source query: 세일즈와 심리학 책들을 읽을 때 어떻게 해야 잘 읽을 수 있는지에 대한 사용자 질문
- Saved query result: [[2026-07-14-Q-how-to-read-sales-psychology-books]]
- Updated Wiki page:
	- [[독서는 판단력과 자산관리의 기반이다]]
- Index 업데이트:
	- [[index]]
- Key context captured:
	- 세일즈/심리학 책은 요약보다 행동 실험으로 읽는다.
	- 한 권에서 하나의 실험만 뽑고, 실제 대화·팀 운영·제품 설명·글쓰기·면접 답변에 적용한 뒤 결과를 기록한다.
- Reuse axis: 독서/책/학습, 경제적 자유/FIRE/레버리지, 제품/창업

## [2026-07-14] query | Yohan Koo LLM Wiki usage insights

- Source query: 구요한 대표는 Obsidian LLM Wiki를 어떻게 사용하면 좋다고 말했는지, 강의 인사이트와 본인 활용 방식이 무엇인지에 대한 사용자 질문
- Saved query result: [[2026-07-14-Q-yohan-koo-llm-wiki-usage-insights]]
- Primary sources:
	- [[2026-07-07-에이전트를-위한-지식-베이스-LLM-Wiki-활용]]
	- [[LLM Wiki as Learning Base]]
	- [[Mothership-Satellite Vault Pattern]]
	- [[Agent-Readable Metadata]]
	- [[Obsidian Tooling for LLM Wiki]]
	- [[Human-AI Knowledge Boundary]]
- Index 업데이트:
	- [[index]]
- Key context captured:
	- LLM Wiki는 이미 아는 지식 보관소보다, 관심은 있지만 아직 설명할 수 없는 자료를 공부 가능한 형태로 만드는 학습 전초기지다.
	- 구요한 대표는 메인 볼트와 LLM Wiki 볼트를 분리하고, Query 결과와 질문 자체를 `Queries` 폴더에 남기는 방식으로 활용한다.
	- 메타데이터와 폴더 구조는 노트가 많아져도 필터링과 라우팅을 가능하게 하는 핵심 장치다.
- Quality gaps:
	- 강의 transcript의 STT 품질 때문에 인명과 일부 기술명이 흔들린다.
	- 본 답변은 2026-07-07 강의 transcript와 기존 Wiki 컴파일 기준이며, 이후 운영 방식은 별도 확인 필요.
- Reuse axis: Codex 개발 워크플로, 독서/책/학습, 에세이/블로그

## [2026-07-12] ingest | YouTube Inspiration Bundle For Economic Freedom North Star

- Source: [[2026-07-12-YouTube-Inspiration-Bundle-User-Reflections]] plus 13 YouTube transcript raw sources
- Origin: YouTube transcript markdown files copied from Desktop into Inbox, then user reflection captured in Codex session
- Collection purpose: 개발자로 성장해 고소득 커리어를 만들고, 자본 레버리지·AI 자동화·제품화·독서와 학습을 통해 경제적 자유라는 북극성에 가까워지기 위해 수집. 취업 포트폴리오 증거라기보다 개인 삶의 운영 지식이며, 투자/FIRE/AI/창업 관련 주장은 검증 필요 상태로 보존
- Raw Source 저장:
	- `10. Raw Sources/14. Transcripts/` — 13 YouTube transcript files
	- `10. Raw Sources/15. Clippings/` — 1 user reflection file
- Mode: A standalone — mothership search skipped, `mainVaultRelated` / `mainVaultCmds` left empty
- Wiki 페이지 생성 (6):
	- Maps (1): [[경제적 자유는 나의 북극성이다]]
	- Guides (1): [[개발자 커리어로 경제적 자유에 가까워지기]]
	- Concepts (4): [[레버리지를 당하지 않고 사용하는 삶]], [[자본 레버리지는 자유의 핵심 엔진이다]], [[AI 자동화는 개인 생산성 레버리지다]], [[독서는 판단력과 자산관리의 기반이다]]
- Wiki 페이지 업데이트 (2):
	- [[harness]]
	- [[cuee]]
- Index 업데이트:
	- [[index]]
- Key context captured:
	- 경제적 자유는 장기 북극성이며 개발자 커리어가 1순위 수단, 자본 레버리지가 2순위 수단
	- 첫 1억 이전의 생활습관·소비습관·투자습관이 이후 자산 증가의 기초
	- 자본 레버리지 전략은 `USD`, `QLD` 같은 반도체/기술주 2배 레버리지 ETF와 DCA/웅덩이 매수법 중심의 개인 운영 가설
	- AI 자동화는 Codex, [[harness]], Threads 반복 운영, 멀티 에이전트 workflow와 연결
	- [[harness]]는 바이브마피아 하네스 레포를 보고 Codex 맞춤형으로 변형한 것이며, [[cuee]]는 그 harness를 사용해 만든 초기 제품화 경험
	- 독서는 지식 복리와 판단력의 기반이며, 논픽션 편향을 보완하기 위해 픽션도 섞어 읽을 계획
- Verification boundary:
	- 투자, FIRE, AI, 1인 유니콘, 파생상품 모델 관련 외부 주장은 `verificationStatus: unverified`로 보존
	- 사용자 동기와 개인 운영 가설은 `user-original` 또는 `user-provided` 맥락으로 분리
- Reuse axis: 경제적 자유/FIRE/레버리지, 독서/책/학습, Codex 개발 워크플로, 제품/창업, 취업/포트폴리오
