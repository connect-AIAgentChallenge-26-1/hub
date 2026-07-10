# Specialized Design Document Common Contract

## Common Metadata

모든 전문 기획서는 다음 metadata를 포함한다.

- 문서 타입
- 상태: draft | confirmed
- Document Plan 항목
- 관련 문서
- 마지막 변경일: YYYY-MM-DD

## Field States

- 실제 값: 사용자가 제공했거나 저장소 근거로 확인된 기획 정보
- `TBD`: 사용자가 아직 미정이라고 확인한 값
- `N/A - 사유`: 사용자가 해당 없음을 확인하고 이유를 제공한 값
- unanswered: 아직 사용자 확인이 필요한 값. 저장 문서에는 남길 수 없다.

administrative metadata, 문서 제목, source 경로를 제외한 실제 기획 정보가
하나 이상 있어야 Approval Queue에 저장할 수 있다. 모든 기획 정보가 `TBD` 또는
`N/A`이면 저장하지 않는다.

## Common Sections

모든 전문 template은 다음 공통 섹션을 유지한다.

- Summary
- 타입별 Details
- Gameplay / Production Notes
- Open Questions
- Sources

필드가 해당하지 않아도 삭제하지 않고 `N/A - 사유`로 남긴다.

