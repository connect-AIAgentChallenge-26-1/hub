# NoticePilot

NoticePilot은 대학생이 긴 공지, 과제 지침, 장학금 안내, 공모전 공지, 채용 공고를 실행 가능한 체크리스트와 캘린더 일정 후보로 바꿀 수 있게 돕는 MVP 웹앱입니다.

현재 기준선은 **React + Vite 기반 frontend MVP + Express mock analyze API + Zod schema validation + frontend-server mock wiring + calendar tab/campus preferences 완료 상태**입니다. 실제 AI API는 아직 연결하지 않았고, client-side mock과 server mock 분석으로 사용자 검토/수정/export 흐름을 검증합니다. 수동 텍스트 붙여넣기만으로도 사용할 수 있으며, 서버 mock 분석은 Express 서버를 함께 실행했을 때 사용할 수 있습니다.

## 제품 스냅샷

![NoticePilot landing screen](docs/assets/wiki/noticepilot-story-appendix-v3-5/a00_landing_actual_crop.png)

## 핵심 아이디어

```text
긴 공지 → 구조화된 분석 결과 → 사용자 검토/수정 → 체크리스트 및 캘린더 export
```

![NoticePilot overview map](docs/assets/wiki/noticepilot-story-appendix-v3-5/noticepilot_story_00_overview_v3_5.png)

NoticePilot은 단순 요약 앱이 아니라 공지에서 다음 정보를 추출하는 것을 목표로 합니다.

- 마감일
- 해야 할 일
- 필수 제출물
- 지원 조건
- 주의사항
- 캘린더 일정 후보
- 각 항목의 원문 근거

## 현재 구현 범위

- React + Vite 프로젝트 구성
- Express analyze API skeleton
- Zod 기반 server schema validation
- `GET /api/health`
- `POST /api/analyze` mock mode
- English / 한국어 UI 전환
- 프로젝트 소개 섹션
- workspace hash tabs: `#analyze`, `#calendar`
- 공지 제목 및 본문 입력 UI
- 샘플 공지 분석 버튼
- 서버 mock 분석 버튼
- mock 분석 dashboard
- 공지 캘린더 탭
- 관심 캠퍼스 설정 카드
- 구독형 ICS 준비 중 상태 카드
- 항목 수정 / 삭제
- 할 일 완료 체크
- 캘린더 일정 선택 토글
- 원문 근거 패널
- Markdown 체크리스트 다운로드
- 선택한 캘린더 일정의 실제 `.ics` 다운로드
- TXT / MD 파일 업로드 및 추출 텍스트 확인
- 공지 유형 / 게시일 메타데이터 입력
- 분석 경고, 에러 메시지, 덮어쓰기 확인 모달
- privacy-like pattern 감지 및 확인 모달
- server unavailable / invalid response 오류 표시
- localStorage 기반 단일 분석 세션 복원
- 별도 localStorage 기반 캠퍼스 선호 설정 저장: `noticepilot:campus-preferences:v1`
- 분석 요청/결과 metadata에 inert `userPreferencesSnapshot` 포함
- Vite `/api` dev proxy를 통한 frontend ↔ server mock wiring

## 기술 스택

- Frontend: React + Vite
- Backend: Express
- Schema validation: Zod
- State: React `useState`
- Persistence: browser `localStorage`
- Export: client-side Markdown and `.ics` generation

## 아직 구현하지 않은 범위

- 실제 AI API 호출
- AI prompt / schema hardening의 runtime 적용
- PDF / HWP / HWPX / OCR 파싱
- 고급 상대 날짜 해석
- 학교별 공지 parsing
- checkbox 기반 batch `.ics` export
- subscription calendar feed URL / backend feed generation
- 여러 공지 프로젝트 저장
- 로그인 / DB / Google Calendar API 연동

## 실행 방법

프론트엔드 MVP와 client-side mock 분석만 확인할 때:

```bash
cd /Users/chan/Documents/070626_naver
npm install
npm run dev
```

개발 서버 주소는 `npm run dev` 실행 후 터미널에 표시됩니다.

```text
Vite 기본값은 보통 http://localhost:5173/ 입니다.
```

서버 mock 분석까지 확인할 때는 터미널 2개를 사용합니다.

```bash
cd /Users/chan/Documents/070626_naver
npm run dev:server
```

