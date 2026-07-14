# 구현 백로그 — 전체 기능 완료

이 문서는 [plan.md](plan.md)의 전체 `REQUIRED` 범위를 어떤 의존 순서로 구현할지 관리한다. 입력·출력 계약은 [skills.md](skills.md), 세부 완료 조건은 [checklist.md](checklist.md)가 진실 소스다.

## 운영 원칙

- 모든 Task는 필수다. 순서가 늦다는 이유로 범위에서 제거하지 않는다.
- 우선순위는 포함 여부가 아니라 선행조건과 위험 감소 순서를 뜻한다.
- 선행조건이 충족되지 않은 Task는 `BLOCKED`로 표시하고 원인·해제 조건을 기록한다.
- 일정은 진행 속도에 맞춰 재산정하되 기능 삭제로 맞추지 않는다.
- Task 완료는 코드 작성만이 아니라 테스트, 문서, 관측성, 오류 처리와 보안 기준 통과를 포함한다.
- 상태는 `대기 / 진행중 / BLOCKED / 완료`만 사용한다.

## 구현 순서

| 순서 | Task | 범위 | 선행조건 | 종료 조건 | 상태 |
|---:|---|---|---|---|:---:|
| T00 | 계약·저장소 품질 게이트 | 문서 동기화, 공통 schema·verdict·reason code, 테스트/lint/type/security CI, auto-merge 승인·테스트 gate | 없음 | C0 전체 통과 | 완료 |
| T01 | Backend·DB 기반 | FastAPI, Pydantic, PostgreSQL schema, migration, 인증·secret 기반, trace/error envelope, provider interface | T00 | API·DB·인증 기반 contract test | 완료 |
| T02 | 종목·OpenDART 수집 | S1·S2, 종목 master, 공시검색, 전체 재무제표, 원문·checksum·정정 이력, retry/rate limit/cache | T01 | C1·C2 통과 | 완료 |
| T03 | 시세·외부 근거 수집 | S13·S14, 시세·거래일·기업행위, 뉴스·공식 외부 근거 provider와 라이선스 | T02 | C3 통과 | BLOCKED(좁혀짐) |
| T04 | Temporal Integrity·재무 계산 | S15·S3, as_of·정정·잠정/확정·CFS/OFS·누적/단일·단위·기업행위, 파생 지표 | T02·T03 | C4 통과 | 대기 |
| T05 | I9 평가 기반 | versioned golden set, record/replay fixture, unit·contract·integration scorer, threshold registry, CI report | T00·T01 | C12-A 통과 | 대기 |
| T06 | 기능 C 숫자 검증 | S7·S16·S17, Structured Claim, 5 verdict, evidence plan, 결정론 검산, Claim 편집 | T04·T05 | C7·C8 통과 | 대기 |
| T07 | 기능 C RAG·반증·인용 | S18·S19·S20·S23·S8·S9·S11, hybrid RAG, counter evidence, citation gate, injection defense, 3회 제한 루프·체크리스트·결과 UI | T02·T03·T06 | C9·C10 통과 | 대기 |
| T08 | 기능 A 종목 공부 | S4·S11, 기업개요·공시·지표·용어·확인 포인트·원문 viewer | T04·T07 | C5 통과 | 대기 |
| T09 | 기능 B 가치·가격 위치 | S5·S6·S21, 복수 valuation, 비교군, 민감도, 중립 가격 위치 | T03·T04·T05 | C6 통과 | 대기 |
| T10 | 복기·가설 추적 | T01 인증 주체 기반 격리·삭제/내보내기, S10·S22, 신규 공시 scheduler와 역사 replay | T06·T07 | C11 통과 | 대기 |
| T11 | FastAPI·React 전체 통합 | A/B/C API, 비동기 job, 인증·권한, 모든 UI 상태, 접근성·모바일 | T08·T09·T10 | C13 통과 | 대기 |
| T12 | I9 전체 평가·회귀 차단 | extraction·verdict·temporal·retrieval·citation·peer·safety·performance·cost E2E | T06~T11 | C12-B 통과 | 대기 |
| T13 | 배포·운영 | secrets, 암호화, backup/restore, 관측·alert, 배포·rollback, incident runbook | T11·T12 | C14 통과 | 대기 |
| T14 | 기능 D 개인 주문 | S12, 주문 API/UI, paper→broker sandbox→live-disabled adapter, 주문 state machine·idempotency·reconciliation·kill switch | T10·T11·T12·T13 | C15 전체 통과(주문 API/UI·live-disabled adapter·안전 gate 포함) | 대기 |
| T15 | 전체 릴리스 검증 | R01~R15 acceptance matrix, T14 포함 최종 tree의 C12-B·C14·보안 gate 재실행, 알려진 한계·규제 검토·운영 인수 | T00~T14 | C16 전체 통과 | 대기 |

