# Document Plan Workflow

## Purpose

프로젝트에 필요한 기획 문서 타입과 작성 상태를 추천하고 추적한다.

## Recommendation Inputs

- 장르
- 핵심 플레이 경험
- 주요 콘텐츠 특징

세 항목 중 하나라도 확인되지 않았으면 Document Plan을 추론해 저장하지 않고
필요한 정보를 질문한다.

## Steps

1. `workspace/project_brief.md`와 현재 `workspace/document_plan.md`를 읽는다.
2. `docs/skills/document_type_selection.md`의 9종 template과 generic fallback을 사용자에게 알린다.
3. 세 추천 입력을 바탕으로 타입별 required, recommended, excluded와 이유를 제안한다.
4. 사용자가 accepted, deferred, rejected로 조정할 수 있게 한다.
5. 사용자가 구성을 확인하면 `docs/templates/document_plan.md` 형식으로 저장한다.
6. `git hash-object workspace/project_brief.md` 값을 기준 hash로 기록한다.
7. 기존 확정 문서와 승인 항목이 있으면 각 타입의 문서 상태와 링크를 연결한다.

## Status Sync

- 승인 항목 생성: `pending_approval`
- 승인 적용: `confirmed`와 확정 문서 경로 기록
- 수정 요청 또는 거부: `needs_revision`
- 원본 재확인 필요: `needs_reconfirmation`
- 계획만 있고 산출물 없음: `not_started`

Document Plan은 사용자 확인을 받은 프로젝트 관리 정보이므로 Approval Queue를
거치지 않고 직접 갱신할 수 있다.

## Review Triggers

- Project Brief의 현재 hash가 기록된 기준 hash와 다르다.
- 장르, 핵심 플레이 경험, 주요 콘텐츠 특징이 바뀌었다.
- 스토리·스테이지·성장·경제 구조 또는 플랫폼·입력 방식이 크게 바뀌었다.
- 계획에 없는 전문 타입 또는 generic fallback 요청이 들어왔다.

trigger가 있으면 상태를 `needs_review`로 알리되 기존 계획을 자동 변경하지 않는다.
계획은 문서 생성 가이드이며 계획 밖 요청을 차단하지 않는다.