```bash
cd /Users/chan/Documents/070626_naver
npm run dev
```

Express analyze API 기본 주소는 `http://127.0.0.1:3001/`이며, Vite 개발 서버는 `/api` 요청을 이 서버로 proxy합니다.

프로덕션 빌드 확인:

```bash
cd /Users/chan/Documents/070626_naver
npm run build
```

## 데모 흐름

1. 앱을 실행합니다.
2. 상단에서 `English` 또는 `한국어`를 선택합니다.
3. `공지 캘린더` / `Calendar` 탭에서 관심 캠퍼스를 선택할 수 있습니다. 이 설정은 분석 결과를 바꾸지 않는 metadata snapshot으로만 저장됩니다.
4. `단건 공지 분석` / `Single notice analysis` 탭으로 돌아옵니다.
5. `Analyze mock notice` 또는 `샘플 공지 분석` 버튼으로 기존 client-side mock 분석을 실행합니다.
6. Express 서버를 함께 실행한 경우 `Analyze via server mock` 또는 `서버 mock 분석` 버튼으로 server mock 분석을 실행합니다.
7. 분석 결과와 warning을 확인합니다. server mock은 실제 AI 호출 없이 `/api/analyze` mock mode를 검증합니다.
8. 추출된 항목을 수정하거나 삭제합니다.
9. `Evidence` / `근거 보기`로 원문 근거를 확인합니다.
10. 필요하면 전체 근거 검토 모드를 열어 모든 항목의 evidence를 한 번에 확인합니다.
11. Markdown 체크리스트 또는 선택한 캘린더 일정의 `.ics` 파일을 다운로드합니다.

## 프로젝트 문서

상세 아키텍처, 구현 계획, 리뷰 포인트는 GitHub Wiki에서 관리합니다.

- [GitHub Wiki](../../wiki)
- [Architecture Overview](../../wiki/01_Architecture_Overview)
- [Implementation Plan](../../wiki/02_Implementation_Plan)
- [Review Points](../../wiki/03_Review_Points)
- [NoticePilot Story Appendix v3.5](../../wiki/NoticePilot-Story-Appendix-v3.5) — 현재 MVP 흐름과 future scope를 이미지로 정리한 GitHub Wiki 페이지

Phase 4 이후의 AI 연동 계약, 테스트 corpus, batch calendar export 로드맵은 repository 문서로 관리합니다.

- [Current Implementation Summary](docs/project/current-implementation-summary.md)
- [Foundation.25.1 Standalone Release Record](docs/releases/foundation-25.1.md) — 검증된 standalone crawler release 기록이며 root runtime에는 연결되지 않았습니다.
- [Phase 4 Plan](docs/roadmap/phase-4-plan.md)
- [AI Output Schema](docs/ai/ai-output-schema.md)
- [Prompt Contract](docs/ai/prompt-contract.md)
- [Test Corpus Plan](docs/qa/test-corpus-plan.md)
- [Batch Calendar Export Roadmap](docs/roadmap/batch-calendar-export.md)

## 다음 단계

1. **Phase 4-A: Planning / Contract Documentation**
   - 현재 구현 기준선 정리
   - AI raw schema와 app schema mapping 문서화
   - prompt contract 문서화
   - 테스트 corpus 계획 수립
   - batch calendar export 로드맵 정리

2. **Phase 4-B: Test Corpus Scaffold**
   - 공개 URL과 수동 추출 텍스트 중심으로 실제 공지 corpus 구축
   - 필요한 공개 첨부파일만 선별적으로 보관
   - 공지 유형별 expected result 작성

3. **Phase 4-C: Real AI API Integration**
   - Express `mode: "ai"` 구현
   - AI API key는 server-only 환경변수로 관리
   - AI raw response를 server에서 normalize / validate 후 현재 app schema로 변환

4. **Phase 4-D: Corpus-based AI QA**
   - 실제 공지 corpus 기준으로 AI 추출 결과 평가
   - prompt / schema / validation backlog 정리

5. **Phase 4-E: Date Resolution v1**
   - 1차는 absolute date 중심
   - reference date가 명확한 relative date만 제한적으로 처리
   - 장기적으로 server-side date resolver로 확장

6. **Phase 5 이후**
   - PDF / HWP / HWPX / OCR extraction
   - 학교별 공지 parsing
   - checkbox 기반 batch `.ics` export
   - subscription calendar feed
