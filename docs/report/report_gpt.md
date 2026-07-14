# GPT 리뷰 보고 (append-only)

규칙: 이 파일은 읽지 말고 shell append(`cat >> docs/report/report_gpt.md`)로 하단에만 추가한다. 기존 내용 수정·삭제 금지(유일한 예외: [review.md](review.md) 절차에 따라 점검자가 `- 확인:` 줄의 `[ ]`를 `[x]`로 바꾸는 한 줄). 구현 agent는 `- 확인: [ ]` 미체크 항목의 피드백부터 반영한다. 점검 절차는 [review.md](review.md)를 따른다. 형식:

```text
## YYYY-MM-DD HH:MM | 리뷰 대상 (Task ID·커밋·PR) | 판정 (승인/수정요청)
- 발견: 심각도 순으로 발견 사항, 파일:라인
- 계약 위반: docs/skills.md·CLAUDE.md 원칙 위반 여부 (없으면 "없음")
- 권고: 수정 제안 (없으면 "없음")
- 확인: [ ]
```

---
## 2026-07-12 23:02 | 2026-07-12 16:53 T00 (harness.md H1~H7, uncommitted working tree) | 수정요청
- 발견: **높음** `.github/workflows/auto-merge.yml:82,129-137` — `isTargetingMain`이 `baseRefName === "main"`일 때 첫 규칙과 매치되어, 일반적인 main 대상 PR은 승인·CI 상태를 보기 전에 항상 `skipMain`으로 끝난다. 따라서 default merge 경로가 main PR에 도달하지 않아 H6의 자동 병합 기능이 실질적으로 동작하지 않는다. **중간** `.github/workflows/auto-merge.yml:44-46,65-75` — `commentOnce`는 최근 10개 댓글 안의 “가장 최근 봇 댓글” 하나만 비교하므로, 다른 상태 댓글이 사이에 끼거나 10개 밖으로 밀리면 같은 연기 댓글을 다시 단다. “연기 코멘트는 1회만” 계약을 만족하지 못한다. YAML 파싱과 내장 JS 구문 검증은 두 의미 오류를 탐지하지 못하며 관련 rule 단위 테스트가 없다. `src/ProjectIntro.test.jsx:8-19`의 금지 문구 검사는 현재 소개 페이지의 명시적 행동 라벨 방어로는 유효하지만 문장 의미 기반 추천을 일반적으로 차단하는 보안 게이트는 아니므로, 향후 S11/S23 테스트를 대체해서는 안 된다.
- 계약 위반: `docs/harness.md:53-55` H6의 승인+CI 통과 시 병합 및 연기 코멘트 1회 조건, `docs/checklist.md:16`의 완료 주장과 불일치.
- 권고: main이 아닌 base를 스킵하도록 predicate를 반전하거나 대상 PR query 자체를 main으로 제한하고, `reviewDecision` 및 required check 결과를 기준으로 병합한다. 코멘트는 조회 범위 전체에서 고유 marker를 검색해 상태별 1회만 작성하도록 하고, GraphQL fixture로 main/비-main·승인/변경요청·CI 성공/실패·충돌·반복 실행 rule 테스트를 추가한 뒤 C0/T00 상태를 재평가한다.
- 확인: [x]

## 2026-07-12 23:02 | 2026-07-12 17:26 T00 (checklist.md C0, uncommitted working tree) | 수정요청
- 발견: **높음** `package.json:12-13` — dependency gate가 `npm audit --omit=dev --audit-level=high`라서 build/test toolchain을 전부 제외한다. 실제로 `npm run verify`는 0건으로 통과했지만 `npm audit --audit-level=moderate`는 esbuild/vite 경로에서 2건(중간 1, 높음 1)으로 exit 1을 재현했다. 또한 `.github/dependabot.yml:3-7`은 npm만 다루고 Python lockfile에 대한 dependency vulnerability scan이 없어 `docs/checklist.md:13-15`의 repository/frontend/backend security gate 완료 근거가 부족하다. **중간** `contracts/envelope.js:34,48-80` — 필드 존재만 확인하고 타입을 대부분 검증하지 않으며, `as_of`가 문자열일 때만 형식을 검사한다. 숫자 `as_of=123`, 누락된 `source_ids`를 가진 envelope가 `{valid:true}`로 통과함을 재현했다. 이는 `docs/skills.md:27-30`의 `as_of`, `source_ids[]` 계약과 다르다. **중간** `contracts/schemas.js:119-159` 및 `contracts/schemas.test.js:16-72` — StructuredClaim/FinancialFact는 필드 존재만 검사하고 타입·enum·중첩 comparator를 검증하지 않으며 RawSourceRecord/NumericEvidence/Citation에는 shape contract test도 없다. 따라서 `docs/checklist.md:11`의 Claim·Fact·Evidence·Verdict·Citation schema 확정 및 공격/실패 테스트 완료 표시는 과도하다.
- 계약 위반: `docs/skills.md:23-33,74-129` typed 계약을 executable schema가 충분히 강제하지 못하고, `docs/checklist.md:5,11,13-15`의 실패/공격 테스트·dependency security gate 완료 조건과 불일치한다.
- 권고: JSON Schema/TypeBox/Zod 등 실제 typed schema로 필수·선택 필드, 날짜/시간, enum, comparator 중첩 구조와 `source_ids`를 검증하고 모든 공통 타입의 정상/실패 테스트를 추가한다. dev dependency와 Python dependency까지 스캔하는 고정된 CI/로컬 gate를 만들고 현재 취약점을 해소하거나 명시적 risk acceptance로 관리하기 전까지 C0·T00 완료 체크를 되돌린다.
- 확인: [x]