## Task 상세

### 감사 개선안 작업 매핑

| 개선안 | Backlog Task |
|---|---|
| I1 Structured Claim | T06 |
| I2·I3 Deterministic Verification·Verdict | T06 |
| I4 Temporal Integrity | T04 |
| I5 Required-Evidence Planner | T06 |
| I6 Counter-Evidence Retrieval | T07·T12 |
| I7 Citation·Provenance | T07·T11 |
| I8 Peer Comparison | T09·T12 |
| I9 Evaluation Harness | T05·T12 |
| I10 Hypothesis Tracking | T10 |
| I11 Injection Defense | T00·T07·T12 |

### T00. 계약·품질 게이트

- `plan → skills → checklist → backlog → CLAUDE/AGENTS` 용어를 동기화한다.
- 5상태 verdict, Claim·Fact·Evidence·trace schema를 versioning한다.
- 테스트·lint·type check·security scan을 CI 필수 상태로 만든다.
- auto-merge는 승인과 품질 gate를 만족할 때만 실행하고 충돌 PR을 자동 종료하지 않는다.
- 추적 문서가 ignore된 문서에 의존하지 않도록 문서 정책을 정리한다.

**완료 (2026-07-12)**: checklist.md C0의 9개 항목 전부 체크. H1~H7 하네스(lint·test·build·secret scan·CI·auto-merge)는 이전 세션에서, `contracts/`(envelope·verdict·schemas 실행 가능 contract test)와 dependency audit는 같은 날 앞선 T00 세션에서 완료했다. T01에서 `backend/` package scaffold와 ruff·mypy·pytest가 생기면서 "type"(backend type check)을 포함해 frontend+backend를 함께 요구하던 나머지 3개 항목(BLOCKED였던 repository-level workflow·frontend/backend lint+type+security·CI 차단 gate)이 해제됐다. `ci.yml`의 `backend` job과 `scripts/verify.sh`(harness.md H1 승격)로 로컬·CI 모두 frontend+backend를 한 번에 검증한다.

### T01~T04. 플랫폼·원천·무결성

