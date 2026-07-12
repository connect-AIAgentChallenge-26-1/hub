# contracts/

이 디렉토리는 [docs/skills.md](../docs/skills.md) "공통 데이터 계약"·"Verdict"·"스키마 버전·migration 정책" 절을 실행 가능한 코드로 미러링한다. 목적은 T01(FastAPI/Pydantic backend)이 생기기 전에도 Envelope·5상태 Verdict 집계·Claim/Fact/Evidence 필드 계약을 실제로 테스트할 수 있게 하는 것이다.

- `envelope.js` — `Envelope<T>` 공통 필드·`status` enum·`reason_code` 규칙 검증
- `verdict.js` — 5상태 Verdict enum과 그룹 `PARTIALLY_SUPPORTED` 집계 규칙
- `schemas.js` — StructuredClaim·FinancialFact·RawSourceRecord·Evidence·NumericEvidence 필드 목록과 Evidence의 `claim_id`/`presentation_item_id` 배타 규칙
- `*.test.js` — 위 계약에 대한 Vitest 기반 contract test (정상·누락·잘못된 enum·배타 위반 케이스 포함)

**진실 소스는 항상 `docs/skills.md`다.** 계약을 바꿀 때는 skills.md를 먼저 수정한 뒤 이 디렉토리의 필드 목록·enum·버전과 테스트를 같은 변경에서 동기화한다.

T01에서 Python/Pydantic backend가 생기면, 이 모듈은 backend가 동일 계약을 구현했는지 비교하는 참조 스펙으로 남거나 backend contract test로 이식된다. 어느 쪽이든 `docs/skills.md`가 계속 단일 진실 소스다.