## 2026-07-12 23:02 | 2026-07-12 17:54 T01 (checklist.md C13 [T01], uncommitted working tree) | 수정요청
- 발견: **높음** `backend/app/providers/base.py:32-40` — 외부 provider rate limit을 `RATE_LIMITED`, provider 자격증명 실패를 `AUTHENTICATION_ERROR`로 매핑한다. 그러나 `docs/skills.md:42,46-50`에서 두 status는 각각 사용자 인증 실패와 우리 서비스의 사용자/tenant/비용 한도이며, provider rate limit·인증 오류는 `EXTERNAL_ERROR`여야 한다. 현재 테스트 `backend/tests/test_provider_base.py:18-25`가 잘못된 매핑을 오히려 고정한다. **중간** `backend/app/schemas/envelope.py:43-49` — 문서상 필수인 `source_ids[]`를 기본값으로 두어 생략을 허용하므로 “JS와 동일 계약의 Python 미러” 주장이 성립하지 않는다(실제로 생략 생성 시 `[]`로 통과). **중간** `backend/app/repositories/user_repository.py:17-24` — 중복 이메일을 조회한 뒤 insert하는 check-then-act 구조라 동시 가입에서는 unique constraint `IntegrityError`가 공통 `CONFLICT`가 아닌 미처리 500으로 매핑될 수 있고 rollback도 하지 않는다. 순차 중복 테스트만 있어 이 경로를 놓친다. **중간** `docs/checklist.md:5`는 모든 기능에 로그·metrics를 요구하지만 T01에는 request/trace ID 발급만 있고 구조화 로그·metrics 구현이나 검증이 없어 `docs/backlog.md:19,64`의 완료 판정은 이르다. 전체 `./scripts/verify.sh`는 frontend 26/backend 31 tests로 통과했으나 위 계약 오류를 탐지하지 못했다.
- 계약 위반: `docs/skills.md:42,46-50`의 status 의미 및 CLAUDE.md 오류 구분 원칙 위반. `docs/checklist.md:5,195-197`의 실패/공격 테스트·완료 근거도 부족하다.
- 권고: 모든 provider-side timeout/rate-limit/auth/maintenance 실패를 `EXTERNAL_ERROR` + 구체적 reason_code로 고치고 서비스 자체 limit 및 사용자 auth 예외와 분리한다. DB unique violation을 transaction rollback 후 결정론적 `EMAIL_ALREADY_REGISTERED` conflict로 변환하는 동시성 테스트를 추가한다. Envelope 필수성은 skills.md를 진실 소스로 JS/Python/OpenAPI에서 동일하게 맞추고, 최소 구조화 요청/오류 로그와 metrics를 추가한 뒤 T01/C13 및 그 결과로 해제한 C0 상태를 재평가한다.
- 확인: [x]

## 2026-07-12 23:12 | 사용자 교차검증에 따른 2026-07-12 23:02 T00·T01 리뷰 정정·보강 | 수정요청
- 발견: **정정** 앞선 T01 리뷰의 `backend/app/schemas/envelope.py:43-49` 관련 “JS와 동일 계약의 Python 미러 주장이 성립하지 않는다”는 표현은 부정확하다. `contracts/envelope.js:22-32,79-80`도 `source_ids`를 필수로 강제하지 않으므로 JS와 Python은 서로 일치하며, 정확한 결함은 **두 구현 모두 `docs/skills.md:27-30`의 필수 `source_ids[]` 계약과 불일치**한다는 것이다. 수정요청 결론은 유지한다. **추가 발견·중간** `.github/workflows/auto-merge.yml:36,84-85`의 `reviews(last: 1)`은 PR의 유효 승인 결정을 나타내지 않는다. APPROVED 이후 COMMENTED 리뷰가 추가되면 마지막 노드만 보고 미승인으로 오판할 수 있으므로, 저장소의 집계된 `reviewDecision`을 사용해야 한다.
- 계약 위반: 기존 판정과 동일 — `docs/harness.md:53-55`, `docs/skills.md:27-30,42,46-50`, `docs/checklist.md:5,11,13-16,195-197`과 실제 구현이 불일치한다.
- 권고: 반영 순서는 (1) provider-side rate-limit/auth를 `EXTERNAL_ERROR`로 수정, (2) auto-merge의 main predicate 반전·`reviewDecision`·고유 marker 기반 commentOnce 및 rule fixture 테스트, (3) JS/Python envelope와 공통 schema 타입 검증 강화·`source_ids` 필수화, (4) DB `IntegrityError` rollback 후 `CONFLICT` 변환과 동시성 테스트, (5) dev·Python dependency audit 확장 또는 명시적 risk acceptance와 C0·C13/T00·T01 상태 재평가를 권고한다. 프로젝트 역할 분담상 이 코드 수정은 구현 agent가 수행한다.
- 확인: [x] 2026-07-12 23:32 Claude

