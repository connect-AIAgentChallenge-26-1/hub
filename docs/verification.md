# 기능 검증

## 1. 검증 기준

- 검증일: 2026-07-11
- 대상: 현재 `AGENTS.md`, README, Architecture, workflow, skill, template, workspace 구조
- 방식: 내부 경로 검사, 요구 기능 추적, 대표 요청의 문서 기반 walkthrough
- 제외: 실제 게임 데이터의 기획 품질 평가는 프로젝트 자료가 생긴 뒤 수행한다.

## 2. 기능 추적

| 기획 기능 | 구현 근거 | 결과 |
| --- | --- | --- |
| 프로젝트 기준 정보 | `project_setup` workflow, Project Brief | 통과 |
| 프로젝트 문서 구성 | `document_plan` workflow와 Document Plan | 통과 |
| 아이디어 관리 | `temporary_idea` workflow와 template | 통과 |
| 원본 자료 등록 | `material_intake` workflow와 Source Index | 통과 |
| 출처 기반 검색 | `project_search` workflow | 통과 |
| 문서 생성·변경 분기 | `document_change`, `write_design_doc`, `propose_change` workflow | 통과 |
| 문서 타입 전문화 | 9종 design template, type selection skill | 통과 |
| 자료 기반 기획서 | `material_to_design` workflow, material conflict skill | 통과 |
| 충돌·영향·confidence·추천 | `conflict_review`, `analysis_reporting` skill | 통과 |
| 승인과 원본 재확인 | `approval_queue` workflow와 approval template | 통과 |
| 결정·버전 기록 | `decision_log`, `version_history` workflow | 통과 |
| 리소스 추출 | `resource_extraction` workflow와 skill | 통과 |
| 태스크 관리 | `task_management` workflow와 task template | 통과 |
| 일정 현황 | `schedule_status` workflow와 report template | 통과 |
| 작업 재개 | `workspace_recovery` workflow | 통과 |

## 3. 대표 시나리오

### 3.1 아이디어와 검색

- 아이디어 저장은 Temporary Ideas만 변경하고 확정 설계와 Approval Queue를 수정하지 않는다.
- 검색은 Project Brief, 확정 설계, 결정, 버전, 승인, 리소스, 태스크, 아이디어를 구분한다.
- 근거가 없거나 상충하면 추정 대신 정보 부족 또는 상충 상태를 답한다.
- 결과: 통과

### 3.2 신규 문서와 기존 문서 변경

- 신규 문서는 같은 주제 검색 후 승인 큐 초안으로 만든다.
- 기존 문서 변경은 Before, After, 충돌, 영향, confidence, 추천안을 포함한다.
- 승인 전에는 `workspace/design/`을 수정하지 않는다.
- 결과: 통과

### 3.3 승인과 재확인

- 대상이 명확한 승인 표현만 적용 절차로 이동한다.
- 적용 직전 원본 또는 동일 주제를 다시 검색한다.
- 기존 대상은 승인 항목의 경로별 원본 hash와 현재 hash를 비교한다.
- 원본 불일치는 `needs_reconfirmation`으로 전환하고 적용하지 않는다.
- 확정 설계 적용은 Decision Log와 Version History를 모두 갱신한다.
- 리소스·태스크 후보 적용은 Decision Log만 갱신한다.
- 결과: 통과

### 3.4 리소스와 태스크

- AI 추출 후보는 Approval Queue까지만 작성한다.
- 승인된 후보만 Resource Inventory와 Task Board에 추가한다.
- 사용자가 직접 명시한 태스크 변경은 제공된 필드만 반영한다.
- 태스크 상태 변경은 설계 Version History에 기록하지 않는다.
- 결과: 통과

### 3.5 일정 계산

기준일 `2026-07-11`의 예제 태스크를 적용한다.

| 태스크 | 상태 | 마감일 | 예상 분류 |
| --- | --- | --- | --- |
| TASK-001 | complete | 2026-07-09 | 완료 |
| TASK-002 | incomplete | 2026-07-10 | 지연, D+1 |
| TASK-003 | incomplete | 2026-07-11 | 오늘 마감, D-Day |
| TASK-004 | incomplete | 2026-07-14 | 예정, D-3 |
| TASK-005 | incomplete | TBD | 일정 미정 |

