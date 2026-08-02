# CareerSignal 릴리스 검증 체크리스트

이 문서는 분석 버전의 활성화, 배포, 최종 결과물 공개 가능 여부를 판단하는 수용 기준이다. 개발 작업과 담당·일정은 GitHub Issues와 GitHub Projects에서 관리하고, 범위와 순서는 [개발 백로그](backlog.md)에서 관리한다.

## 0. 판정 방법

항목마다 누가 통과를 판정하는지를 괄호로 밝힌다.

| 표기 | 뜻 |
| --- | --- |
| `코드` | 저장소의 검사가 판정한다. 괄호 안은 판정하는 파일이다 |
| `사람` | 사람이 확인해 표시한다. 저장소의 검사가 판정하지 않는다 |

`코드` 항목의 확인 명령은 `cd agent && python -m pytest tests/unit tests/eval -q` 와 `cd server && npm test` 다. 파이썬 검사는 `agent/tests/unit`의 61개 모듈과 `agent/tests/eval`의 1개 모듈에 있으며 2,190개가 수집된다(`def test_` 1,854개에 매개변수 전개가 더해진 수다). 저장소·권한 검사는 `agent/tests/integration`의 7개 모듈이며 데이터베이스 접속을 요구하므로 위 명령에 포함하지 않는다. 자바스크립트 검사는 `server/src`의 6개 `*.test.js`와 `product/src/data/recompose.test.js`다.

체크 표시는 코드와 데이터가 함께 조건을 만족할 때만 한다. 코드가 구현되고 검사가 도는 것과 그 코드가 실 데이터에서 판정을 낸 것은 다르며, 후자를 요구하는 항목은 조건을 항목 아래에 적는다. Phase별 상태는 [개발 백로그](backlog.md) 2장에 있다.

## 1. 기반 수직 슬라이스

- [x] 직무 선택에서 준비 로드맵까지 다섯 화면이 연결된다. (사람)
- [x] React, Express, Supabase, FastAPI의 독립 실행 경계가 구성된다. (코드: `agent/tests/unit/test_domain_purity.py`)
- [x] 샘플 공고가 저장소에 적재되고 Express가 조회한다. (코드: `server/src/index.test.js`)
- [x] 네 화면의 데이터 계약이 fixture로 검증된다. (코드: `server/src/outputs.test.js`)
- [x] 합격 전략과 준비 로드맵이 범위와 체크 상태를 공유한다. (코드: `server/src/recompose.test.js`)

## 2. 설계와 계약

- [x] 데이터 계층, 저장 구조, 그래프, Wiki의 정의가 기준 문서에 있다. (사람)
- [x] 분류체계 발견·승격 절차와 지표 정의가 기준 문서에 있다. (사람)
- [x] 공통 실행 계약이 Pydantic 스키마로 구현된다. (코드: `agent/tests/unit/test_contracts.py`)
- [x] 순수 도메인 로직이 저장소와 모델에 의존하지 않는다. (코드: `agent/tests/unit/test_domain_purity.py`)
- [x] 온톨로지 버전에 두 그래프 층의 노드·엣지 유형과 허용 연결이 등록된다. (코드: `agent/tests/unit/test_ontology.py`, `agent/migrations/sql/0020_ontology_evidence_alignment.sql`)
- [x] 지표 정책 버전에 최소 표본, 억제 정책, 불확실성 방법이 등록된다. (코드: `agent/tests/unit/test_metric_policy.py`, `agent/migrations/sql/0022_metric_uncertainty_methods.sql`)

## 3. 실행 환경

- [x] 생성 모델의 식별자가 실제 응답으로 확인되고 코드와 문서에 반영된다. (사람: `agent/scripts/smoke.py`의 결과)
- [x] 구조화 출력이 스키마를 준수한다. (사람: `agent/scripts/smoke.py`의 결과)
- [x] 임베딩 차원이 확인되고 벡터 컬럼 정의에 반영된다. (사람: `agent/scripts/check_embedding.py`의 결과)
- [x] 교차 모델 응답이 확인된다. (사람: `agent/scripts/smoke.py`의 결과)
- [x] 저장소 연결과 벡터 확장이 확인된다. (사람: `agent/scripts/smoke.py`의 결과)
- [x] 실행별 토큰과 비용 한도의 초기값이 설정된다. (코드: `agent/tests/unit/test_contracts.py`)
- [x] 생성 모델 키를 Express가 보유하지 않는다. (사람: `server/.env`와 `server/render.yaml`)

