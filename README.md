# 플레이스픽 AI

네이버 검색 결과와 LLM을 조합해 모임 장소 결정을 돕는 서비스 저장소다. 현재
구현된 결과물은 Java 17 백엔드 개발 환경과 반복 가능한 검증 하네스이며, 완성형
MVP의 기능·계약·선행 관계는 [서비스 완성 roadmap](docs/roadmap.md)에서 관리한다.

## 현재 상태와 목표

| 구분 | 현재 구현 | 다음 제품 단계 |
| --- | --- | --- |
| 런타임 | Java 17, Spring Boot 3.5.16, Gradle 8.14.4 | 동일 기준 유지 |
| HTTP | Actuator health·Prometheus만 공개 | 조건 확인, 비동기 추천, SSE, 공유·투표·확정 |
| 데이터 | PostgreSQL·Redis 로컬 하네스 | 도메인 스키마, outbox, Redis Streams와 DLQ |
| 외부 연동 | Naver·Elice 개별 Local Live 통과; 세 대표 합성 시나리오의 실제 Linked Live strict success | 제품 runtime 연결과 승인 배포 E2E |
| 프런트엔드 | 독립 프로토타입만 존재 | Next.js 기반 주최자·참여자 전체 사용자 여정 |
| 품질 | 환경 단위·통합·Eval·문서와 health smoke 검증 완료 | 계약·Eval·브라우저 E2E·보안·부하·릴리스 gate |

측정하지 않은 처리량이나 품질 수치는 성과로 기재하지 않는다. 상세 실행 증거와
의사 결정은 [WI-0001](docs/work-records/WI-0001-agentic-development-environment.md),
검증 완료 결과의 포트폴리오 요약은
[CASE-0001](docs/case-studies/CASE-0001-agentic-development-environment.md)에 기록한다.

2026-07-15 Split Live는 `main` SHA `dc6e1e2...`에서 한 번 실행했지만 성공 summary 없이
안전하게 실패했다. 비밀·Provider 원문 노출은 관찰되지 않았으나 실패 stage를 구분하지
못했으므로 Split 계약은 계속 `specified`다. 같은 날 첫 baseline `make check`는 Windows
bind mount의 Gradle task output cache mode 복원 문제로 중단됐다. task output build
cache만 비활성화하고 dependency·configuration cache와 up-to-date 판단은 유지한 뒤,
별도 우회 옵션 없는 표준 `make check`가 통과했다. Split 실패는 성공으로 과장하지 않으며
자세한 증거는
[WI-0041](docs/work-records/WI-0041-recommendation-core-split-live-workflow.md),
[WI-0042](docs/work-records/WI-0042-naver-elice-linked-live-workflow.md)와
[TS-0013](docs/troubleshooting/TS-0013-gradle-test-output-cache-bind-mount-mode.md)에서
관리한다.

같은 날 21:10 KST, 병합 `main` SHA `541a98b3...`에서 실제 Naver→Elice Linked Live를
정확히 한 번 실행했다. 고정 합성 장소 조건을 Gateway를 통한 Elice 조건 추출 논리 단계에
전달했지만 `conditionExtraction / PROVIDER_UNAVAILABLE`로 종료했다. 따라서 사용자 확인,
Naver Local·Blog, 서버 Top 3와 Elice 근거 이유 단계에는 도달하지 않았고 `linked=true`
증거도 없다. 같은 SHA에서는 재실행하지 않았으며 생성 report 10개 안전 scan과 Gateway
종료를 확인했다. 이 실패 시점의 실제 Linked 계약은 계속 `specified`였다.

이 실패 기록을 지우지 않고 원인을 단계별로 분리한 뒤, 검토·push된 validation SHA
`e789af65e94441aa38a018a2931c3705f7125112`에서 세 합성 사용자 시나리오를 각각 독립
invocation으로 실행했다. 각 invocation은 새 Gateway·port·일회성 local 자격을 사용하고
HTTP retry·redirect 없이 실제 Elice 조건 추출 → 명시적 확인 fixture → 실제 Naver
Local·Blog → 서버 결정론적 Top 3 → 실제 Elice 근거 이유 → 서버 provenance 검증을
끝까지 통과했다.

