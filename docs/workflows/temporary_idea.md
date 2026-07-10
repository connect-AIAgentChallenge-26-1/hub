# Temporary Idea Workflow

## Purpose

확정 반영 요청이 없는 아이디어를 확정 설계와 분리해서 저장한다.

## Steps

1. 현재 `workspace/ideas/temporary_ideas.md`를 읽고 같은 아이디어가 있는지 확인한다.
2. 사용자가 저장을 요청했거나 아이디어 기록 의도가 명확한지 확인한다.
3. `docs/templates/temporary_idea.md` 형식으로 항목을 작성한다.
4. ID는 `IDEA-YYYYMMDD-NNN` 형식으로 같은 날짜의 다음 번호를 사용한다.
5. 출처는 사용자 입력으로 기록하고 관련 문서는 확인되는 경우에만 연결한다.
6. 확정되지 않은 태그나 관련 문서를 추론하지 않는다.
7. `workspace/design/`과 Approval Queue는 수정하지 않는다.

## Promotion

사용자가 아이디어를 기획안이나 변경안으로 발전시키길 요청하면
`docs/workflows/document_change.md`로 다시 분기한다. 기존 아이디어 ID를 새 승인
항목의 근거에 연결하되 원본 아이디어는 삭제하지 않는다.

