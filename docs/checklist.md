# 전체 구현 체크리스트 — 근거 검증 Agent

이 문서는 [plan.md](plan.md)의 R01~R15와 [skills.md](skills.md)의 S1~S23·I1~I11을 검증 가능한 작업으로 분해한다. 모든 체크박스는 최종 완료에 필수다. 구현 순서는 [backlog.md](backlog.md)를 따른다.

각 항목은 코드, 정상·실패 테스트, 문서, 로그·metrics를 함께 갖춰야 완료다.

## C0. 계약·저장소 품질 게이트 [T00]

- [x] `plan.md`, `skills.md`, `backlog.md`, `checklist.md`, `CLAUDE.md`, `AGENTS.md`의 기능 ID·용어·상태 동기화
- [x] `schema_version`, request/trace ID, `as_of`, status, reason code, warning, source, rule/model version 공통 envelope 확정 — `docs/skills.md` 계약 + `contracts/envelope.js`·`contracts/envelope.test.js` 실행 가능한 contract test. GPT 리뷰(2026-07-12) 반영: `source_ids[]` 필수화, 비문자열 `as_of` 거부, id/timestamp 필드 타입 검사(Python 미러 `app/schemas/envelope.py`도 동일 변경)
- [x] Claim·Fact·Evidence·Verdict·Citation schema와 migration 정책 확정 — `docs/skills.md` "스키마 버전·migration 정책" 절 + `contracts/schemas.js`·`contracts/schemas.test.js`. GPT 리뷰(2026-07-12) 반영: 필드 존재 검사를 typed spec(타입·enum·날짜 pattern·중첩 comparator·array item 타입)으로 교체하고 RawSourceRecord/NumericEvidence/Citation 포함 6개 타입 전부 정상·실패 테스트 구비
- [x] 5상태 verdict 및 그룹 `PARTIALLY_SUPPORTED` 규칙 계약 테스트 — `contracts/verdict.js`·`contracts/verdict.test.js`, red→green 검증 완료
- [x] repository-level build·test·lint·type·security workflow와 gate 정책 구성 — frontend(lint·test·build)·backend(ruff·mypy·pytest, T01)·secret scan·dependency audit까지 구성. 단일 로컬 진입점은 `scripts/verify.sh`(harness.md H1 승격)
- [x] frontend/backend lint, backend type check, secret·dependency security scan 구성 — frontend lint(eslint)·backend lint(ruff)+type check(mypy, T01 `backend/`)·secret scan(gitleaks)·dependency scan 전부 구성, red→green 검증 완료. GPT 리뷰(2026-07-12) 반영: npm audit에서 `--omit=dev` 제거(vite 7 업그레이드로 esbuild/vite 취약점 해소, 현재 0건), backend `uv.lock` 전체를 pip-audit로 스캔(`scripts/verify.sh`·CI), Dependabot을 npm+uv+github-actions 3개 생태계로 확장
- [x] CI에 build·test·lint·type·security 차단 gate 연결 — `ci.yml`의 `frontend` job(`npm run verify`)과 `backend` job(ruff→mypy→alembic upgrade→pytest, postgres service container)이 각각 차단 gate. `backend` job의 GitHub Actions 런타임(서비스 컨테이너·`astral-sh/setup-uv`)은 YAML 구문 검증만 했고 실제 PR에서는 미검증
- [x] auto-merge 승인·품질 gate 추가, 충돌 자동 close와 반복 코멘트 제거 — GPT 리뷰(2026-07-12)에서 main 대상 PR을 첫 규칙이 전부 스킵해 병합 경로가 죽어 있던 결함과 commentOnce 반복 코멘트 결함 발견. 판정 로직을 `scripts/auto-merge-rules.js`(순수 함수)로 추출해 수정: main 대상 PR만 처리, `reviewDecision` 기준 승인 판정, 충돌은 연기만. 1차 수정은 최근 100개 댓글 안에서 marker를 찾는 방식이었으나 재리뷰에서 "PR이 오래 열려 있으면 창 밖으로 밀릴 수 있다"는 잔여 결함이 지적돼 label 기반 상태 추적(`auto-merge:상태` label, PR당 유일해 pagination 창과 무관하게 정확)으로 교체. label이 저장소에 없으면 `addLabels`가 실패하는 문제를 막기 위해 4개 상태 label을 멱등하게 사전 생성. rule 단위 테스트 14건(`scripts/auto-merge-rules.test.js`)으로 병합/스킵/연기/label 전환 경로 검증. GitHub Actions 런타임 동작(label 생성·부착 포함)은 여전히 실제 PR로 미검증
- [x] tracked 문서가 ignored 문서를 필수 참조하지 않도록 문서 정책 정리 — grep으로 tracked 문서가 ignored 아카이브를 근거로 인용하지 않음을 확인. 부수적으로 `.gitignore`의 `docs/*` 규칙이 `docs/report/`의 신규 파일까지 가려버리는 결함을 발견해 `!docs/report/` 예외 추가로 수정

## C1. 종목 해석 [R01][S1][T02]

- [x] OpenDART 고유번호와 상장 종목 master 수집·버전 관리 — `RawCorpMasterBatch`(immutable) + `Company`(현재 projection), `CompanyResolver.ingest_corp_master`
- [x] 종목명·약칭·6자리 종목코드 → `corp_code` 매핑 — `CompanyResolver.resolve`(exact stock_code → exact name → fuzzy substring)
- [x] 동명·유사 종목 후보와 `matched_by`, listing status, 기준일 반환 — `ResolveResult`(`matched_by`, `listing_status`, `resolved_at`, `candidates[]`)
- [x] 사용자 확정 없이 모호한 후보를 자동 확정하지 않는 테스트 — 실제 OpenDART 동명 4건("덕성", 상장 1+비상장 3)으로 재현, 상장사가 하나뿐이어도 항상 후보 반환 확인
- [x] 비상장·상장폐지·지원 외 시장 안전 종료 테스트 — 비상장(UNLISTED reason_code)·시장 필터 미지원(UNSUPPORTED_MARKET_FILTER) 테스트. **한계**: OpenDART `corpCode.xml`은 상장폐지 시 `stock_code`가 공란으로 되돌아가 "비상장"과 "상장폐지"를 데이터만으로 구분할 수 없다 — 둘 다 안전하게 UNLISTED로 처리하며 구분하지 않음을 문서화

## C2. OpenDART 공시·재무·원문 [R02][S2][T02]

