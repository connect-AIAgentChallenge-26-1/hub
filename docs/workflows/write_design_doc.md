# Write Design Doc Workflow

## Purpose

기존 자료를 바탕으로 게임 기획서 형태의 초안을 만들되, 승인 전에는
확정 문서로 저장하지 않는다.

이 workflow는 문서 관련 요청의 최상위 진입점이 아니다.
`docs/workflows/document_change.md`의 `draft_design_from_materials` 분기에서
하위 workflow로 사용한다.

## When To Use

- 사용자가 있는 자료로 기획서를 만들어달라고 요청할 때
- 설정, 아이디어, 승인 큐 항목, 결정 로그를 기획서 형식으로 구조화할 때
- 새 설정을 창작하기보다 기존 자료를 정리하는 것이 목적일 때

## Steps

1. `docs/workflows/document_change.md`에서 검색한 근거와 분기 결과를 확인한다.
2. `docs/skills/document_type_selection.md`로 전문 타입을 정한다.
3. system, world_setting, narrative, character, quest, item, level,
   balance_economy, ui는 `docs/templates/design/`의 해당 template을 따른다.
4. 전문 타입에 맞지 않을 때만 `docs/templates/design_doc.md` fallback을 사용하고 이유를 쓴다.
5. 선택한 template 이름과 용도를 사용자에게 알린다.
6. 출처가 없는 세부 설정은 창작하지 않는다.
7. unanswered 필드는 한 번에 질문하고 사용자가 확인한 경우만 `TBD` 또는 `N/A - 사유`로 기록한다.
8. `docs/skills/document_readiness.md` gate를 적용한다.
9. gate를 통과하지 못하면 파일을 수정하지 않고 필요한 질문만 출력한다.
10. `docs/skills/analysis_reporting.md` 기준으로 영향과 confidence를 정리한다.
11. gate를 통과하면 별도 확인 없이 `docs/templates/approval_item.md` 형식으로 Approval Queue에 저장한다.
12. Document Plan의 해당 타입 상태를 `pending_approval`로 갱신한다.

## Approval Rule

사용자가 명시적으로 승인하기 전에는 `workspace/design/`에 새 확정 문서를 만들지 않는다.

## Output

- 승인 큐 항목 초안
- 기획서 초안 제목
- 문서 타입
- 사용한 전문 template 또는 fallback 이유
- 초안 전문
- 누락 정보 질문
- readiness 결과
- 근거 파일 목록
