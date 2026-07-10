# Project Setup Workflow

## Purpose

게임 프로젝트의 기본 정보를 `workspace/project_brief.md`에 정리한다.

## When To Use

- 새 프로젝트 정보를 처음 입력할 때
- 프로젝트명, 장르, 플랫폼, 엔진, 핵심 플레이 경험, 주요 콘텐츠 특징,
  현재 초점, 제약을 갱신할 때

## Steps

1. 현재 `workspace/project_brief.md`를 읽는다.
2. 사용자가 직접 제공한 정보와 기존 값을 비교한다.
3. 확인되지 않은 내용은 만들지 않고 `TBD`로 유지한다.
4. 사용자가 저장 또는 갱신을 명시한 경우 제공된 필드만 반영한다.
5. 기존 값과 새 입력이 충돌하면 덮어쓰지 않고 어떤 값을 사용할지 질문한다.
6. 변경 후 확정 설계 문서와 모순될 가능성이 있으면 관련 파일을 알린다.
7. 장르, 핵심 플레이 경험, 주요 콘텐츠 특징이 모두 확인되면
   `docs/workflows/document_plan.md`에 따라 문서 구성을 추천한다.
8. 기존 Document Plan이 있으면 Project Brief hash 변경과 재검토 필요 여부를 알린다.

## Output

- 반영된 필드
- 유지된 `TBD`
- 충돌 또는 추가 확인이 필요한 필드
- 변경된 파일 경로
- Document Plan 추천 또는 재검토 알림

## Approval Rule

Project Brief는 게임 설계 상세 문서가 아니라 사용자가 직접 제공하는 프로젝트
기준 정보다. 사용자가 저장 또는 갱신을 명시한 값은 별도 Approval Queue 없이
반영할 수 있다. AI가 추론한 값은 반영하지 않는다.
