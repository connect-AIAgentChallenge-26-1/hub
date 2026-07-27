# 소스 보관 기록

- 보관 기준일: 2026-07-28
- 시간대: Asia/Seoul
- 프로젝트: 갓생러 플래너
- 권리자 표기: 장우진
- 실행 방식: Node.js 백엔드가 단일 HTML 프론트엔드와 공용 스크립트를 제공

## 원본 기준

- 프론트엔드: `frontend-work/플래너.html`, `frontend-work/planner-core.js`
- 백엔드: `work/server.js`, `work/cloud-memory.js`, `work/fcm-push.js`
- 데이터베이스 설계: `supabase/schema.sql`
- 확장 소스: `src/`, `capacitor.config.json`

## 의도적으로 제외한 항목

- 실제 `.env` 및 `work.env`
- OpenAI·OAuth·Supabase·Firebase 비밀값
- `work/data/planner.sqlite`와 WAL/SHM 파일
- 사용자 일정·대화·로그인 세션·업로드 자료
- 로그, `node_modules`, 테스트 산출물, 과거 백업본

각 보관 파일의 SHA-256 값은 `SHA256SUMS.txt`에 기록합니다.

