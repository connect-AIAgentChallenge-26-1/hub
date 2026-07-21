# Codex 인수인계 — 2026-07-21 신뢰 패널 · 주간 타임테이블 · LLM 간이 MBTI 추정 채팅 착수 · 연구 DB 정리

> 이전 인수인계: [CODEX_HANDOFF_2026-07-20.md](./CODEX_HANDOFF_2026-07-20.md). 이 문서는 그 이후 오늘까지의 변경·검증·남은 착수점을 정리한다.

## 0. 저번 이후 달라진 점 (핵심 차이)

- **Supabase 연동은 이미 운영에서 충족 확인.** 배포 백엔드 헬스체크가 `"backend":"supabase","storedCount":4` 반환 — 실제 Supabase에 영속·재시작 후 잔존. 오늘은 코드 추가가 아니라 이 사실 확인 + 다음 기능 설계·구현에 집중.
- **결과 신뢰 패널(#27)·주간 타임테이블 골격(#29) 구현.**
- **외부 LLM 간이 MBTI 추정 채팅(#25, ADR-008) 1차 구현.** 백엔드 프록시·클라이언트 래퍼·프론트 동의/채팅 UI까지. **라이브 Gemini 호출 검증은 `GEMINI_API_KEY` 주입 후로 대기(§3).**
- **아키텍처 mermaid(#17)·연구 DB 정리 문서 추가.**

## 1. 오늘 만든 커밋 (work 브랜치)

- (이 PR) feat: 신뢰 패널(#27) · 주간 타임테이블 골격(#29) · LLM 간이 MBTI 추정 채팅 1차(#25, ADR-008) · 아키텍처 다이어그램(#17)/DB 정리 문서

세부:
- **#27 신뢰 패널:** 추천 카드에 `basedOn` 근거 지표 칩 노출 + "① 내 응답 신호 → ② 반영된 행동지표 → ③ 추천 공부법" 3단계 패널 + MBTI 한계 고지 강화. `frontend/src/ProjectIntro.jsx`, `styles/app.css`.
- **#29 주간 타임테이블:** `frontend/src/lib/schedule.js`에 `buildWeeklyTimetable` 순수함수(요일×아침/오후/저녁, 학습=월·수·금 분산·회복=저녁, 마감 임박 시 압축) + 필수시간 localStorage 저장(`storage.js`). 알림·캘린더 없음.
- **#25 LLM 채팅:** `backend/src/lib/llm.js`(Gemini 래퍼 — responseSchema JSON 강제, 429/503 유한 모델 폴백, 타임아웃, 실패 시 null) · `POST /api/mbti-chat`(consent 필수·원문 미저장·키 없으면 available:false) · 프론트 `StepMbtiChat`(동의+≈2회 대화) → 추정 MBTI를 기존 `matchMethods`에 주입(`mbtiSource="ai-estimated"`, "간이 추정" 라벨). 의존성 `@google/genai` 추가. 설계 `docs/AI_Pipeline_Design.md`.
- **#17 / DB:** README "아키텍처" 섹션 mermaid(프런트→백엔드→저장소/LLM, 폴백 분기) + `docs/db-notes.md`(테이블·쿼리·RLS 학습).

## 2. 오늘 실제로 검증한 것

- `npm --prefix frontend run lint` / `run build` 통과.
- **#27:** 결과 화면에서 근거 지표 칩 3개 카드 + 3단계 신뢰 패널(4축→행동지표→추천) 렌더 DOM 확인.
- **#29:** 실천 카드 화면에서 주간 타임테이블이 학습 블록을 월·수·금 오후, 회복을 저녁에 배치하는 것 DOM 확인. 필수시간 localStorage 반영.
- **#25:** 백엔드 `POST /api/mbti-chat` — consent 없으면 400, 키 없으면 `available:false` (curl). 프론트 E2E: 동의→2턴 대화→추정 요청(`POST /api/mbti-chat → 200`, CORS preflight 204)→키 없어 규칙 설문으로 무중단 폴백 확인.
- 스크린샷 주의: 이 환경 브라우저 페인은 프로그래매틱 스크롤 후 캡처가 blank로 나오는 quirk가 있어, 하단 검증은 DOM 텍스트 추출로 확인함(2026-07-20과 동일).

## 3. 남은 것 / 다음 착수점

- **⚠️ 라이브 Gemini 추정 검증(대기):** `backend/.env`에 `GEMINI_API_KEY`(사용자 발급)를 넣고 `npm --prefix backend run dev` 후, 앱에서 "AI와 대화해 추정" → 실제 4글자 추정이 나오고 `matchMethods`로 연결되는지 확인해야 함. 키 없이는 폴백 경로까지만 검증됨. `MODEL_CHAIN`(`gemini-2.5-flash`→`gemini-2.0-flash`)은 Gemini 공식 문서로 최종 확정/조정.
- **#25 후속:** eval 셋(대화→기대 추정 쌍) 회귀, 비용·지연 로깅·호출 상한, 채팅 성공 시 결과 화면 추정 근거(rationale) 노출 강화.
- **#29 후속:** 정확 시각 배치·요일 커스터마이즈·저장된 계획 편집.
- **#19(보류):** vitest 도입 + `buildDayPlan`/`buildWeeklyTimetable`/`scoring` 단위 테스트 — 사용자 지시로 다음 세션.

## 4. 하드룰 (재확인, 바뀐 것 없음)

- 커밋·PR에 AI 크레딧(Co-Authored-By/Generated with) 미표기. 관련 변경은 한 커밋으로.
- 시크릿 커밋 금지. `GEMINI_API_KEY`·Supabase 키는 backend `.env`에만(사용자 주입), 프론트(`VITE_`) 노출 금지.
- 외부 LLM은 반드시 backend 프록시 경유. 채팅 원문 허용은 동의 사용자·`/api/mbti-chat` 한정, 연구 저장 경로(ADR-001)는 비식별 파생값만 — 분리 유지.
- push·PR 생성 직전 사용자에게 알림.
