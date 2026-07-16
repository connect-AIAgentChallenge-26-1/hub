# 개발 환경 정본

## 기준

- Java 17, Spring Boot 3.5.16, Gradle Wrapper 8.14.4
- Node 24는 프런트와 문서 검증에만 사용
- Docker Desktop + Dev Container
- PostgreSQL 16, Redis 7.4
- Windows host에서도 shell과 `gradlew`는 LF를 유지

호스트에 JDK·Gradle을 별도로 설치하지 않고 Dev Container에서 루트 `./gradlew`와
`make` 명령을 사용한다. Java daemon, toolchain, compile release와 test runtime이 17이
아니면 setup·검증을 실패시킨다.

## 실행 명령

| 명령 | 책임 |
| --- | --- |
| `make setup` | 필수 도구, Docker, Java 17과 환경 파일 검사 |
| `make dev` | Mock Provider를 사용하는 로컬 개발 서비스 실행 |
| `make dev-live` | `.env.live.local`의 실제 Provider를 사용하는 명시적 개발 실행 |
| `make test` | Docker 없는 단위 테스트 |
| `make integration` | Testcontainers·Mock HTTP 통합/계약 테스트 |
| `make eval` | schema·근거·금지 주장 Eval |
| `make check` | 단위·통합·Eval·문서·정책·secret 검증 |
| `make live-evidence` | 실제 Provider 경로의 안전한 증거 요약 생성 |
| `make build-images` | Java 17 backend와 frontend 운영 image build |
| `make observe` | Prometheus·Grafana 포함 개발 환경 실행 |
| `make down` | 로컬 서비스 종료 |
| `make reset` | 명시적 확인 뒤 로컬 container·volume 초기화 |

기존 `edge-check`, Provider별 canary, Split/Linked workflow와 `load-smoke` 명령은 PP-041에서
제거한다. Mock 회귀는 `make check`, 실제 호환성은 제품 adapter를 사용하는 명시적 Live
경로에서 검증한다.

## 환경 파일

`.env`는 Mock 개발의 비밀이 아닌 로컬 설정, `.env.live.local`은 실제 Naver·Elice
자격과 endpoint 설정에 사용한다. 둘 다 Git에서 제외하고 기존 파일을 setup이 덮어쓰지
않는다. 예시는 변수 이름과 설명만 제공하며 실제 값을 넣지 않는다.

`make check`, 일반 CI와 `make dev`는 `.env.live.local`을 읽지 않는다. `make dev-live`와
`make live-evidence`만 명시적으로 읽으며 알 수 없는 변수, placeholder, 잘못된 HTTPS
host와 누락 값을 fail-fast한다.

로컬 실제 값은 다음 원칙을 따른다.

- Naver key, Elice token과 전체 routing URL을 shell history·대화·Issue·PR에 출력하지 않는다.
- Provider 응답 원문, 장소명·주소·링크, prompt·completion을 기본 로그·JUnit report에
  남기지 않는다.
- 노출이 의심되면 즉시 Provider console에서 폐기·교체하고 사용량과 Git history를
  점검한다.

배포에서는 Provider 자격을 Render runtime secret store에만 둔다. GitHub Actions에는
Provider 자격을 넣지 않고 배포에 필요한 최소 scope credential만 둔다. 브라우저 bundle과
Vercel 프런트에는 backend secret을 전달하지 않는다.

## 서비스와 포트

| 서비스 | 기본 포트 |
| --- | ---: |
| Backend | 8080 |
| Frontend 개발 | 3000 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| Prometheus | 9090 |
| Grafana | 3001 |

호스트 포트는 `127.0.0.1`에만 bind하고 Compose service에 고정 `container_name`을 사용하지
않는다. 현재 backend에는 Actuator와 정식 `/api/v1/**`가 구현돼 있다. 개발 전용
`/__dev/api/**`는 `live-dev` profile에서만 등록하고 production에는 노출하지 않는다.

## 검증 경계

- 단위 테스트는 Docker와 외부 네트워크 없이 통과한다.
- 통합 테스트는 Testcontainers와 Mock endpoint만 사용한다.
- `make check` 중 실제 외부 DNS·HTTP가 발생하면 실패한다.
- 실제 값이 보이는 수동 확인은 PP-042 Live Playground에서 별도로 검증한다.
- 실제 Provider를 쓰는 정식 API 로컬 smoke는 RUN-0005의 명시적 수동 절차로만 실행한다.
- 운영 image builder JDK와 runtime JRE도 Java 17로 고정한다.

VS Code 확장, Codex 설정과 추가 MCP는 개발자가 선택할 수 있지만 저장소 필수 실행
경로에는 포함하지 않는다. 저장소 Stop hook으로 매 작업마다 검증을 강제하지 않으며,
완료 전에 변경 범위에 맞는 명령을 사람이 선택해 실행한다.
