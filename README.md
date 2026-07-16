# 플레이스픽 AI

플레이스픽 AI는 자연어로 받은 모임 조건을 확인한 뒤 Naver 장소·블로그 근거를
결정론적으로 평가하고, Elice LLM으로 근거가 연결된 추천 이유를 생성하는 Java 17
서비스다. 추천 결과는 세 후보로 제공하고 공유방의 투표와 주최자 최종 확정까지
이어진다.

## 구현 경계

| 영역 | 현재 저장소의 기준 |
| --- | --- |
| 백엔드 | Java 17, Spring Boot 3.5.16, Gradle Wrapper 8.14.4 |
| 추천 | 조건 확인, Naver 검색, 정규화·필터·점수, Top 3, 근거 기반 이유 |
| 실행 | `mock`, 로컬 직접 연동 `live-dev`, 무료 데모 `production` |
| 데이터 | PostgreSQL을 정본으로 사용하고 Redis Streams로 작업을 전달 |
| 프런트 | Next.js 기반 제품 화면과 개발용 Live Playground |
| 배포 목표 | Vercel Hobby + Render Free + Neon Free + Upstash Free |

정식 `/api/v1`의 익명 Session·Draft·202 Job·Outbox·Worker·결과, Room·Vote·최종 확정과
비식별 이벤트 수집은 구현돼 있고 Mock·Testcontainers 자동 테스트로 검증한다. 실제
Naver→Elice 직접 경로도 2026-07-16 세 합성 사용자 시나리오에서 장소 3개,
`linked=true`, 저하·이유 fallback 없이 통과했으며 report secret scan을 통과했다. 상세
과정과 호출 수는
[CASE-0002](docs/case-studies/CASE-0002-naver-elice-linked-live-user-flow.md)가 정본이다.

같은 날 Live Playground 브라우저에서 실제 Draft를 사람이 보정한 뒤 Naver evidence,
Top 3와 Elice 이유를 확인하고 삭제까지 완료했다. 이어 정식 same-origin API에서 별도
주최자·참여자 세션, `202` Job, PostgreSQL Outbox, Redis Worker, 추천·방 SSE,
`LIKE → DISLIKE → DELETE → LIKE`와 최종 결과 조회까지 실제 Provider로 통과했다. 이는
로컬 정식 서비스 흐름의 실행 증거이며 cloud 배포 완료 증거는 아니다.

Mock 자동 검증과 실제 Provider 검증은 분리한다. CI와 `make check`는 외부 API를
호출하지 않는다. 실제 Naver·Elice 호출은 로컬의 Git 제외 파일
`.env.live.local`을 사용하는 `make dev-live` 또는 `make live-evidence`에서만 수행한다.
무료 클라우드 데모는 Render의 sleep과 cold start가 있는 포트폴리오 환경이며 상시 가동
SLA를 보장하지 않는다. 저장소에는 배포 구성과 workflow가 있지만 실제 cloud 리소스·
secret 주입·배포 E2E는 아직 검증하지 않았다.

## 로컬 실행

필수 조건은 실행 중인 Docker Desktop과 Dev Container다. Dev Container 안에는
Java 17, Node 24와 프로젝트 도구가 준비된다.

```bash
make setup
make dev
```

브라우저에서 `http://localhost:3000`을 연다. `make dev`는 PostgreSQL·Redis와
in-process Mock Provider를 사용하므로 외부 키가 필요 없다.

실제 Provider 값을 화면에서 확인하려면 `.env.live.local.example`을 참고해 Git에서
제외된 `.env.live.local`을 직접 작성한 뒤 실행한다.

```bash
make dev-live
```

Live Playground는 사용자의 자연어, 추출 Draft, 확인 조건, Naver 후보와 Blog 근거,
필터·중복 제거, 점수·순위, Elice 전달 문맥과 검증된 추천 이유를 단계별로 표시한다.
실행 데이터는 기본 30분 동안 메모리에만 남고 화면에서 즉시 삭제할 수 있다.

실제 값 자체를 테스트 로그에 남기지 않고 화면 계약까지 자동 확인하려면 `make dev-live`를
실행한 상태에서 별도 Dev Container 터미널로 다음 수동 전용 검증을 실행한다.

```bash
npm run test:e2e:live --workspace @placepick/frontend
```

