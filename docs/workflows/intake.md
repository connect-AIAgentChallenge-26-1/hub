# Intake Workflow

## Purpose

사용자 입력을 먼저 분류해서 적절한 작업 흐름으로 보낸다.

## Intent Types

- `project_setup`: 프로젝트 기본 정보 입력 또는 갱신.
- `document_plan`: 필요한 기획 문서 타입 추천, 확인, 상태 조회.
- `material_intake`: 대화, Markdown, TXT 원본 자료 등록.
- `material_to_design`: 등록된 원본으로 기획서 신규안 또는 변경안 작성.
- `temporary_idea`: 확정 반영 요청이 없는 아이디어, 메모, 가능성.
- `document_change`: 문서 생성, 기존 문서 수정, 자료 취합, 기획서화 요청.
- `write_design_doc`: `document_change` 하위의 자료 기반 기획서 초안 작성 요청.
- `propose_change`: `document_change` 하위의 기존 확정 문서 변경 요청.
- `project_search`: 기존 설정 확인, 검색, 요약 요청.
- `approval_decision`: 승인 큐 항목의 승인, 보류, 수정 요청, 거부.
- `resource_extraction`: 자료에서 리소스와 태스크 후보 추출.
- `task_update`: 사용자가 명시한 태스크 추가, 수정, 완료 상태 갱신.
- `schedule_status`: 완료율, 지연, 남은 기간 등 태스크 일정 조회.
- `workspace_recovery`: 저장소의 현재 상태를 이용한 작업 재개.

## Steps

1. 사용자 요청에서 실제 수정 요청이 있는지 확인한다.
2. 검색만 요청한 경우 문서를 수정하지 않는다.
3. 문서 관련 요청이면 `docs/workflows/document_change.md`를 먼저 따른다.
4. 프로젝트 기본 정보 입력이면 `docs/workflows/project_setup.md`를 따른다.
5. 문서 구성 추천이나 갱신이면 `docs/workflows/document_plan.md`를 따른다.
6. 원본 자료 등록이면 `docs/workflows/material_intake.md`를 따른다.
7. 등록 자료 기반 작성 요청이면 `docs/workflows/material_to_design.md`를 따른다.
8. 임시 아이디어 저장이면 `docs/workflows/temporary_idea.md`를 따른다.
9. 리소스 추출이면 `docs/workflows/resource_extraction.md`를 따른다.
10. 사용자가 태스크 변경을 명시했으면 `docs/workflows/task_management.md`를 따른다.
11. 일정 현황 조회이면 `docs/workflows/schedule_status.md`를 따른다.
12. 작업 재개 요청이면 `docs/workflows/workspace_recovery.md`를 따른다.
13. 확정 반영이 명확하지 않으면 아이디어나 승인 큐 초안으로만 처리한다.
14. 필요한 workflow 문서를 읽고 해당 절차를 따른다.
15. 정보가 부족하면 바로 확정하지 말고 질문 또는 `TBD`를 남긴다.

## Output

- 분류 결과
- 사용한 workflow
- 다음 산출물 위치
- 필요한 사용자 확인 사항
