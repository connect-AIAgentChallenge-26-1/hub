# GamePM Codex Workspace 기획서

## 1. 제품 정의

GamePM Codex Workspace는 별도 API, 서버, CLI, 웹 UI 없이 Codex와 저장소의
Markdown 문서만으로 동작하는 게임 기획·로컬 PM 보조 에이전트 작업장이다.

Codex는 저장소의 규칙, workflow, skill, template을 읽고 사용자의 요청을
분류한다. 분석과 초안 작성은 수행하지만, AI가 추론한 확정 기획 변경이나
태스크 후보는 승인 전 실제 관리 문서에 반영하지 않는다.

## 2. 문제 정의

- 아이디어와 확정 설정이 섞이면 현재 기준을 판단하기 어렵다.
- 설정 변경이 다른 문서, 리소스, 태스크에 미치는 영향을 추적하기 어렵다.
- 기획 자료에서 필요한 리소스와 제작 태스크를 반복해서 정리해야 한다.
- 태스크의 완료 여부와 마감일이 흩어지면 지연 상황을 빠르게 파악하기 어렵다.
- AI가 문서를 바로 수정하면 변경 이유와 승인 여부를 추적하기 어렵다.
- 작업을 다시 시작할 때 현재 초점과 미완료 작업을 재구성하는 비용이 든다.

## 3. 목표 사용자

### 개인 게임 기획자

- 게임 설정과 제작 정보를 Markdown으로 관리한다.
- 아이디어, 변경안, 확정 문서를 분리한다.
- AI의 분석과 초안을 검토한 뒤 반영 여부를 직접 결정한다.
- 태스크 완료 상태를 입력하고 현재 일정 상황을 요약받는다.

### Codex 작업 에이전트

- 저장소 안의 근거만 프로젝트 사실로 사용한다.
- 요청을 적절한 workflow로 분기한다.
- 누락 정보는 `TBD`와 질문으로 드러낸다.
- 승인 경계와 원본 재확인 절차를 지킨다.
- 외부 도구에 쓰거나 메시지를 보내지 않는다.

## 4. 운영 모델

```text
사용자 요청
  -> AGENTS.md와 intake workflow 확인
  -> 관련 workspace 문서 검색
  -> 요청 유형별 분석 또는 초안 생성
  -> 필요 시 Approval Queue 등록
  -> 사용자 결정
  -> 원본 재확인
  -> 확정 문서 또는 관리 문서 반영
  -> Decision Log / Version History 기록
```

저장소 하나가 게임 프로젝트 하나를 담당한다. `workspace/`가 프로젝트 상태,
`docs/`가 에이전트의 동작 규칙과 산출물 형식을 저장한다.

게임을 추가할 때는 새 프로젝트 저장소 또는 workspace를 만들고 해당 게임 전용
Project Brief와 Document Plan을 사용한다. 현재 저장소 안에서 여러 게임의 상태를
하나의 Document Plan으로 합치지 않는다.

### 4.1 문서 저장 역할

- Project Brief: 어떤 게임인지 설명하는 프로젝트 기준 정보
- Document Plan: 어떤 기획 문서가 필요하고 어디까지 작성됐는지 추적하는 목록
- Materials: 기획서 작성 전의 세계관, 시나리오, 메모 원본
- Approval Queue: 사용자 검토 전의 기획서 신규안과 변경안 전문
- Confirmed Design: 사용자 승인 후 확정된 실제 기획서 본문

Document Plan에는 기획서나 원본 자료의 본문을 넣지 않고 타입, 필요도, 상태,
이유, 관련 경로만 기록한다.

## 5. 핵심 기능

### 5.1 프로젝트 지식 관리

#### Project Brief

- 프로젝트명, 장르, 플랫폼, 엔진, 핵심 플레이 경험, 주요 콘텐츠 특징,
  현재 초점, 제약을 관리한다.
- 사용자가 제공하지 않은 항목은 `TBD`로 둔다.
- 검색과 분석 시 프로젝트의 최상위 맥락으로 사용한다.

#### Document Plan

