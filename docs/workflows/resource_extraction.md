# Resource Extraction Workflow

## Purpose

기획 자료에서 제작에 필요한 리소스와 태스크 후보를 추출한다.

## Resource Types

- `npc`
- `dialogue`
- `item`
- `quest`
- `ui`
- `effect`
- `sound`
- `cutscene`

## Steps

1. 사용자가 지정한 원본 자료와 관련 확정 문서를 읽는다.
2. `workspace/resources/resource_inventory.md`에서 기존 리소스를 검색한다.
3. 원본에 명시된 리소스 후보를 타입별로 추출한다.
4. 후보마다 이름, 사용 위치, 제작 요구, 출처, 관련 문서를 정리한다.
5. 이름이나 역할이 겹치는 기존 리소스가 있으면 중복 가능성을 표시한다.
6. 자료에 없는 제작 사양은 `TBD`로 둔다.
7. `docs/skills/resource_extraction.md` 기준으로 파트별 태스크 후보를 함께 만든다.
8. `docs/templates/approval_item.md` 형식으로 승인 큐 항목을 작성한다.
9. 승인 전에는 resource inventory와 task board를 수정하지 않는다.

## Apply Rule

- 승인된 리소스는 `RES-001`부터 순차 ID를 부여해 inventory에 추가한다.
- 승인된 태스크 후보는 `docs/workflows/task_management.md` 형식으로 task board에 추가한다.
- 적용 결과는 Decision Log에 기록하지만 확정 설계 문서가 아니므로 Version History에는 기록하지 않는다.

## Output

- 원본 자료와 근거 위치
- 리소스 후보 목록
- 중복 가능성
- 태스크 후보 목록
- 누락 정보
- 승인 큐 항목 초안