- [x] 공시검색 API client와 `status` 오류 매핑 — `OpenDartProvider.fetch_disclosure_list`, 8개 status 코드(000/013/014/020/010·011·012/100/900) 실제·문서 기반 매핑 테스트
- [x] 단일회사 전체 재무제표 API client(CFS/OFS·보고서 코드) — `OpenDartProvider.fetch_financial_statements`
- [x] S2 `COLLECT`의 immutable `RawDisclosureRecord`와 `NORMALIZE` discriminated union contract — `RawDisclosureRecord` 모델 + `POST /api/v1/disclosures`의 `{operation: COLLECT|NORMALIZE}` Pydantic discriminated union
- [x] `rcept_no`로 공시 접수일·보고서명·재무 행 조인 — `Disclosure.rcept_no`/`FinancialFactRow.rcept_no`가 조인 키
- [x] 사업·분기·반기·3분기 보고서와 정정 chain 저장 — `classify_report_type`(ANNUAL/Q1/HALF/Q3/OTHER), `CorrectionChain`(실제 정정 공시 2건이 동일 원본 1건에 연결되는 것을 실제 데이터로 확인). **한계**: OpenDART가 "이 공시가 어떤 원본을 정정하는지"를 직접 알려주지 않아 `[…정정]` bracket 제거 후 동일 corp_code·보고서명·이전 접수일 매칭 휴리스틱이며, 매칭 실패 시 임의로 연결하지 않고 미연결 상태로 남김(테스트로 확인)
- [x] 공시 원문 다운로드·파싱·checksum·immutable raw snapshot — `collect_document`(base64 zip payload, checksum), 실제 공시 원문으로 검증. GPT 리뷰(2026-07-13) 반영: 캐시 hit 경로가 원본 fetch와 다른 JSON 직렬화(`ensure_ascii` 기본값 차이)로 checksum을 재계산해 한글 payload에서 checksum이 흔들리던 결함을 발견 — `opendart.py`에 공용 `stable_json_bytes()`를 두고 원본·캐시 hit 양쪽이 동일 함수를 쓰도록 통일, 회귀 테스트 추가
- [x] 표·본문 chunking과 종목·접수일·대상기간·문서 metadata — `_normalize_document`(고정 크기 chunking). **한계**: DART 고유 XML(SECTION/TABLE) 태그를 모두 평문으로 flatten해 표 구조는 보존하지 않음(문서화된 단순화)
- [x] S2 `NORMALIZE`의 `eligible_financial_rows`, `document_chunks`, A용 `document_evidence` typed output — `NormalizeResult` + `document_evidence`는 `presentation_item_id`+`relation=NEUTRAL` Evidence 계약 준수. GPT 리뷰(2026-07-13) 반영: `eligible_raw_record_ids` 중 DB에 없는 id를 조용히 버리던 것을 Envelope `warnings[]`로 드러내도록 수정(호출자 오류를 삼키지 않음, CLAUDE.md 오류 구분 원칙)
- [x] timeout·retry/backoff·rate limit·cache·점검 응답 테스트 — httpx `QueueTransport`로 timeout 2회 후 성공(재시도 확인)·3회 연속 실패(포기) 재현, TTL 캐시로 동일 요청 2회차 provider 미호출 확인
- [x] 데이터 없음과 provider 장애를 다른 reason code로 반환 — `013`(no data)→`ProviderNotFoundError`, `020`(rate limit)/`010·011·012`(auth)→`EXTERNAL_ERROR` 계열, `100`/`900`(예상 밖 상태)→`ProviderMaintenanceError`로 서로 다른 예외 타입·reason_code. GPT 리뷰(2026-07-13) 반영: `ProviderError` 전용 exception handler가 없어 실제 API 응답에서는 이 구분이 generic `Exception` handler로 흘러 전부 `INTERNAL_ERROR`/`UNHANDLED_EXCEPTION`이 되던 결함 발견 — `map_provider_error()` 기반 handler를 등록해 `/api/v1/disclosures` envelope에서 실제로 구분되도록 수정, API 레벨 테스트 추가

**T04(S15) 선행 의존**: NORMALIZE의 `filed_at <= as_of` 미래 데이터 차단은 지금 구현했지만, 정정 chain 최신본 선택·잠정/확정 우선순위·CFS/OFS 기간 간 선택 정책은 S15(T04)가 중앙화하기 전까지 이 스킬 안의 임시 규칙이다 — T04에서 S15가 생기면 이 NORMALIZE는 S15를 호출하도록 교체된다.

## C3. 시세·기업행위·외부 근거 [R03][S13·S14][T03]

- [x] 공식 시세 provider와 수동 입력 adapter 계약 확정 — 한국투자증권(KIS) Developers Open API(`app/providers/kis.py`) + `MarketCollector.record_manual_quote`(provider="manual_input", 별도 license 문구로 출처 구분)
- [x] S13·S14 `COLLECT` raw record → S15 PRE → `NORMALIZE` discriminated union contract — `POST /api/v1/market`(`COLLECT_CURRENT_PRICE|COLLECT_PERIOD_PRICE|COLLECT_CORPORATE_ACTION|MANUAL_INPUT|NORMALIZE`), `POST /api/v1/external-evidence`(`COLLECT|NORMALIZE`) Pydantic discriminated union. S15(T04)가 아직 없어 `trade_date/record_date <= as_of` 차단만 임시 PRE_NORMALIZE 규칙으로 심음(T02와 동일 패턴, T04에서 S15로 교체)
- [x] 거래 캘린더, quote timestamp, 거래량, 발행주식 수 수집 — `Quote.trade_date`(quote timestamp), `Quote.volume`, `SharesOutstanding`(KIS `lstn_stcn`). **한계**: KIS 전용 국내휴장일조회 TR(`CTCA0903R`)이 모의투자(vps)에서 `EGW02006`("모의투자 TR이 아닙니다")로 거부됨을 실제 호출로 확인 — 실전투자 전용이라 거래 캘린더는 기간별시세 응답에 실제 존재하는 거래일 집합에서 파생한다(문서화된 단순화)
- [x] 조정·비조정 주가, 액면분할·증자·배당락 metadata 보존 — `PriceBasis.ADJUSTED/UNADJUSTED`(`FID_ORG_ADJ_PRC`), `CorporateActionType.DIVIDEND/BONUS_ISSUE/PAID_IN_CAPITAL_INCREASE/FACE_VALUE_CHANGE`(예탁원 4종 API). 삼성전자 2018-05-04 실제 50:1 액면분할(`inter_bf_face_amt` 5000→`inter_af_face_amt` 100)로 검증
- [x] 시세 provider 라이선스·최신성·장애 fallback 표시 — `Quote.license`(`LICENSE_NOTICE` 상수), 수동 입력 시 `license`에 "수동 입력 — {source_note}" 별도 표시
- [x] 뉴스·거래소·공식기관 외부 근거 provider allowlist — `ExternalSourceProvider`(`naver_news`/`data_go_kr`/`krx_official` 3개만 존재, 그 외 값 표현 불가)
- [x] S14 versioned deterministic query-builder가 Structured Claim에서만 검색어를 생성하는 contract test — `build_news_query`(`s14-query-builder-1.0.0`), 결정론·claim 필드만 사용 테스트(`test_external_evidence_collector.py`)
- [x] 뉴스 게시·수정 시각, URL, 기업 entity match, checksum 저장 — `ExternalDocument.published_at`(`pubDate` 파싱)·`source_url`·`entity_matched`·`checksum`. **한계**: 네이버 뉴스 검색 API가 기사 수정 시각을 제공하지 않아 `revised_at`은 항상 NULL(임의 추정 금지, CLAUDE.md 절대 원칙 2)
- [ ] 공식 provider의 구조화 수급·계약 수치를 provenance 포함 `NumericEvidence`로 변환 — **BLOCKED**: 변환 로직(`promote_official_numeric_evidence`)은 구현·unit test(synthetic fixture, 실 provider 캡처 아님) 완료했지만, 공공데이터포털(data.go.kr)·KRX 공식 구조화 provider는 자격증명이 없어(`docs/prerequisites.md` T03) 실제 COLLECT client 구현·live 검증을 하지 못했다. 해제 조건: 사용자가 두 provider 중 최소 1곳의 API key를 발급받아 `.env`에 채우면 재개
- [x] 산문에서 LLM이 추출한 미검증 수치를 `NumericEvidence`로 승격하지 않는 테스트 — `ExternalEvidenceCollector.normalize`는 네이버 뉴스 출처에서 `numeric_evidence`를 항상 빈 배열로 반환, `promote_official_numeric_evidence`는 네이버 뉴스 record를 주면 `ValueError`로 즉시 거부
- [x] 커뮤니티 소문을 사실 근거로 승격하지 않는 테스트 — `ExternalSourceProvider` allowlist 자체에 커뮤니티 출처를 나타낼 값이 없음(enum 3개 고정), `promote_official_numeric_evidence`가 비공식 출처를 거부하는 테스트로 실행 지점 확인
- [x] 뉴스·테마 원천 부재 시 `UNVERIFIABLE` 반환 — `ExternalNormalizeResult.verifiable_status`(entity-matched 문서 없으면 `UNVERIFIABLE`)

