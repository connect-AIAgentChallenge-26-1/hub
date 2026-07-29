# ShowUp 통합 QA 버그 목록

> 최종 갱신: 2026-07-28. 상태는 로컬 코드와 읽기 전용 프로덕션 조회 기준이다.

## P0 — 제출 전 필수

| # | 항목 | 상태 | 조치 |
|---|------|------|------|
| 1 | 수정 코드 프로덕션 미배포 | 미완료 | Hosting·Firestore Rules·Storage Rules 배포 후 핵심 플로우 재확인 |
| 2 | 데모 영상·`demoVideoUrl` | ✅ 완료 | 4분 41초 영상 녹화·Google Drive 업로드·showcase.json 갱신 완료 |
| 3 | 최종 push·PR | 미완료 | 7/29 밤 10시 전 제출 |

## P1 — 이번 감사에서 수정

| # | 문제 | 수정 |
|---|------|------|
| 4 | 고객 검색 배너가 서로 다른 고객의 noShow/incident 값을 혼합 | 한 명의 alert 고객 데이터만 사용 |
| 5 | 예약 생성 화면에 위험 고객 경고 없음 | 선택 고객 `RiskAlertBanner` 추가 |
| 6 | 신규 고객 중복 판정이 전화번호 뒤 4자리만 확인 | 전체 정규화 전화번호 정확 일치 조회로 변경 |
| 7 | 고객 상세가 과거/미래 예약을 임의 상태 변경 | 오늘 활성 예약만 버튼 노출 |
| 8 | 사건 타임라인 key 충돌·UTC 날짜 하루 밀림 | Firestore 문서 ID + 로컬 날짜 변환 |
| 9 | 노쇼 최신성이 예약 생성일 기준, 미래 시각에도 +5 | `statusChangedAt` 우선 + 미래 제외 테스트 |
| 10 | 고객 삭제 시 예약·사건 orphan | 500개 단위 batch cascade 삭제 |
| 11 | Functions 이관 코드가 고객 변경·삭제 race 미처리 | 이전/새 고객 재계산 + 없는 고객 skip |
| 12 | Storage Rules 문법 손상·인증 사용자 read 허용 | 정상 문법으로 교체, MVP 전체 deny |
| 13 | Rules가 ownerUid 변경·임의 필드·불완전 riskStats 허용 | 허용 키·필수 필드·형식·불변 필드 검증 강화 |
| 14 | 보안 테스트 `.mjs`가 git ignore되어 clone 재현 불가 | `smoke-test.mjs`만 추적 예외, 18개 회귀 테스트 작성 |
| 15 | `/privacy`·`/terms`가 placeholder | MVP 운영 초안과 법률 검토 경고로 교체 |
| 16 | Firebase 10 취약점·workspace React 타입 충돌 | Firebase 12.16.0·React 19.2.7로 정합화, Firebase production 취약점 제거 |
| 17 | 수동 청크가 미사용 TanStack Query를 참조하고 Firestore를 공개 화면에 preload | stale 참조 제거, Auth/Firestore 청크와 초기화 분리 |
| 18 | 예약 완료 후 날짜·시간·상태 메타데이터 변조 가능 | Rules에서 완료 예약은 메모만 수정 허용, 전환 이력 필드 불변 검증 추가 |
| 19 | 고객 삭제 중 남은 예약이 전체 목록에 섞일 수 있음 | Rules direct get 차단 + 전체 예약 목록은 기존 고객 ID 집합으로 필터링 |

## P2 — 알려진 제한

| 항목 | 현재 상태 | 다음 조치 |
|------|----------|----------|
| Cloud Functions | Firebase CLI 조회 결과 0개 | Blaze 전환 후 trigger 배포·Rules 차단 |
| riskStats 무결성 | owner 클라이언트가 자기 가게 캐시 갱신 가능 | Blaze 전환 후 서버 trigger 전환 |
| 계정 탈퇴 | 전체 데이터 cascade UI 없음 | Phase 2 구현 |
| 데모 계정 | 공개 비밀번호, 데이터 변경 가능 | 제출 후 비활성화/초기화 |
| 법적 문안 | MVP 운영 초안 | 상용화 전 전문가 검토·사업자 정보 보완 |
| Lighthouse | 최신 실측 없음 | 배포 후 실제 URL로 측정 |
| React Router advisory | RSC 모드 CSRF high 2건; 현재 SPA는 RSC·Action 미사용 | 패치 버전 공개 시 즉시 업그레이드 |
