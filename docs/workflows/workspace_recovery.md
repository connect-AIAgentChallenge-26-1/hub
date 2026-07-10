# Workspace Recovery Workflow

## Purpose

저장소에 남아 있는 현재 프로젝트 상태를 읽어 작업 재개 정보를 제공한다.

## Steps

1. `workspace/project_brief.md`에서 Current Focus를 확인한다.
2. `workspace/document_plan.md`에서 not_started, needs_revision,
   needs_reconfirmation 문서를 확인한다.
3. `workspace/materials/source_index.md`에서 active, in_use, delete_failed 자료를 확인한다.
4. `workspace/tasks/task_board.md`에서 미완료와 지연 태스크를 확인한다.
5. `workspace/approvals/approval_queue.md`에서 pending, approved,
   needs_reconfirmation 항목을 확인한다.
6. Decision Log와 Version History의 최근 항목을 확인한다.
7. 임시 아이디어 중 후속 처리가 명시된 항목이 있으면 분리한다.
8. 근거 파일과 함께 현재 상태, 중단 지점 후보, 다음 행동 후보를 요약한다.

## Output

- 현재 초점
- 미완료·지연 태스크
- 승인 대기·재확인 항목
- 미완료 Document Plan 항목과 활성 source
- 최근 결정과 반영 내역
- 미처리 아이디어
- 근거 파일

## Safety Rules

- 저장소에 없는 이전 대화나 작업 상태를 추정하지 않는다.
- 작업 재개 요청만으로 파일을 수정하지 않는다.
- 다음 행동 후보는 추천이며 자동 실행하지 않는다.