## C4. Temporal Integrity·재무 계산 [R04][S3·S15][I4][T04]

- [x] `filed_at <= as_of` 미래 데이터 차단 — `app/services/temporal_integrity.py`(S15) `pre_normalize()`가 중앙에서 처리. S2(`disclosure_collector.py`)·S13(`market_collector.py`)의 T02·T03 시절 inline 임시 규칙을 이 호출로 교체(T02·T03 기존 테스트 전부 회귀 없이 통과 확인)
- [x] `as_of` 내 정정 chain 최신본 선택과 원본 이력 보존 — T02에서 구현한 `DisclosureCollector._resolve_correction_chains`(원본 미변경, `CorrectionChain`으로 연결만 추가) 유지, 회귀 테스트 통과
- [x] 잠정·확정 실적 구분·우선순위·충돌 표시 — `temporal_integrity.resolve_provisional_confirmed()`(확정 우선, 충돌 시 warning). **한계**: OpenDART `fnlttSinglAcntAll`은 항상 확정(감사) 수치만 주고 잠정실적 flag가 없어 실제 잠정 데이터로는 아직 검증하지 못함 — 규칙 자체는 구현·테스트 완료
- [x] 두 기간 CFS 우선, OFS 일관 fallback, CFS/OFS 혼합 금지 — `select_fs_div`(기간별 CFS 우선, 없으면 OFS+warning), `assert_single_fs_div`(혼합 시 계산 중단). `financial_facts.py` 라우터가 fiscal_period별로 facts를 그룹화해 `select_fs_div`를 호출하므로 요청에 여러 기간이 섞여도 최신 기간만 남기고 나머지를 버리지 않는다(GPT 리뷰 2026-07-14 15:25 반영 — 이전에는 `filed_at` 최신 기간 하나만 계산 대상이었음). 삼성전자 실제 CFS+OFS 연간 데이터로 검증
- [x] `thstrm_amount`·누적값·전기 비교값의 의미를 보고서 종류별 매핑 — `app/services/financial_calculator.py` 모듈 docstring·`_row_fact_candidates`. **실 라이브 호출로 발견(임의 추정 아님)**: 분기·반기 IS/CIS는 `thstrm_amount`가 이미 단일기간, `thstrm_add_amount`가 누적값(둘 다 제공); CF는 중간기간에 누적값만 제공(`thstrm_add_amount` 필드 자체 없음); annual은 `thstrm_add_amount`가 항상 빈 문자열
- [x] 반기·3분기 누적값 → 단일분기 변환 공식·원본값 보존 — `derive_single_period_value`/`derive_single_quarter_fact`(`derivation_note`에 원본 두 누적값 보존). 삼성전자 2025 영업활동현금흐름 실수치로 Q2·Q3 단일분기 값을 도출해 검증(Q1+Q2+Q3=3분기 누적과 정확히 일치)
- [x] raw 값·단위·통화와 normalized 값·단위 동시 저장 — `FinancialFact.raw_value`/`raw_unit` + `normalized_value`/`normalized_unit`
- [x] 0.15/15%, 원/천원/백만원 혼동 방지 테스트 — `normalize_amount`(원/천원/백만원 배율 테스트로 서로 다른 값임을 확인), `parse_ratio`+`UnitConfusionError`(source_unit 미명시 시 거부, RATIO/PERCENT 자동 혼용 금지)
- [x] 분모 0·음수·흑자전환·적자지속 규칙 테스트 — `_safe_ratio`(분모 0 → `None`+warning, 크래시 아님), 음수 자본 ROE 테스트(수학적으로 계산은 되지만 크래시 없음), `classify_sign_transition`(PROFIT_TURNAROUND/CONTINUED_LOSS/PROFIT_TO_LOSS/CONTINUED_PROFIT 4개 reason_code, verdict 아님)
- [x] 매출·영업이익·순이익·부채·현금흐름·배당·PER/PBR/ROE 공식과 버전 — `ACCOUNT_METRIC_MAP`(실제 IFRS/DART 표준계정코드) + `FORMULA_REGISTRY` + `S3_FORMULA_VERSION`, 전부 삼성전자 실제 연간 데이터로 계산 검증
- [x] 시세·발행주식 수·시가총액 기준일 일치와 기업행위 보정 — `CalculateFinancialFactsRequest.price_as_of`/`shares_outstanding_as_of`를 S15 `POST_DERIVED`의 `source_as_of`에 포함시켜 미래 기준일이면 계산에서 거부한다. PER/PBR은 발행주식 수·가격 기준일을 모두 검증하고, EPS/BPS는 가격을 쓰지 않으므로 발행주식 수 기준일만 검증한다(GPT 리뷰 2026-07-14 15:25 반영 — 이전에는 price_as_of 하나만 미래여도 가격을 쓰지 않는 EPS/BPS까지 함께 거부됐음). 기준일 없이 값만 오면 아예 미사용. **한계**: 기업행위 보정은 S13이 조정주가(`PriceBasis.ADJUSTED`)와 KIS 실시간 발행주식수를 제공하는 것에 의존하며, S3 자체가 재무제표 시점과 시세 시점 사이의 액면분할 등을 감지해 과거 수치를 소급 조정하지는 않는다(호출자가 조정된 값을 넘겨야 함, 문서화된 단순화)
- [x] 다른 기업·기간·단위·재무범위 혼합 시 계산 중단 — `assert_single_fs_div`가 corp_code·fiscal_period·fs_div·unit 4개 모두 검사해 하나라도 섞이면 `ValueError`
- [x] 모든 원천의 S15 `PRE_NORMALIZE`와 모든 파생 Fact/Evidence의 `POST_DERIVED` 2단계 계약 테스트 — `tests/test_temporal_integrity.py`(PRE_NORMALIZE 3건·POST_DERIVED 9건) + `financial_facts.py` 라우터가 실제로 POST_DERIVED를 호출해 검증 실패 시 numeric_evidence에서 제외
- [x] S15 discriminated union이 PRE의 derived payload와 POST의 raw payload를 schema 단계에서 거부 — `tests/test_temporal_integrity_api.py`의 양방향 422 테스트
- [x] S3·S5·S21 파생 결과의 공식·입력 provenance·기업·기간·단위·`as_of` 사후 검증 — S3는 `financial_facts.py`에서 실제로 배선 완료(POST_DERIVED 호출). `DerivedCheckInput`/`PostDerivedCheckInput`에 `target_period`/`source_periods`를 추가해 `post_derived()`가 파생 레코드의 대상 기간과 원천 fact들의 기간 불일치도 실제로 거부한다(GPT 리뷰 2026-07-14 15:25 반영 — 이전에는 기업·단위·기준시점만 검증하고 기간은 검증하지 않았음). `post_derived()`는 `source_ids`가 채워져 있어도 `source_corp_codes`/`source_units`/`source_periods` 개수가 다르거나 `source_as_of`가 더 적으면 거부한다(GPT 리뷰 2026-07-14 15:56 반영 — 이전에는 `source_ids`만 비어 있지 않으면 나머지 배열이 비어 있어도 통과했다). `source_as_of`는 fact 기준일 외에 자체 source_id가 없는 시세·발행주식 수 기준일도 포함하므로 "이상"만 요구하고 정확히 같은 길이를 강제하지 않는다. `PostDerivedCheckInput`에도 `min_length=1`과 동일한 model-level validator를 추가해 API 단계에서 먼저 422로 막는다. S5·S21은 아직 미구현(T09)이라 재사용만 준비된 상태 — S15가 도메인 무관 공용 서비스로 설계돼 있어 그때 그대로 호출하면 된다

