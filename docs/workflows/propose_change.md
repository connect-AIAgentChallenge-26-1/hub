# Propose Change Workflow

## Purpose

기존 확정 문서 변경 요청을 검토 가능한 변경안으로 만든다.

이 workflow는 문서 관련 요청의 최상위 진입점이 아니다.
`docs/workflows/document_change.md`의 `update_existing_document` 분기에서
하위 workflow로 사용한다.

## When To Use

- 관련 확정 문서가 발견되었을 때
- 요청 내용이 기존 문서의 주제와 직접 연결될 때
- 새 문서를 만드는 것보다 기존 문서 갱신이 자연스러울 때

## Steps

1. `docs/workflows/document_change.md`에서 검색한 대상 문서와 분기 결과를 확인한다.
2. 대상 문서가 여러 개이면 변경안을 확정하지 말고 후보와 질문을 제시한다.
3. 대상 문서의 현재 요약, 관련 설정, 변경 요청을 분리한다.
4. 대상 문서가 전문 타입이면 해당 `docs/templates/design/` 구조를 유지한다.
5. `docs/skills/conflict_review.md` 기준으로 충돌과 영향 범위를 검토한다.
6. 원본 자료를 사용하면 `docs/skills/material_conflict_review.md`와 source baseline을 적용한다.
7. `docs/skills/analysis_reporting.md` 기준으로 영향, confidence, 추천안을 정리한다.
8. 변경 후 문서 초안 또는 변경 섹션을 작성한다.
9. unanswered가 생기면 `docs/skills/document_readiness.md` 기준으로 먼저 질문한다.
10. readiness gate를 통과하면 `docs/templates/change_proposal.md`와
    `docs/templates/approval_item.md` 형식으로 승인 큐 항목을 만든다.

## Approval Rule

변경안 생성은 허용된다. 확정 문서 수정은 사용자 승인 이후에만 허용된다.

## Output

- 변경안 제목
- 대상 문서
- 변경 전 요약
- 변경 후 초안
- 충돌/영향 분석
- confidence와 추천안
- 누락 정보
- 승인 큐 항목 초안
