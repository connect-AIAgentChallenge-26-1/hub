# 플레이스픽 AI 저장소 지침

## 정본과 작업 원칙

이 저장소는 Java 17 기반 플레이스픽 AI 서비스를 구현한다. 실행 코드와 테스트가
가장 높은 정본이고, `docs/contracts.md`, 승인된 ADR, GitHub Issue, `documents/` 순으로
참고한다. Task 상태는 GitHub Issue에서만 관리하고 Work Record는 중요한 작업을 실제로
시작할 때만 만든다. 기존 사용자 변경과 미추적 `plans/`, HTML 프로토타입은 범위 밖이면
보존한다.

## 고정 기준

- Java 17, Spring Boot 3.5.16, Gradle Wrapper 8.14.4, JUnit 5를 유지한다.
- Node 24와 lockfile의 exact version을 사용한다.
- DB 스키마의 정본은 Flyway이며 Hibernate는 `ddl-auto=validate`다.
- Controller는 변환·위임만 하고 도메인은 HTTP, 외부 DTO, 영속성 구현에 의존하지 않는다.
- 외부 HTTP 호출은 DB 트랜잭션 밖에서 실행하고 자동 retry는 Worker 한 계층에서만 한다.

## 표준 명령

- 환경: `make setup`
- Mock 개발: `make dev`
- 실제 Provider 개발: `make dev-live`
- 단위·통합·Eval: `make test`, `make integration`, `make eval`
- 전체 검증: `make check`
- 실제 고정 증거: `make live-evidence`
- 운영 빌드: `make build-images`
- 관측·종료·초기화: `make observe`, `make down`, `make reset`

Gradle은 루트 Wrapper만 사용한다. `make check`는 Java 단위·통합·Eval과 프런트·문서
검증을 한 번씩 수행하므로 같은 suite를 중복 실행하지 않는다.

## Provider와 비밀

- `mock`은 로컬 기본값과 모든 CI에 사용하며 실제 외부 호출이 없어야 한다.
- `live-dev`는 Git에서 제외한 `.env.live.local`을 Java가 직접 파싱해 Naver·Elice를
  호출한다. 임의 사용자 입력을 허용하되 비밀과 인증 Header는 화면·로그에 표시하지 않는다.
- `production`의 Naver·Elice 원본 키는 Render 환경 변수에만 둔다. GitHub에는 Vercel과
  Render 배포 자격만 `production` Environment secret으로 저장한다.
- `make live-evidence`는 고정 합성 시나리오의 반복 가능한 직접 검증이며 CI에서 실행하지 않는다.
- Embedding은 제품 추천 경로에서 사용하지 않는다.
- `.env*`, token, cookie, 개인정보와 Provider 원문 payload를 커밋하거나 일반 로그에 남기지 않는다.

## 서비스 불변식

- 사용자 확인이 끝난 조건만 추천 Core에 전달한다.
- 추천 생성은 `202 Accepted + jobId + Location` 계약을 지킨다.
- Job과 transactional outbox는 같은 PostgreSQL 트랜잭션에서 생성한다.
- Redis Streams Worker는 at-least-once를 전제로 event ID로 중복을 무해하게 만든다.
- 점수·순위는 서버가 결정하며 LLM은 주어진 evidence 안에서 설명만 만든다.
- 공개 오류는 RFC 9457 Problem Details를 사용하고 token·내부 payload를 노출하지 않는다.
- 투표의 최종 정합성은 DB unique constraint와 트랜잭션으로 보장한다.

## 문서와 완료

API·이벤트·LLM·DB·실행 계약을 바꾸면 해당 코드와 함께 `docs/` 정본을 갱신한다.
장기 결정은 ADR, 반복 절차는 Runbook, 재현 장애는 Troubleshooting, 검증 성과는 Case
Study에 기록한다. 모든 변경에 별도 Work Record를 강제하지 않는다.

완료는 관련 자동 테스트, `make check`, 비밀 비노출, 계약 동기화가 모두 확인된 상태다.
실제 Provider·클라우드 결과는 직접 실행한 범위만 주장하고, 무료 Render의 sleep·cold
start를 상시 가용성이나 SLA로 표현하지 않는다.