- `seoul-cafe-complete-v1`: 사용자가 서울, 2명, 1인당 2만 원 이하, 조용한 카페,
  흡연 장소 제외를 입력한 흐름이다. 추출값을 곧바로 추천에 쓰지 않고 versioned 확인
  조건을 적용한 뒤 검색·근거 연결·Top 3·이유 검증을 완료했다. `callCount=7`이었다.
- `seoul-restaurant-nullable-v1`: 사용자가 서울 음식점만 입력한 흐름이다. 인원과 예산을
  임의 추정하지 않고 nullable과 안정적인 warning으로 유지한 뒤 전체 경로를 완료했다.
  `callCount=6`이었다.
- `seoul-cafe-dessert-v1`: 사용자가 서울 디저트 카페와 흡연 장소 제외를 입력한 흐름이다.
  누락된 인원·예산은 추정하지 않고, 선호·제외 조건을 확인한 뒤 실제 근거 기반 결과까지
  완료했다. `callCount=6`이었다.

세 결과 모두 `linked=true`, `degraded=false`, `reasonFallback=false`, `cleanup=true`인
strict success였다. 이는 실제 Provider와 동기식 추천 core의 연결을 검증한 결과다.
Controller, DB, 202 Job, Outbox, Worker, SSE, 프런트엔드와 cloud 배포는 아직 구현·검증하지
않았으므로 전체 제품 서비스가 완료됐다는 의미는 아니다.

목표 사용자 여정은 `익명 세션 → 자연어 조건 초안 → 사용자 확인 → 202 추천 Job →
근거 기반 후보 3개 → 공유방 → LIKE/DISLIKE → 주최자 최종 확정`이다. 현재 코드가
이 흐름을 제공한다는 뜻은 아니며, 각 계약은 roadmap의 Task가 구현·검증될 때
`specified`에서 `implemented`로 전환한다.

## 시작하기

필수 조건은 Git, VS Code, Dev Containers 확장, 실행 중인 Docker Desktop이다.
호스트의 Gradle·Node·k6 설치에는 의존하지 않는다.

```bash
# VS Code에서 Reopen in Container 후
make setup
make up
make run
```

다른 터미널에서 전체 검증을 실행한다.

```bash
make check
make observe
make load-smoke
```

주요 명령은 다음과 같다.

| 명령 | 목적 |
| --- | --- |
| `make test` | Docker가 필요 없는 단위 테스트 |
| `make integration` | Testcontainers·WireMock 통합/계약 테스트 |
| `make eval` | Eval fixture와 정책 검증 |
| `make edge-check` | Approval Gate·Provider Gateway의 무비밀 자동 검증 |
| `make actionlint` | 고정된 actionlint 이미지로 GitHub Actions workflow 검증 |
| `make check` | 저장소 전체 정적·문서·백엔드 검증 |
| `make naver-live-contract` | 별도 승인 후 Naver Local·Blog 실제 계약을 각 1회 검증 |
| `make llm-live-contract` | 별도 승인 후 Elice 합성 Chat·Embedding 계약을 각 1회 검증 |
| `make workflow-live-probe APPROVED_SHA=<sha>` | 병합 main에서 네 Provider를 분리 호출하는 Split Live |
| `make workflow-live-linked APPROVED_SHA=<sha> SCENARIO=<id>` | 병합 main에서 선택한 실제 Naver→Elice 핵심 시나리오 검증 |
| `make workflow-live-linked-dev APPROVED_SHA=<sha> SCENARIO=<id>` | 검토·push된 전용 검증 브랜치에서 선택한 실제 시나리오 반복 검증 |
| `make down` | 로컬 서비스 종료 |
| `make reset` | 확인 후 로컬 데이터 볼륨 초기화 |

기본 포트는 앱 8080, PostgreSQL 5432, Redis 6379, Mock Naver 8089,
Mock LLM 8090, Prometheus 9090, Grafana 3001이다.

## 문서와 작업 방식

