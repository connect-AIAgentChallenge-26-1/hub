# 플레이스픽 AI 저장소 지침

## 목적과 정본

이 저장소는 Java 17 기반 플레이스픽 AI 서비스와 검증 하네스를 만든다. 현재 실행
코드는 개발 환경과 백엔드 skeleton 단계이며, 서비스 완성 순서와 계약은
`docs/roadmap.md`와 `docs/contracts.md`를 따른다.

비즈니스 API나 프런트엔드는 계약 상태가 `specified`이고 연결된 `PP-*` Issue와
Work Record가 있을 때만 구현한다. 구현·테스트·계약 문서는 같은 PR에서 갱신한다.

정보가 충돌하면 다음 우선순위를 적용한다.

1. 실행되는 코드·테스트·설정
2. `docs/` 운영 문서와 승인된 ADR
3. 연결된 Issue와 Work Record
4. 참고 원문인 `documents/`

기존 사용자 변경과 미추적 파일은 작업 범위가 아니면 보존한다.

## 고정 기술 기준

- 호스트, Dev Container, Gradle toolchain, 테스트, CI는 Java 17이다.
- Spring Boot 3.5.16, Gradle Wrapper 8.14.4, JUnit 5를 사용한다.
- 루트 Gradle 멀티 프로젝트와 `backend` 모듈을 유지한다.
- 동적 버전과 SNAPSHOT을 추가하지 않는다.
- DB 스키마의 정본은 Flyway이고 Hibernate는 `ddl-auto=validate`를 사용한다.

## 표준 명령

- 환경 점검: `make setup`
- 인프라: `make up`, `make down`
- 실행: `make run`
- 단위: `make test`
- 통합: `make integration`
- Eval: `make eval`
- Edge 신뢰 경계: `make edge-check`
- 전체 검증: `make check`
- 승인된 Naver 실제 계약: `make naver-live-contract`
- 승인된 Elice 합성 계약: `make llm-live-contract`
- 승인된 Split Live: `make workflow-live-probe APPROVED_SHA=<40자리-main-SHA>`
- 승인된 Naver→Elice Linked Live:
  `make workflow-live-linked APPROVED_SHA=<40자리-main-SHA> SCENARIO=<id>`
- 검토·push된 전용 브랜치 반복 Live:
  `make workflow-live-linked-dev APPROVED_SHA=<40자리-브랜치-SHA> SCENARIO=<id>`
- 관측성: `make observe`
- 부하 smoke: `make load-smoke`
- 데이터 초기화: `make reset`

Gradle을 직접 실행할 때도 루트의 `./gradlew`만 사용한다. `check`는 단위,
통합, Eval을 포함하므로 같은 작업을 다시 중복 실행하지 않는다.

## 아키텍처와 안전 불변식

- Controller는 변환과 위임만 하고 비즈니스 규칙은 application 계층에 둔다.
- 도메인은 외부 API DTO, HTTP, 영속성 세부 구현에 의존하지 않는다.
- 외부 호출은 전용 client adapter 뒤에 두고 DB 트랜잭션 안에서 실행하지 않는다.
- 추천 처리는 Job·transactional outbox 저장과 Redis Streams 전달을 거치는 승인된
  비동기 흐름으로 만든다.
- `local`, `test`, `load` 프로필은 `PLACEPICK_EXTERNAL_MODE=mock`이어야 한다.
- 테스트와 부하 도구에서 실제 Naver·LLM endpoint나 API key를 사용하지 않는다.
- 실제 Naver 계약 확인은 검토된 SHA에서 전용 Local Live task만 수행한다. 표준 명령은
  `.env.live.local`을 읽지 않으며 이 파일과 실제 key를 커밋하지 않는다.
- Elice Local Live는 별도 task에서 합성 Chat·Embedding만 호출한다. 공용 환경 파일을
  사용해도 Naver와 Elice 변수는 서로의 하위 프로세스에 전달하지 않는다.
- Elice 개별 Local Live에서는 합성 데이터만 사용하고 Embedding을 추천·검색·중복 제거에
  사용하지 않는다. 직접 OpenAI Responses는 자동 fallback이 아니다.