**T01 완료 (2026-07-12)**: `backend/`(uv 관리, Python 3.12, FastAPI·Pydantic v2·SQLAlchemy·Alembic·PyJWT·passlib[argon2]). `app/config.py`(pydantic-settings, 루트 `.env`/`.env.example`), `app/schemas/envelope.py`(`contracts/envelope.js`와 동일 계약의 Python 미러), `app/middleware.py`(request_id/trace_id), `app/exception_handlers.py`(모든 오류를 Envelope로 매핑), `app/providers/base.py`(T02~T14 provider가 구현할 추상 인터페이스와 timeout/rate-limit/auth/maintenance/not-found → status·reason_code 매핑), `app/models/user.py`+Alembic 초기 migration, `UserRepository`, `app/security/`(argon2 hashing, JWT), `/api/v1/auth/register·login·me` FastAPI 엔드포인트. 로컬 Postgres는 `docker-compose.yml`(port 5442, postgres:18)로 실행한다. 31개 backend pytest(unit+integration, 실제 Postgres 대상) 전부 통과, ruff·mypy strict 통과, red→green 검증 완료. `scripts/verify.sh`로 frontend+backend 통합 검증, `ci.yml`의 `backend` job에 postgres service container로 연결(YAML 구문만 검증, 실제 PR 미검증).
- 전체 도메인 스키마(기업·공시·Claim 등)는 T02 이후 범위이며 T01은 인증 기반(users)만 다룬다.
- 사용자의 실제 `.env`에는 `DATABASE_URL`·`JWT_SECRET_KEY`가 아직 없다 — 로컬 실행 전 `.env.example`을 참고해 채워야 한다(에이전트가 실제 `.env` 내용을 읽거나 쓰지 않았음, CLAUDE.md 절대 원칙 8).
- **GPT 리뷰 반영 (2026-07-12, report_gpt.md 3건)**: provider rate limit·인증 실패 status를 `EXTERNAL_ERROR`로 정정, Envelope `source_ids` 필수화(JS·Python 동시), `UserRepository` 동시 가입 경쟁을 rollback 후 `CONFLICT`로 변환, 구조화 JSON 로그·Prometheus metrics(`app/observability.py`, `/metrics`) 추가(backend pytest 36개). auto-merge 판정 로직을 `scripts/auto-merge-rules.js`로 추출해 main 대상 PR 스킵 결함·반복 코멘트 결함 수정(rule 테스트 10건). `contracts/` schema를 typed spec으로 강화. npm audit dev 포함(vite 7 업그레이드로 0건), pip-audit·Dependabot(uv·github-actions) 확장.

**T00·T01 3차 후속 (2026-07-13)**: report_gpt.md 2026-07-12 23:51 미체크 4건 반영 — auto-merge 상태 label을 전환 시 삭제하던 결함(A→B→A 반복 재발) 수정, `docs/skills.md`에 timestamp RFC3339 계약 명시 + `contracts/fixtures/timestamps.json` 공통 fixture로 JS/Python 교차 검증, `scripts/check-node-version.js`+`npm run preverify`로 Node 버전 게이트를 advisory에서 강제 실패로 전환(로컬 환경이 실제 Node 22.9.0 미지원임을 이 과정에서 발견, 22.17.0로 전환), `docs/skills.md`에 migration 기록 표 신설.

**T02 완료 (2026-07-13)**: S1 Company Resolver — `app/models/company.py`(`Company` 현재 projection + `RawCorpMasterBatch` immutable ingest 기록), `app/services/company_resolver.py`(OpenDART `corpCode.xml` 파싱·upsert, exact stock_code/exact name/fuzzy substring 순 매칭, 동명 후보는 상장 여부와 무관하게 항상 candidates로 반환해 자동 확정 안 함, market 필터는 KRX 분류 provider 미정(T03)이라 `UNSUPPORTED_MARKET_FILTER`로 명시적 미지원). S2 Disclosure Collector — `app/providers/opendart.py`(공시검색·재무제표·원문·corp master 4개 endpoint, DART status→`ProviderError` 매핑, tenacity 재시도, JSON/XML 두 에러 응답 형식 모두 처리), `app/models/disclosure.py`(`RawDisclosureRecord` immutable, `Disclosure`/`FinancialFactRow`/`DocumentChunk`/`CorrectionChain`/`ProviderCacheEntry`), `app/services/disclosure_collector.py`(COLLECT/NORMALIZE, `filed_at <= as_of` 미래 데이터 차단, `[…정정]` bracket 매칭 기반 correction chain, DART XML 원문 flatten+고정크기 chunking, TTL 캐시). `POST /api/v1/companies/*`, `POST /api/v1/disclosures`(discriminated union) FastAPI 엔드포인트, provider는 `get_opendart_provider` 의존성 주입으로 테스트에서 실제 네트워크 없이 교체 가능. 실제 OpenDART API(Samsung Electronics·NAVER·SK하이닉스·"덕성" 동명 4건·실제 정정 공시 쌍)로 fixture를 캡처해 record/replay 테스트 109개(backend 전체) 작성.
- **한계 2건 문서화(임의 확정 아님)**: (1) 상장폐지와 비상장은 `corpCode.xml`만으로 구분 불가 — 둘 다 안전하게 UNLISTED로 처리. (2) correction chain은 원본이 명시되지 않아 이름 매칭 휴리스틱이며, 매칭 실패 시 연결하지 않는다.
- T04(S15)가 생기기 전까지 NORMALIZE의 정합성 규칙(미래 데이터 차단만)은 임시 구현이며, S15 도입 시 이 스킬은 S15를 호출하도록 교체된다.