- 장르, 핵심 플레이 경험, 주요 콘텐츠 특징을 바탕으로 필요한 기획 문서 타입을 추천한다.
- 세 추천 입력 중 하나라도 확인되지 않으면 구성을 추론해 저장하지 않고 먼저 질문한다.
- 지원 template의 이름과 용도를 사용자에게 먼저 알린다.
- 문서 타입별 필요도를 `required`, `recommended`, `excluded`로 제안한다.
- 9종을 모두 강제하지 않고 프로젝트에 해당하는 일부 타입만 선택해도 저장한다.
- 세계관이나 서사가 없는 게임에는 world_setting, narrative를 강제하지 않는다.
- 사용자 확인 후 문서 상태와 관련 경로를 `workspace/document_plan.md`에서 관리한다.
- 문서 상태는 `not_started`, `pending_approval`, `confirmed`, `needs_revision`,
  `needs_reconfirmation`을 사용한다.
- 계획 밖 문서도 허용하되 Document Plan에 추가할지 확인한다.
- Project Brief의 핵심 정보가 바뀌면 자동 수정하지 않고 `needs_review`를 알린다.
- 재검토 대상에는 장르뿐 아니라 핵심 플레이 루프, 스토리·스테이지·성장·경제
  구조, 플랫폼·입력 방식의 큰 변경이 포함된다.

#### Source Materials

- 대화, Markdown, TXT로 입력된 세계관, 시나리오, 메모를 확정 설계와 분리해 보관한다.
- Project Brief나 Document Plan이 아직 설정되지 않아도 원본 자료부터 등록할 수 있다.
- 원본 자료는 기본적으로 `reference`이며 사용자가 지정하면 `authoritative`로 표시한다.
- authoritative는 근거 우선순위이며 승인 없이 확정 사실이 되거나 기존 설계를 덮어쓰지 않는다.
- 자료 등록만으로 기획서를 만들지 않고 사용자의 명시적 작성 요청을 기다린다.
- 기획서 작성 시 원본 hash와 사용된 사실을 추적한다.
- 1차 지원 형식은 대화 입력, Markdown, TXT이며 PDF와 DOCX는 변환 후 등록한다.

#### Temporary Ideas

- 확정 반영 요청이 없는 아이디어를 미승인 정보로 저장한다.
- 원문, 날짜, 출처, 관련 문서 후보를 구분한다.
- 확정 문서와 검색 결과에서 명확히 분리한다.

#### Project Search

- Project Brief, Document Plan, 확정 설계, 결정, 버전, 승인 항목, 원본 자료,
  리소스, 태스크, 아이디어 순으로 검색한다.
- 답변에는 가능한 한 파일 경로와 근거 위치를 포함한다.
- 확정 정보, 승인 대기 정보, 임시 아이디어를 구분한다.
- 근거가 없으면 추정하지 않고 정보 부족을 알린다.

### 5.2 게임 기획 보조

#### 요청 분류

- `temporary_idea`: 확정 반영 요청이 없는 아이디어
- `material_intake`: 대화, Markdown, TXT 원본 자료 등록
- `material_to_design`: 등록 원본으로 기획서 신규안 또는 변경안 작성
- `document_plan`: 프로젝트별 기획 문서 구성 추천과 갱신
- `document_change`: 신규 문서, 기존 문서 변경, 자료 취합, 기획서화
- `project_search`: 기존 프로젝트 정보 검색과 요약
- `approval_decision`: 승인, 보류, 수정 요청, 거부
- `resource_extraction`: 자료에서 리소스와 태스크 후보 추출
- `task_update`: 사용자가 명시한 태스크 정보 또는 상태 갱신
- `schedule_status`: 현재 태스크 일정과 지연 현황 조회
- `workspace_recovery`: 현재 작업 맥락 복구

#### 문서 변경 분기

문서 관련 요청은 검색 후 다음 하나로 분기한다.

- `create_new_document`
- `update_existing_document`
- `compile_from_sources`
- `draft_design_from_materials`
- `ask_for_clarification`

#### 문서 작성과 보완

- system, world_setting, narrative, character, quest, item, level,
  balance_economy, ui 전문 template을 지원한다.
- npc는 character, 시나리오·스토리는 narrative, 맵·스테이지·던전은 level,
  밸런스·경제는 balance_economy의 별칭으로 처리한다.
