# 사용자 준비물 — 외부 계정·API key·결정 사항

이 문서는 agent가 대신 할 수 없는, **사용자가 직접 준비해야 하는 것**을 Task 시점별로 정리한다. 실제 secret 값은 절대 이 문서나 저장소에 적지 않는다. `.env.example`(변수명만)은 T01에서 생성되며, 실제 `.env`는 gitignore 대상이다.

상태 표기: `[ ]` 미준비 / `[x]` 준비 완료

## 지금 바로 (T00 전후)

- [x] **문서 커밋** — T00·T01 계약·backend·하네스 기준점을 확정하고 upstream 추적 이슈 [#643](https://github.com/connect-AIAgentChallenge-26-1/hub/issues/643)에 후속 검증 항목을 기록
- [ ] **GitHub branch protection** — main에 required status checks 설정 (`ci.yml`의 `frontend`·`backend`·`secret-scan` job을 required로 지정)
- [x] **auto-merge 정책 결정** — 품질 gate(CI 성공+리뷰 승인) 통과를 머지 조건으로 반영 완료 (`.github/workflows/auto-merge.yml`)

## T01 — Backend·DB 기반

- [x] **PostgreSQL 실행 환경** — Docker Desktop이 이미 설치·실행 중이어서 `docker-compose.yml`(postgres:18, localhost:5442)로 해결. 실제 배포 환경의 PostgreSQL 호스팅은 T13에서 별도 결정
- [x] **로컬 `.env`에 T01 변수 채우기** — `DATABASE_URL`·`JWT_SECRET_KEY`가 실제 `.env`에 채워졌음을 확인(agent는 값을 읽거나 표시하지 않고 존재 여부와 DB 연결 성공만 확인)
- [ ] **secret 관리 방식 결정 (배포 환경)** — 로컬은 `.env`로 확정. 배포 환경은 무엇을 쓸지(플랫폼 내장 secrets, AWS Secrets Manager 등) 방향만 T13 이전에 미리 결정

## T02 — OpenDART 수집

- [x] **OpenDART API key 발급** — `.env`의 `DART_API_KEY`에 값이 채워져 있음을 확인(agent는 값을 읽거나 표시하지 않음). 일일 요청 한도 정책은 실제 호출 시 rate limit 응답으로 확인
- [x] 발급받은 key를 `.env`의 `DART_API_KEY`에 입력

## T03 — 시세·외부 근거 수집

- [x] **시세 provider 선택 (2026-07-13)** — 한국투자증권(KIS) Developers Open API로 결정(T14 개인 주문과 겸용 가능해 F6 권고를 따름). 인증은 앱키(App Key)+앱시크릿(App Secret)으로 REST 접근토큰을 발급받는 방식이며, 실전투자(prod)와 모의투자(vps) 환경의 앱키가 서로 다르다. 국내주식 현재가 조회 등은 `FID_COND_MRKT_DIV_CODE`(시장 구분, 예: "J")·`FID_INPUT_ISCD`(종목코드) 파라미터를 사용한다.
- [x] **시세 provider 가입·key 발급 (2026-07-14)** — 모의투자 앱키·앱시크릿 발급 완료, `.env`의 `KIS_APP_KEY`·`KIS_APP_SECRET`·`KIS_ENV=vps`에 채워짐을 확인(agent는 값을 읽거나 표시하지 않고 존재 여부·형식만 확인). 실제 API 호출로 인증·현재가·기간별시세·예탁원 기업행위 4종 endpoint 검증 완료(`backend/tests/fixtures/kis/`).
- [x] **뉴스·외부 근거 provider allowlist 결정 (2026-07-13)** — 공식 출처(공공데이터포털·거래소 공시) + 네이버 뉴스 검색 API로 결정. 네이버 API는 `X-Naver-Client-Id`/`X-Naver-Client-Secret` 헤더 인증, 엔드포인트 `https://openapi.naver.com/v1/search/news.json`, 응답 필드 `title/originallink/link/description/pubDate`. **주의**: 뉴스 기사 본문은 산문이므로 CLAUDE.md 절대 원칙 2·[skills.md](skills.md) S14 제약에 따라 여기서 나온 수치를 검증 없이 `NumericEvidence`로 승격하지 않는다 — 사실 근거가 아닌 "검증 대상 주장의 출처"로만 쓰인다.
- [x] **네이버 뉴스 API key 발급 (2026-07-14)** — `.env`의 `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`에 채워짐을 확인. 실제 뉴스 검색 호출로 검증 완료(`backend/tests/fixtures/naver/`).
- [x] 발급받은 key를 `.env`의 `KIS_APP_KEY`·`KIS_APP_SECRET`·`NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`에 입력(`KIS_ENV`는 모의투자면 `vps`, 실전이면 `prod`)
- [ ] **공식 구조화 provider(공공데이터포털/KRX) key 발급 — 신규 식별(2026-07-14)** — `docs/checklist.md` C3의 "공식 provider의 구조화 수급·계약 수치를 NumericEvidence로 변환" 항목에 필요. (1) data.go.kr(공공데이터포털)에서 원하는 금융·기업행위 API를 검색해 활용신청 후 서비스 key 발급, 또는 (2) KRX 정보데이터시스템의 공식 API/데이터 신청. 둘 중 최소 1곳만 있어도 재개 가능. agent는 개인 명의 계정 등록을 대신할 수 없다.
- [ ] 발급받은 key를 `.env`에 입력(변수명은 key 발급 시점에 `docs/skills.md` S14와 함께 확정)

## T06·T07 — LLM (기능 C)

- [ ] **Upstage API key 발급** — https://console.upstage.ai 에서 발급 (모델: solar-pro3, OpenAI 호환 SDK 사용). 채팅·문서에 노출된 key는 반드시 폐기·재발급
- [ ] **LLM 예산 결정** — 월 상한 금액. C12-A의 token/cost budget threshold에 이 값이 들어간다
- [ ] key를 `.env`의 `UPSTAGE_API_KEY`에 입력

## T13 — 배포·운영

- [ ] **배포 플랫폼 선택·계정 생성** — frontend, FastAPI, PostgreSQL, Chroma 영속화를 어디서 돌릴지 결정 (예: Railway·Fly.io·Render·AWS 중 택일)
- [ ] **플랫폼 secrets 등록** — `.env`의 모든 key를 배포 환경 secrets로 등록
- [ ] **GitHub Actions secrets 등록** — CI에서 record/replay fixture 갱신이나 배포에 필요한 key
- [ ] (선택) 도메인, 오류·알림 채널(email, Slack 등)

## T14 — 개인 주문 (기능 D)

- [ ] **증권사 개발자 계정** — 예: 한국투자증권 KIS Developers (모의투자 지원). 앱 key/secret 발급, 모의투자 계좌 개설
- [ ] **본인 명의 계좌** — sandbox 통과 후 개인 live 검증용. 공개·데모 배포는 paper-only이므로 필수는 아님
- [ ] **약관·법률 검토** — live adapter 활성화 전 증권사 API 약관, 자동주문 관련 규정 확인. 이것은 코드 완료와 별개의 release gate다

## .env 변수 미리보기

실제 schema는 T01에서 확정하지만, 사용자가 채워야 할 값은 대략 다음과 같다.

| 변수 | 발급처 | 필요 시점 |
|---|---|---|
| `DART_API_KEY` | opendart.fss.or.kr | T02 |
| `KIS_APP_KEY` / `KIS_APP_SECRET` | apiportal.koreainvestment.com(한국투자증권 KIS Developers) | T03 |
| `KIS_ENV` | `vps`(모의투자) 또는 `prod`(실전투자) | T03 |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | developers.naver.com | T03 |
| (미확정) 공공데이터포털 또는 KRX 공식 구조화 provider key | data.go.kr 또는 KRX 정보데이터시스템 | T03(BLOCKED, C3 마지막 1항목) |
| `UPSTAGE_API_KEY` | console.upstage.ai | T06 |
| `DATABASE_URL` | 로컬/배포 PostgreSQL | T01 |
| `JWT_SECRET_KEY` | 직접 생성(32바이트 이상 무작위 값) | T01 |
| `BROKER_APP_KEY` / `BROKER_APP_SECRET` | 증권사 개발자 포털 | T14 |

## 원칙

- secret은 `.env`·배포 secrets에만 존재한다. 문서·코드·커밋·LLM context에 넣지 않는다 (CLAUDE.md 절대 원칙 8).
- provider를 선택하면 [skills.md](skills.md)의 해당 스킬(S13·S14·S12) 계약에 provider 이름·제약을 반영하고 record/replay fixture를 만든다.
- key가 없어서 진행 불가한 Task는 [backlog.md](backlog.md)에 `BLOCKED`와 해제 조건(예: "DART_API_KEY 발급 대기")으로 기록한다.