## C5. 기능 A 종목 공부 [R05][S4·S11·S20][T08]

- [ ] 기업개요·상장·사업 정보 API/UI
- [ ] 최근 공시와 정정 여부·접수일·대상기간 표시
- [ ] 재무지표 값·추세·공식·원본 계정·기준일 표시
- [ ] 버전된 금융 용어 glossary와 문맥 설명
- [ ] 확인 포인트와 데이터 부족·stale·provider 오류 상태
- [ ] 문장·수치별 provenance와 공식 DART 원문 이동
- [ ] 표·본문 원문 하이라이트와 citation integrity 상태
- [ ] 추천·단정 표현 금지 테스트

## C6. 기능 B 가치 범위·가격 위치 [R06][S5·S6·S21][I8][T09]

- [ ] 복수 valuation 방법·공식·가정·rule version 구현
- [ ] 방법별 가치 시나리오 범위와 민감도 재현 테스트
- [ ] 동일 기준일 시세·재무·발행주식 수 사용
- [ ] KRX 업종·사업·재무 metadata 기반 peer universe 구성
- [ ] peer 포함·제외 기업, 표본 수, 중앙값·분포·품질 점수 공개
- [ ] peer 품질 기준 미달 시 비교 Claim `UNVERIFIABLE`
- [ ] 가격 위치 `BELOW/WITHIN/ABOVE_MODEL_RANGE/INSUFFICIENT` API/UI
- [ ] 단일 목표가·매수 가능·관망·분할매수·보류 문구 0건
- [ ] 시세 stale·provider 장애·기업행위 미반영 안전 종료

## C7. Structured Claim [R07][S7·S23][I1·I11][T06]

