# Architecture

## 1. Overview

GamePM Codex Workspace는 코드 실행 제품이 아니라 문서 기반 게임 기획·로컬
PM 작업 환경이다.

```text
User
  -> Codex 입력창
    -> AGENTS.md
    -> docs/workflows/
    -> docs/skills/
    -> docs/templates/
    -> workspace/
```

Codex가 에이전트 실행부 역할을 하고, 이 저장소의 Markdown 파일들이 규칙, 메모리, 승인 상태, 산출물 역할을 한다.

## 2. Directory Roles

### `docs/workflows/`

작업 절차를 정의한다. Codex는 요청 유형에 맞는 workflow를 먼저 확인한 뒤 작업한다.
문서 관련 요청은 먼저 `document_change` workflow에서 검색과 분기를 수행한 뒤,
필요한 하위 workflow로 이동한다.

태스크, 일정, 리소스, 작업 재개 요청도 `intake`에서 전용 workflow로 분기한다.
프로젝트 설정은 Document Plan 추천으로 이어지고, 원본 자료 등록과 자료 기반
기획서 작성은 서로 다른 workflow로 처리한다.

### `docs/skills/`

반복적으로 쓰는 판단 기준과 품질 규칙을 정의한다. 예: 충돌 검토, 문서 보완 질문, 한국어 기획 문체.

### `docs/templates/`

산출물 형식을 정의한다. 승인 큐, 9종 전문 기획서, 범용 fallback, Document
Plan, source index, 결정 로그, 버전 기록은 template을 따른다.

### `workspace/`

실제 프로젝트 상태를 저장한다.

- `design/`: 승인된 확정 기획 문서
- `document_plan.md`: 필요한 문서 타입과 작성 상태
- `materials/`: 원본 복사본과 source 수명 주기
- `ideas/`: 임시 아이디어
- `approvals/`: 승인 대기 변경안
- `decisions/`: 결정 로그
- `versions/`: 버전 기록
- `resources/`: 승인된 제작 리소스 인벤토리
- `tasks/`: 사용자 입력 또는 승인된 로컬 태스크 보드

### `docs/dev-log/`

과거 개발 기록 보관용이다. 현재 아키텍처, 행동 규칙, workflow 정책의 근거로 사용하지 않는다.

## 3. Approval Boundary

Codex는 다음 작업을 승인 없이 수행할 수 있다.

- 문서 검색
- 요약
- 질문 생성
- 문서 요청 분기
- 자료 기반 기획서 초안 작성
- 변경안 초안 작성
- 승인 큐 항목 작성
- 충돌/영향도 분석
- 일정 현황과 작업 재개 보고
- 사용자가 직접 명시한 태스크 정보와 완료 상태 반영
- Document Plan 추천과 사용자 확인 결과 반영
- 대화, Markdown, TXT 원본 자료 등록

Codex는 다음 작업을 사용자 승인 없이 수행하지 않는다.

- `workspace/design/` 확정 문서 수정
- 승인 큐 항목을 적용 완료로 처리
- 결정 로그에 승인 결정을 기록
- 버전 기록에 반영 완료 기록
- AI가 추론한 리소스·태스크 후보의 확정 목록 반영
- 전문 기획서 신규안·변경안의 확정 설계 반영

## 4. Source Reconfirmation

승인된 변경안을 적용하기 전에는 대상 문서를 다시 읽는다.

- 대상 문서 내용이 변경안 작성 당시와 다르면 적용하지 않고 재확인 항목으로 남긴다.
- 변경안에 대상 문서나 근거가 불명확하면 적용하지 않고 질문을 만든다.
- 신규 문서 생성도 동일한 제목이나 주제가 이미 있는지 먼저 확인한다.

## 5. Document Change Routing

문서 관련 요청은 신규 생성이나 기존 문서 수정으로 바로 확정하지 않는다.
Codex는 먼저 관련 문서를 검색하고 다음 중 하나로 분기한다.

- `create_new_document`: 독립 문서로 분리하는 것이 자연스러운 경우
- `update_existing_document`: 기존 확정 문서 갱신이 자연스러운 경우
- `compile_from_sources`: 자료 정리, 요약, 출처 묶음이 목적일 경우
- `draft_design_from_materials`: 기존 자료를 기획서 형식으로 구조화할 경우
- `ask_for_clarification`: 분기나 대상 문서 판단 근거가 부족한 경우

## 6. Resource And Task Flow

```text
기획 자료
  -> 리소스·태스크 후보 추출
  -> Approval Queue
  -> 사용자 승인
  -> Resource Inventory / Task Board
```

사용자가 직접 명시한 태스크 정보와 완료 상태는 Approval Queue 없이 반영한다.
AI가 완료 여부, 마감일, 담당자를 추론해서 변경하는 것은 허용하지 않는다.

일정 보고는 task board를 읽어 완료율, 지연, 오늘 마감, 남은 기간, 일정 미정
항목을 계산하는 읽기 전용 흐름이다.

## 7. Document Planning And Material Flow

```text
Project Brief
  -> 9종 template 안내와 문서 구성 추천
  -> 사용자 확인
  -> Document Plan

원본 자료 등록
  -> Materials Inbox / Source Index
  -> 사용자 작성 요청
  -> 전문 문서 후보와 충돌 분석
  -> 개별 Approval Queue 항목
  -> 사용자 승인
  -> Confirmed Design / Document Plan 갱신
  -> 소비 완료 원본 삭제 / Source Tombstone 유지
```

전문 template 필드는 concrete, 사용자 확인 `TBD`, 사유가 있는 `N/A` 중 하나여야
한다. 실제 기획 정보가 하나도 없거나 unanswered가 남으면 승인 항목을 만들지 않는다.

자료 기반 승인 적용 전에는 대상과 source hash를 모두 비교한다. 원본 자동 삭제는
모든 선택 후보가 confirmed 또는 skipped이고 tombstone 기록이 끝난 뒤 inbox
복사본에만 수행한다.

## 8. Operating Model

이 저장소는 테스트 가능한 Python 패키지를 제공하지 않는다. 품질 관리는 문서 구조와 운영 규칙으로 한다.

기본 검증 기준:

- 요청 유형에 맞는 workflow를 따랐는가
- 산출물이 template 형식을 따르는가
- 승인 전 확정 문서가 수정되지 않았는가
- 승인 후 확정 설계가 변경됐다면 Decision Log와 Version History가 함께 갱신되었는가
- AI 추론 리소스·태스크가 승인 전 확정 목록에 들어가지 않았는가
- 일정 보고가 task board의 명시된 값만 사용했는가
- 전문 template과 Document Plan 상태가 연결됐는가
- 자료 기반 변경이 source 근거와 삭제 조건을 지켰는가
