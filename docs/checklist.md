# 전체 구현 체크리스트 — 근거 검증 Agent

이 문서는 [plan.md](plan.md)의 R01~R15와 [skills.md](skills.md)의 S1~S23·I1~I11을 검증 가능한 작업으로 분해한다. 모든 체크박스는 최종 완료에 필수다. 구현 순서는 [backlog.md](backlog.md)를 따른다.

각 항목은 코드, 정상·실패 테스트, 문서, 로그·metrics를 함께 갖춰야 완료다.

## C0. 계약·저장소 품질 게이트 [T00]

- [ ] `plan.md`, `skills.md`, `backlog.md`, `checklist.md`, `CLAUDE.md`, `AGENTS.md`의 기능 ID·용어·상태 동기화
- [ ] `schema_version`, request/trace ID, `as_of`, status, reason code, warning, source, rule/model version 공통 envelope 확정
- [ ] Claim·Fact·Evidence·Verdict·Citation schema와 migration 정책 확정
- [ ] 5상태 verdict 및 그룹 `PARTIALLY_SUPPORTED` 규칙 계약 테스트
- [ ] repository-level build·test·lint·type·security workflow와 gate 정책 구성
- [ ] frontend/backend lint, backend type check, secret·dependency security scan 구성
- [ ] CI에 build·test·lint·type·security 차단 gate 연결
- [ ] auto-merge 승인·품질 gate 추가, 충돌 자동 close와 반복 코멘트 제거
- [ ] tracked 문서가 ignored 문서를 필수 참조하지 않도록 문서 정책 정리

## C1. 종목 해석 [R01][S1][T02]

- [ ] OpenDART 고유번호와 상장 종목 master 수집·버전 관리
- [ ] 종목명·약칭·6자리 종목코드 → `corp_code` 매핑
- [ ] 동명·유사 종목 후보와 `matched_by`, listing status, 기준일 반환
- [ ] 사용자 확정 없이 모호한 후보를 자동 확정하지 않는 테스트
- [ ] 비상장·상장폐지·지원 외 시장 안전 종료 테스트

## C2. OpenDART 공시·재무·원문 [R02][S2][T02]

- [ ] 공시검색 API client와 `status` 오류 매핑
- [ ] 단일회사 전체 재무제표 API client(CFS/OFS·보고서 코드)
- [ ] S2 `COLLECT`의 immutable `RawDisclosureRecord`와 `NORMALIZE` discriminated union contract
- [ ] `rcept_no`로 공시 접수일·보고서명·재무 행 조인
- [ ] 사업·분기·반기·3분기 보고서와 정정 chain 저장
- [ ] 공시 원문 다운로드·파싱·checksum·immutable raw snapshot
- [ ] 표·본문 chunking과 종목·접수일·대상기간·문서 metadata
- [ ] S2 `NORMALIZE`의 `eligible_financial_rows`, `document_chunks`, A용 `document_evidence` typed output
- [ ] timeout·retry/backoff·rate limit·cache·점검 응답 테스트
- [ ] 데이터 없음과 provider 장애를 다른 reason code로 반환

## C3. 시세·기업행위·외부 근거 [R03][S13·S14][T03]

- [ ] 공식 시세 provider와 수동 입력 adapter 계약 확정
- [ ] S13·S14 `COLLECT` raw record → S15 PRE → `NORMALIZE` discriminated union contract
- [ ] 거래 캘린더, quote timestamp, 거래량, 발행주식 수 수집
- [ ] 조정·비조정 주가, 액면분할·증자·배당락 metadata 보존
- [ ] 시세 provider 라이선스·최신성·장애 fallback 표시
- [ ] 뉴스·거래소·공식기관 외부 근거 provider allowlist
- [ ] S14 versioned deterministic query-builder가 Structured Claim에서만 검색어를 생성하는 contract test
- [ ] 뉴스 게시·수정 시각, URL, 기업 entity match, checksum 저장
- [ ] 공식 provider의 구조화 수급·계약 수치를 provenance 포함 `NumericEvidence`로 변환
- [ ] 산문에서 LLM이 추출한 미검증 수치를 `NumericEvidence`로 승격하지 않는 테스트
- [ ] 커뮤니티 소문을 사실 근거로 승격하지 않는 테스트
- [ ] 뉴스·테마 원천 부재 시 `UNVERIFIABLE` 반환

## C4. Temporal Integrity·재무 계산 [R04][S3·S15][I4][T04]

