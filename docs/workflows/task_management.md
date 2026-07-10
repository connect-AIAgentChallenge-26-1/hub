# Task Management Workflow

## Purpose

로컬 태스크의 생성, 정보 수정, 완료 상태를 관리한다.

## Task Fields

- ID: `TASK-001`부터 순차 부여
- 제목
- 분류: `planning | programming | art | sound | qa | other`
- 출처
- 마감일: `YYYY-MM-DD | TBD`
- 상태: `incomplete | complete`
- 완료일: `YYYY-MM-DD | TBD`
- 마지막 변경일: `YYYY-MM-DD`

## Direct User Update

사용자가 태스크 추가, 마감일 변경, 완료 또는 미완료 전환을 명시한 경우:

1. `workspace/tasks/task_board.md`를 읽는다.
2. ID나 제목으로 대상 태스크를 확인한다.
3. 후보가 여러 개면 적용하지 않고 대상을 질문한다.
4. 사용자가 제공한 필드만 갱신한다.
5. `complete`로 변경할 때 사용자가 완료일을 주지 않으면 현재 날짜를 사용한다.
6. `incomplete`로 되돌릴 때 완료일을 `TBD`로 바꾼다.
7. 마지막 변경일을 현재 날짜로 갱신한다.
8. 변경 결과를 사용자에게 요약한다.

사용자의 직접 지시는 별도 Approval Queue 없이 반영하며 Decision Log와 Version
History를 작성하지 않는다.

## AI-Derived Candidate

1. 원본 기획 자료와 추론 근거를 제시한다.
2. 확정 정보가 아닌 값은 `TBD`로 둔다.
3. 기존 task board에서 중복 제목과 같은 출처를 검색한다.
4. 후보를 Approval Queue에 등록한다.
5. 승인 후 다음 TASK ID를 부여하고 task board에 추가한다.
6. 적용 결정은 Decision Log에 기록하되 Version History에는 기록하지 않는다.

## Safety Rules

- AI는 완료 상태, 완료일, 마감일을 추정하지 않는다.
- 사용자가 완료했다고 말하지 않은 태스크를 완료 처리하지 않는다.
- 태스크 삭제 요청은 즉시 삭제하지 않고 대상과 의도를 재확인한다.

