# 백엔드 지침

- 모든 daemon, toolchain, compile release와 테스트 JVM은 Java 17이다.
- 루트 Gradle Wrapper만 사용하고 동적 버전·SNAPSHOT을 추가하지 않는다.
- Flyway가 스키마 정본이고 Hibernate는 `ddl-auto=validate`다.
- 계층은 `web → application → domain` 방향을 지키며 외부 Provider·JDBC·Redis는 adapter에 둔다.
- 외부 호출은 DB transaction 밖에서 수행하고, HTTP adapter의 자동 retry는 금지한다.
- `mock`은 in-process Provider와 테스트용 WireMock만 사용한다. CI는 실제 DNS·API를 호출하지 않는다.
- `live-dev`와 `production`은 공통 direct adapter를 사용하되 각 환경에서 필요한 credential만 읽는다.
- secret, cookie, 원문 Provider payload와 사용자 개인정보를 로그·예외·테스트 report에 남기지 않는다.
- 점수·순위는 서버가 결정하고 Elice 출력은 같은 후보의 evidence ID만 참조하도록 검증한다.
- Job·Outbox는 한 트랜잭션, Stream 처리는 at-least-once와 처리 ID 멱등성, SSE는 snapshot-first와 재연결을 따른다.
- API 계약 변경에는 단위·통합/계약 테스트와 `docs/contracts.md` 갱신을 포함한다.
- 자동 검증은 `./gradlew check`, 실제 고정 검증은 루트 `make live-evidence`를 사용한다.