- [문서 인덱스](docs/README.md): 운영 정본, 문서 종류와 탐색 경로
- [서비스 완성 roadmap](docs/roadmap.md): PP-001~PP-040 Task DAG와 완료 기준
- [개발 환경](docs/development-environment.md): 버전·실행·안전 기준
- [아키텍처](docs/architecture.md): 현재 경계와 목표 구조
- [계약](docs/contracts.md): 현재 공개 표면과 향후 계약 상태
- [문서화 표준](docs/standards/documentation.md): Work Record·ADR·장애 기록 기준
- [Naver Local Live Runbook](docs/runbooks/RUN-0001-naver-local-live-and-credential-rotation.md): 실제 계약 검증과 key 교체
- [Elice LLM Local Live Runbook](docs/runbooks/RUN-0002-elice-llm-local-live-and-token-rotation.md): 합성 계약 검증과 token 교체
- [Linked Live Runbook](docs/runbooks/RUN-0004-recommendation-workflow-linked-live.md): 실제 Naver→Elice 독립 invocation 검증과 중단

`documents/`는 최초 기획과 참고 자료를 보존하는 원문 영역이고, 실제 구현과
함께 갱신되는 정본은 `docs/`다. 작업은 `main`에서 분기한 짧은 브랜치에서
진행하고 필수 CI 통과 후 수동 squash merge한다.

## 안전 원칙

- `local`, `test`, `load`와 필수 CI에서는 실제 Naver·LLM API를 호출하지 않는다.
- 실제 Naver 계약 확인은 Git에서 제외한 `.env.live.local`을 읽는 격리 task에서만
  Local·Blog 각 한 번으로 제한한다. 표준 실행과 `make check`는 이 파일을 읽지 않는다.
- 2026-07-14 Naver Local·Blog는 응답 metadata 차이를 합성 회귀로 고친 뒤 각각 한 번의
  실제 2xx·schema canary를 통과했다. 이는 결과 저장·LLM 전달 약관 승인이 아니다.
- Elice 개별 확인은 별도 격리 task의 합성 Chat·Embedding으로 수행한다. PP-040은
  저장소 소유자의 양쪽 Provider 승인 진술과 field allowlist 아래 실제 Naver 근거를
  연결하는 닫힌 합성 입력의 로컬 예외다. 각 invocation은 일회성 자격·독립 호출 예산으로
  격리되며 검토 campaign 안에서 반복할 수 있다. 승인 원문은 독립 검토하지 않았으며 제품
  runtime·실제 사용자 데이터·배포 허용이나 법률 준수를 뜻하지 않는다.
- 2026-07-14 Elice Chat·Embedding은 transport와 model metadata 호환 경계를 보강한 뒤
  각각 한 번의 실제 2xx 계약 검증을 통과했다. Chat은 MVP provider capability가
  확인됐지만 제품 runtime 연결과 Elice 데이터 정책 승인은 별도 Task다.
- 직접 OpenAI Responses API는 Elice 실패 시 자동 fallback하지 않는 재검토 대안이다.
- 배포 Live의 원본 provider key는 외부 Provider Gateway만 보유한다. 공유 Fork,
  GitHub Actions, Vercel과 Render에는 원본 key를 두지 않는다.
- Mock 자동 검증, Naver·Elice 개별 Local Live, Split Live, Linked Live, 제품 runtime과
  클라우드 배포를 서로 다른 상태로 기록한다.
- 대화에 노출된 기존 Naver key는 재사용하지 않고 교체를 사람이 확인한다.
- 실제 사용자·제품 runtime에서 Local·Blog 결합·영구 저장·LLM 전달은 별도 약관·보안·
  개인정보 승인 전 활성화하지 않는다.
- 비밀값, `.env`, 개인 정보, 전체 프롬프트나 비공개 추론 과정은 커밋하지 않는다.
- API·이벤트·DB·프롬프트 계약 변경은 구현과 같은 PR에서 문서화한다.
- 원격 branch protection과 실제 외부 연동은 별도 승인 없이는 변경하지 않는다.

향후 무료 포트폴리오 demo의 목표는 Vercel Hobby 프런트, Render Free Singapore의
Java `all` 역할, Neon Free와 Upstash Free다. 현재 cloud resource나 실제 서비스는
배포되지 않았으며 Render sleep·cold start와 무료 한도 때문에 production 또는 상시
가용 환경으로 표현하지 않는다. 세부 경계는
[ADR-0009](docs/adr/ADR-0009-mock-local-live-gateway-boundary.md)와
[ADR-0010](docs/adr/ADR-0010-free-demo-deployment-boundary.md)을 따른다.
