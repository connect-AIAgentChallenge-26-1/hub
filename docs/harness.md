# 하네스 구축 지시서 — 최소 검증 루프

이 문서는 agent가 자기 작업을 **사람 없이 통과/실패로 판정받는 최소 피드백 루프**를 만들기 위한 구현 지시서다. [backlog.md](backlog.md) T00의 품질 게이트 부분을 구체화하며, 완료 조건은 [checklist.md](checklist.md) C0의 해당 항목이다.

사용법: `docs/harness.md 지시서대로 하네스를 구축해줘`라고 지시한다.

## 설계 원칙

1. **로컬 1명령** — agent는 코드를 고친 뒤 명령 하나(`npm run verify`)로 전체 게이트를 돌린다. 명령이 여러 개면 agent가 일부를 빼먹는다.
2. **CI = 로컬 재실행** — CI는 로컬과 같은 명령을 그대로 실행한다. 로컬 통과 = CI 통과가 보장돼야 한다.
3. **차단력 최소 보장** — 게이트 수는 최소로 하되, 있는 게이트는 실제로 실패를 차단해야 한다. 항상 통과하는 게이트는 만들지 않는다.
4. **확장 슬롯 예약** — backend(T01)가 생기면 pytest·ruff·mypy가 같은 `verify` 명령과 CI에 추가된다. 지금 그 자리를 비워두되 구조는 미리 잡는다.

## 구현 항목

### H1. 로컬 verify 명령

- `package.json`에 다음 script를 추가한다:
  - `lint` — ESLint (frontend)
  - `test` — Vitest (frontend)
  - `verify` — `lint → test → build`를 순서대로 실행하고 하나라도 실패하면 비0 종료
- backend가 생기면 `verify`가 backend 검사(ruff·mypy·pytest)까지 포함하도록 shell script(`scripts/verify.sh`)로 승격한다. 지금은 npm script로 충분하다.

### H2. Frontend lint

- ESLint flat config를 추가한다. Vite React 템플릿 표준 구성(`eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`) 수준이면 충분하다.
- 기존 `src/` 코드가 lint를 통과하도록 수정한다. 규칙을 꺼서 통과시키지 않는다.

### H3. Frontend 테스트 기반

- Vitest + React Testing Library를 설치하고 `src/` 에 최소 1개의 실제 의미 있는 테스트를 만든다 (예: ProjectIntro가 렌더링되고 추천성 문구가 없는지 — CLAUDE.md 절대 원칙 1과 연결).
- placeholder(`expect(true).toBe(true)`)는 금지한다. 테스트 lane의 존재 이유는 "테스트가 실패할 수 있음"을 증명하는 것이다.

### H4. Secret scan

- gitleaks를 CI에 추가한다 (`gitleaks/gitleaks-action`).
- `.env`가 ignore되어 있어도 과거 커밋·문서에 key가 섞이는 사고를 잡는 것이 목적이다.
- 로컬 실행 방법(`brew install gitleaks && gitleaks detect`)을 README 또는 이 문서에 기록한다.

### H5. CI workflow

- `.github/workflows/ci.yml`을 만든다:
  - trigger: `pull_request`, `push`(main)
  - job 1 `frontend`: checkout → Node 설치 → `npm ci` → `npm run verify`
  - job 2 `secret-scan`: gitleaks
  - job 3 `backend`: **T01 전까지 주석 처리된 슬롯**으로 남긴다 (ruff·mypy·pytest)
- 모든 job 실패는 workflow 실패다. `continue-on-error` 금지.

### H6. auto-merge 수정

기존 [auto-merge.yml](../.github/workflows/auto-merge.yml)은 품질 게이트 없이 머지하고 충돌 PR을 자동 close한다. T00 정책에 맞게 수정한다:

- 머지 조건에 **CI(위 ci.yml) 성공 + 리뷰 승인(APPROVED)** 을 추가한다.
- 충돌 PR은 close하지 않고 코멘트로 충돌 사실만 알린다.
- 조건 미충족 PR은 건너뛴다 (연기 코멘트는 1회만, 반복 코멘트 금지).

### H7. 차단력 검증 (red → green)

하네스는 "실패를 실제로 차단하는지" 증명해야 완료다. 각 게이트에 대해:

1. 고의로 실패하는 변경을 만든다 (lint 위반 코드, 실패하는 테스트, 가짜 secret 문자열).
2. `npm run verify` 또는 해당 게이트가 **실패하는 것을 확인**하고 출력을 기록한다.
3. 변경을 되돌리고 통과를 확인한다.

이 red→green 기록이 없으면 게이트를 완료로 표시하지 않는다.

## 완료 조건 (checklist C0 매핑)

이 지시서 완료 시 C0에서 체크되는 항목:

- [ ] repository-level build·test·lint workflow와 gate 정책 구성 (H1·H2·H3·H5)
- [ ] frontend lint, secret scan 구성 (H2·H4) — backend lint·type check는 T01에서 이 하네스에 추가
- [ ] CI에 build·test·lint·security 차단 gate 연결 (H5)
- [ ] auto-merge 승인·품질 gate 추가, 충돌 자동 close와 반복 코멘트 제거 (H6)

C0의 schema·envelope·문서 동기화 항목은 이 지시서 범위 밖이며 T00의 나머지 작업으로 남는다.

## 사용자 준비물 (agent가 못 하는 것)

- GitHub 저장소 Settings → Branches → main에 branch protection 추가, ci.yml의 job을 required status check로 지정 ([prerequisites.md](prerequisites.md) 참고)

## 지시 템플릿

```text
docs/harness.md 지시서대로 하네스를 구축해줘.
H1~H7 순서로 진행하고, 각 게이트는 H7의 red→green 검증까지 완료해줘.
끝나면 checklist.md C0 해당 항목을 체크하고 backlog.md T00 상태를 갱신해줘.
```