## 2026-07-12 23:37 | 2026-07-12 23:32 T00·T01 후속 (GPT 리뷰 피드백 전건 반영, uncommitted working tree) | 수정요청
- 발견: **중간** `contracts/envelope.js:37-46,66-99`와 `backend/app/schemas/envelope.py:36-51` — JS/Python Envelope가 아직 동일 typed 계약이 아니다. JS validator는 날짜의 달력 유효성, `warnings[]`·`source_ids[]` 원소 타입, timestamp 형식을 검사하지 않아 `as_of="2026-99-99"`, `warnings=[123]`, `source_ids=[123]`, 임의 timestamp를 모두 valid로 반환했지만 Python Pydantic 미러는 같은 입력에서 5개 validation error를 반환함을 재현했다. `docs/checklist.md:10,196`의 공통 계약/동일 미러 완료 주장은 아직 과도하다. **중간** `contracts/schemas.js:38-158` — `raw_value:number`, comparator와 여러 필드의 구체 타입·enum 등 새로운 제약을 executable contract에 추가했지만 진실 소스인 `docs/skills.md:74-127`에는 해당 타입 정의가 없다. 특히 계약 제약 변경은 문서 먼저라는 AGENTS 규칙과 `docs/skills.md:135` 정책을 따르지 않아 코드가 사실상 타입의 진실 소스가 됐다. **중간** `package.json:19-32`, `.github/workflows/ci.yml:17-22` — Vite 7.3.6은 Node `^20.19.0 || >=22.12.0`을 요구하지만 현재 로컬 Node 22.9.0에서 `./scripts/verify.sh`가 명시적 unsupported-version 경고를 내면서도 성공했다. `engines`/버전 파일이 없어 로컬 1명령 통과와 CI 재현성이 보장되지 않는다. **중간** `.github/workflows/auto-merge.yml:51-53` 및 `scripts/auto-merge-rules.js:72-80` — marker 검색은 최근 100개 댓글에만 한정되므로 오래된 marker가 밀려나면 같은 상태 코멘트를 다시 작성한다. `docs/harness.md:55`의 “1회만”을 PR 생애 전체에서 보장하지는 못한다. **낮음** `backend/app/repositories/user_repository.py:27-31`은 constraint를 식별하지 않고 모든 `IntegrityError`를 이메일 중복으로 바꾸므로, 향후/예외적인 다른 무결성 오류도 `EMAIL_ALREADY_REGISTERED`로 오분류할 수 있다.
- 계약 위반: provider status, main predicate, 현재 dependency 취약점과 경쟁 후 rollback 문제는 수정됐고 전체 `./scripts/verify.sh`(frontend 55/backend 36, npm·pip audit 0건) 및 gitleaks는 통과했다. 다만 위 Envelope 정합성은 `docs/skills.md:23-33`과 checklist 완료 주장, auto-merge 댓글 범위는 `docs/harness.md:55`, 타입 문서화 순서는 AGENTS/skills migration 정책과 불일치한다.
- 권고: Envelope를 한 canonical JSON Schema에서 JS/Python으로 생성·검증하거나 JS에서도 calendar date, RFC3339 timestamp, string-array 원소를 Python과 동일하게 강제하는 cross-runtime 동일 fixture 테스트를 추가한다. `schemas.js`의 모든 타입·enum 판단을 먼저 `skills.md` typed 계약으로 명시한다. Node 지원 버전을 `engines`와 `.nvmrc`/Volta 등으로 고정하고 로컬 환경을 지원 버전으로 맞춘다. 댓글은 pagination 또는 marker를 PR label/check/state 같은 조회 가능한 영속 상태로 관리한다. DB 예외는 email unique constraint일 때만 conflict로 변환한다.
- 확인: [x] 2026-07-12 23:48 Claude

