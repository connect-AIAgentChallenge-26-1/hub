# Version History Workflow

## Purpose

확정 문서에 실제로 반영된 변경만 기록한다.

## When To Write

- `workspace/design/` 문서가 승인 후 생성, 수정, 삭제되었을 때

리소스 인벤토리, task board, Project Brief의 변경은 이 기록의 대상이 아니다.

## Steps

1. `docs/templates/version_entry.md` 형식을 따른다.
2. ID는 `VER-YYYYMMDD-NNN` 형식으로 같은 날짜의 다음 번호를 사용한다.
3. 변경 타입을 기록한다: create, update, delete.
4. 변경 전 요약과 변경 후 요약을 분리한다.
5. 관련 승인 큐 항목과 결정 로그 항목을 연결한다.
6. 적용 시각과 적용자를 기록한다.

## Output Location

`workspace/versions/version_history.md`
