# 소스 보관 기록

- 보관 기준일: 2026-07-28
- 시간대: Asia/Seoul
- 프로젝트: 갓생러 플래너
- 권리자 표기: 장우진
- 실행 방식: Node.js 백엔드가 단일 HTML 프론트엔드와 공용 스크립트를 제공

## 원본 기준

- 프론트엔드: `frontend-work/플래너.html`, `frontend-work/planner-core.js`
- 백엔드: `work/server.js`, `work/autonomous-decision-engine.js`, `work/cloud-memory.js`, `work/fcm-push.js`
- 데이터베이스 설계: `supabase/schema.sql`
- 확장 소스: `src/`, `capacitor.config.json`

## 의도적으로 제외한 항목

- 실제 `.env` 및 `work.env`
- OpenAI·OAuth·Supabase·Firebase 비밀값
- `work/data/planner.sqlite`와 WAL/SHM 파일
- 사용자 일정·대화·로그인 세션·업로드 자료
- 로그, `node_modules`, 테스트 산출물, 과거 백업본

각 보관 파일의 SHA-256 값은 `SHA256SUMS.txt`에 기록합니다.

## 2026-07-28 추가 구현 기록

- 연간 진행도·최근 수행 이력·현재 컨디션을 결합하는 365일 연속성 페이스메이커
- 실패 시 기록 초기화 대신 실행 강도를 낮춰 복귀를 유도하는 회복 모드와 연속성 예비력 산출

- 근거 연결형 자율 의사결정 엔진과 일정 충돌 그래프
- 신뢰도·실행 가치·위험도·예상 절약 시간 산출
- 승인형 실행, 일회성 결정 서명, 적용 전 상태 보존 및 원클릭 되돌리기
- 결정별 사용자 피드백 학습과 알림 일일 예산
- SQLite 결정 이력 및 선택적 Supabase 장기 보관 스키마