- 요청과 기존 문서로 타입이 하나면 자동 선택하고 사용 template을 알린다.
- 둘 이상의 타입이 가능하거나 범용 template이 필요하면 후보와 이유를 질문한다.
- 전문 타입에 맞지 않는 장르 고유 문서는 범용 template을 사용한다.
- resource, meeting_note, task는 별도 전용 workflow로 처리한다.
- 자료에 없는 세부 설정은 창작하지 않고 `TBD`로 둔다.
- 답하지 않은 필드는 질문하고, 사용자가 미정이라고 확인하면 `TBD`, 적용되지
  않음을 확인하고 사유를 주면 `N/A`로 기록한다.
- 첫 입력에 unanswered가 있으면 파일을 만들지 않고 부족한 필드를 한 번에 알린다.
- 사용자의 후속 답변으로 모든 필드가 실제 값, `TBD`, `N/A - 사유` 중 하나가
  된 뒤 readiness를 다시 검사한다.
- administrative metadata, 제목, source 경로를 제외한 실제 기획 정보가 하나 이상 있어야 저장한다.
- 모든 내용이 `TBD`·`N/A`이거나 답하지 않은 필드가 남으면 저장하지 않는다.
- 저장 조건을 충족하면 별도 incomplete draft 파일 없이 Approval Queue에 자동 저장한다.
- 설정과 구현·리소스·QA 메모를 분리한다.

#### 자료 기반 기획서 작성

- 사용자가 원본 자료를 지정해 작성을 요청했을 때만 분석을 시작한다.
- 기존 확정 문서와 주제를 비교해 신규 문서 또는 기존 문서 변경안으로 분기한다.
- 하나의 원본에서 여러 전문 문서가 가능하면 후보 목록을 보여주고 개별 작성한다.
- 사용자가 선택하지 않은 후보는 `unselected`로 유지하고, 명시적으로 제외하면 `skipped`로 기록한다.
- 자료끼리 또는 확정 문서와 상충하면 임의로 병합하지 않고 차이와 authority를 제시한다.
- 원본과 대상 문서 hash를 승인 항목에 기록하고 적용 직전에 모두 재확인한다.

#### 충돌·영향·신뢰도·추천 분석

- 확정 설정, 용어, 중복 문서, 범위 확장, 제작 영향과의 충돌을 확인한다.
- NPC, Quest, Item, Dialogue, UI, Resource, Task 영향을 구분한다.
- 근거의 수와 품질, 누락 정보에 따라 confidence를 `high`, `medium`, `low`로 표시한다.
- 추천안은 근거, 장점, 단점, 영향 범위를 포함하며 확정 사실과 구분한다.

### 5.3 리소스와 태스크 관리

#### Resource Extraction

- 기획서, 시나리오, 회의 자료에서 NPC, Dialogue, Item, Quest, UI, Effect,
  Sound, Cutscene 후보를 추출한다.
- 각 후보에 원본 출처와 관련 문서를 연결한다.
- 기존 확정 리소스와 이름·역할이 겹치면 중복 가능성을 표시한다.
- AI가 추론한 리소스는 승인 후 `workspace/resources/`에 반영한다.

#### Task Management

- 리소스와 기획 변경에서 기획, 프로그래밍, 아트, 사운드, QA 태스크 후보를 만든다.
- 태스크는 ID, 제목, 분류, 출처, 마감일, 상태, 완료일, 마지막 변경일을 가진다.
- 상태는 `incomplete`와 `complete`만 사용한다.
- AI가 추론한 태스크 후보는 승인 후 task board에 반영한다.
- 사용자가 직접 명시한 태스크 추가·수정·완료 처리는 별도 승인 없이 반영한다.

### 5.4 로컬 PM 현황 보고

- 미완료이며 마감일이 지난 태스크를 `지연`으로 분류한다.
- 미완료이며 마감일이 남은 태스크는 기준일로부터 남은 일수를 표시한다.
- 마감일이 없는 미완료 태스크는 `일정 미정`으로 분류한다.
- 완료 태스크 수, 전체 태스크 수, 완료율을 요약한다.
- 마감일이 오늘인 태스크는 `D-Day`, 이후는 `D-N`, 지났으면 `D+N`으로 표시한다.
- AI는 완료 여부를 추정하거나 상태·마감일을 자율 변경하지 않는다.
- 일정 재배정, 자동 리마인더 발송, 담당자 평가는 제공하지 않는다.

### 5.5 승인과 이력 관리

#### Approval Queue