## 4. 데이터 준비

- [x] 기업 공식 채용공고 원문이 직무·기업군·출처 메타데이터와 함께 저장된다. (코드: `agent/tests/unit/test_ingest.py`, `agent/tests/unit/test_postings.py`)
- [x] 대상 회사의 공식 채용·기술 자료가 저장된다. (코드: `agent/tests/unit/test_ingest.py`)
- [x] 공공·직무 표준의 기준과 용어가 구조화된다. (코드: `agent/migrations/sql/0015_job_standards.sql`)
- [x] 제3자 자료가 허용 용도와 신뢰도 점수와 함께 저장된다. (코드: `agent/tests/unit/test_source_policy_check.py`)
- [x] 원본 스냅샷의 내용 변경이 데이터베이스에서 차단된다. (코드: `agent/tests/integration/test_ingest.py`, `agent/migrations/sql/0001_initial_schema.sql`)
- [x] 접근할 수 없게 된 자료의 스냅샷과 관찰 기록이 보존된다. (코드: `agent/tests/unit/test_ingest.py`)
- [ ] 평가 세트의 정답과 루브릭을 사람이 확정한다. (사람: `docs/eval/`)
- [x] 청크, 임베딩, 키워드 인덱스가 같은 데이터 버전으로 연결된다. (코드: `agent/tests/unit/test_chunking.py`, `agent/tests/unit/test_embedding.py`)

`docs/eval/`의 다섯 파일은 `status = draft`다. 확정 범위는 [평가 세트](eval/README.md)에 있다.

## 5. 분류체계와 지표

- [x] 요구 표현이 분류체계와 무관하게 추출되고 근거 위치가 원문과 일치한다. (코드: `agent/tests/unit/test_extractor.py`, `agent/tests/unit/test_mentions.py`)
- [x] 기지 추출과 잔여 추출이 분리 실행된다. (코드: `agent/tests/unit/test_discovery.py`)
- [x] 후보와 기존 차원의 관계가 동의어·상하위·관련·신규로 판정된다. (코드: `agent/tests/unit/test_discovery.py`)
- [x] 승격되지 않은 후보가 통계에 포함되지 않는다. (코드: `agent/tests/unit/test_promotion.py`)
- [x] 승격 결정이 독립 공고 수, 독립 회사 수, 평가 세트 대조 결과와 함께 기록된다. (코드: `agent/tests/unit/test_promotion.py`)
- [x] 분류체계 버전 발행 시 해당 데이터셋의 할당이 전량 재계산된다. (코드: `agent/tests/unit/test_publication.py`, `agent/tests/unit/test_assignment.py`)
- [x] 지표 적용 가능성이 정의되고 적용 불가 조합이 계산되지 않는다. (코드: `agent/tests/unit/test_metric_expansion.py`)
- [x] 모든 지표 행이 표본 수, 기간, 범위, 불확실성을 함께 저장한다. (코드: `agent/tests/unit/test_metric_runner.py`)
- [x] 모든 지표 행이 대상군을 가지며 서로 다른 대상군의 수치를 같은 비교 기준에 놓지 않는다. (코드: `agent/tests/unit/test_segment.py`, `agent/tests/integration/test_entry_segment.py`)
- [x] 표본 상태가 정책 버전의 임계값과 일치한다. (코드: `agent/tests/unit/test_metric_policy.py`)
- [x] 표본이 모자란 값이 행을 남긴 채로 억제된다. (코드: `agent/tests/unit/test_metric_runner.py`)
- [x] 기간 비교가 두 기간 모두 비교 가능한 표본 상태일 때만 생성된다. (코드: `agent/tests/unit/test_metric_temporal.py`)
- [x] 역량별 기대 깊이가 저장된 깊이 분포에서 도출되고 근거 차원과 표본 수를 남긴다. (코드: `agent/tests/unit/test_depth_profile.py`)
- [x] 서로 다른 지표 정책 버전의 수치를 비교하지 않는다. (코드: `agent/tests/unit/test_metric_policy.py`)