- [x] Solar Structured Outputs schema와 provider mock — `app/providers/solar.py`(OpenAI 호환 `chat/completions`, 엔드포인트·에러 status는 2026-07-14 WebSearch로 공식 문서 확인 후 구현, 임의 추정 아님) + `backend/tests/test_solar_provider.py`(httpx `MockTransport`, 실 키 불필요)
- [x] 복합 문장 → 원자 Claim + `claim_group_id` — `app/services/structured_claim_extractor.py` `extract()`, `test_compound_sentence_splits_into_multiple_claims_sharing_claim_group_id`
- [x] 원문 span, 기업, 유형, evidence domain, metric, comparator, 비교 대상·peer ref, 기간, 방향, 조건 구조화 — `app/schemas/structured_claim.py` `StructuredClaim`(T03에서 typed 계약만 먼저 도입한 것을 T06에서 실제로 채움)
- [x] 의견·미래 예측·수치·비교·부정·조건문 분류 — `ClaimType` 6종 Literal enum(`docs/skills.md` "Structured Claim" 절), `evidence_planner.py`·`deterministic_verifier.py`가 `OPINION`/`FUTURE_PREDICTION`은 근거 없이 `UNVERIFIABLE`, `CONDITIONAL`은 `INSUFFICIENT_EVIDENCE`(조건 평가 스킬 없음, 임의 추정 아님)로 분기
- [x] 모호어·기간·비교대상 `ambiguity_flags` 기반 확인 질문 UI — `app/services/claim_disclosure.py`(F9 규칙) + `contracts/disclosure.js`(JS 미러) + `src/components/ClaimDisclosure.jsx`(React, 빈 배열이면 요약 카드 자동 진행·있으면 해당 항목만 객관식 확인 질문, 미답변 시 검증 불가 안내). `src/test/setup.js`에 누락돼 있던 `afterEach(cleanup)`을 이번에 추가해 vitest `globals:false`에서 테스트 간 DOM이 누적되던 결함도 함께 수정(다른 컴포넌트 테스트에도 영향)
- [x] 원문에 없는 span·기업·숫자 생성 0건 — `structured_claim_extractor.py`의 `_is_grounded_span`/`_is_grounded_number`가 원문에 없는 span·숫자를 가진 후보를 드롭하고, `corp_code`/`stock_code`/`as_of`는 LLM 출력을 신뢰하지 않고 S1 `resolved_company`·요청 `as_of`로 강제 덮어쓴다(검증이 아니라 애초에 LLM이 정하지 못하게 함). GPT 리뷰(2026-07-15 10:07) 반영: `_is_grounded_number`가 부분 문자열 검색이라 "2025년"의 "2"가 target_value=2와 우연히 일치해 원문에 없는 comparator 임계값이 통과하던 결함을 재현으로 확인 — 정규식으로 원문의 숫자 '토큰'(연속 자릿수, 천단위 콤마·소수점 포함)만 추출해 정확히 일치하는지 검사하도록 강화(`_extract_number_tokens`), 연도 숫자가 더 이상 임계값의 근거가 되지 않는다. GPT 리뷰(2026-07-15 10:19) 후속 반영: 토큰화 이후에도 "2분기"·"Q2" 같은 분기 designator의 숫자는 여전히 유효 토큰으로 뽑혀 target_value와 일치하던 결함을 재현으로 확인 — 토큰화 전에 `_PERIOD_DESIGNATOR_PATTERN`(`\d+분기`, `Q\d+`)으로 분기 표기 전체를 먼저 제거해 그 안의 숫자가 애초에 토큰 후보에 들어오지 않게 함. GPT 리뷰(2026-07-15 10:44) 후속 반영: `op=MULTIPLE`(배수 주장) claim이 배수 표기("N배") 없이 같은 숫자의 금액 표기("2조원")만으로 접지된 것으로 오판되던 결함(단위를 보지 않고 숫자 값만 비교)을 재현으로 확인 — `_is_grounded_number`가 `Comparator` 전체를 받도록 바꾸고, `op=MULTIPLE`에서는 `_MULTIPLE_NOTATION_PATTERN`(`N배`/`Nx`/`N×`)에 매치되는 숫자만 근거로 인정하도록 강화. GPT 리뷰(2026-07-15 11:21) 후속 반영: `_MULTIPLE_NOTATION_PATTERN`에 좌우 경계가 없어 "S2X"(제품명)·"2X200"(식별자) 내부의 숫자도 배수 표기로 오인되던 결함을 재현으로 확인 — 숫자 앞과 x/X/× 뒤에 영문자·숫자가 바로 붙어 있으면 매치하지 않도록 lookbehind/lookahead 경계를 추가. GPT 리뷰(2026-07-15 11:40) 후속 반영: 경계 문자 집합이 하이픈·밑줄을 놓쳐 "S-2X" 같은 하이픈 코드명이 여전히 통과했고, "배" 표기는 뒤에 오는 한글 음절을 전혀 걸러내지 않아 "2배럴"(barrel)의 "배"도 배수로 오인되던 결함을 재현으로 확인 — x/X/×는 좌우에 `[A-Za-z0-9_-]`가 붙으면 제외. GPT 리뷰(2026-07-15 13:05) 후속 반영: "배" 뒤 조사 화이트리스트(가/이/는/…)가 너무 좁아 "2배보다"·"2배까지"·"2배로써" 같은 정상 배수 표현을 잘못 드롭(extraction recall 저하)하던 결함을 재현으로 확인 — 조사·어미는 열린 부류라 열거가 불완전하므로, 반대로 배수가 아님이 명확한 명사 시작 음절만 블록(`_BAE_NON_MULTIPLIER_HEADS`, 현재 "럴"=배럴)하고 나머지는 배수로 허용하도록 방향을 뒤집음. **한계(문서화)**: MULTIPLE 외 op(RATIO의 "%", 금액 단위 등)는 아직 단위별 표기를 구분하지 않고 원문 숫자 토큰 전체와 비교하는 이전 방식을 유지한다. 배 명사 블록리스트도 배-로 시작하는 명사가 열린 집합이라 태생적으로 불완전하다 — 완전한 판별은 형태소 분리가 필요하며 후속 과제. 정규식 기반 grounding은 구조적으로 반례가 계속 나올 수 있음(이번까지 6차 수정)을 알려진 한계로 남긴다
- [x] S14 외부 근거 수집이 S7 `StructuredClaim` 이후에만 실행되는 contract test — `external_evidence_collector.collect_news(claim: StructuredClaim, ...)`가 타입 자체로 이미 강제하고 있었음을 `test_collect_news_cannot_run_without_a_structured_claim`(dict를 넘기면 `AttributeError`)로 명시적 검증
- [x] schema allowlist, 허용 필드 밖 출력 차단 — Python `StructuredClaim`/`Comparator` `model_config=ConfigDict(extra="forbid")` + `claim_type`/`comparator.op`/`comparator.comparison_operator` `Literal` enum, JS `contracts/schemas.js` `validateShape(..., {strict:true})` 동일 계약(양쪽 테스트, `docs/skills.md` 2026-07-14 migration 기록에 pre-release 보정으로 문서화)
- [x] 사용자 입력 인젝션·malformed output·timeout 안전 처리 — S23(`llm_security_gateway.py`)이 지시·데이터 분리(delimiter 이스케이프 포함)·secret redaction·injection 패턴 trace·schema allowlist 검증을 수행하고, `SolarProvider`가 timeout 2회 후 성공/3회 연속 실패를 재현(OpenDART와 동일 tenacity 패턴), `structured_claim_extractor.extract()`가 malformed output을 `ExtractionFailedError`로 명시적으로 올려 라우터가 422 `VALIDATION_ERROR`로 매핑(삼키지 않음)

**한계(BLOCKED 아님, 문서화)**: 이 절의 9개 항목은 모두 코드+테스트로 완료했지만, `UPSTAGE_API_KEY`가 아직 발급되지 않아(`docs/prerequisites.md` T06·T07) 실제 Upstage Solar API 라이브 호출은 검증하지 못했다. 항목 1(provider mock)이 명시적으로 mock을 완료 조건으로 인정하고 있고 나머지 항목도 httpx `MockTransport`/주입된 fake completion 함수로 실제 동작을 증명 가능해 BLOCKED로 분류하지 않았다 — T02~T05의 "실 provider 자격증명 필요 = BLOCKED" 선례(체크리스트 문구가 실 캡처를 직접 요구한 경우)와는 다른 경우로 판단했다(체크리스트 문구가 mock을 명시 허용). 키가 발급되면 `backend/tests/fixtures/solar/`에 실 라이브 호출을 캡처해 회귀 테스트로 추가한다.

## C8. 필수 근거·결정론 검산 [R08][S16·S17][I2·I3·I5][T06]

