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

현재 HEAD의 실행 코드는 Vite + React 소개 페이지, T00 계약 contract test, T01 backend 인증 기반(FastAPI+PostgreSQL), T02 S1·S2(종목 해석·OpenDART 공시 수집), T03 S13·S14(시세·기업행위·외부 근거 수집, 일부), T04 S3·S15(재무 계산·시점 정합성), T05 I9 골든 평가 하네스(대부분 완료, BLOCKED 1항목), T06 S7·S16·S17·S23(Structured Claim·결정론 검산, Solar 라이브 호출만 미검증), T07 S18·S19·S20·S8·S9(RAG·반증·인용·오케스트레이션·체크리스트)와 기능 C 결과 UI(S11 일부)다. S4·S5·S6·S10·S12·S21·S22(나머지 도메인 스킬)와 S11의 LLM 요약 경로는 아직 구현되지 않았다. 문서가 목표 상태를 정의하더라도 실제 완료 여부는 [docs/checklist.md](docs/checklist.md)와 자동 테스트 결과로만 판단한다.

- [src/ProjectIntro.jsx](src/ProjectIntro.jsx) — 하드코딩된 소개용 예시
- [src/App.jsx](src/App.jsx) — 소개 컴포넌트 렌더링
- [src/main.jsx](src/main.jsx) — React 진입점
- [contracts/](contracts/) — Envelope·5상태 Verdict 집계·Claim/Fact/Evidence 필드 계약의 실행 가능한 미러(frontend 쪽 contract test). 진실 소스는 여전히 [docs/skills.md](docs/skills.md)
- [backend/](backend/) — FastAPI + Pydantic v2 + SQLAlchemy + Alembic + PostgreSQL.
  - T01: 인증 기반(users, JWT, `/api/v1/auth/*`), `Envelope[T]`, provider 인터페이스
  - T02: S1 종목 해석(`app/services/company_resolver.py`, `/api/v1/companies/*`), S2 OpenDART 공시·재무·원문 수집(`app/providers/opendart.py`, `app/services/disclosure_collector.py`, `/api/v1/disclosures`)
  - T03(대부분 완료, BLOCKED 1항목): S13 시세·기업행위 수집(`app/providers/kis.py` 한국투자증권 KIS Developers Open API, `app/services/market_collector.py`, `/api/v1/market`), S14 외부 근거 수집(`app/providers/naver_news.py`, `app/services/external_evidence_collector.py`, `/api/v1/external-evidence`). 공공데이터포털/KRX 공식 구조화 provider는 자격증명이 없어 `docs/checklist.md` C3의 마지막 1항목만 BLOCKED(해제 조건은 `docs/prerequisites.md` T03 참고)
  - T04(완료): S15 시점·단위 정합성 계층(`app/services/temporal_integrity.py`, `PRE_NORMALIZE`/`POST_DERIVED`, `/api/v1/temporal-integrity`) — S2·S13의 T02·T03 시절 inline 임시 as_of 규칙을 이 중앙 서비스 호출로 교체. S3 재무 정규화·계산(`app/models/financial_fact.py`, `app/services/financial_calculator.py`, `/api/v1/financial-facts/calculate`) — 계정 매핑, CFS/OFS 선택, 누적→단일분기 변환, PER/PBR/ROE 등 지표와 버전. 삼성전자 실제 DART 재무제표로 검증(`backend/tests/fixtures/opendart/financial_calculator/`)
  - T06(완료, Solar 라이브 호출만 미검증): S16 결정론 검산(`app/services/deterministic_verifier.py` — `THRESHOLD`/`INCREASE`/`DECREASE`/`MULTIPLE`/`RATIO`/`CONTINUITY` comparator, 부호 전환 `RATIO_UNDEFINED_SIGN_CHANGE`, 도메인별 `NumericEvidence` adapter), S17 필수 근거 계획(`app/services/evidence_planner.py`), `app/services/verdict_aggregator.py`(`contracts/verdict.js` Python 미러, 그룹 `PARTIALLY_SUPPORTED`) — 이 셋은 LLM 의존이 전혀 없어 완전 검증됨. S23 LLM 보안 게이트(`app/services/llm_security_gateway.py` — 지시/데이터 분리, secret redaction, injection 패턴 trace, schema allowlist), S7 구조화 Claim 추출(`app/providers/solar.py` Upstage Solar 공식 문서 기반 구현, `app/services/structured_claim_extractor.py` — 원문 span·숫자 grounding, corp_code/as_of 강제 신뢰, F9 progressive disclosure `app/services/claim_disclosure.py`+`src/components/ClaimDisclosure.jsx`)는 httpx mock/주입 provider로 스키마·grounding·injection·malformed output·timeout까지 전부 검증했으나 `UPSTAGE_API_KEY` 미발급으로 실제 Solar 라이브 호출만 미검증(`docs/checklist.md` C7 한계 참고). `POST /api/v1/claims/extract`·`POST /api/v1/claims/verify`(`app/routers/claims.py`)
  - T07(완료, dense 임베딩·서술형 LLM 판정 라이브만 미검증): S18 근거 검색(`app/services/evidence_retriever.py` — dense 임베딩 코사인 + 순수 Python BM25 sparse → RRF hybrid, 종목 metadata filter 필수, rerank·dedup·score threshold, Recall@K/precision), 벡터 스토어(`app/services/vector_store.py` — Chroma 시맨틱의 `InProcessVectorStore`, `IndexedChunk` chunk/embedding schema + checksum·version), 임베딩 provider(`app/services/embedding_provider.py` — 결정론 `HashingEmbeddingProvider` + Upstage `SolarEmbeddingProvider` httpx mock). S19 반증 검색(`app/services/counter_evidence_retriever.py` — 방향 반전 counter query, 결정론 lexical relation 규칙 + `RELATION_RULE_VERSION`, 상충 감지·노이즈 기록). S20 인용 무결성(`app/services/citation_integrity.py` — exact/offset/fuzzy·checksum·DART canonical URL 검증, 인용 실패 시 확정 verdict 차단). S8 오케스트레이션(`app/services/evidence_orchestrator.py` — 수치 branch(S16) ∥ 문서 branch(S18→S19→S20) 병합, 예산·timeout·coverage 기반 최대 3회 재검색, provider 장애 `EXTERNAL_ERROR` 보존, 그룹 집계). S9 체크리스트(`app/services/checklist_generator.py`). Evidence Pydantic 미러(`app/schemas/evidence.py`, claim_id/presentation_item_id 배타). `POST /api/v1/evidence/verify`(`app/routers/evidence.py`). 기능 C 결과 UI `src/components/EvidenceResult.jsx`(5상태 verdict·계산식·상충·인용 원문 viewer·체크리스트·provider 장애 구분). **아키텍처 결정(사용자 2026-07-15)**: CLAUDE.md 목표 Chroma·LangGraph는 무거운 의존성·게이트 위험 때문에 인터페이스+결정론 인메모리로 구현하고 실바인딩을 T11/T13로 연기(`docs/checklist.md` C9 한계 참고). `UPSTAGE_API_KEY` 미발급으로 dense 임베딩·S8 서술형 판정 라이브만 미검증(T06 C7과 동일 "한계" 분류)