- 전체 5건, 완료 1건, 미완료 4건, 완료율 20%로 계산한다.
- 빈 task board는 완료율 `계산 불가`로 보고한다.
- 전체 완료 상태에서는 지연·예정·일정 미정 목록이 비어야 한다.
- 결과: 통과

### 3.6 작업 재개

- Project Brief, Document Plan, Source Index, Task Board, Approval Queue,
  Decision Log, Version History만 사용한다.
- 저장소에 없는 이전 대화나 중단 지점을 사실처럼 만들지 않는다.
- 요청만으로 프로젝트 파일을 수정하지 않는다.
- 결과: 통과

### 3.7 Document Plan 추천

- 추상 퍼즐은 system과 ui를 검토하되 world_setting과 narrative를 강제하지 않는다.
- 스토리형 RPG는 narrative, character, quest, item, level 등을 추천 후보로 둔다.
- 일부 타입만 accepted여도 Document Plan을 저장할 수 있다.
- 계획 밖 요청은 차단하지 않고 타입 추가 여부를 확인한다.
- Project Brief 기준 hash가 달라지면 `needs_review`를 알리고 자동 재분류하지 않는다.
- 장르가 같아도 핵심 루프, 콘텐츠 구조, 플랫폼·입력 방식이 크게 바뀌면 재검토한다.
- 결과: 통과

### 3.8 전문 Template 저장 Gate

- 타입이 명확하면 template을 자동 선택하고, 복수 후보면 사용자에게 질문한다.
- concrete 기획 정보 1개와 사용자 확인 `TBD`가 있는 문서는 pending 승인 항목으로 저장한다.
- 모든 내용이 `TBD`·`N/A`인 빈 골격은 저장하지 않는다.
- unanswered 필드 또는 사유 없는 `N/A`가 있으면 질문만 하고 저장하지 않는다.
- npc, 시나리오, 스테이지, 경제 별칭이 각각 전문 타입으로 연결된다.
- 결과: 통과

### 3.9 원본 자료 기반 작성

- 대화는 Markdown, Markdown·TXT 파일은 inbox 복사본으로 등록한다.
- 등록 직후에는 기획서나 승인 항목을 자동 생성하지 않는다.
- 명시 요청 시 전문 문서 후보와 기존 확정 문서 충돌을 먼저 분석한다.
- 관련 확정 문서가 없으면 create, 같은 주제가 있으면 update 후보로 분기한다.
- 여러 후보는 사용자 선택 후 개별 승인 항목으로 만든다.
- reference와 authoritative 모두 승인 없이 확정 설계를 바꾸지 않는다.
- 결과: 통과

### 3.10 Source 재확인과 삭제

- 자료 기반 승인 항목은 대상과 source 경로별 hash를 모두 기록한다.
- 하나라도 hash가 바뀌면 `needs_reconfirmation`으로 전환한다.
- pending, needs_revision, needs_reconfirmation, unselected 후보가 있으면 원본을 삭제하지 않는다.
- 모든 후보가 confirmed 또는 skipped면 tombstone 기록 후 inbox 복사본을 마지막으로 삭제한다.
- 저장소 밖 파일과 source index tombstone은 삭제하지 않는다.
- 삭제 실패는 `delete_failed`로 남기고 적용된 확정 문서를 되돌리지 않는다.
- 삭제 후 원본 전문은 복구할 수 없고 source hash와 사용 사실 요약만 남는다.
- 결과: 통과

## 4. 정적 검사

- 현재 문서가 참조하는 `docs/`와 `workspace/` Markdown 경로가 모두 존재한다.
- `git diff --check` 기준 whitespace 오류가 없어야 한다.
- README, Architecture, AGENTS의 승인 경계와 기능 범위가 `docs/plan.md`와 일치해야 한다.
- 9종 전문 template과 Document Plan·materials 참조 경로가 모두 존재해야 한다.
- `workspace/design/`은 이번 기능 개발에서 변경되지 않아야 한다.
