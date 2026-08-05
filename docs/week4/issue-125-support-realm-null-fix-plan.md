# 오늘 할 일 — supportRealm 결측 매칭 누락 버그 수정 (이슈 #125)

> 작성일: 2026-08-05 (수) · 대상 이슈: [#125 bizinfo supportRealm 결측 4건이 어떤 조건으로도 매칭 안 되는 버그](https://github.com/syd348/hub/issues/125)

## 오늘의 목표 (한 줄)

**`subsidy.supportRealm`이 빈 문자열(bizinfo API 결측)인 공고가 어떤 사용자 조건으로도
매칭 결과에서 영원히 사라지지 않도록 한다.**

## 현재 상태 (전환 전)

- `server/src/db/subsidies-repo.ts`의 `matchesSupportRealm()`이 하드 필터로 동작 —
  `subsidy.supportRealm`이 빈 문자열이면 `profile.supportRealm.includes('')`가 절대
  true가 될 수 없어 무조건 제외됨
- 실측(2026-07-30, 전체 1,515건) 결과 bizinfo API 자체 결측 4건 확인 — 이슈 #92 도입
  당시 300건 표본에선 결측 0%였던 전제가 전체 데이터에선 안 맞았음
- `matchesRegion()`은 이미 같은 패턴(빈 배열 = "정보 없음" = 필터링 제외)을 쓰고 있음

## 범위

### 포함 (오늘)
- `matchesSupportRealm()`에 `subsidy.supportRealm === ''` 예외 추가 (옵션 A — 대화
  중 이미 결정됨: region과 동일한 원칙 적용)
- 관련 엣지 케이스 테스트 추가

### 제외 (오늘 아님)
- 옵션 B(크롤러 매핑 단계에서 빈 값을 '기타'로 fallback) — 옵션 A로 결정됐으므로 불필요
- 결측 4건 외 향후 유사 사례에 대한 별도 모니터링 — 이번 수정으로 구조적으로 해결되므로
  추가 대응 불필요

## 실행 순서

### 묶음 1 — 필터 수정 + 테스트 (15분 내외)
- [x] `matchesSupportRealm()`에 빈 문자열 예외 추가, 주석 갱신(결측 0% 전제가 더 이상
      유효하지 않음을 반영)
- [x] `subsidies-repo.test.ts`의 "match — supportRealm hard filter (이슈 #92)" 블록에
      엣지 케이스 테스트 추가
- [x] `npm test`/`npm run lint` 통과 확인

## 완료 기준

- [x] `matchesSupportRealm()` 수정
- [x] 기존 4건(및 향후 유사 사례)이 매칭 결과에 노출되는지 테스트로 확인
- [x] `npm test` / `npm run lint` 통과

**이슈 #125 완료 (2026-08-05)**

## 리스크 / 결정 필요

| 항목 | 내용 | 결정 |
|------|------|-----------|
| 옵션 A vs B | region과 동일한 원칙(A) vs 크롤러 매핑에서 fallback(B) | **옵션 A로 결정** (대화 중 확정, 2026-08-04) — 코드베이스 기존 컨벤션과 일관되고 서버 쪽 수정만으로 범위가 작음 |