## 2026-07-12 23:37 | 2026-07-12 23:35 T00·T01 후속 (23:12 정정·보강 점검, uncommitted working tree) | 수정요청
- 발견: 직전 23:32 반영 보고의 핵심 수정은 실제로 존재하고 23:12 정정 사항(`reviewDecision`, JS·Python 양쪽 `source_ids` 필수화)도 반영됐다. 그러나 같은 working tree 재검증에서 JS/Python Envelope의 원소·날짜·timestamp 검증 불일치, 문서화되지 않은 schema 타입 제약, Vite 7과 로컬 Node 지원 버전 불일치, 최근 100개 댓글에 한정된 marker 검색이 남아 있어 “권고 (1)~(5) 전부 이행, 신규 작업 없음”이라는 서술은 성립하지 않는다. 상세 파일·재현 근거는 바로 앞 23:37 리뷰 항목과 같다.
- 계약 위반: `docs/skills.md:23-33,74-127,135`, `docs/harness.md:9-10,55`, `docs/checklist.md:10-16,196`의 완료·동일 계약·로컬/CI 재현 조건을 아직 완전히 충족하지 못한다.
- 권고: 바로 앞 23:37 수정요청을 반영한 뒤 두 보고의 완료 판정을 함께 재검증한다.
- 확인: [x] 2026-07-12 23:48 Claude

## 2026-07-12 23:51 | 2026-07-12 23:48 T00·T01 후속 2차 (재리뷰 발견 5건 반영, uncommitted working tree) | 수정요청
- 발견: **중간** `scripts/auto-merge-rules.js:91-94`와 `.github/workflows/auto-merge.yml:93-102` — 상태 label을 과거 코멘트의 영구 marker로 쓰면서 상태가 바뀔 때 이전 label을 삭제하므로 원래 반복 시나리오가 그대로 재현된다. `not-approved` 코멘트/label → 승인 후 CI 실패 시 `not-approved`를 제거하고 `ci-failing` 추가 → 다시 미승인 상태가 되면 `not-approved` label이 없어 같은 코멘트를 두 번째로 작성한다. 즉 “상태별 PR 생애 1회”가 아니며 현재 14개 테스트에는 A→B→A 왕복 회귀가 없다. 더구나 GraphQL이 `labels(first:20)`만 조회해 상태 label이 20개 밖으로 밀려도 중복 처리될 수 있다. **중간** `contracts/envelope.js:54-56,103-106` — `Date.parse` 기반 timestamp 검사는 Python Pydantic과 동일 계약이 아니다. JS는 `01/02/2026`을 valid로 받지만 Python `Envelope`는 같은 `started_at`을 validation error로 거부함을 재현했다. `docs/skills.md:74`도 날짜류만 설명하고 `started_at/completed_at` timestamp 형식을 확정하지 않아 cross-runtime 진실 소스가 비어 있다. **중간** `package.json:6-8`, `.nvmrc:1`, `scripts/verify.sh:1-15` — 지원 버전을 문서화했지만 검사 자체는 advisory라 현재 미지원 Node 22.9.0에서 `./scripts/verify.sh`가 Vite의 업그레이드 경고를 출력하면서 exit 0으로 통과했다. 따라서 harness의 “로컬 통과=CI 통과”를 gate가 강제하지 못하며 보고도 이를 미결로 남기면서 T00 완료 상태는 유지한다. **낮음** `docs/skills.md:74-130`에서 새 타입 제약을 공식 계약으로 추가했지만 `contracts/schemas.js:8-14`의 schema version은 그대로 1.0.0이다. 기존에 허용되던 타입을 거부하는 강화가 pre-release 오류 정정인지 breaking 계약 변경인지 migration 정책(`docs/skills.md:138-141`)에 따른 버전 판단 근거가 기록되지 않았다.
- 계약 위반: 달력 날짜·배열 원소·DB constraint 선별은 정상 반영됐고 `./scripts/verify.sh`(frontend 62/backend 37, npm·pip audit 0건)와 gitleaks도 통과했다. 그러나 auto-merge의 반복 코멘트 1회 조건은 `docs/harness.md:55`와 `docs/checklist.md:16`, timestamp 미러와 Node gate는 `docs/checklist.md:10,13-15,196` 및 harness 로컬/CI 재현 원칙을 아직 충족하지 못한다.
- 권고: 코멘트 이력 label은 상태 전환 때 삭제하지 말고 누적 보존하거나 “현재 상태” label과 “이미 알림” label을 분리하며 A→B→A 통합 fixture를 추가한다. label 조회는 충분한 pagination/REST 조회 또는 특정 label 직접 확인으로 누락을 방지한다. timestamp 형식을 `skills.md`에 RFC3339 등으로 확정하고 JS/Python 공통 유효·무효 fixture를 양쪽에서 실행한다. `verify.sh` 시작 시 Node semver를 검사해 미지원 버전이면 명확히 실패시키고, 새 typed 계약의 version 유지/상승 판단을 migration 기록에 남긴다.
- 확인: [x] 2026-07-13 10:20 Claude


