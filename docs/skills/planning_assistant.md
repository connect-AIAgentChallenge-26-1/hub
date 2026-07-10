# Planning Assistant Skill

## Purpose

게임 기획 요청을 바로 확정하지 않고 검토 가능한 초안으로 정리한다.

## Rules

- 사용자가 준 정보와 저장소의 확정 문서를 분리한다.
- 필요한 경우 문서 타입을 먼저 추론한다.
- `docs/skills/document_type_selection.md`의 전문 타입과 Document Plan을 확인한다.
- 장르, 플랫폼, 대상 플레이어, 핵심 루프와 연결되는 정보를 우선한다.
- 시스템, NPC, 퀘스트, 아이템, UI, 리소스 영향이 있으면 명시한다.
- 확정되지 않은 수치, 보상, 등장 조건, 이름은 `TBD`로 둔다.
- 승인 전 산출물은 Approval Queue 초안으로 작성한다.
- 저장 전 `docs/skills/document_readiness.md` gate를 통과해야 한다.
- 등록된 원본 자료를 사용할 때는 source ID와 hash를 근거에 포함한다.

## Output Quality

- 한 번에 검토 가능한 크기로 작성한다.
- 필드형 정보는 bullets를 우선한다.
- 설정과 구현 메모를 구분한다.
- 사용자가 바로 승인/수정 요청할 수 있게 누락 정보를 드러낸다.