- [ ] `filed_at <= as_of` 미래 데이터 차단
- [ ] `as_of` 내 정정 chain 최신본 선택과 원본 이력 보존
- [ ] 잠정·확정 실적 구분·우선순위·충돌 표시
- [ ] 두 기간 CFS 우선, OFS 일관 fallback, CFS/OFS 혼합 금지
- [ ] `thstrm_amount`·누적값·전기 비교값의 의미를 보고서 종류별 매핑
- [ ] 반기·3분기 누적값 → 단일분기 변환 공식·원본값 보존
- [ ] raw 값·단위·통화와 normalized 값·단위 동시 저장
- [ ] 0.15/15%, 원/천원/백만원 혼동 방지 테스트
- [ ] 분모 0·음수·흑자전환·적자지속 규칙 테스트
- [ ] 매출·영업이익·순이익·부채·현금흐름·배당·PER/PBR/ROE 공식과 버전
- [ ] 시세·발행주식 수·시가총액 기준일 일치와 기업행위 보정
- [ ] 다른 기업·기간·단위·재무범위 혼합 시 계산 중단
- [ ] 모든 원천의 S15 `PRE_NORMALIZE`와 모든 파생 Fact/Evidence의 `POST_DERIVED` 2단계 계약 테스트
- [ ] S15 discriminated union이 PRE의 derived payload와 POST의 raw payload를 schema 단계에서 거부
- [ ] S3·S5·S21 파생 결과의 공식·입력 provenance·기업·기간·단위·`as_of` 사후 검증

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

- [ ] Solar Structured Outputs schema와 provider mock
- [ ] 복합 문장 → 원자 Claim + `claim_group_id`
- [ ] 원문 span, 기업, 유형, evidence domain, metric, comparator, 비교 대상·peer ref, 기간, 방향, 조건 구조화
- [ ] 의견·미래 예측·수치·비교·부정·조건문 분류
- [ ] 모호어·기간·비교대상 warning과 Claim 확인·수정 UI
- [ ] 원문에 없는 span·기업·숫자 생성 0건
- [ ] S14 외부 근거 수집이 S7 `StructuredClaim` 이후에만 실행되는 contract test
- [ ] schema allowlist, 허용 필드 밖 출력 차단
- [ ] 사용자 입력 인젝션·malformed output·timeout 안전 처리

## C8. 필수 근거·결정론 검산 [R08][S16·S17][I2·I3·I5][T06]

- [ ] Claim 유형별 required evidence rule registry와 버전
- [ ] 필수 근거 충족률 계산과 missing fields 반환
- [ ] 증가·감소·배수·비율·연속성 comparator 구현
- [ ] `SUPPORTED/REFUTED/INSUFFICIENT/UNVERIFIABLE` 원자 판정
- [ ] 그룹 `PARTIALLY_SUPPORTED` 집계
- [ ] `배수 >= 2`, 실제 1.38배 → `REFUTED` 테스트
- [ ] 부호 전환 배수 `RATIO_UNDEFINED_SIGN_CHANGE` 처리
- [ ] financial·market·flow·valuation·peer `NumericEvidence` adapter와 S15 `POST_DERIVED` gate
- [ ] 계산식·사용값·기간·기업·출처·reason code 출력
- [ ] 동일 Claim·Fact 반복 verdict 일치 100%
- [ ] LLM이 수치·verdict를 변경할 수 없는 계약 테스트

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

## C12. I9 평가·CI [R12][I9][T05·T12]

### C12-A. 평가 기반 [T05]

- [ ] versioned golden dataset schema와 fixture validation
- [ ] dataset·metric version별 `eval/thresholds` registry와 변경 승인 규칙 확정
- [ ] extraction P/R 0.80, numerical·지원 범위 verdict 100%, citation 100%, temporal·hallucination·injection·추천·schema 실패 0건을 registry에 등록
- [ ] retrieval Recall@K·relevance precision·counter retrieval·insufficient/unverifiable·상충 판정 최소값을 registry에 수치로 고정
- [ ] latency·LLM token/cost·provider 실패율 budget을 환경별 수치로 registry에 고정
- [ ] OpenDART·시세·외부 근거·LLM용 immutable record/replay fixture와 checksum
- [ ] scorer가 완전·불완전 synthetic 결과를 정확히 통과/차단하는 unit test
- [ ] 평가 리포트 schema와 이전 dataset·rule·model 버전 대비 회귀 diff 생성
- [ ] threshold 누락·dataset schema 실패·scorer 오류 시 CI를 차단하는 harness smoke test

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

- [ ] backend package scaffold·dependency lock·환경변수 schema·secret 예제 구성 [T01]
- [ ] FastAPI app factory, Pydantic 공통 envelope, backend unit·integration test runner [T01]
- [ ] PostgreSQL 기본 schema·migration·repository·인증 기반 contract test [T01]
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