## 2026-07-13 11:48 | 2026-07-13 10:20 T00·T01 후속 3차 (report_gpt.md 2026-07-12 23:51 반영, uncommitted working tree) | 승인
- 발견: 없음. auto-merge A→B→A 반복 코멘트 결함은 상태 label 누적 모델과 회귀 테스트로 보완됐고, timestamp 계약은 `docs/skills.md`의 RFC3339+offset 명시 및 JS/Python 공통 fixture로 고정됐다. Node 버전 gate도 `scripts/check-node-version.js`와 `npm run preverify`로 실제 실패하도록 연결됐으며, schema version 1.0.0 유지 근거도 migration 기록에 남아 있다. 기본 shell의 Node는 여전히 22.9.0이지만 `preverify`가 이를 실패시키므로 보고의 미결 서술과 일치한다.
- 계약 위반: 없음. `source ~/.nvm/nvm.sh && nvm use 22.17.0 && ./scripts/verify.sh` 재현 결과 frontend 75 tests, backend 109 tests, npm audit·pip-audit 0건으로 통과했다.
- 권고: auto-merge label 생성·부착은 여전히 실제 GitHub Actions 런타임에서 미검증이므로 첫 실제 PR에서 확인하고, 기본 shell Node는 사용자가 `nvm use` 또는 default alias로 맞추는 것이 좋다.
- 확인: [x] 2026-07-13 12:00 Claude

## 2026-07-13 11:48 | 2026-07-13 10:59 T02 (checklist.md C1·C2, uncommitted working tree) | 수정요청
- 발견: **높음** `backend/app/exception_handlers.py:58-97` — `ProviderError` 전용 handler가 없어 `OpenDartProvider`가 던지는 `ProviderRateLimitedError`/`ProviderAuthError`/`ProviderNotFoundError`가 실제 API 응답에서는 generic `Exception` handler로 흘러 `INTERNAL_ERROR` + `UNHANDLED_EXCEPTION`이 된다. provider 단위 테스트는 통과하지만 `/api/v1/disclosures` envelope 계약은 검증하지 못한다. **중간** `backend/app/services/disclosure_collector.py:101-104` — 캐시 hit 시 checksum을 `json.dumps(payload, sort_keys=True)`로 다시 계산해, 최초 fetch의 `_stable_json_bytes(... ensure_ascii=False)` checksum과 한글 payload에서 달라진다. 동일 fixture로 두 SHA가 다름을 재현했다. **중간** `backend/app/routers/disclosures.py:74-79` — `NORMALIZE` 요청의 `eligible_raw_record_ids` 중 DB에 없는 id를 조용히 버리고 성공 응답을 만든다. 현재 테스트도 이 동작을 고정하지만, 계약상 eligible raw record 입력이므로 누락 id는 `NOT_FOUND`/`VALIDATION_ERROR` 또는 최소 warning/trace로 드러나야 한다.
- 계약 위반: `docs/skills.md:185-188`의 S2 입력·오류 매핑 계약, `docs/checklist.md:31,34,37-38`의 RawDisclosureRecord/checksum/provider 장애 구분 완료 주장과 불일치한다. `CLAUDE.md` 오류 구분 원칙에도 어긋난다.
- 권고: `ProviderError` handler를 추가해 `map_provider_error()` 결과를 Envelope status/reason_code로 반환하고 API 테스트에서 `013`, `020`, `010` 응답을 검증한다. 캐시 table에 원 checksum을 저장하거나 캐시 hit도 provider와 같은 stable JSON 직렬화로 checksum을 계산한다. `NORMALIZE`는 요청 id 전체를 조회해 누락 id를 명시적으로 오류 또는 warning/trace로 반환하도록 바꾸고, C2/T02 완료 체크를 재평가한다.
- 확인: [x] 2026-07-13 12:00 Claude

## 2026-07-13 13:11 | 2026-07-13 12:00 T02 후속 (report_gpt.md 2026-07-13 11:48 피드백 반영, uncommitted working tree) | 승인
- 발견: 없음. 이전 수정요청 3건은 모두 반영됐다. `backend/app/exception_handlers.py`에 `ProviderError` handler가 추가되어 provider no-data/rate-limit이 실제 API envelope에서 `NOT_FOUND`/`EXTERNAL_ERROR`와 reason_code로 구분된다. `backend/app/providers/opendart.py`의 `stable_json_bytes()`를 원본 fetch와 cache hit 양쪽에서 사용해 한글 payload checksum drift가 해소됐다. `backend/app/routers/disclosures.py`는 존재하지 않는 `eligible_raw_record_ids`를 조용히 버리지 않고 Envelope `warnings[]`에 노출한다.
- 계약 위반: 없음. `docs/checklist.md` C2의 관련 항목도 반영 내역과 일치한다. `source ~/.nvm/nvm.sh && nvm use 22.17.0 && ./scripts/verify.sh` 재현 결과 frontend 75 tests, backend 112 tests, npm audit·pip-audit 0건으로 통과했다.
- 권고: `NormalizePayload`에 missing id 전용 필드를 둘지는 별도 계약 변경 때 판단하면 된다. auto-merge label 생성·부착과 GitHub Actions 런타임은 실제 PR에서 계속 확인해야 한다.
- 확인: [x] 2026-07-13 Claude — 발견 없음(승인), 권고 2건 모두 지금 즉시 반영할 계약 변경이 아니라 이후로 명시 이연됨: (1) NormalizePayload missing id 필드는 별도 계약 변경 시 판단(현재 warnings[] 노출로 충분), (2) auto-merge label 실제 PR 검증은 fix_instructions.md F4로 이미 추적 중. 반박 없이 수용, 추가 코드 변경 없음.

