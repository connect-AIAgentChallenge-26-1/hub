# GitHub Flow와 병합 기준

## Branch와 Issue

`main`은 항상 병합 가능하게 유지한다. `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`,
`test/`로 시작하는 짧은 branch에서 작업하고 장기간 유지하는 `develop`은 두지 않는다.

Task 상태, 담당자와 완료 기준은 GitHub Issue에서만 관리한다. Roadmap이나 Work Record에
상태를 복제하지 않는다. 구현을 시작할 때 Issue를 진행 상태로 바꾸고, 중요한 작업에만
`in-progress` Work Record를 만든다.

## PR 검토 기준

- `Closes #<issue>` 또는 `Relates #<issue>`로 범위를 연결한다.
- 사용자·시스템 관점의 변경 결과와 비범위를 설명한다.
- 실행한 자동·수동 검증과 결과를 기록한다.
- 보안·데이터·호환성 위험과 rollback을 설명한다.
- API·이벤트·DB·LLM·실행 계약이 바뀌면 같은 PR에서 정본을 갱신한다.
- AI가 만든 변경을 사람이 diff와 검증 결과로 확인한다.

Work Record, ADR, Troubleshooting과 Experiment 링크는 해당 문서가 실제로 필요한 PR에만
추가한다. 형식 채우기를 위해 빈 문서를 만들지 않는다.

## 병합

CI 통과와 review thread 해결 뒤 사용자가 수동 squash merge한다. PR 제목은 squash commit이
되므로 Conventional Commit 형식을 사용한다. 예약 자동 병합, 충돌 PR 자동 종료와 workflow의
권한 우회는 사용하지 않는다.

협업 저장소에서는 `main` 직접 push 금지, 필수 status check, 대화 해결, force push·삭제
금지를 권장한다. 별도 reviewer가 있는 경우 최소 한 명의 승인을 요구한다. 개인 Fork처럼
동일한 소유자만 작업하는 저장소에서는 승인을 기계적으로 강제하는 대신 작성자가 전체
diff, CI와 rollback을 명시적으로 self-review한다. 원격 보호 규칙은 관리자가 GitHub에서
설정하며 저장소 workflow가 임의로 변경하지 않는다.