## 6. 에이전트

- [ ] 데이터 수집 에이전트가 자료를 발견·수집·평가해 원본과 출처 평가를 저장한다. (코드: `agent/tests/unit/test_collector.py`)
- [x] 지식 구축 에이전트가 사전 의미 층을 구축한다. (코드: `agent/tests/unit/test_graph_semantic.py`)
- [x] 계보 기록 파이프라인이 계보 층과 사후 의미 층을 기록한다. (코드: `agent/tests/unit/test_graph_provenance.py`)
- [x] 등록되지 않은 노드·엣지 유형과 허용되지 않은 연결이 폐기된다. (코드: `agent/tests/unit/test_ontology.py`)
- [x] 경로 캐시가 분류체계·지식·분석·그래프 정책 네 버전을 키로 갖는다. (코드: `agent/tests/unit/test_graph_paths.py`)
- [x] 근거 집합이 자료 계층 정책과 출처 다양성을 지키고 선택·탈락 이유를 남긴다. (코드: `agent/tests/unit/test_evidence_set.py`, `agent/tests/unit/test_evidence_set_optimization.py`)
- [x] Wiki가 생성 조건을 충족한 역량에 대해서만 생성된다. (코드: `agent/tests/unit/test_knowledge_agent.py`)
- [x] Wiki의 모든 필드가 허용된 계층의 근거를 가진다. (코드: `agent/tests/unit/test_knowledge_agent.py`)
- [x] 통계 분석 에이전트가 차원을 발견하고 할당한다. (코드: `agent/tests/unit/test_discovery.py`, `agent/tests/unit/test_assigner.py`)
- [x] 집계 파이프라인이 지표를 결정적으로 계산하고 저장한다. (코드: `agent/tests/unit/test_metric_families.py`, `agent/tests/unit/test_stage_e.py`)
- [x] 채용공고 해석 에이전트가 명시 요구, 추론 요구, 회사 맥락 신호를 구분한다. (코드: `agent/tests/unit/test_interpretation_agent.py`)
- [x] 합격 전략 에이전트가 체크리스트 개념과 버전 인스턴스를 분리해 저장한다. (코드: `agent/tests/unit/test_strategy_agent.py`)
- [x] 준비 로드맵 에이전트가 깊이 프로파일을 반영한 학습 전략을 생성한다. (코드: `agent/tests/unit/test_roadmap_agent.py`)
- [x] 각 에이전트가 입력·출력 스키마를 통과한다. (코드: `agent/tests/unit/test_contracts.py`)
- [x] 근거가 부족한 에이전트가 조사 요청을 발행하고 오케스트레이터가 수집을 스케줄링한다. (코드: `agent/tests/unit/test_orchestration.py`)
- [x] 에이전트가 다른 도메인 에이전트를 직접 호출하지 않는다. (코드: `agent/tests/unit/test_domain_purity.py`)
- [x] 각 실행이 종료 사유를 기록한다. (코드: `agent/tests/unit/test_stage_d.py`, `agent/tests/unit/test_stage_e.py`)

수집 항목의 미달 조건은 발견이다. `agents/collector/fetcher.py`는 미리 준비한 원문을 계약에 맞춰 돌려주는 스텁이며 출처 발견과 웹 수집을 하지 않는다. 실구현은 Phase 26이다.

## 7. 검증

