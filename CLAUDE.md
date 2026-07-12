# CLAUDE.md

대학생 소액 투자자를 위한 **근거 검증 Agent**. 제품 전체 범위는 [docs/plan.md](docs/plan.md), 스킬 계약은 [docs/skills.md](docs/skills.md), 구현 순서는 [docs/backlog.md](docs/backlog.md), 완료 조건은 [docs/checklist.md](docs/checklist.md), 범용 작업 규칙은 [AGENTS.md](AGENTS.md), agent 작업 시작·종료 절차는 [docs/instructions.md](docs/instructions.md)를 따른다.

## 문서 우선순위

1. 이 문서의 안전 원칙·제품 경계
2. `docs/plan.md`의 전체 완료 범위
3. `docs/skills.md`의 입력·출력·제약 계약
4. `docs/checklist.md`의 완료 조건
5. `docs/backlog.md`의 구현 순서·상태
6. 실제 코드와 자동 테스트 결과

감사 보고서는 의사결정 근거이자 시점 기록이며 현재 제품 범위를 직접 정의하지 않는다.

## 절대 원칙

1. **추천 금지** — 목표가, 매수·매도 지시, `관망·분할매수·보류` 같은 행동 라벨을 출력하지 않는다. 데이터 검증과 모델 범위 대비 가격 위치만 설명한다.
2. **환각 금지** — 원문에 없는 수치·사실·출처를 만들지 않는다. 데이터가 없으면 0이나 추정값으로 채우지 않는다.
3. **기준시점 필수** — 모든 데이터 화면·API에 `as_of`, 공시 접수일, 대상 기간을 표시한다.
4. **출처 필수** — 재무 수치·근거·판정은 공식 출처와 원문 위치로 추적 가능해야 한다.
5. **결정론 우선** — 숫자 계산과 수치 verdict는 코드가 수행하며 LLM이 덮어쓰지 못한다.
6. **정합성 강제** — 다른 기업·기간·단위·CFS/OFS·누적/단일 값을 묵시적으로 섞지 않는다.
7. **오류 구분** — 데이터 없음, 지원 불가, provider 장애, 인증 실패와 구현 오류를 구분한다.
8. **보안·격리** — 사용자·문서 입력을 신뢰하지 않으며 사용자별 데이터와 자격증명을 격리한다.
9. **주문 분리** — 분석 결과에서 주문으로 자동 연결하지 않는다. 주문 가격과 수량은 사용자가 직접 입력하고 재확인한다.

## 전체 구현 원칙

- [docs/plan.md](docs/plan.md)에 등록된 R01~R15는 모두 `REQUIRED`다.
- S1~S23, I1~I11, 기능 A~D, 인증·API·UI·평가·배포·운영을 전부 구현한다.
- 단계가 늦거나 외부 권한이 필요하다는 이유로 기능을 삭제하지 않는다. 차단 시 `BLOCKED`와 해제 조건을 기록한다.
- 안전한 부족·검증불가·비활성 상태도 정상적으로 구현해야 해당 기능을 완료로 인정한다.
- 작업 전 `skills.md` 계약을 갱신하고 코드·테스트·문서를 한 변경으로 동기화한다.

## 핵심 기능

- **A. 종목 공부** — 공시·재무·외부 근거 → 정규화 → 기업·공시·지표·원문 리포트
- **B. 가치 범위·가격 위치** — 시세·재무·peer → 복수 가치 시나리오·민감도 → 중립적 가격 위치
- **C. 근거 검증** — 자연어 → Structured Claim → 결정론 검산 + RAG·반증·인용 → 5 verdict·체크리스트·복기
- **D. 개인 주문** — 사용자 직접 지정가·수량 → paper/sandbox/개인 live-disabled adapter → 확인·주문·체결·취소

기능 D는 A/B/C와 분리된 guarded command 경로다. 공개·데모 환경에서는 paper-only이며 타인 계좌 주문은 제공하지 않는다.

## Verdict 계약