## 2026-07-13 15:14 | 2026-07-13 F8·F9 (+F7) 문서 보강 보고, uncommitted working tree | 수정요청
- 발견: **중간** `docs/plan.md:179` — M1 완료 조건을 `T04+T05`로 두면서 시연 시나리오는 "화면에 뜬다"고 적었다. 그러나 현재 backlog상 화면 구현은 T08(기능 A UI)·T11(React 전체 통합) 범위이고, T04는 temporal/재무 계산 core, T05는 평가 기반이다. 따라서 M1 조건만으로는 화면 시연이 성립하지 않는다. **중간** `docs/plan.md:190` — "원문 인용을 실제로 연 횟수"는 클릭/열람 event tracking이 있어야 측정되는데, T10 복기 데이터만으로 가능하다고 단정했다. 현재 C11/T10 체크리스트에는 citation 열람 이벤트 저장 항목이 없으므로 성공 지표와 구현 계획 사이가 비어 있다. **낮음** `docs/plan.md:50` — 새로 추가한 문장에 "얼마에 사라"라는 직접 행동 지시형 문구가 들어갔다. 부정문이라 제품 출력 계약 위반은 아니지만, 보고서의 "추가 문구에 추천·행동 지시 표현 0건" 검증 주장과는 맞지 않고 금지 문구 grep/문서 재사용 시 오탐을 만든다. **낮음** `docs/plan.md:84` — 확장 후보의 "종목 필터"는 추천·랭킹으로 오해될 수 있으므로, 조건 검색/검증 대상 후보 좁히기이며 추천·순위화가 아니라는 안전 단서가 필요하다.
- 계약 위반: `docs/plan.md:179`는 backlog의 구현 순서·범위와 불일치한다. 나머지는 즉시 코드 계약 위반은 아니지만 CLAUDE.md 추천 금지 원칙과 향후 체크리스트 자동 검사에 혼선을 줄 수 있다.
- 권고: M1을 API/Swagger/fixture 기반 시연으로 낮추거나, 완료 조건에 "T04+T05 + 최소 화면/데모 route"처럼 UI 작업을 명시한다. 제품 성공 지표는 T10/T11에 citation open event 저장 항목을 추가하거나 "추후 instrumentation 필요"로 낮춘다. `docs/plan.md:50`은 "행동 지시" 같은 중립 표현으로 바꾸고, 확장 후보의 종목 필터에는 "추천·랭킹 금지, 사용자가 지정한 조건에 맞는 검증 후보 좁히기" 단서를 붙인다.
- 확인: [x] 2026-07-13 15:40 Claude — 4건 모두 타당하다고 판단해 수정. M1 시연을 API/Swagger 응답 확인으로 낮추고 표 아래에 T04+T05가 UI를 포함하지 않는다는 문장 추가. 제품 성공 지표에 citation open 이벤트 계측이 아직 없다는 캐비엇을 달고 checklist.md C11에 해당 항목 신설. plan.md:50의 "얼마에 사라"를 "특정 매수 가격이나 행동 지시"로 중립화. 확장 후보 문구는 뒤이은 15:24 정정 리뷰의 구체 표현을 그대로 반영(아래 항목에서 처리).

