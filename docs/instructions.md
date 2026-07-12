# 개발 지시서 — Agent 작업 절차

이 문서는 agent(Claude Code 등)에게 개발을 지시할 때 참조하는 **작업 절차서**다. 제품 범위·계약·완료 조건은 이 문서가 아니라 아래 문서들이 진실 소스이며, 이 문서는 "어떤 문서를 언제 어떻게 읽고 갱신할지"만 정의한다.

사용법: 새 세션에서 `docs/instructions.md 절차에 따라 T0X 진행해줘`라고 지시한다.

## 문서 지도

| 문서 | 역할 | 읽는 시점 |
|---|---|---|
| [CLAUDE.md](../CLAUDE.md) | 안전 원칙·제품 경계·현재 구현 상태 | 항상 (자동 로드) |
| [AGENTS.md](../AGENTS.md) | 범용 작업 규칙·Source of Truth 우선순위 | 항상 |
| [plan.md](plan.md) | 전체 요구사항 R01~R15, 아키텍처, 완료 정의 | 범위·의존 판단이 필요할 때 |
| [skills.md](skills.md) | S1~S23 입력·출력·제약 typed 계약 (단일 진실 소스) | 구현 대상 스킬 착수 전 필수 |
| [backlog.md](backlog.md) | T00~T15 구현 순서·선행조건·상태 | 매 작업 시작·종료 시 |
| [checklist.md](checklist.md) | C0~C16 검증 가능한 완료 조건 | 매 작업 시작·종료 시 |
| [prerequisites.md](prerequisites.md) | 사용자가 준비할 API key·계정·결정 사항 | Task 착수 전 외부 자격증명 필요 여부 확인 |
| [harness.md](harness.md) | 최소 검증 하네스(verify·CI·secret scan) 구축 지시서 | 하네스 구축·확장 시 |
| [report/report_claude.md](report/report_claude.md) | 구현 세션 작업 보고 (append-only) | 작업 종료 시 append |
| [report/report_gpt.md](report/report_gpt.md) | 리뷰 세션 보고 (append-only) | GPT 등 리뷰 세션 종료 시 append |
| [report/review.md](report/review.md) | 보고서 점검·피드백 절차 (`확인: [ ]` 미체크 항목부터) | 리뷰 세션 시작 시, report_gpt.md 피드백 반영 시 |

우선순위 충돌 시: CLAUDE.md 안전 원칙 > plan.md > skills.md > checklist.md > backlog.md > 코드·테스트 결과 순서를 따른다.

`docs/` 아래 위 4개 외 파일(docs_1.md, planning.md, check_project/ 등)은 ignore된 초기 기획 아카이브다. 참고는 가능하나 **범위·계약의 근거로 인용하지 않는다.**

## 작업 시작 절차

1. **리뷰 피드백 확인** — [report/report_gpt.md](report/report_gpt.md)에 `확인: [ ]` 미체크 항목이 있으면 [report/review.md](report/review.md) B절에 따라 먼저 반영·체크한다.
2. **Task 확정** — [backlog.md](backlog.md)에서 지시받은 Task의 선행조건이 `완료`인지 확인한다. 미충족이면 구현하지 말고 `BLOCKED` 사유와 해제 조건을 보고한다.
3. **완료 조건 로드** — Task의 종료 조건에 해당하는 [checklist.md](checklist.md)의 C 섹션 체크박스를 전부 읽는다. 이것이 acceptance criteria다.
4. **계약 로드** — 해당 Task가 포함하는 S 스킬의 [skills.md](skills.md) 계약(입력·출력·제약·envelope·verdict·reason code)을 읽는다.
5. **범위 확인** — 의존 관계나 아키텍처 판단이 필요하면 [plan.md](plan.md)의 R 레지스트리·기술 아키텍처를 확인한다.
6. **하네스 확인** — `npm run verify`를 한 번 돌려 현재 baseline이 green인지 확인한다. 이미 실패 상태에서 시작하면 자신의 작업으로 인한 실패와 기존 실패를 구분할 수 없다.
7. backlog.md의 해당 Task 상태를 `진행중`으로 바꾸고 구현을 시작한다.

## 작업 중 규칙

- **계약 변경은 문서 먼저**: 스킬 입력·출력·제약을 바꿔야 하면 skills.md를 먼저 수정하고, 같은 변경에서 코드·테스트·checklist를 동기화한다.
- **범위 변경은 동시 동기화**: plan.md를 바꾸면 skills/checklist/backlog/CLAUDE/AGENTS를 한 변경으로 갱신한다.
- **완료 기준**: 코드 + 정상/실패/공격 테스트 + 문서 + 로그·metrics가 전부 있어야 한 항목이 완료다.
- checklist에 없는 기능을 임의로 추가하거나, 있는 항목을 일정 이유로 빼지 않는다. 차단되면 `BLOCKED` 기록으로 대체한다.

## 작업 종료 절차

1. `npm run verify`를 실행해 통과를 확인한다(backend가 생기면 `scripts/verify.sh` 등 확장된 명령을 따른다). checklist.md는 이 결과로 실제 통과한 항목만 체크하며, 항목이 여러 계층(frontend+backend 등)을 묶고 있으면 전부 충족했을 때만 체크한다. 문서에 적혀 있다는 이유로 체크하지 않는다.
2. backlog.md 상태를 갱신한다 (`진행중` → `완료` 또는 `BLOCKED`+사유).
3. 하위 체크박스가 전부 통과하기 전에는 상위 Task를 `완료`로 바꾸지 않는다.
4. 실행 명령·구현 상태가 바뀌었으면 CLAUDE.md의 「현재 구현 상태」·「현재 실행 명령」을 즉시 갱신한다.
5. plan.md의 R 상태(`미구현` → `IMPLEMENTED`)를 해당 C 섹션이 전부 통과했을 때만 갱신한다.
6. [report/report_claude.md](report/report_claude.md)에 작업 보고를 남긴다. 파일을 읽지 말고 `cat >> docs/report/report_claude.md`로 하단에만 추가하며, 형식은 파일 상단 템플릿을 따른다. 새 항목 마지막 줄에는 반드시 `- 확인: [ ]`를 포함한다 — 다른 LLM이 [report/review.md](report/review.md) 절차로 미체크 항목부터 점검한다.

## 지시 템플릿

```text
docs/instructions.md 절차에 따라 T01(Backend·DB 기반)을 진행해줘.
완료 조건은 checklist.md C13의 [T01] 항목이고,
막히는 부분은 BLOCKED로 기록하고 멈춰서 보고해줘.
```