`SUPPORTED / PARTIALLY_SUPPORTED / REFUTED / INSUFFICIENT_EVIDENCE / UNVERIFIABLE`

- 원자 수치 Claim의 비교식이 거짓이면 `REFUTED`다.
- `PARTIALLY_SUPPORTED`는 부족·검증불가 없이 같은 그룹에 `SUPPORTED`와 `REFUTED` 원자 결과가 모두 있을 때만 사용한다.
- 데이터가 부족한 것과 의견·비사실 주장을 구분한다.
- 흑자전환·적자지속은 verdict가 아니라 `reason_code`다.

## 목표 아키텍처

- **Frontend**: React + Vite
- **Backend**: FastAPI + Pydantic
- **Core**: 일반 Python 결정론 정규화·계산·판정·인용 검사
- **Orchestration**: LangGraph — S8 검색·반증·재검색 조건부 루프에 한정
- **LLM**: Upstage Solar(solar-pro3, OpenAI 호환 API) Structured Outputs + S23 보안 게이트
- **Data**: PostgreSQL + migration, Chroma metadata-filtered RAG
- **Sources**: OpenDART, 공식 시세·거래소·기업행위, 허용 뉴스·공식기관, 증권사 adapter
- **Quality**: pytest, lint, type check, security scan, versioned I9 golden evaluation, CI gate
- **Operations**: 인증·권한, secrets, 암호화, 관측, backup/restore, rollback, incident runbook

## LLM 사용 경계

- S7은 Solar Structured Outputs로 Claim을 생성한 뒤 schema·원문 span·허용 필드 검사를 수행한다.
- S4의 용어 설명, S8의 서술형 근거 해석, S11의 쉬운 설명에 LLM을 사용한다.
- S3·S15·S16의 단위·기간·수치 계산은 LLM을 사용하지 않는다.
- 공시 원문과 사용자 입력은 지시가 아닌 untrusted data block으로 전달한다.
- 어떤 LLM context에도 주문 자격증명·API key·계좌 비밀을 넣지 않는다.

## 기능 D 안전 계약

- paper가 기본이며 broker sandbox를 반드시 통과한다.
- S5·S6·S8 결과를 주문 값으로 자동 입력하거나 자동 호출하지 않는다.
- 주문 전 종목·가격·수량·예상금액·수수료·quote 시각·계좌를 재확인한다.
- idempotency, 금액 한도, stale quote 차단, kill switch, 상태 reconciliation을 구현한다.
- live adapter 코드는 구현하지만 기본 비활성이고 개인 환경의 별도 승인 gate로만 활성화한다.
- 실제 활성화 전 법률·컴플라이언스·증권사 약관 검토를 별도 release gate로 둔다.

## 현재 구현 상태

현재 HEAD의 실행 코드는 Vite + React 소개 페이지 한 장이다. Backend와 S1~S23은 아직 구현되지 않았다. 문서가 목표 상태를 정의하더라도 실제 완료 여부는 [docs/checklist.md](docs/checklist.md)와 자동 테스트 결과로만 판단한다.

- [src/ProjectIntro.jsx](src/ProjectIntro.jsx) — 하드코딩된 소개용 예시
- [src/App.jsx](src/App.jsx) — 소개 컴포넌트 렌더링
- [src/main.jsx](src/main.jsx) — React 진입점

## 현재 실행 명령

```bash
npm install
npm run dev
npm run build
npm run preview
```

Backend 명령은 T01에서 package scaffold와 함께 추가하고 이 문서를 즉시 갱신한다.

## 컨벤션

- 사용자 대면 문구는 한국어, 초보자 눈높이, 추천이 아닌 검증 톤을 사용한다.
- schema·rule·model·prompt·dataset 버전을 기록한다.
- 외부 provider 계약은 공식 문서와 record/replay fixture로 검증한다.
- 새 기능은 정상 경로뿐 아니라 부족·모호·장애·공격 입력 테스트를 가져야 한다.