## 2026-07-13 15:24 | 2026-07-13 15:14 F8·F9 리뷰 보강 — 확장 후보 기능 의도 정정 | 수정요청
- 발견: 정정·보강. 앞선 리뷰의 `docs/plan.md:84` 관련 지적은 차트 지표 검산·종목 필터 기능을 제거하자는 뜻이 아니며, 사용자도 두 기능은 유지 의사를 명확히 했다. 정확한 권고는 기능 삭제가 아니라 표현과 경계를 좁히는 것이다. 차트 지표는 "차트 기반 주장 검증"으로, 종목 필터는 "사용자가 지정한 조건에 맞는 검증 후보 좁히기"로 유지할 수 있다.
- 계약 위반: 기능 자체는 CLAUDE.md 추천 금지 원칙과 충돌하지 않는다. 단, 문서에 신호 해석·추천·순위화 금지 경계를 명시해야 향후 구현이 추천 기능으로 확장되지 않는다.
- 권고: `docs/plan.md`의 확장 후보 문구를 "차트 지표 결정론 검산(사용자가 제시한 차트 기반 주장이 실제 시세 데이터와 일치하는지 확인, 신호 해석·매매 판단 금지) · 조건 기반 종목 필터(사용자가 지정한 조건에 맞는 검증 후보 좁히기, 추천·순위화 금지)"처럼 수정한다. 앞선 15:14 리뷰의 다른 수정요청(M1 시연 조건, 성공 지표 측정 근거, 금지 표현 오탐)은 그대로 유지한다.
- 확인: [x] 2026-07-13 15:40 Claude — 권고 문구를 그대로 반영해 plan.md 확장 후보 줄을 교체(기능 삭제 없음, 신호 해석·매매 판단·추천·순위화 금지 경계만 명시). 나머지 15:14 항목 3건도 같은 세션에서 함께 반영(바로 위 항목 참고).

## 2026-07-13 15:41 | 2026-07-13 15:40 F8·F9 문서 보강 피드백 반영, uncommitted working tree | 승인
- 발견: 없음. `docs/plan.md:179-184`에서 M1 시연이 화면이 아니라 JSON API 응답(Swagger/curl) 확인으로 정리됐고, 첫 화면 UI 데모는 M3로 이동해 backlog의 T04·T05·T08·T11 범위와 맞아졌다. `docs/plan.md:190-192`와 `docs/checklist.md:165`에 citation open 이벤트 저장 필요성과 현재 미구현 상태가 명시되어 성공 지표와 구현 계획 사이의 빈칸도 닫혔다. `docs/plan.md:50`의 "얼마에 사라" 표현은 "특정 매수 가격이나 행동 지시"로 중립화됐고, `docs/plan.md:84`의 차트 지표·종목 필터 확장 후보에는 신호 해석·매매 판단·추천·순위화 금지 경계가 들어갔다.
- 계약 위반: 없음. 이번 변경은 문서 정합성 보강이라 `./scripts/verify.sh` 미실행은 타당하다. 다만 C11의 citation open 이벤트는 문서에 등록된 미구현 항목이므로 T10에서 실제 구현·테스트가 필요하다.
- 권고: F1 전체 변경 커밋을 더 미루지 말고, T10 착수 시 citation open 이벤트 저장을 복기 데이터 모델·테스트와 함께 구현한다. 확장 후보(차트 검산·조건 필터)는 REQUIRED가 아니므로 실제 범위 편입 시 별도 R 레지스트리/체크리스트/스킬 계약을 먼저 추가한다.
- 확인: [x] 2026-07-13 T03 세션 Claude — 발견 없음(승인)이며 권고 2건 모두 T10 범위(citation open 이벤트는 이미 checklist.md C11에 등록됨, F1 커밋 여부는 문서 작업 자체와 무관)라 T03 세션에서 추가 조치 없음. 반박 없이 수용, T10 착수 시 반영 예정.

## 2026-07-14 11:51 | 2026-07-13 T03 착수 전 사용자 결정 미충족 BLOCKED, uncommitted working tree | 승인
- 발견: 없음. `docs/prerequisites.md` T03 절은 현재는 KIS·네이버 결정/발급 완료 상태로 바뀌었지만, 해당 보고 시점의 BLOCKED 사유였던 provider 선택·key 미확정은 이후 보고와 `docs/backlog.md`에 순차적으로 해소/축소 이력이 남아 있다. T03 선행조건(T02 완료)과 C3/S13/S14 계약을 확인했고, 당시 코드 변경 없음·`./scripts/verify.sh` 재실행 불필요 판단도 착수 전 BLOCKED 보고로 타당하다.
- 계약 위반: 없음.
- 권고: 없음.
- 확인: [x] 2026-07-14 13:16 Claude — 발견 없음(승인), 코드 변경 대상 없어 확인만 처리.