- [x] Claim 유형별 required evidence rule registry와 버전 — `app/services/evidence_planner.py`(`EVIDENCE_PLANNER_VERSION`, comparator.op 기준 single-value/two-period/continuity 3종 registry)
- [x] 필수 근거 충족률 계산과 missing fields 반환 — `coverage()`(`satisfied`/`missing`/`coverage_rate`)
- [x] 증가·감소·배수·비율·연속성 comparator 구현 — `app/services/deterministic_verifier.py`(`INCREASE`/`DECREASE`/`MULTIPLE`/`RATIO`/`CONTINUITY`, `THRESHOLD` 포함 6종 op 전부)
- [x] `SUPPORTED`/`REFUTED`/`INSUFFICIENT`/`UNVERIFIABLE` 원자 판정 — `verify_atomic()`
- [x] 그룹 `PARTIALLY_SUPPORTED` 집계 — `app/services/verdict_aggregator.py`(`contracts/verdict.js` Python 미러) + `verify_group()`
- [x] `배수 >= 2`, 실제 1.38배 → `REFUTED` 테스트 — `test_multiple_2x_threshold_with_actual_1_38x_is_refuted`(단위) + `test_verify_returns_refuted_for_1_38x_against_2x_threshold`(API e2e) 그대로 재현
- [x] 부호 전환 배수 `RATIO_UNDEFINED_SIGN_CHANGE` 처리 — 적자→흑자(`comparison<0<current`) MULTIPLE/INCREASE/DECREASE 모두 `INSUFFICIENT_EVIDENCE`+해당 reason_code로 처리, REFUTED로 단정하지 않음
- [x] financial·market·flow·valuation·peer `NumericEvidence` adapter와 S15 `POST_DERIVED` gate — 도메인별 `select_*_evidence()` 5종 + `integrity_status=="VERIFIED"` 방어 gate. **한계**: `NumericEvidence`는 원본 Fact의 corp_code·unit·period를 다시 담지 않아(`docs/skills.md` 필드 정의) 사후 재검증이 불가능하므로 실제 `S15.post_derived()` 재호출은 생성 시점(S3 `financial_facts.py` 라우터, 이미 C4에서 완료)이 책임진다 — 이 모듈은 그 결과(`integrity_status`)를 신뢰 경계에서 강제하는 하위 gate다. valuation·peer는 S5·S21 미구현(T09)이라 근거 자체가 없어 항상 `INSUFFICIENT_EVIDENCE`(크래시·임의 대입 없음, C4의 S5·S21 선례와 동일 판단)
- [x] 계산식·사용값·기간·기업·출처·reason code 출력 — `Calculation`(formula/inputs/computed_value/formula_version) + `AtomicVerdictResult`(reason_code/used_evidence_ids/missing_fields), `/api/v1/claims/verify` 응답에 그대로 노출
- [x] 동일 Claim·Fact 반복 verdict 일치 100% — `test_same_claim_and_facts_always_yield_the_same_verdict`
- [x] LLM이 수치·verdict를 변경할 수 없는 계약 테스트 — `test_module_has_no_llm_or_network_dependency`(소스에 solar/llm/httpx 등 토큰 부재 정적 검사) + `test_verify_atomic_signature_has_no_llm_supplied_verdict_backdoor`(임의 kwarg 주입 시 `TypeError`)

## C9. RAG·반증·인용·보안 [R09][S18·S19·S20·S23][I6·I7·I11][T07]

- [ ] Chroma document·embedding·chunk schema와 checksum/version
- [ ] dense+sparse hybrid 검색과 metadata filter
- [ ] reranking·중복 제거·검색 score threshold
- [ ] retrieval Recall@K·relevance precision baseline
- [ ] 지지 query와 반대 방향 query 동시 실행
- [ ] counter retrieval A/B 결과와 노이즈 기록
- [ ] 상충 근거 감지·표시·판정 규칙
- [ ] Evidence relation `SUPPORTS/REFUTES/NEUTRAL/CONFLICTS`와 rule version 계약 테스트
- [ ] Evidence가 `claim_id`·`presentation_item_id`를 둘 다 누락하거나 둘 다 포함하면 schema가 거부하는 negative test
- [ ] exact/fuzzy/offset 인용 검사와 공식 URL 검증
- [ ] S20이 S2 A용 `presentation_item_id` Evidence와 S18/S19 C용 `claim_id` Evidence를 모두 검사
- [ ] 인용 실패 근거로 확정 verdict를 내리지 않는 테스트
- [ ] 사용자 입력·공시 문서 인젝션 데이터 블록 격리
- [ ] secret·PII redaction, tool/schema allowlist, 공격 event trace
- [ ] S4·S7·S8·S11의 provider 직접 호출을 막고 모든 LLM 호출이 S23을 통과하는 테스트
- [ ] S17 충족률·예산·timeout 기준 최대 3회 재검색 종료

## C10. 기능 C 결과·체크리스트 [R10][S8·S9·S11][T07]

- [ ] Claim별 5상태 verdict와 그룹 결과 API/UI
- [ ] 계산식·지지·반증·상충·부족·검증불가 이유 표시
- [ ] 검색 시도·필수 근거 충족 범위·rule/model version 표시
- [ ] missing/conflicting evidence 기반 확인 체크리스트
- [ ] 데이터 부재와 API 장애를 구분하고 provider 장애는 재검색 후에도 `EXTERNAL_ERROR`로 보존
- [ ] 인용 원문 viewer와 출처·기준일 유지
- [ ] 같은 입력 반복 결과 안정성·비결정 구간 trace
- [ ] 근거 없음·의견을 거짓으로 표시하지 않는 테스트

## C11. 복기·가설 추적·사용자 데이터 정책 [R11][S10·S22][I10][T10]

- [ ] T01 인증 주체를 사용한 tenant 격리·소유권 검사
- [ ] 분석 Claim·Evidence·Verdict·rule/model version immutable snapshot
- [ ] 사용자 주석·태그·체크리스트 상태 저장
- [ ] 복기 로그 목록·필터·패턴 집계 UI
- [ ] 사용자 데이터 내보내기·삭제·보존기간·기기 변경
- [ ] 신규 공시 감지 scheduler와 idempotent 재검증
- [ ] 과거 `as_of` snapshot과 신규 결과를 별도 저장
- [ ] 역사 fixture replay로 가설 변화 E2E 테스트
- [ ] 미래 데이터가 과거 판정에 들어가는 사례 0건
- [ ] citation open 이벤트 저장(사용자·claim·evidence·연 시각) — plan.md 제품 성공 지표("인용 열람 횟수") 측정 근거

## C12. I9 평가·CI [R12][I9][T05·T12]

### C12-A. 평가 기반 [T05]