- [eval/](eval/) — T05(대부분 완료, BLOCKED 1항목): I9 골든 평가 하네스. `schema.js`(golden dataset·threshold registry typed 계약), `golden-v1.json`(30개 case), `thresholds-v1.json`(C12-A 명시값 등록 + 초기 placeholder, `change_log[]` 변경 승인), `scorers.js`(14개 카테고리 scorer, `contracts/schemas.js`·`contracts/verdict.js` 재사용), `report.js`(리포트+regression diff), `run.js`(CLI, `scripts/verify.sh`·`ci.yml` `eval` job에 배선, threshold 누락·dataset 위반·scorer 예외·fixture checksum drift를 exit 2로 차단). OpenDART·KIS·네이버 record/replay는 T02~T04 fixture를 재사용(`fixtures-manifest.json`), LLM(Solar) fixture는 S7(T06)·`UPSTAGE_API_KEY` 대기로 BLOCKED

## 현재 실행 명령

```bash
# frontend
npm install
npm run dev
npm run build
npm run preview

# 전체 검증(frontend+backend, 단일 진입점)
./scripts/verify.sh

# backend만 실행
docker compose up -d postgres        # 로컬 PostgreSQL (postgres:18, localhost:5442)
cd backend
uv run alembic upgrade head          # migration 적용
uv run uvicorn app.main:app --reload # API 서버
uv run pytest                        # backend 테스트

# I9 골든 평가 하네스만 실행
node eval/run.js                     # eval/reports/latest.json·history/에 리포트 저장
```

backend 실행에는 루트 `.env`에 `DATABASE_URL`·`JWT_SECRET_KEY`가 필요하다 (`.env.example` 참고, 실제 값은 절대 커밋하지 않는다).

## 컨벤션

- 사용자 대면 문구는 한국어, 초보자 눈높이, 추천이 아닌 검증 톤을 사용한다.
- schema·rule·model·prompt·dataset 버전을 기록한다.
- 외부 provider 계약은 공식 문서와 record/replay fixture로 검증한다.
- 새 기능은 정상 경로뿐 아니라 부족·모호·장애·공격 입력 테스트를 가져야 한다.