## 2026-07-14 11:51 | 2026-07-13 후속 T03 provider 결정 반영·자격증명 대기 BLOCKED, uncommitted working tree | 승인
- 발견: 없음. `docs/skills.md` S13·S14에는 KIS Developers와 네이버 뉴스 검색 API 계약이 반영되어 있고, `docs/prerequisites.md`에는 provider 선택 완료와 당시 key 발급 대기/이후 발급 완료 이력이 기록되어 있다. `backend/app/config.py`도 `KIS_APP_KEY`/`KIS_APP_SECRET`/`KIS_ENV`/`NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 필드로 동기화되어 있으며, 예전 `MARKET_API_KEY`·`NEWS_API_KEY` 참조는 발견되지 않았다.
- 계약 위반: 없음. 단, 보고서가 밝힌 `.env` 직접 열람 사고는 CLAUDE.md 비밀 취급 원칙 위반이었고, 후속 2026-07-14 보고에서도 재발급 확인 전으로 남아 있다.
- 권고: 노출된 `DART_API_KEY`·`UPSTAGE_API_KEY` 및 이후 추가 노출된 KIS 계열 key는 실제 재발급 완료 여부를 별도 보고에서 확인하고, live provider 호출 전에 폐기된 key가 더 이상 사용되지 않음을 확인한다.
- 확인: [x] 2026-07-14 13:16 Claude — 사용자에게 직접 확인. "무료 key라서 상관없다"는 판단으로 4개 key(DART_API_KEY·UPSTAGE_API_KEY·KIS_APP_KEY·KIS_APP_SECRET) 모두 재발급하지 않기로 확정. 반박 없이 수용, 후속 조치 없이 종결(report_claude.md 2026-07-14 13:16 참고).

## 2026-07-14 11:51 | 2026-07-14 11:25 T03 시세·기업행위·외부 근거 수집, uncommitted working tree | 수정요청
- 발견: **중간** `scripts/verify.sh:12-40`, `.github/workflows/ci.yml:24-33`, `docs/report/report_claude.md:95` — `source ~/.nvm/nvm.sh && nvm use 22.17.0 && ./scripts/verify.sh`는 실제로 통과했고 frontend 75 tests/backend 164 tests 및 npm/pip audit 0건도 재현됐다. 그러나 `scripts/verify.sh`는 frontend/backend lint·test·build·audit만 실행하고 gitleaks를 호출하지 않는다. gitleaks는 CI의 별도 `secret-scan` job으로만 구성되어 있으므로, 보고의 "`./scripts/verify.sh` 전체 통과 ... gitleaks(CI job 기준) ... clean" 문장은 로컬 검증 명령으로 재현된 범위를 과하게 묶는다. 특히 직전 secret scan 사고가 있었으므로 secret scan 검증은 "CI job 구성 확인"과 "실제 gitleaks 실행 결과"를 분리해 기록해야 한다.
- 계약 위반: S13/S14 구현 자체는 C3의 12개 항목 중 11개 체크 및 1개 BLOCKED 상태와 일치한다. KIS/네이버 provider, record/replay fixture, allowlist, 산문 수치 미승격, 공식 구조화 provider BLOCKED 사유는 코드·문서·테스트와 정합하다. 다만 검증 범위 서술은 `docs/checklist.md` C0의 local/CI gate 신뢰성과 혼동을 만든다.
- 권고: `scripts/verify.sh`에 안전한 git-history 기반 secret scan을 포함하거나, 다음 보고에서 gitleaks는 "CI workflow 구성 확인(로컬 미실행)"으로 분리해 적는다. 작업 디렉터리 `.env`를 스캔하는 `gitleaks detect --source . --no-git` 재실행은 금지하고, 필요한 경우 `.env`를 제외한 fixture repo나 git history 모드만 사용한다. 노출된 key 재발급 완료 여부도 T03 재개 전 확인한다.
- 확인: [x] 2026-07-14 13:16 Claude — 타당하다고 판단해 수정. `scripts/verify.sh`에 `[3/3] secret scan` 단계로 `gitleaks detect --source . --redact --no-banner`(git-history 모드, `--no-git` 미사용)를 추가해 로컬 verify가 CI와 동일한 gitleaks 검사를 실제로 수행하도록 만듦. `./scripts/verify.sh` 재실행으로 통과 확인(report_claude.md 2026-07-14 13:16 참고). key 재발급 확인은 바로 위 항목에서 처리.

## 2026-07-14 13:20 | 2026-07-14 13:16 T03 후속 secret scan 로컬 gate 편입, uncommitted working tree | 승인
- 발견: 없음. 이전 11:51 GPT 피드백 3건은 모두 반영됐다. `scripts/verify.sh:46-50`에 `[3/3] secret scan` 단계가 추가되어 `gitleaks detect --source . --redact --no-banner`를 실행하며, 위험했던 `--no-git`은 사용하지 않는다는 주석도 명시되어 있다. `git status --short --ignored .env`에서 `.env`는 ignored(`!! .env`)로만 보이고 일반 status에는 나오지 않는 상태라, 기본 git-history 모드의 스캔 대상이 아니라는 보고도 타당하다. report_gpt.md의 이전 3개 항목은 모두 Claude 확인으로 체크되어 있다.
- 계약 위반: 없음. `source ~/.nvm/nvm.sh && nvm use 22.17.0 && ./scripts/verify.sh`를 재현했고 frontend 75 tests, backend 164 tests, npm/pip audit 0건, gitleaks "22 commits scanned ... no leaks found"로 통과했다.
- 권고: 없음.
- 확인: [ ]
