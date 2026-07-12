# 사용자 준비물 — 외부 계정·API key·결정 사항

이 문서는 agent가 대신 할 수 없는, **사용자가 직접 준비해야 하는 것**을 Task 시점별로 정리한다. 실제 secret 값은 절대 이 문서나 저장소에 적지 않는다. `.env.example`(변수명만)은 T01에서 생성되며, 실제 `.env`는 gitignore 대상이다.

상태 표기: `[ ]` 미준비 / `[x]` 준비 완료

## 지금 바로 (T00 전후)

- [x] **문서 커밋** — T00·T01 계약·backend·하네스 기준점을 확정하고 upstream 추적 이슈 [#643](https://github.com/connect-AIAgentChallenge-26-1/hub/issues/643)에 후속 검증 항목을 기록
- [ ] **GitHub branch protection** — main에 required status checks 설정 (`ci.yml`의 `frontend`·`backend`·`secret-scan` job을 required로 지정)
- [x] **auto-merge 정책 결정** — 품질 gate(CI 성공+리뷰 승인) 통과를 머지 조건으로 반영 완료 (`.github/workflows/auto-merge.yml`)

## T01 — Backend·DB 기반

- [x] **PostgreSQL 실행 환경** — Docker Desktop이 이미 설치·실행 중이어서 `docker-compose.yml`(postgres:18, localhost:5442)로 해결. 실제 배포 환경의 PostgreSQL 호스팅은 T13에서 별도 결정
- [ ] **로컬 `.env`에 T01 변수 채우기** — 저장소의 `.env`는 아직 `DATABASE_URL`·`JWT_SECRET_KEY`가 없다(agent는 실제 `.env`를 읽거나 쓰지 않았음). `.env.example`을 참고해 다음을 추가해야 backend가 로컬에서 실행된다: `DATABASE_URL=postgresql+psycopg://hub:hub@localhost:5442/hub`, `JWT_SECRET_KEY=<32바이트 이상의 무작위 값>`
- [ ] **secret 관리 방식 결정 (배포 환경)** — 로컬은 `.env`로 확정. 배포 환경은 무엇을 쓸지(플랫폼 내장 secrets, AWS Secrets Manager 등) 방향만 T13 이전에 미리 결정

## T02 — OpenDART 수집

- [ ] **OpenDART API key 발급** — https://opendart.fss.or.kr 회원가입 → 인증키 신청 (무료, 즉시 발급). 일일 요청 한도가 있으므로 발급 후 한도 정책 확인
- [ ] 발급받은 key를 `.env`의 `DART_API_KEY`에 입력

## T03 — 시세·외부 근거 수집

- [ ] **시세 provider 선택·가입** — 후보를 하나 확정해야 S13 계약을 짤 수 있다:
  - 공공데이터포털(data.go.kr) 금융위원회 주식시세정보 — 무료, API key 발급 필요
  - KRX 정보데이터시스템 — 라이선스·이용약관 확인 필요
  - 증권사 시세 API(T14와 겸용 가능, 예: 한국투자증권 KIS Developers)
- [ ] **뉴스·외부 근거 provider allowlist 결정** — 어떤 출처를 공식 근거로 인정할지 목록 확정 (예: 공공데이터포털, 거래소 공시, 네이버 뉴스 API 등). 각 provider의 API key 발급과 이용약관·라이선스 확인
- [ ] 선택한 provider의 key를 `.env`에 입력

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
| `MARKET_API_KEY` | 선택한 시세 provider | T03 |
| `NEWS_API_KEY` 등 | 선택한 외부 근거 provider | T03 |
| `UPSTAGE_API_KEY` | console.upstage.ai | T06 |
| `DATABASE_URL` | 로컬/배포 PostgreSQL | T01 |
| `JWT_SECRET_KEY` | 직접 생성(32바이트 이상 무작위 값) | T01 |
| `BROKER_APP_KEY` / `BROKER_APP_SECRET` | 증권사 개발자 포털 | T14 |

## 원칙

- secret은 `.env`·배포 secrets에만 존재한다. 문서·코드·커밋·LLM context에 넣지 않는다 (CLAUDE.md 절대 원칙 8).
- provider를 선택하면 [skills.md](skills.md)의 해당 스킬(S13·S14·S12) 계약에 provider 이름·제약을 반영하고 record/replay fixture를 만든다.
- key가 없어서 진행 불가한 Task는 [backlog.md](backlog.md)에 `BLOCKED`와 해제 조건(예: "DART_API_KEY 발급 대기")으로 기록한다.