- [x] 여덟 검사가 모두 구현되고 검사별로 판정이 기록된다. (코드: `agent/tests/unit/test_checks.py`, `agent/tests/unit/test_checks_semantic.py`, `agent/tests/unit/test_verification_framework.py`)
- [x] 판정이 일곱 유형 중 하나로 저장된다. (코드: `agent/tests/unit/test_verdict.py`)
- [x] 자료 계층과 허용 용도 위반이 자동으로 차단된다. (코드: `agent/tests/unit/test_source_policy_check.py`)
- [x] 근거 위치가 원문과 일치하지 않는 주장이 폐기된다. (코드: `agent/tests/unit/test_checks.py`)
- [x] 통계의 분모, 표본, 중복 제거, 재계산이 일치한다. (코드: `agent/tests/unit/test_metric_verification.py`)
- [ ] 근거 함의 검사가 모든 공개 후보 주장에 적용된다. (코드: `agent/tests/unit/test_checks_semantic.py`)
- [ ] 교차 모델 감사가 위험 기반 표본에 적용된다. (코드: `agent/tests/unit/test_checks_semantic.py`)
- [x] 추가 요구 없음 주장이 범위 전수 확인을 근거로 가진다. (코드: `agent/tests/unit/test_interpretation_agent.py`)
- [x] 범위 전수 확인이 없으면 판단 근거 부족을 출력한다. (코드: `agent/tests/unit/test_interpretation_agent.py`)
- [x] 신뢰도가 주장 유형별 정책과 구성값으로 판정된다. (코드: `agent/tests/unit/test_domain.py`)
- [x] 생성 모델의 자기 보고를 신뢰도로 사용하지 않는다. (코드: `agent/tests/unit/test_domain.py`)
- [x] 수리 반복이 한도 안에서 종료된다. (코드: `agent/tests/unit/test_verification_framework.py`)

두 항목의 미달 조건은 판정자 주입이다. 검사 5·6·7은 등록된 채로 판정자 포트가 비어 있어 `not_applicable`을 기록한다. 조건은 [개발 백로그](backlog.md) Phase 18에 있다.

## 8. 오케스트레이션과 버전

- [x] 공고 추가·수정·삭제가 해당 직무와 영향 범위의 분석을 재실행한다. (코드: `agent/tests/unit/test_orchestration.py`)
- [x] 분류체계 버전 발행이 해당 직무의 할당과 통계를 재실행한다. (코드: `agent/tests/unit/test_orchestration.py`)
- [x] 자료 유형별 변경이 정의된 후속 단계만 재실행한다. (코드: `agent/tests/unit/test_orchestration.py`)
- [x] 영향받지 않은 분석 결과가 재사용된다. (코드: `agent/tests/unit/test_orchestration.py`)
- [x] 실행이 데이터·분류체계·모델·프롬프트·검색 정책·지표 정책 버전을 기록한다. (코드: `agent/tests/unit/test_envelope.py`, `agent/tests/unit/test_telemetry_instrumentation.py`)
- [x] 일부 단계가 실패하면 기존 활성 버전을 유지한다. (코드: `agent/tests/unit/test_activation.py`)

## 9. 수용 평가와 릴리스 게이트

- [x] 평가 세트 채점이 활성화 이전에 실행된다. (코드: `agent/tests/unit/test_release_gate.py`)
- [ ] 요구 표현 추출의 정밀도와 재현율이 기준을 충족한다. (사람: `docs/eval/` 확정 후 채점 결과)
- [ ] 차원 할당 정확도가 기준을 충족한다. (사람: `docs/eval/` 확정 후 채점 결과)
- [ ] 근거 정확도와 미지원 주장 비율이 기준을 충족한다. (사람: `docs/eval/` 확정 후 채점 결과)
- [x] 해석에서 로드맵까지의 식별자 연결이 끊기지 않는다. (코드: `agent/tests/unit/test_evaluation_scoring.py`, `server/src/recompose.test.js`)
- [x] 수용 기준을 충족하지 않은 버전이 활성화되지 않는다. (코드: `agent/tests/unit/test_release_gate.py`)
- [x] 전체 검증을 통과한 직무 분석 버전만 원자적으로 활성화된다. (코드: `agent/tests/unit/test_activation.py`, `agent/tests/unit/test_integrated_verifier.py`)
- [x] 실행 한도에 도달해 조사를 마치지 못한 결과가 공개되지 않는다. (코드: `agent/tests/unit/test_disclosure.py`)

세 지표 항목의 미달 조건은 세트 확정이다. 채점기는 초안 세트에도 실행되며 그 결과가 게이트 판정이 되는가는 `evaluation/acceptance.py`가 `status`로 가른다. `draft` 동안의 판정은 `not_gating`이다.

