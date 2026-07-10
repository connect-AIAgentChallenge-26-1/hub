# Decision Log Workflow

## Purpose

승인, 거부, 보류, 수정 요청의 이유와 맥락을 추적한다.

## When To Write

- 승인 큐 항목이 승인되어 적용될 때
- AI가 제안한 리소스·태스크 후보가 승인 또는 거부될 때
- 승인 큐 항목이 거부될 때
- 중요한 방향성이 결정될 때
- 기존 결정을 뒤집을 때

## Steps

1. `docs/templates/decision_log_entry.md` 형식을 따른다.
2. ID는 `DEC-YYYYMMDD-NNN` 형식으로 같은 날짜의 다음 번호를 사용한다.
3. 결정 상태와 이유를 기록한다.
4. 관련 승인 큐 항목, 대상 문서, 근거 파일을 연결한다.
5. 자료 기반 항목은 source ID, hash, authority와 실제 사용한 핵심 사실을 요약한다.
6. 결정으로 생긴 후속 작업이 있으면 적는다.

사용자가 직접 지시한 단순 태스크 추가, 정보 수정, 완료 상태 변경은 기록하지 않는다.

## Output Location

`workspace/decisions/decision_log.md`