- 상태는 `pending`, `approved`, `applied`, `on_hold`, `change_requested`,
  `rejected`, `needs_reconfirmation`을 사용한다.
- "승인한다", "적용한다"처럼 대상과 의도가 명확한 표현만 승인으로 처리한다.
- "좋아 보임", "괜찮네" 같은 평가는 승인으로 보지 않는다.
- 적용 직전 대상 문서와 동일 주제 문서를 다시 검색한다.
- 원본이나 근거가 변경됐으면 적용하지 않고 `needs_reconfirmation`으로 전환한다.
- 자료 기반 기획서가 적용되면 Document Plan과 source index의 상태를 함께 갱신한다.
- pending, needs_revision, needs_reconfirmation, unselected 후보가 하나라도 있으면 원본을 삭제하지 않는다.
- 한 원본의 모든 후보가 confirmed 또는 skipped가 되면 tombstone을 먼저 기록하고
  `workspace/materials/inbox/`의 등록 복사본만 마지막 단계에서 자동 삭제한다.
- 삭제 후에도 source ID, hash, 관련 확정 문서, 결정, 삭제일은 tombstone으로 남긴다.
- 저장소 밖 사용자 파일과 source index는 자동 삭제하지 않는다.
- 삭제에 실패하면 `delete_failed`로 남기고 이미 적용된 확정 문서는 되돌리지 않는다.
- 자동 삭제 후 원본 전문은 복구할 수 없으며 tombstone과 Decision Log의 사용 사실 요약만 남는다.

#### Decision Log와 Version History

- 승인, 거부, 보류, 수정 요청의 이유와 후속 작업은 Decision Log에 기록한다.
- 승인 후 확정 설계 문서에 실제 반영된 create, update, delete만 Version History에 기록한다.
- 단순 태스크 상태 변경은 Decision Log와 Version History 대상이 아니다.

### 5.6 작업 재개

- Project Brief의 현재 초점을 확인한다.
- 미완료·지연 태스크와 승인 대기 항목을 요약한다.
- 최근 Decision Log와 Version History를 확인한다.
- 이전 대화 내용을 추정하지 않고 저장소에 남은 정보만 사용한다.

## 6. 승인 경계

승인 없이 가능한 작업:

- 검색, 요약, 질문 생성, 충돌·영향 분석
- 기획서·변경안·리소스·태스크 후보 작성
- Document Plan 추천과 사용자 확인 내용 반영
- 원본 자료 등록과 source index 갱신
- 일정 현황과 작업 재개 보고
- 사용자가 직접 명시한 태스크 정보와 완료 상태 반영

명시적 승인 후 가능한 작업:

- `workspace/design/`의 확정 기획 문서 생성·수정·삭제
- AI가 추론한 리소스 또는 태스크 후보의 확정 목록 반영
- 승인 항목의 `applied` 처리
- 자료 기반 승인 적용 후 소비 완료된 inbox 원본 삭제

## 7. 제외 범위

- OpenAI API 직접 호출
- 독립 실행 CLI, 백엔드 서버, 웹 UI, 대시보드 화면
- GitHub, Notion, Slack, Discord, Unity 직접 연동
- 외부 메시지 발송과 자동 데이터 동기화
- 다중 프로젝트 자동 관리
- AI의 자율 일정 변경, 담당자 평가, 상태 추정
- 대화 기록 자체를 저장하거나 복원하는 기능

## 8. 완료 기준

- 모든 핵심 기능이 workflow, skill, template, workspace 산출물 중 필요한 구현과 연결된다.
- `docs/checklist.md`가 기능별 개발 상태와 검증 결과를 추적한다.
- 검색 답변이 출처와 확정 상태를 구분한다.
- 승인 전 확정 설계와 AI 추론 태스크·리소스가 반영되지 않는다.
- 승인 적용 시 원본 재확인과 결정·버전 기록이 함께 수행된다.
- 전문 template 추천과 Document Plan 상태가 실제 문서 흐름과 일치한다.
- 자료 기반 변경은 대상과 source hash를 모두 재확인하고 소비 완료 원본만 삭제한다.
- 태스크 현황 보고가 완료, 지연, 남은 기간, 일정 미정 상태를 일관되게 계산한다.
- 대표 사용자 시나리오가 문서 기반 검증 절차를 통과한다.