- PP-040 Linked Live만 저장소 소유자의 양쪽 Provider 승인 진술과 ADR-0013의 field
  allowlist 아래 고정 합성 입력·메모리 처리·로컬 Naver→Elice 전달을 허용한다. 허용된
  `SCENARIO`는 `seoul-cafe-complete-v1`, `seoul-restaurant-nullable-v1`,
  `seoul-cafe-dessert-v1`뿐이다.
  승인 원문은 독립 검토하지 않았으며 제품 runtime·실제 사용자·배포나 법률 준수로
  확장하지 않는다.
- 배포 Live의 원본 provider key는 외부 Provider Gateway만 소유한다. 공유 Fork,
  GitHub Actions와 애플리케이션 배포 플랫폼에 원본 key를 두지 않는다.
- Mock 자동 검증, Naver·Elice 개별 Local Live, Split Live, Linked Live, 제품 runtime과
  클라우드 배포 상태를 별도 증거로 기록한다.
- 표준 `make check`와 CI는 `.env.live.local`을 읽거나 실제 Provider를 호출하지 않는다.
  Live 명령은 깨끗한 병합 `main` 또는 검토·push된 전용 validation branch의 정확한 승인
  SHA에서만 실행한다. 각 invocation은 새 Gateway·port·일회성 local 자격과 독립 호출
  예산을 사용하고 HTTP retry·redirect를 0회로 유지한다. 같은 검증 campaign 안에서
  닫힌 합성 시나리오를 독립 invocation으로 반복하는 것은 허용한다.
- 실제 사용자·제품 runtime의 검색 결과 결합·영구 저장·LLM 전달은 별도 약관·보안·
  개인정보 승인 전 차단한다.
- 비밀값, `.env`, 토큰, 개인정보를 출력하거나 커밋하지 않는다.
- 현재 공개 HTTP 표면은 `/actuator/health`와 `/actuator/prometheus`뿐이다.
- 계약의 `specified`는 구현 완료나 공개를 뜻하지 않는다. 실제 코드와 자동 검증이
  완료돼야 `implemented`로 바꾼다.
- 대화나 로그에 노출된 credential은 재사용하지 않고 provider 콘솔에서 교체한다.

## 문제 해결과 문서 라우팅

작업은 `문제 정의 → 구현 → 단위 → 통합/계약 → Eval → 부하/관측 →
원인 분석·수정 → 문서화` 순서로 닫는다.

- 모든 중요한 작업: `docs/work-records/`의 Work Record
- 장기 영향을 주는 선택: `docs/adr/`의 ADR
- 비직관적이거나 재발 가능한 장애: `docs/troubleshooting/`
- 측정 가능한 가설: `docs/experiments/`
- 반복 가능한 진단·복구 절차: `docs/runbooks/`
- 검증된 결과를 포트폴리오로 정리: `docs/case-studies/`

문서에는 문제, 목적, 판단 기준, 검토 대안, 선택 이유, 검증 증거와 남은
위험을 기록한다. 전체 프롬프트, 숨은 추론 과정, 비밀값은 기록하지 않는다.
AI 사용은 위임 범위, 채택·거절 결과, 사람이 수행한 검증만 남긴다.

## 변경 시 동기화할 계약

- API 변경: `docs/contracts.md`의 API 항목
- 이벤트 변경: `docs/contracts.md`의 이벤트 항목
- LLM 입력·출력·정책 변경: `docs/contracts.md`의 프롬프트 항목과 Eval
- DB 변경: Flyway migration과 아키텍처 문서
- 실행·도구 변경: README와 개발 환경 문서

## 완료 정의

1. 변경 목적과 성공 기준이 연결된 Work Record 또는 Issue에 명확하다.
2. 관련 테스트와 `make check`가 통과한다.
3. 표준 자동 검증의 실제 외부 호출 0건과 모든 경로의 비밀 비노출을 확인한다. 승인된
   Live 작업은 연결 Runbook의 호출 상한·safe summary·cleanup을 별도 증거로 남긴다.
4. 변경된 계약·결정·트러블슈팅과 검증 증거가 함께 갱신된다.
5. 측정하지 않은 수치나 확인하지 않은 성공을 주장하지 않는다.