- [x] versioned golden dataset schema와 fixture validation — `eval/schema.js` `validateGoldenDataset`(카테고리 14종, 필수 커버리지 태그 7종, verdict 5상태 커버리지 강제) + `eval/golden-v1.json`(`dataset_version: golden-v1.0.0`, 30개 case), `eval/schema.test.js`
- [x] dataset·metric version별 `eval/thresholds` registry와 변경 승인 규칙 확정 — `eval/schema.js` `validateThresholdRegistry`(버전 패턴·`change_log[]` 필수 강제, 단일 파일 shape만 검사) + `eval/thresholds-v1.json`(`thresholds_version: thresholds-v1.0.0`). GPT 리뷰(2026-07-14 18:23) 반영: shape 검사만으로는 threshold 값을 낮추면서 버전·change_log를 그대로 둬도 통과함을 재현으로 확인 — `validateThresholdChangeApproval(previous, next)`를 추가해 값이 바뀐 metric마다 버전 bump와 그 metric을 지목하는 새 change_log 항목을 요구하고, `eval/run.js`가 `git show HEAD:eval/thresholds-v1.json`으로 이전 커밋 registry를 불러와 실행 시 자동 검증(`THRESHOLD_CHANGE_NOT_APPROVED`, exit 2). GPT 리뷰(2026-07-14 18:37) 후속 반영: metric 이름만 정확히 지목하고 `before`/`after`는 조작된 change_log 항목도 통과하던 결함을 재현으로 확인 — `extractBound()`로 실제 이전/이후 bound(`min`/`max`/`equals`/`per_environment`)를 뽑아 change_log 항목의 `before`/`after`와 정확히 일치하는지까지 검증하도록 강화. GPT 리뷰(2026-07-14 18:44) 후속 반영: `min`+`max`처럼 bound kind를 2개 이상 선언한 ambiguous metric entry가 `validateThresholdRegistry()`를 통과하고, `extractBound()`의 우선순위(min→max→equals→per_environment)가 `eval/report.js` `resolveThreshold()`의 실제 평가 우선순위(per_environment→min→max→equals)와 달라 malformed entry에서 감사 로그 검증과 실제 평가가 서로 다른 bound를 볼 수 있던 결함을 재현으로 확인 — `validateThresholdRegistry()`가 bound kind를 정확히 하나만 허용하도록 강화하고 `extractBound()`의 우선순위를 `resolveThreshold()`와 동일하게 맞춤. 변경 승인 규칙은 `docs/skills.md` "I9 골든 평가 하네스 계약"에 문서화(버전 갱신+정확한 change_log 2요건은 코드로 강제, review.md 교차 점검은 사람이 수행)
- [x] extraction P/R 0.80, numerical·지원 범위 verdict 100%, citation 100%, temporal·hallucination·injection·추천·schema 실패 0건을 registry에 등록 — `eval/thresholds-v1.json` metrics(`extraction_precision`/`extraction_recall` min 0.80, `verdict_accuracy_rate`/`numerical_consistency_rate`/`citation_correctness_rate` equals 1.0, `temporal_leakage_failures`/`provider_fault_classification_failures`/`hallucination_failures`/`injection_defense_failures`/`recommendation_ban_failures`/`schema_violation_failures` max 0)
- [x] retrieval Recall@K·relevance precision·counter retrieval·insufficient/unverifiable·상충 판정 최소값을 registry에 수치로 고정 — `eval/thresholds-v1.json`의 `retrieval_recall_at_5`/`retrieval_relevance_precision`/`counter_retrieval_recall`/`insufficient_unverifiable_detection_accuracy`/`conflict_detection_accuracy`. **한계**: S18~S20(T07) 착수 전이라 실측 데이터가 없어 보수적 초기 placeholder로 고정했고(수치 근거는 `change_log[0]`), 실측이 쌓이면 change_log를 통해 조정한다(임의 추정 아님, 명시적으로 placeholder라고 문서화)
- [x] latency·LLM token/cost·provider 실패율 budget을 환경별 수치로 registry에 고정 — `eval/thresholds-v1.json`의 `latency_p95_ms`/`llm_cost_budget_usd_per_month`/`provider_failure_rate_max`(`per_environment: {dev,staging,production}`). **한계**: 위와 동일 — T11 통합·실측 전 초기 placeholder, T12에서 실측 E2E로 재검증
- [ ] OpenDART·시세·외부 근거·LLM용 immutable record/replay fixture와 checksum — **BLOCKED(부분)**: OpenDART·KIS(시세)·네이버(외부 근거)는 T02~T04에서 이미 캡처한 `backend/tests/fixtures/{opendart,kis,naver}/`를 재캡처 없이 `eval/fixtures-manifest.json`에 sha256 checksum으로 고정 참조했고, `eval/run.js`가 매 실행마다 실제 파일과 checksum을 대조해 드리프트를 검증한다(red→green으로 실제 checksum 불일치를 잡음을 확인). LLM(Solar) fixture만 남았다: S7(T06)이 아직 없어 Solar를 호출하는 코드 경로 자체가 없고 `UPSTAGE_API_KEY`도 미발급(`docs/prerequisites.md` T06·T07 절 미체크)이라 캡처할 수 없다. 해제 조건: 사용자가 UPSTAGE_API_KEY를 발급해 `.env`에 채우고 T06에서 S7이 Solar를 실제로 호출하게 되면, 그 세션에서 T02~T04와 동일한 방식(실 라이브 호출 캡처)으로 `eval/fixtures-manifest.json`의 `llm_solar` 항목을 채운다
- [x] scorer가 완전·불완전 synthetic 결과를 정확히 통과/차단하는 unit test — `eval/scorers.js` 14개 카테고리 scorer 전부, `eval/scorers.test.js`에서 각 카테고리마다 완전한 결과(기본 `reference_prediction`)는 통과·의도적으로 틀린 predicted는 차단됨을 확인(예: unit 혼동 시뮬레이션, 환각 span 주입, injection marker 누출, 상충 근거 누락 등). GPT 리뷰(2026-07-14 18:23) 반영: `hallucination`/`injection_defense`/`recommendation_ban` 3개 scorer는 docs/skills.md:529가 "0건/false가 아니면 실패"라는 불변식으로 정의하는데, 실제 구현은 이 불변식이 아니라 case별 `expected.*` gold label과 비교하고 있어 dataset이 실수로 `expected.hallucinated=true` 등으로 잘못 기록되면 실제 환각·leak·추천 문구가 있어도 통과함을 재현으로 확인 — 세 scorer 모두 결과를 불변식(`hallucinated===false`/`leaked===false`/`banned_phrase_count===0`)에 직접 비교하도록 고치고, `expected.*`가 그 불변식과 다르면(=dataset이 위반을 정상으로 기록하면) scorer가 조용히 넘기지 않고 던지도록 함(scoreVerdictAccuracy의 dataset 내부 일관성 검사와 같은 패턴)
- [x] 평가 리포트 schema와 이전 dataset·rule·model 버전 대비 회귀 diff 생성 — `eval/report.js` `buildReport`(schema_version·overall_pass·blocking_failures)·`regressionDiff`(이전 `eval/reports/latest.json` 대비 metric별 delta·regressed 판정, 이전 리포트 없으면 빈 배열), `eval/run.js`가 매 실행마다 `eval/reports/latest.json`+`eval/reports/history/`에 저장. `eval/report.test.js`로 검증
- [x] threshold 누락·dataset schema 실패·scorer 오류 시 CI를 차단하는 harness smoke test — `eval/run.js`가 `MISSING_THRESHOLD`/`INVALID_DATASET`/`INVALID_THRESHOLD_REGISTRY`/`SCORER_ERROR`/`FIXTURE_CHECKSUM_MISMATCH`/`DATASET_THRESHOLD_MISMATCH`를 exit code 2로 구분해 차단(정상 실패는 exit 1). `eval/run.test.js`(자동 테스트, 실 파일은 건드리지 않고 임시 사본으로 검증) + `scripts/verify.sh`/`node eval/run.js`로 실제 red→green 수동 검증 완료(threshold 제거·필수 태그 제거·잘못된 operation 주입 3가지 모두 exit 2로 차단 후 원복 확인). `scripts/verify.sh` [3/4]와 `ci.yml`의 `eval` job에 배선