이 명령은 CI와 `make check`에는 포함되지 않으며 screenshot·video·trace를 만들지 않는다.
정식 `/api/v1/**` 전체 로컬 Live 흐름을 안전한 단계 출력으로 확인하는 절차는
[RUN-0005](docs/runbooks/RUN-0005-direct-live-development.md), 실제 과정과 결과는
[CASE-0002](docs/case-studies/CASE-0002-naver-elice-linked-live-user-flow.md)를 따른다.

## 검증 명령

| 명령 | 목적 |
| --- | --- |
| `make test` | Docker 없는 Java·프런트 단위 테스트 |
| `make integration` | Testcontainers·WireMock 통합/계약 테스트 |
| `make eval` | 결정론적 추천·LLM 정책 Eval |
| `make check` | 문서·Compose·프런트·Java 전체 자동 검증 |
| `make live-evidence` | 고정 합성 시나리오의 실제 Naver→Elice 직접 검증 |
| `make build-images` | Java 17 운영 이미지와 Next.js production build |
| `make observe` | PostgreSQL·Redis·Prometheus·Grafana 실행 |
| `make down` | 로컬 인프라 종료 |
| `make reset` | 확인 후 로컬 데이터 볼륨 삭제 |

실제 키, 인증 Header, Provider routing URL과 원문 응답은 Git·JUnit·일반 로그에
기록하지 않는다. Embedding은 제품 추천 경로에서 사용하지 않는다.

## 무료 클라우드 데모

배포 후 요청 처리는 Vercel·Render·Neon·Upstash에서 이루어지므로 로컬 PC나 Docker
Desktop을 켜 둘 필요가 없다. Render에 Naver·Elice·DB·Redis 자격을 저장하고,
GitHub `production` Environment에는 Vercel 배포 토큰과 Render Deploy Hook만 둔다.

`.github/workflows/deploy-demo.yml`은 수동으로 입력한 정확한 40자리 `main` SHA를
검증하고, 같은 SHA의 테스트·빌드·Vercel 배포·Render 배포와 revision 확인을 수행한다.
Vercel과 Render의 Git 자동 배포는 끈다. 이전 정상 SHA를 다시 입력하는 것이 데모
롤백 절차다. 이는 구현된 배포 절차이며 완료된 배포 증거는 아니다. 실제 계정·프로젝트·
secret 생성과 대표 사용자 여정 검증은 저장소 밖에서 소유자가 수행하기 전까지
`planned`다.

## 아키텍처

```text
브라우저 → Next.js → Spring API
                     ├─ PostgreSQL: Session, Draft, Job, Outbox, 결과, 투표
                     ├─ Redis Streams: 추천 작업 전달·retry·DLQ
                     ├─ PostgreSQL event + JVM fan-out/Job DB poll: SSE 전달
                     ├─ Naver API HUB: 장소·블로그 근거
                     └─ Elice LLM: 조건 추출·근거 문장
```

추천 Job과 Outbox는 같은 PostgreSQL 트랜잭션에서 생성한다. Worker는 중복 전달을
허용하는 대신 처리 event ID를 기록해 멱등성을 지키고, 점수와 순위는 LLM이 아니라
서버의 결정론적 규칙으로 확정한다.

## 문서

- [문서 인덱스](docs/README.md)
- [Task DAG](docs/roadmap.md)
- [API·이벤트·Provider 계약](docs/contracts.md)
- [아키텍처](docs/architecture.md)
- [개발 환경](docs/development-environment.md)
- [무료 데모 배포 결정](docs/adr/ADR-0010-free-demo-deployment-boundary.md)
- [직접 Provider 단순화 결정](docs/adr/ADR-0014-mvp-direct-provider-and-simplified-trust-boundary.md)
- [실제 Naver→Elice 사용자 여정 증거](docs/case-studies/CASE-0002-naver-elice-linked-live-user-flow.md)

Task 상태와 담당자의 단일 정본은 `gdh0730/hub`의 GitHub Issue다. Work Record는
중요한 작업을 실제로 시작할 때만 만들며, 과거 상세 증거는 `docs/archive/`에 보존한다.
`documents/`와 `plans/`는 원문·참고 자료이고 현재 구현 정본은 `docs/`와 실행 코드다.
