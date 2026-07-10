# GamePM Codex Workspace

이 저장소는 OpenAI API로 실행되는 별도 제품이 아니라, Codex가 이 폴더의 규칙과 문서를 읽고 게임 기획 작업을 수행하는 로컬 문서형 에이전트 작업장이다.

Codex는 프로젝트별 기획 문서 구성 추천, 9종 전문 기획서 작성, 원본 자료
기반 신규·변경안 생성, 충돌 검토, 리소스·태스크 후보 추출, 일정 현황 보고,
승인 큐 정리, 결정 로그와 버전 기록 작성을 돕는다. 단, 확정 설계 문서와
AI가 추론한 리소스·태스크 후보는 사용자의 명시적 승인 이후에만 반영한다.

## Core Principle

### Human in the Loop

- Codex는 분석, 초안, 변경안, 질문, 검토 결과를 만든다.
- AI가 제안한 확정 설계·리소스·태스크 후보는 `workspace/approvals/approval_queue.md`에 둘 초안으로 취급한다.
- 사용자가 명시적으로 승인하기 전에는 `workspace/design/`의 확정 문서를 수정하지 않는다.
- 승인된 확정 설계 변경은 Decision Log와 Version History에 함께 기록한다.
- 승인된 리소스·태스크 후보는 Decision Log에 기록하고 확정 목록에 반영한다.
- 사용자가 직접 알려준 태스크 정보와 완료 상태는 task board에 반영할 수 있다.
- 일정 현황은 현재 task board만 분석하며 AI가 상태나 마감일을 추정하지 않는다.

## How To Use

Codex 입력창에서 이 저장소를 열고 자연어로 요청한다.

예시:

```text
docs/workflows/document_change.md 규칙에 따라 상점 NPC 설정 요청을 분기해줘.
확정 문서는 수정하지 말고 승인 큐 항목으로 작성해줘.
```

```text
docs/workflows/document_change.md 규칙에 따라 있는 자료들로 전투 기획서 초안을 만들어줘.
관련 문서를 먼저 확인하고 충돌 가능성도 같이 정리해줘.
```

```text
이 프로젝트의 장르, 핵심 플레이 경험, 주요 콘텐츠 특징을 기준으로
필요한 기획 문서를 추천하고 Document Plan 초안을 보여줘.
```

```text
이 세계관 메모를 원본 자료로 등록해줘. 아직 기획서는 만들지 마.
```

```text
SRC-20260711-001을 분석해서 만들 수 있는 전문 기획서 후보를 보여줘.
기존 확정 문서와 충돌도 같이 확인해줘.
```

```text
docs/workflows/document_change.md 규칙에 따라 전투 시스템 변경 요청을 검토해줘.
기존 문서 수정인지 신규 문서 생성인지 먼저 판정해줘.
```

```text
workspace/approvals/approval_queue.md의 첫 번째 항목을 승인할게.
승인 흐름에 따라 확정 문서, 결정 로그, 버전 기록을 갱신해줘.
```

```text
이 시나리오에서 필요한 리소스와 제작 태스크 후보를 추출해줘.
확정 목록에는 반영하지 말고 승인 큐 항목으로 작성해줘.
```

```text
TASK-003을 오늘 완료했어. 상태를 반영하고 현재 일정 현황을 알려줘.
```

```text
현재 저장소 기준으로 진행 중인 작업과 다음에 확인할 항목을 정리해줘.
```

## Repository Map

```text
AGENTS.md
README.md

docs/
  plan.md
  architecture.md
  checklist.md
  verification.md
  workflows/
  templates/
  skills/

workspace/
  project_brief.md
  document_plan.md
  materials/
    source_index.md
    inbox/
  design/
  ideas/
  approvals/
  decisions/
  versions/
  resources/
  tasks/
```

## Important References

- `AGENTS.md`: Codex가 이 저장소에서 반드시 지켜야 하는 전체 규칙
- `docs/workflows/`: 작업별 실행 절차. 문서 관련 요청은 `document_change`를 먼저 따른다.
- `docs/templates/`: 승인 큐, 9종 전문 기획서, 결정 로그, 버전 기록 템플릿
- `docs/skills/`: 반복 작업에 적용할 전문 규칙
- `docs/verification.md`: 기능 추적과 대표 시나리오 검증 결과
- `workspace/`: 실제 프로젝트 문서와 작업 상태

`docs/dev-log/`는 과거 개발 기록 보관용이다. 현재 행동 규칙, 아키텍처, 워크플로우 판단에는 사용하지 않는다.

## Verification

이 저장소에는 기본 Python 테스트나 런타임 의존성이 없다. 변경 후에는 다음을 확인한다.

- 승인 전 확정 문서를 수정하지 않았는가
- 변경안이 승인 큐 형식으로 작성되었는가
- 승인된 확정 설계 변경에 Decision Log와 Version History 기록이 남았는가
- 문서 관련 요청이 검색 후 생성, 수정, 자료 취합, 기획서화, 질문으로 분기되었는가
- 기획 문서와 변경안이 `docs/templates/`의 형식을 따르는가
- Document Plan 추천과 실제 문서 상태가 일치하는가
- 자료 기반 승인 적용 전에 대상과 source hash를 모두 재확인했는가
- 소비 완료되지 않은 원본이나 저장소 밖 파일을 삭제하지 않았는가
- AI 추론 리소스·태스크가 승인 전 확정 목록에 반영되지 않았는가
- 일정 현황이 task board의 명시된 값만 사용했는가
