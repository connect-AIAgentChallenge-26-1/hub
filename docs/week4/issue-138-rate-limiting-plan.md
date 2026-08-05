# 오늘 할 일 — 공개 API rate limiting 추가 (이슈 #138)

> 작성일: 2026-08-05 (수) · 대상 이슈: [#138 공개 API(/api/match, /api/subsidies)에 rate limiting 부재](https://github.com/syd348/hub/issues/138)

## 오늘의 목표 (한 줄)

`express-rate-limit`을 도입해 `/api/subsidies`, `/api/match`에 IP 기준 요청 빈도 제한을 걸고, 초과 시 기존 에러 응답 컨벤션(`{ error: string }` + 상태 코드)을 따르게 한다.

## 현재 상태 (전환 전)

- `server/src/app.ts`: `helmet()`, `cors()`만 적용돼 있고 rate limiting 미들웨어 없음.
- `server/src/routes/subsidies.ts`: `GET /`(목록), `GET /:id`(단건) — 인증 없는 공개 GET.
- `server/src/routes/match.ts`: `POST /`(매칭) — 인증 없는 공개 POST, 호출마다 `match_requests`
  테이블에 insert.
- 클라이언트 확인 결과 `POST /api/match`는 온보딩 완료 시 1회만 호출되는 게 아니라, 결과 화면에서
  **정렬 변경·페이지네이션("더보기")마다도 호출**된다(`src/hooks/useSubsidies.ts`의
  `useInfiniteQuery` → `submitProfile`). 이슈 본문의 "1회성 호출" 전제와 실제 코드가 다르므로
  분당 제한값 판단 시 이를 반영한다 (아래 "리스크 / 결정 필요" 참고).
- 에러 응답 컨벤션: 모든 라우트가 `{ error: string }` + 4xx/5xx로 통일돼 있음
  (`subsidies.ts`의 404/500, `match.ts`의 400/500 확인).
- 기존 라우트 테스트(`server/src/routes/subsidies.test.ts` 13건, `match.test.ts` 10건)는
  `supertest`로 같은 앱 인스턴스에 반복 요청을 보내므로, 기본 rate limit이 낮으면 429로 깨질 수
  있음.

## 범위

### 포함 (오늘)
- `express-rate-limit`을 `server` workspace 의존성으로 추가.
- `server/src/middleware/rate-limit.ts`(가칭)에 공용 429 핸들러를 만들어 `{ error: string }` 형식
  통일.
- `subsidiesRouter`, `matchRouter`에 각각 다른 제한값 적용 (IP 기준).
- 테스트 환경(`NODE_ENV=test`, vitest가 자동 설정)에서는 제한을 매우 높게 잡아 기존 라우트
  테스트가 429로 깨지지 않게 함.
- 429 응답에 대한 새 테스트 케이스 최소 1개씩(`subsidies`, `match`) 추가.

### 제외 (오늘 아님)
- 사용자별/API 키 기준 제한 (인증 시스템 없음 — 향후 이슈).
- Redis 등 외부 스토어 기반 분산 rate limit (단일 인스턴스 MVP라 인메모리 스토어로 충분).
- `/api/health`에 대한 제한 (헬스체크는 인프라 모니터링용으로 제외).

## 실행 순서

### 묶음 1 — 의존성 추가 + 공용 미들웨어 (15분)
- [ ] `npm install express-rate-limit -w @hub/server`
- [ ] `server/src/middleware/rate-limit.ts` 작성: `express-rate-limit`의 `handler` 옵션으로
      `{ error: string }` + 429 응답 통일, `NODE_ENV === 'test'`일 때 제한을 매우 높게(예:
      10000/분) 설정해 기존 테스트 영향 없게 함.

### 묶음 2 — 라우터에 적용 (10분)
- [ ] `server/src/app.ts`에서 `subsidiesRouter` 앞에 목록/상세 공용 리미터(분당 100) 장착.
- [ ] `matchRouter` 앞에 별도 리미터(분당 30) 장착.

### 묶음 3 — 테스트 (15분)
- [ ] `subsidies.test.ts`, `match.test.ts`에 "제한 초과 시 429 + `{ error }`" 케이스 추가
      (테스트 전용으로 낮은 limit을 만든 별도 앱 인스턴스를 쓰거나, 미들웨어 자체를 직접
      import해서 유닛 테스트).
- [ ] `npm test`, `npm run lint`, `npm run build -w @hub/server` 통과 확인.

## 완료 기준

- [ ] `express-rate-limit` 도입 완료.
- [ ] `/api/subsidies`(목록+상세) 분당 100, `/api/match` 분당 30 — IP 기준.
- [ ] 제한 초과 시 `{ error: string }` + 429.
- [ ] `npm test` 전체 통과 (기존 라우트 테스트 영향 없음).

## 리스크 / 결정 필요

| 항목 | 내용 | 기본 방침 |
|------|------|-----------|
| `/api/match` 제한값 | 이슈 본문은 "1회성 호출"을 전제로 분당 20을 제안했으나, 실제로는 결과 화면의 정렬 변경·페이지네이션마다도 호출됨(`useSubsidies.ts`) | 여유를 두어 분당 30으로 설정 — 정상 사용자가 정렬 3~4번 바꾸고 페이지 여러 번 넘겨도 여유 있게, 스크립트성 남용은 여전히 제한 |
| 테스트에서 rate limit 처리 방식 | 기존 테스트가 반복 호출로 429에 걸릴 수 있음 | `NODE_ENV==='test'`일 때 limiter의 `max`를 매우 크게(10000) 설정 — 미들웨어 자체는 항상 붙어있어 프로덕션 설정 누락을 방지, 실제 429 동작은 별도 유닛 테스트로 검증 |
| 인메모리 스토어의 한계 | 서버 재시작 시 카운터 초기화, 멀티 인스턴스 배포 시 인스턴스별로 따로 카운트 | MVP 단일 인스턴스(Render) 기준으로는 허용 가능한 수준 — 스케일 아웃 시 별도 이슈로 Redis 스토어 검토 |

## 오늘 끝나면 다음 (참고)

- 없음 (이 이슈로 완결).
