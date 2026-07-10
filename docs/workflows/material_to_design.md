# Material To Design Workflow

## Purpose

등록된 원본 자료를 이용해 전문 기획서 신규안 또는 기존 문서 변경안을 작성한다.

## Trigger

사용자가 source ID나 inbox 자료를 지정해 기획서 작성을 명시적으로 요청했을
때만 사용한다. 자료 등록 직후 자동 실행하지 않는다.

## Steps

1. 지정된 source index 항목과 inbox 원본을 읽고 현재 hash가 기록과 같은지 확인한다.
2. Document Plan, 확정 설계, 승인 대기 항목, 관련 원본 자료를 검색한다.
3. `docs/skills/material_conflict_review.md`로 일치, 추가 가능, 직접 충돌, 해석 불가를 구분한다.
4. `docs/skills/document_type_selection.md`로 만들 수 있는 전문 문서 후보와 이유를 제시한다.
5. 후보가 여러 개면 사용자가 선택한 문서만 각각 별도 흐름으로 작성한다.
6. 관련 확정 문서가 없으면 create, 있으면 update 후보로 분기한다.
7. 선택된 전문 template에 source 사실을 매핑하고 출처 위치를 기록한다.
8. unanswered 필드를 구조화해 질문하고 `docs/skills/document_readiness.md` gate를 적용한다.
9. gate를 통과한 문서마다 별도의 Approval Queue 항목을 만든다.
10. approval source baseline에 source ID, 경로, hash, authority를 기록한다.
11. source 상태를 `in_use`, 선택 후보와 Document Plan 문서 상태를 `pending_approval`로 갱신한다.

## Conflict Rules

- authoritative 원본도 확정 설계를 자동으로 덮어쓰지 않는다.
- 여러 원본이 상충하면 source별 차이와 authority를 보여주고 사용자 판단을 받는다.
- 기존 문서 주제와 직접 이어지면 새 문서를 중복 생성하지 않고 update 후보를 우선한다.
- 충돌이나 대상 판단이 해결되지 않으면 Approval Queue에 저장하지 않는다.

## Output

- 사용한 source와 authority
- 문서 타입 후보
- 기존 문서 충돌 분석
- create 또는 update 판정
- 타입별 전문 초안 또는 보완 질문
- 생성된 승인 항목 ID