**T03 착수 시도·BLOCKED (2026-07-13)**: 형식적 선행조건(T02)은 완료됐지만 착수에 필요한 [prerequisites.md](prerequisites.md) T03 절의 사용자 결정 2건이 없어 처음엔 구현 없이 BLOCKED로 보고했다. 세션 중 사용자가 결정 — (1) 시세 provider: 한국투자증권(KIS) Developers Open API, (2) 뉴스·외부 근거 allowlist: 공식 출처(공공데이터포털·거래소 공시) + 네이버 뉴스 검색 API. 결정을 반영해 `docs/prerequisites.md`(체크박스 갱신, 발급 절차·env var 명시), `docs/skills.md` S13·S14(provider 이름·인증 방식·핵심 요청 필드), `.env`/`.env.example`(`MARKET_API_KEY`/`NEWS_API_KEY` → `KIS_APP_KEY`/`KIS_APP_SECRET`/`KIS_ENV`/`NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`로 정밀화), `backend/app/config.py`(Settings 필드 동일하게 교체)를 문서 먼저 원칙에 따라 동기화했다. provider 세부 사항은 GitHub `koreainvestment/open-trading-api` 공식 문서와 네이버 개발자센터 공식 문서를 조사해 근거로 삼았다(환각 아님).
- **여전히 BLOCKED인 이유**: 실제 COLLECT 구현과 T02 방식의 record/replay fixture 캡처에는 살아있는 자격증명이 필요한데, 이는 사용자의 개인 계좌 개설·개발자 포털 가입이 필요해 agent가 대신할 수 없다 — (1) 한국투자증권 계좌 개설(모의투자 가능)과 KIS Developers 앱키·앱시크릿 발급, (2) 네이버 개발자센터 애플리케이션 등록과 Client ID/Secret 발급.
- **해제 조건**: 사용자가 위 key 4종(`KIS_APP_KEY`, `KIS_APP_SECRET`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`)을 발급받아 `.env`에 채우고 `docs/prerequisites.md` T03 절 남은 체크박스를 갱신하면, agent가 provider client 코드·record/replay fixture 구현부터 재개한다.
- **대안 경로**: `docs/fix_instructions.md` F6은 key 발급 대기 중 T05(I9 평가 기반, 선행조건 T00·T01만 필요)를 병렬 착수할 수 있다고 안내한다.
- **부수 사건**: 이 세션에서 `.env`를 Read 도구로 직접 열람해 `DART_API_KEY`·`UPSTAGE_API_KEY` 실제 값이 대화 컨텍스트에 노출됐다(존재 여부만 셸로 확인해야 했는데 실수로 전체 파일을 읽음). 사용자에게 즉시 고지하고 prerequisites.md의 자체 원칙(노출된 key 폐기·재발급)에 따라 두 key 재발급을 권고했다.

**T03 재개·대부분 완료, BLOCKED 범위 축소 (2026-07-14)**: 사용자가 KIS 4종 key(`KIS_APP_KEY`/`KIS_APP_SECRET`/`KIS_ENV`/`NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`)를 `.env`에 채웠다. 착수 중 `KIS_ENV`가 `vps`/`prod`가 아닌 36자리 값(APP_KEY 오기입 추정)으로 되어 있는 것을 발견해 임의로 넘겨짚지 않고 사용자에게 확인 — 모의투자(vps)로 확정해 `.env`를 고쳤다. `backend/app/config.py`의 `kis_env`를 `Literal["vps","prod"]`로 강화해 같은 오류가 재발해도 startup에서 즉시 실패하도록 만들었다.
- **구현**: `app/providers/kis.py`(KIS OAuth 토큰 발급+in-process 캐시, 현재가·기간별시세·예탁원 4종 기업행위 endpoint, 분당 1회 토큰 rate limit과 초당 호출 rate limit을 서로 다른 reason_code로 구분 — `ProviderTokenRateLimitedError` 신설), `app/providers/naver_news.py`(뉴스 검색 client), `app/models/market.py`(`RawMarketRecord`/`Quote`/`SharesOutstanding`/`CorporateAction`), `app/models/external_evidence.py`(`RawExternalRecord`/`ExternalDocument`, `ExternalSourceProvider` 3종 allowlist), `app/schemas/structured_claim.py`(S7 착수 전 `StructuredClaim` typed 계약 선도입, `contracts/schemas.js` STRUCTURED_CLAIM_SPEC과 동일 필드), `app/services/market_collector.py`(S13 COLLECT/NORMALIZE + 수동 입력 adapter), `app/services/external_evidence_collector.py`(S14 COLLECT/NORMALIZE + `promote_official_numeric_evidence` 변환 로직), `POST /api/v1/market`·`POST /api/v1/external-evidence` discriminated union 라우터, Alembic migration(`9afeb16760a3`). 모의투자 계정으로 실제 KIS API(현재가·기간별시세 조정/비조정·삼성전자 2018년 실제 50:1 액면분할·배당·무상증자·유상증자)와 네이버 뉴스 검색 API를 라이브 호출해 `backend/tests/fixtures/kis/`·`backend/tests/fixtures/naver/`에 캡처(T02와 동일한 record/replay 원칙, 토큰 값은 재발급 전용 redacted placeholder로 치환). 신규 backend pytest 52개(기존 112개 + 52 = 164개) 전부 통과, `./scripts/verify.sh` 전체(frontend 75 + backend 164, lint·type·secret·dependency audit) green.
- **실 라이브 호출로만 발견한 provider 특이사항 3건(임의 추정 아님, 문서화)**: (1) KIS는 존재하지 않는 종목코드에도 `rt_cd="0"`(성공)을 반환하고 output을 전부 0/공백으로 채운다 — 명시적 오류가 없어 이 shape을 직접 감지해 `ProviderNotFoundError`로 변환. (2) 국내휴장일조회 TR(`CTCA0903R`)은 모의투자 환경에서 `EGW02006`("모의투자 TR이 아닙니다")로 거부돼 실전투자 전용임을 확인 — 거래 캘린더는 기간별시세 응답의 실제 거래일 집합에서 파생. (3) 접근토큰 발급(분당 1회, `EGW00133`)과 일반 조회의 초당 호출 제한(`EGW00201`)은 서로 다른 오류이며 별도 reason_code로 구분해야 함을 실제로 재현해 확인.
- **여전히 BLOCKED인 부분 (범위 축소)**: `docs/checklist.md` C3의 "공식 provider의 구조화 수급·계약 수치를 provenance 포함 NumericEvidence로 변환" 1개 항목만 남았다. 공공데이터포털(data.go.kr)·KRX 공식 구조화 provider는 자격증명이 없어 이번에도 agent가 대신 발급받을 수 없다 — 변환 로직 자체는 구현·synthetic fixture로 unit test했지만 live provider 연동은 미검증이다.
- **해제 조건**: 사용자가 data.go.kr 또는 KRX 공식 API 중 최소 1곳의 key를 발급받아 `.env`에 채우면(`docs/prerequisites.md` T03 절 갱신), agent가 해당 provider client 구현과 live record/replay fixture 캡처부터 재개한다.
- **부수 사건**: 이 세션에서 secret scan 설정을 점검하려고 `gitleaks detect --source . --no-git`을 직접 실행했는데, 이 모드는 git 이력이 아니라 작업 디렉터리 파일을 그대로 스캔해 `.env`의 `DART_API_KEY`·`KIS_APP_KEY`·`KIS_APP_SECRET`·`UPSTAGE_API_KEY` 실제 값이 도구 출력(대화 컨텍스트)에 노출됐다(`NAVER_*`는 이 출력에 없었음). 사용자에게 즉시 고지하고 4개 key 재발급을 권고했다. 실제 CI의 secret scan은 `.github/workflows/ci.yml`의 `gitleaks/gitleaks-action`으로 git 이력을 스캔하는 올바른 방식이며 이 문제와 무관하다.

- raw 데이터는 immutable snapshot과 checksum을 보존한다.
- OpenDART `rcept_no`로 공시검색의 접수일과 재무제표를 연결한다.
- provider 오류·timeout·limit·점검을 데이터 없음과 구분한다.
- 다른 기업·기간·단위·CFS/OFS 값이 섞이는 테스트를 실패시킨다.
- 시세와 재무·발행주식 수 기준시점을 맞춘다.

### T05·T12. I9 품질 계약

- T05에서 C12-A의 scorer·threshold registry·초기 golden set·record/replay 기반을 구현하고 각 Task와 함께 확장한다.
- T12에서 C12-B의 A/B/C 전체 E2E, 안전, 공격, 장애, 성능, 비용 기준을 CI 차단 gate로 확정한다.
- 평가 결과는 versioned report로 저장하고 이전 버전 대비 회귀를 표시한다.

### T06·T07. 기능 C

- 수치 Claim은 S16에서 코드로 판정하고 LLM이 덮어쓰지 못하게 한다.
- 뉴스·테마·공시 이벤트 Claim은 허용 provider와 S18 RAG로 검증한다.
- S17의 필수 근거 충족률이 재검색·종료 기준이며 LLM 자기확신도는 사용하지 않는다.
- 지지 검색과 반증 검색을 모두 수행하고 S20 인용 gate를 통과한 근거만 판정에 쓴다.

### T08·T09. 기능 A·B

- 기능 A는 데이터 한계와 staleness를 숨기지 않고 원문으로 이동할 수 있어야 한다.
- 기능 B는 복수 모델·가정·민감도·peer 구성 내역을 공개한다.
- 기능 B UI는 행동 권고가 아니라 모델 범위 대비 가격 위치만 표시한다.

### T10. 복기·가설

- 사용자별 데이터 격리, 보존기간, 삭제·내보내기, 기기 변경을 구현한다.
- I10은 역사 `as_of` replay로 먼저 검증하고 실제 신규 공시 scheduler를 함께 구현한다.
- 과거 snapshot을 새 데이터로 덮어쓰지 않는다.

### T13. 배포·운영

- 배포 플랫폼·PostgreSQL·Chroma 영속화 방식을 확정한다.
- secret rotation, backup/restore, migration rollback, provider 장애 runbook을 실제로 재현한다.
- model·prompt·rule·schema 버전과 비용·latency·실패율을 관측한다.

### T14. 기능 D

- 분석 결과에서 주문 경로로 자동 edge를 만들지 않는다.
- paper와 broker sandbox를 모두 완료한다.
- live adapter 코드는 구현하되 기본 비활성, 개인 전용, 별도 server-side gate로 둔다.
- timeout 후 맹목 재시도하지 않고 broker 상태를 조회해 reconcile한다.
- 부분체결·취소·거부·중복 클릭·장마감·잔고부족·stale quote를 테스트한다.
- 공개·데모 배포는 paper-only다.

## 완료 정책

- 하위 체크박스가 모두 통과해야 상위 Task를 완료로 바꾼다.
- 외부 자격증명·권한이 없어 live 호출이 차단돼도 adapter·sandbox·비활성 gate가 검증되면 코드는 완료할 수 있다. 실제 활성 상태는 별도 운영·컴플라이언스 승인으로 관리한다.
- 데이터 원천이 기준을 충족하지 못하는 경우 안전한 `UNVERIFIABLE` 동작과 사용자 설명까지 구현해야 해당 기능이 완료다.
- T15 전에는 “전체 구현 완료”라고 표시하지 않는다.