## 10. 저장 결과 조회와 체크 상태

- [x] 화면 조회가 에이전트를 호출하지 않고 활성 분석 결과를 반환한다. (코드: `server/src/index.test.js`, `server/src/outputs.test.js`)
- [x] 범위 선택이 네 분석 화면에 같은 범위로 적용된다. (코드: `server/src/outputs.test.js`)
- [x] 체크 변경이 준비 현황 카드에 즉시 반영된다. (코드: `product/src/data/recompose.test.js`)
- [x] 체크 변경이 포트폴리오·자소서·면접 전략을 변경하지 않는다. (코드: `server/src/recompose.test.js`)
- [x] 체크 적용이 프로젝트 로드맵과 학습 전략만 재조합한다. (코드: `server/src/recompose.test.js`, `agent/tests/unit/test_roadmap_agent.py`)
- [x] 체크 상태가 체크리스트 개념 식별자에 연결되어 버전 변경 후에도 유지된다. (코드: `agent/tests/unit/test_strategy_agent.py`, `server/src/recompose.test.js`)
- [x] 로딩, 빈 결과, 미지원 직무, 서버 오류 상태가 일관된 화면과 응답을 제공한다. (코드: `server/src/index.test.js`)

조회 경로의 근거는 다음과 같다. `server/src/db.js`가 `active_analysis_versions`를 읽고 `server/src/outputs.js`가 저장된 payload를 그대로 돌려준다. `server/src/index.js`에서 에이전트 서비스로 나가는 경로는 `POST /api/postings/analyze`와 `POST /api/extract` 둘뿐이며, `GET /api/stats`와 `POST /api/reverse`·`/api/conditions`·`/api/roadmap`은 저장소만 읽는다. 활성 버전이 없으면 `503 NO_ACTIVE_ANALYSIS`를 내고 `product/src/components/AnalysisNotice.jsx`가 안내한다. 체크 상태 조합기는 `server/src/recompose.js`이며 파이썬 기준 구현 `agent/src/careersignal/agents/roadmap/recompose.py`의 결과를 `server/src/__fixtures__/recompose-cases.json`으로 대조한다.

## 11. 계측

- [x] 검색 후보가 전략별 점수와 함께 기록된다. (코드: `agent/tests/unit/test_retrieval.py`)
- [x] 검색 결과의 사용 목적이 일곱 유형으로 기록된다. (코드: `agent/tests/unit/test_retrieval.py`)
- [x] 근거가 연결된 주장의 비율이 보고된다. (코드: `agent/tests/unit/test_telemetry_instrumentation.py`)
- [x] 인용한 근거가 주장을 지지하는 비율이 보고된다. (코드: `agent/tests/unit/test_telemetry_instrumentation.py`)
- [ ] 검색 전략별 기여도가 비교 가능한 형태로 보고된다. (사람: `docs/eval/` 확정 후 제거 실험)
- [x] 표본 수렴 관찰이 기록된다. (코드: `agent/tests/unit/test_saturation.py`)

`telemetry/instrumentation.py`의 `marginal_utility`는 인터페이스만 갖는다. 제거 실험은 평가 세트 표본에서 측정한다.

## 12. 보안과 비용

- [x] API 키가 환경변수와 배포 환경 비밀값으로 관리된다. (사람: `server/render.yaml`, Vercel 환경변수)
- [x] API 키와 수집 원문이 클라이언트 번들, 로그, Git 이력에 노출되지 않는다. (사람: `.gitignore`, `agent/data/sources/`)
- [x] 검색, 재시도, 토큰 사용량에 실행별 한도가 적용된다. (코드: `agent/tests/unit/test_contracts.py`, `agent/tests/unit/test_concurrency.py`)
- [ ] 영상 분석 모델에 공개 자료만 입력된다. (사람)
- [x] 수집 대상의 이용 조건과 robots 정책이 기록된다. (코드: `agent/tests/unit/test_source_policy_check.py`)
- [x] 구성요소가 허용 범위 밖의 테이블에 쓰지 못한다. (코드: `agent/tests/integration/test_permissions.py`)

