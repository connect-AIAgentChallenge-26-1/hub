# 문제 해결과 포트폴리오 문서화 표준

## 하나의 질문에 하나의 정본

| 질문 | 정본 |
| --- | --- |
| Task 상태·담당자·완료 기준·토론은 무엇인가? | GitHub Issue |
| 어떤 순서로 구현해야 하는가? | `roadmap.md`의 DAG |
| 현재 외부 계약은 무엇인가? | `contracts.md` |
| 현재 시스템 책임 경계는 무엇인가? | `architecture.md` |
| 작업 중 무엇을 관찰·결정·검증했는가? | Work Record |
| 장기간 구현을 제약하는 선택은 왜 했는가? | ADR |
| 재발 장애를 어떻게 진단하는가? | Troubleshooting |
| 측정 가설과 결과는 무엇인가? | Experiment |
| 현재 반복 절차는 무엇인가? | Runbook |
| 검증된 성과를 사용자 문제 관점에서 어떻게 설명하는가? | Case Study |

같은 상태표, 실행 이력과 수치를 여러 문서에 복제하지 않는다. 다른 문서에는 결론 한 줄과
정본 링크만 둔다. PR은 현재 변경의 검토 화면이며 장기 기록의 대체물이 아니다.

## 생성 시점

- GitHub Issue는 구현 전에 문제·가치·완료 기준을 합의할 때 만든다.
- Work Record는 중요한 Task가 실제로 시작될 때만 `in-progress`로 만든다.
- 시작하지 않은 Issue를 위해 `planned` Work Record를 선생성하지 않는다.
- ADR·Troubleshooting·Experiment·Runbook은 각각의 작성 조건이 실제로 발생할 때만 만든다.
- 완료된 상세 기록은 `docs/archive/`로 이동하고 활성 상태·추적성 검사에서 제외한다.
- Case Study는 검증 증거가 확보된 뒤에만 `verified`로 만든다.

## 공통 frontmatter

활성 artifact는 `id`, `title`, `type`, `status`, `date`, `owners`, `related`를 가진다.
Work Record에는 실제 변경 범위를 선언하는 `paths`도 필요하다.

| type | ID | 허용 상태 |
| --- | --- | --- |
| `work-record` | `WI-0001` | `in-progress`, `blocked`, `done` |
| `adr` | `ADR-0001` | `proposed`, `accepted`, `superseded`, `rejected` |
| `troubleshooting` | `TS-0001` | `draft`, `verified`, `retired` |
| `experiment` | `EXP-0001` | `planned`, `running`, `completed`, `invalidated` |
| `runbook` | `RUN-0001` | `draft`, `verified`, `retired` |
| `case-study` | `CASE-0001` | `draft`, `verified`, `retired` |

날짜는 `YYYY-MM-DD`, 배열은 YAML list로 쓴다. 새 ID는 종류별 최댓값 다음 번호를
사용한다. Archive로 이동한 ID도 재사용하지 않는다.

## Work Record 최소 내용

1. 관찰 가능한 문제와 근거
2. 목적, 검증 가능한 성공 기준, 범위·비범위와 제약
3. 판단 기준, 대안, 선택 이유와 재검토 조건
4. 관찰·가설·검증·결과·다음 결정
5. 구현 결과와 재현 가능한 검증 증거
6. AI 위임 범위와 사람의 확인 책임
7. 남은 위험과 배운 점

Issue의 상태나 본문을 복사하지 않는다. Work Record는 작업 과정에서 새로 생긴 판단과
증거만 보완한다. 내부 사고 과정, 전체 prompt, 비밀값, 개인정보와 Provider 응답 원문은
기록하지 않는다.

## 변경 추적

활성 Work Record의 `paths`는 해당 작업의 실제 변경 경로를 glob으로 선언한다. 중요한
변경은 최소 하나의 `in-progress` Work Record에 매핑한다. 작은 오탈자, 의존성 lockfile,
Archive 경로는 추적 검사에서 제외할 수 있다.

PR에는 연결 Issue, 변경 요약, 검증 결과와 위험만 기록한다. ADR·TS·EXP가 실제로 생겼을
때만 링크하고, 모든 PR에 문서를 의무적으로 생성하지 않는다.

## 완료와 보관

- Issue 성공 기준과 자동·수동 검증 증거가 일치할 때 Task를 닫는다.
- Work Record를 `done`으로 바꾸고 상세 기록은 archive로 이동할 수 있다.
- 현재 계약·절차에서 더 이상 유효하지 않은 ADR·Runbook은 `superseded` 또는 `retired`로
  표시하고 대체 문서를 링크한다.
- Archive는 과거 사실을 보존하는 읽기 전용 영역이다. 현재 명령과 상태를 판단하는 데
  사용하지 않는다.
- 실행 결과의 포트폴리오 서사는 Case Study 한 곳에 모은다.

## 품질 규칙

- 빈 섹션, 임시 placeholder, 중복 ID와 깨진 활성 내부 링크를 남기지 않는다.
- 검증 전에는 `done`, `accepted`, `verified`, `completed`를 사용하지 않는다.
- 외부 링크 availability는 필수 CI와 분리한다.
- 비밀처럼 보이는 예시도 실제 값과 혼동되지 않도록 빈 값 또는 명백한 설명을 사용한다.
- 변경 후 `make check`를 실행하고 실제 Provider 호출이 없었음을 확인한다.