### C12-B. 전체 품질 게이트 [T12]

- [ ] Claim extraction precision·recall 각각 0.80 이상, type/verifiable accuracy registry 기준 통과
- [ ] numerical consistency와 지원 범위 verdict accuracy 100%
- [ ] temporal leakage·타기업·단위 혼합 0건
- [ ] retrieval Recall@K·relevance precision·counter retrieval A/B registry 기준 통과
- [ ] 사용자에게 노출된 citation correctness 100%, unsupported assertion·hallucination 0건
- [ ] insufficient/unverifiable detection과 상충 근거 판정 registry 기준 통과
- [ ] prompt/document injection·추천 문구·schema escape 허용 실패 0건
- [ ] provider timeout·rate limit·retry·cache·idempotency fault test 통과
- [ ] 사용자 격리·인증·데이터 삭제·migration test 통과
- [ ] latency·LLM token/cost·provider 실패율 budget 통과
- [ ] 모든 평가 결과와 회귀 diff를 CI artifact로 보존
- [ ] 기준 미달 시 CI와 릴리스 차단

## C13. Backend 기반·FastAPI·React·인증 통합 [R13][T01·T11]

- [x] backend package scaffold·dependency lock·환경변수 schema·secret 예제 구성 [T01] — `backend/`(uv, `pyproject.toml`+`uv.lock`), `app/config.py`(pydantic-settings), 루트 `.env.example`
- [x] FastAPI app factory, Pydantic 공통 envelope, backend unit·integration test runner [T01] — `app/main.py:create_app()`, `app/schemas/envelope.py`(contracts/envelope.js와 동일 계약의 Python 미러), pytest 36개 통과. GPT 리뷰(2026-07-12) 반영: provider rate limit·인증 실패를 `EXTERNAL_ERROR`로 정정(skills.md status 의미 준수), `source_ids` 필수화, `UserRepository` 동시 가입 경쟁을 rollback 후 결정론적 CONFLICT로 변환, 구조화 JSON 요청/오류 로그(`app/observability.py`)와 Prometheus 요청 metrics(`/metrics`) 추가
- [x] PostgreSQL 기본 schema·migration·repository·인증 기반 contract test [T01] — `app/models/user.py`+Alembic 초기 migration(`alembic/versions/c4f6e182a5f8_*`), `UserRepository`, `/api/v1/auth/register·login·me` e2e contract test(정상·중복 이메일 409·오답 비밀번호 401·미인증 401·validation 422). GPT 재리뷰(2026-07-12) 반영: `IntegrityError`를 `constraint_name`으로 선별해 `ix_users_email` 위반만 CONFLICT 변환, 무관한 무결성 오류는 그대로 전파(오분류 방지 테스트 추가, backend pytest 37개)
- [ ] versioned FastAPI endpoint와 OpenAPI schema
- [ ] 인증·인가·tenant filter를 모든 사용자 데이터 endpoint에 적용
- [ ] 동기/비동기 분석 job, timeout, 취소, idempotency
- [ ] 표준 오류 envelope와 partial result
- [ ] React A/B/C 전체 화면과 Claim 편집·provenance viewer
- [ ] loading·empty·partial·stale·provider-error 상태
- [ ] keyboard·screen reader·색상 대비·모바일 접근성
- [ ] 문장별 출처·기준일·지원 범위·rule/model version 표시
- [ ] frontend-backend contract·E2E 테스트

## C14. 배포·운영 [R14][T13]

- [ ] 배포 플랫폼과 PostgreSQL·Chroma 영속 저장 방식 확정
- [ ] 개발·staging·production 환경 분리
- [ ] secrets manager·암호화·rotation·최소권한
- [ ] DB·vector index backup/restore 실제 복구 테스트
- [ ] migration·application rollback 테스트
- [ ] logs·metrics·traces·alerts와 request correlation
- [ ] provider·LLM 상태, latency, 실패율, 비용 dashboard
- [ ] 개인정보·보존·삭제·incident·provider 장애 runbook
- [ ] production smoke·health·readiness·load test

## C15. 기능 D 개인 주문 [R15][S12][T14]

- [ ] A/B/C와 분리된 주문 adapter와 feature flag
- [ ] 인증된 주문 preview·submit·status·cancel·history FastAPI endpoint와 OpenAPI 계약
- [ ] S12 `OrderCommand` operation별 request/response·cursor와 `OrderState` enum contract test
- [ ] 주문 직접 입력·미리보기·2단계 확인·상태 timeline·취소·이력 React 화면
- [ ] frontend/backend 주문 contract·paper·sandbox E2E와 사용자·계좌 격리 테스트
- [ ] paper adapter → broker sandbox → live-disabled adapter
- [ ] client가 보낸 mode/live 의도를 무시하고 server entitlement·환경만으로 실행 mode 결정
- [ ] 본인 계좌 인증·자격증명 암호화·로그 redaction
- [ ] 사용자 직접 종목·지정가·수량 입력, 분석값 자동 입력 금지
- [ ] 계좌 마스킹·broker executable quote 시각·장 상태·예상금액·수수료 immutable preview
- [ ] 만료되는 confirmation nonce와 재인증을 포함한 2단계 확인
- [ ] 종목 allowlist·1회/일일 한도·stale quote 차단·kill switch
- [ ] `client_order_id`·idempotency key·중복 클릭 방지
- [ ] timeout 후 broker 상태 조회·reconciliation, 맹목 재주문 금지
- [ ] 접수·거부·부분체결·완전체결·취소 state machine
- [ ] 장마감·잔고부족·네트워크 단절·unknown 상태 fault injection
- [ ] 주문·체결·취소 감사 로그와 사용자 알림
- [ ] 공개·데모 build paper-only
- [ ] staging의 paper/sandbox 주문 smoke, trace·metrics·alert, kill switch·rollback drill
- [ ] 법률·컴플라이언스·운영 승인 전 live를 차단하는 server-side release gate 구현·문서화

## C16. 전체 릴리스 완료 [T15]

- [ ] R01~R15 상태가 모두 `IMPLEMENTED`
- [ ] S1~S23·I1~I11 acceptance matrix 전부 통과
- [ ] T14가 포함된 최종 commit에서 build·test·lint·type·secret·dependency security scan 재실행
- [ ] 최종 tree에서 C12-B 전체 평가와 회귀 차단 gate 재실행
- [ ] 최종 배포에서 C14 health·readiness·load·관측·rollback 핵심 gate 재실행
- [ ] A/B/C 실제 provider E2E와 provider 장애 fallback 통과
- [ ] D paper·sandbox E2E와 live-disabled 안전 gate 통과
- [ ] I9 CI report 전체 기준 통과
- [ ] backup/restore·rollback·incident drill 완료
- [ ] 알려진 한계·데이터 출처·라이선스·보안·법률 경계 문서화
- [ ] 사용자·운영자 문서와 재현 가능한 데모 시나리오 완료
