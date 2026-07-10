# Document Readiness Skill

## Purpose

전문 기획서가 Approval Queue에 저장 가능한지 판단한다.

## Field States

- concrete: 저장소 근거나 사용자 입력에 있는 실제 기획 정보
- `TBD`: 사용자가 아직 미정이라고 명시한 정보
- `N/A - 사유`: 사용자가 적용되지 않음을 확인하고 이유를 준 정보
- unanswered: template에는 필요하지만 아직 확인되지 않은 정보

## Save Gate

다음을 모두 만족해야 저장할 수 있다.

1. administrative metadata, 문서 제목, source 경로를 제외한 concrete 정보가 하나 이상 있다.
2. 모든 template 필드가 concrete, `TBD`, `N/A - 사유` 중 하나다.
3. 사유 없는 `N/A`가 없다.
4. 저장소 근거가 없는 내용을 AI가 창작하지 않았다.
5. 사용한 template과 문서 타입이 명시돼 있다.

모든 기획 정보가 `TBD` 또는 `N/A`이면 빈 골격으로 판단해 저장하지 않는다.

## Question Rules

- 이미 확인된 필드는 다시 묻지 않는다.
- unanswered 필드를 한 번의 구조화된 목록으로 묻는다.
- 사용자는 구체 값, `TBD`, `N/A + 사유` 중 하나로 답할 수 있다고 알린다.
- 사용자의 다음 답변을 반영한 뒤 전체 필드를 다시 검사한다.
- gate를 통과하면 별도 저장 확인 없이 Approval Queue 항목을 만든다.

