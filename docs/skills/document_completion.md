# Document Completion Skill

## Purpose

기획서 초안에서 승인이나 구현 전에 필요한 누락 정보를 찾는다.

## Common Required Fields

- NPC: 이름, 역할, 등장 위치, 관련 퀘스트, 대사 톤, 설계 의도.
- Quest: 시작 조건, 완료 조건, 주요 NPC, 보상, 실패 조건.
- Item: 이름, 분류, 획득 방법, 효과, 밸런스 값.
- System: 목적, 규칙, 입력, 출력, 예외.
- World Setting: 요약, 규칙, 제약, 충돌 금지 설정.
- UI: 목적, 주요 상태, 입력 방식, 표시 정보, 예외 상태.
- Resource: 종류, 사용 위치, 제작 요구, 의존 문서.

이 목록은 빠른 검토용이다. 전문 문서는 `docs/templates/design/`의 모든 필드를
확인하고 `docs/skills/document_readiness.md`의 저장 gate를 적용한다.

## Question Rule

- 이미 문서에 있는 정보는 묻지 않는다.
- 승인에 꼭 필요한 질문을 우선한다.
- 첫 초안에서 남겨도 되는 정보는 `TBD`로 둔다.
- 질문마다 왜 필요한지 짧게 설명한다.
- 이미 확인된 필드는 다시 묻지 않는다.
- `TBD`와 `N/A`는 사용자가 명시한 경우에만 사용한다.
