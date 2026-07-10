# Approval Queue Workflow

## Purpose

AI가 만든 변경안을 사용자가 검토하고 결정할 수 있게 관리한다.

## Status

- `pending`: 검토 대기
- `approved`: 승인됨, 아직 적용 전
- `applied`: 승인된 대상 저장소에 반영 완료
- `on_hold`: 보류
- `change_requested`: 수정 요청
- `rejected`: 거부
- `needs_reconfirmation`: 적용 직전 원본이 달라져 재확인 필요

## Add Item Steps

1. `docs/templates/approval_item.md` 형식을 따른다.
2. ID는 `APR-YYYYMMDD-NNN` 형식으로 같은 날짜의 다음 번호를 사용한다.
3. 대상 문서 또는 저장소와 근거 파일을 명시한다.
4. 기존 대상마다 `git hash-object <path>` 결과를 원본 hash로 기록한다.
5. 신규 대상마다 원본 기준을 `not_created`로 기록한다.
6. 자료 기반 항목은 source마다 ID, 경로, hash, authority를 기록한다.
7. 변경 전 요약과 변경 후 초안을 분리한다.
8. 위험도, 누락 정보, 충돌 가능성을 기록한다.
9. 상태는 기본적으로 `pending`으로 둔다.
10. 전문 기획서는 Document Plan의 해당 타입을 `pending_approval`로 갱신한다.

## Apply Approved Item Steps

1. 사용자가 승인한 항목 ID나 제목을 명시했는지 확인한다.
2. 모든 대상 문서를 다시 읽고 현재 hash를 승인 항목의 대상별 원본 hash와 비교한다.
3. source baseline이 있으면 inbox 원본을 다시 읽고 현재 hash를 모두 비교한다.
4. 신규 대상은 같은 경로·제목·주제가 여전히 없는지 확인한다.
5. 대상 또는 source hash가 다르거나 신규 대상이 생겼으면 적용하지 않고
   `needs_reconfirmation`으로 처리한다. Document Plan과 source index도 같은 상태로 갱신한다.
6. 대상 종류에 따라 반영한다.
   - 확정 기획 문서: `workspace/design/`
   - 승인된 리소스 후보: `workspace/resources/resource_inventory.md`
   - 승인된 태스크 후보: `workspace/tasks/task_board.md`
7. `docs/workflows/decision_log.md`에 따라 결정 로그를 기록한다. 자료 기반 항목은
   source ID, hash, authority, 사용된 핵심 사실 요약을 포함한다.
8. 확정 기획 문서가 실제 변경된 경우에만 `docs/workflows/version_history.md`에 따라 버전 기록을 남긴다.
9. Document Plan의 해당 타입을 `confirmed`로 갱신하고 확정 문서 경로를 연결한다.
10. source index의 해당 후보를 `confirmed`로 갱신하고 관련 승인·확정 문서를 연결한다.
11. 승인 큐 상태를 `applied`로 갱신하고 관련 기록 링크를 추가한다.
12. source의 모든 후보가 `confirmed` 또는 `skipped`이고 pending, needs_revision,
    needs_reconfirmation 항목이 없으면 source index에 삭제일, 관련 결정, 확정 문서,
    핵심 사용 사실을 tombstone으로 기록한다.
13. tombstone 기록까지 성공한 뒤 `workspace/materials/inbox/` 안의 해당 원본을 마지막으로 삭제한다.
14. 삭제에 실패하면 source 상태를 `delete_failed`로 기록하고 이미 적용된 확정 문서는 되돌리지 않는다.

## Non-Approval Decisions

- 수정 요청 또는 거부: Document Plan과 source 후보를 `needs_revision`으로 갱신한다.
- 보류: 기존 `pending_approval` 상태를 유지하고 결정 이유를 기록한다.
- 후보 제외: 사용자가 명시한 source 후보만 `skipped`로 갱신한다.
- 후보 제외로 모든 후보가 confirmed 또는 skipped가 되면 Apply Steps 12~14와 같은
  tombstone·inbox 삭제 절차를 수행한다.

## Safety Rule

승인 문구가 애매하면 적용하지 않는다. 예: "괜찮네", "좋아 보임"은 명시 승인으로 보지 않는다.

사용자가 직접 명시한 태스크 정보와 완료 상태 갱신은 Approval Queue 대상이
아니다. AI가 자료에서 추론한 리소스·태스크 후보만 승인 후 반영한다.

자동 삭제는 `workspace/materials/inbox/`의 등록 복사본에만 적용한다. 저장소 밖
파일, source index, Decision Log, Version History는 삭제하지 않는다.