영상 항목의 미달 조건은 경로 부재다. 영상 처리 단계는 코드에 없으며 판정은 영상 자료를 입력하는 경로가 생긴 뒤의 일이다. 단계의 정의는 [데이터 전략](data-strategy.md)에 있다.

## 13. 배포와 클로즈드 베타

- [x] React, Express, FastAPI, Supabase가 배포 환경에서 연결된다. (사람: `server/render.yaml`, `product/vercel.json`)
- [x] API 주소가 환경별 설정으로 분리된다. (사람: `product/vite.config.js`의 개발 proxy와 `product/vercel.json`의 rewrites, `product/src/data/api.js`)
- [x] 배포 환경에서 다섯 화면 흐름과 범위 변경이 검증된다. (사람)
- [x] 배포 환경에서 체크 상태와 재조합이 검증된다. (사람)
- [x] 장애 시 활성 분석 버전이 유지되고 안전한 오류가 표시된다. (코드: `server/src/index.test.js`, `agent/tests/unit/test_activation.py`)
- [ ] 베타 피드백 Issue 템플릿과 분류 기준이 준비된다. (사람: `.github/`)
- [x] 배포 URL과 데모 시나리오가 문서에 연결된다. (사람: `README.md`, `docs/plan.md`)
- [ ] FastAPI 배포 환경이 NVIDIA 교차 검사용 키를 받는다. (사람: `server/render.yaml`, Render 환경변수)
- [ ] 공개 정적 프로토타입이 로컬 최신 화면과 같은 문구·디자인을 표시한다. (사람)

베타 피드백 항목의 미달 조건은 `.github/`가 `pull_request_template.md`와 `workflows/`만 갖고 Issue 템플릿을 갖지 않는다는 점이다. 배포 주소는 `README.md`와 `AGENTS.md`에 있다.

## 14. 확장과 최종 결과물

- [ ] 베타에서 재현된 P0 문제와 발표를 막는 P1 문제가 수정·회귀 검증된다. (사람)
- [ ] 허용된 출처의 공고 변경이 데이터 버전과 재실행 범위에 반영된다. (코드: `agent/tests/unit/test_orchestration.py`)
- [ ] 추가 직무가 파이프라인과 화면 계약을 재사용하고 분류체계를 데이터로 추가해 분석된다. (사람: 직무별 실 표본)
- [ ] 사용자 공고 입력이 캐시 미적중 시 해석·전략·로드맵 체인을 실행하고 검증 결과를 저장한다. (코드: `agent/src/careersignal/api/routes_user_posting.py`)
- [ ] Express용 service role이 `legacy_posting_samples`에 조회 권한만 가진다. (코드: `agent/migrations/sql/0025_legacy_posting_samples.sql`)
- [ ] 생성 CSV의 사용자 문구가 공개 용어를 사용하고 런타임 정규화는 방어 계층으로만 남는다. (사람: `agent/data/demo_seed/`)
- [ ] 의미색과 글래스 효과가 공통 디자인 토큰을 사용한다. (사람: `product/src/index.css`, `prototype/style.css`)
- [ ] 관측 화면이 수작업 데이터 없이 운영 테이블에서 파생된다. (사람)
- [ ] 데모가 저장 결과 조회, 범위 변경, 체크 상태 조합, 근거 경로 추적을 재현한다. (사람)
- [ ] 발표 자료가 문제, 자료 정책, 여섯 에이전트, 분류체계 발견, 검증, 계측 결과를 설명한다. (사람)
- [ ] GitHub Projects의 최종 범위 Issue가 완료 조건과 검증 근거를 가진다. (사람)

공고 변경 항목의 미달 조건은 실 데이터다. 영향 범위 계산은 `orchestration/impact.py`에 있고, 갱신 대상이 되는 실 공고 확보는 Phase 27이다.

직무 확장 항목의 미달 조건은 표본이다. 직무 아홉 종의 카탈로그·화면 계약·분석 버전은 갖춰져 있고 여덟 직무의 분석 데이터는 `dataset_version = ds_demo_v1`의 생성 데이터다. 근거는 [ADR 0015](adr/0015-generated-dataset-version.md), 교체 단위는 [개발 백로그](backlog.md) 11장에 있다.
