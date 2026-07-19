# NoticePilot

NoticePilot은 대학생이 긴 공지, 과제 지침, 장학금 안내, 공모전 공지, 채용 공고를 실행 가능한 체크리스트와 캘린더 일정 후보로 바꿀 수 있게 돕는 MVP 웹앱입니다.

현재 기준선은 **React + Vite 기반 frontend MVP + Express mock analyze API + Zod schema validation + frontend-server mock wiring + calendar tab/campus preferences + Foundation.25.1 기반 S-Lite 영속 단일 feed 발급 완료 상태**입니다. 실제 AI API와 운영용 공지 수집 파이프라인은 아직 연결하지 않았습니다. S-Lite는 로그인 없는 단일 관리자용 작은 서버 경계로, SQLite에 capability token hash만 저장해 서버 재시작 뒤에도 기존 ICS 링크를 유지합니다.

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
- 로컬 reference 구독형 ICS 생성·복사 상태 카드
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
- 환경변수로만 활성화되는 Foundation.25.1 reference feed API와 Python bridge
- capability URL 기반 `GET` / `HEAD` ICS delivery 및 조건부 `304`

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
- 계정 소유의 사용자별 subscription feed와 다중 사용자 저장소
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

복원된 Foundation.25.1의 고정 reference calendar를 로컬에서 검증할 때만 서버를 다음처럼 실행합니다. 이 모드는 로그인·DB·사용자별 캠퍼스 필터가 없는 비운영 검증 경계이며, 생성된 capability URL은 서버 재시작 시 만료됩니다.

```bash
NOTICEPILOT_ENABLE_REFERENCE_FEED=true npm run dev:server
```

Reference mode는 숫자형 loopback host에서만 시작됩니다. `HOST=0.0.0.0`,
`HOST=::`, `HOST=localhost` 또는 LAN 주소와 함께 활성화하면 서버가 시작
전에 실패합니다. 기본값 `127.0.0.1`을 그대로 사용하는 것을 권장합니다.

한 명의 운영자가 재시작 후에도 유지되는 ICS 링크 하나를 발급하려면
S-Lite mode를 사용합니다. 아래 세 환경변수는 모두 필수이며 reference mode와
동시에 활성화할 수 없습니다.

```bash
export NOTICEPILOT_ENABLE_SLITE_FEED=true
export NOTICEPILOT_SLITE_ADMIN_KEY="$(openssl rand -hex 32)"
export NOTICEPILOT_SLITE_DB_PATH='/absolute/private/path/slite.sqlite3'
npm run dev:server
```

첫 링크 발급:

```bash
curl -X POST http://127.0.0.1:3001/api/subscription-feeds/slite \
  -H "Authorization: Bearer $NOTICEPILOT_SLITE_ADMIN_KEY" \
  -H 'Content-Type: application/json' \
  --data '{}'
```

응답의 `subscriptionPath`는 raw capability token을 포함해 한 번만 표시됩니다.
실제 구독 주소는 공개 HTTPS origin과 이 path를 결합해 캘린더 앱에 등록합니다.
상태 조회로 원래 URL을 복구할 수 없으며, 분실 시
`POST /api/subscription-feeds/slite/rotate`로 명시적으로 회전해야 합니다.
`DELETE /api/subscription-feeds/slite`는 feed를 폐기하고, 폐기 후 rotate는 같은
feed ID로 새 링크를 명시적으로 활성화합니다.

현재 S-Lite는 단일 프로세스·단일 replica 전용입니다. 안정적인 DB volume과
backup/restore도 필수입니다. 상세 계약은
[S-Lite Durable Feed](docs/architecture/slite-durable-feed.md)를 참고하세요.

단일 Linux host용 HTTPS 배포 kit도 포함되어 있습니다. Node는
`127.0.0.1:3001`에서만 시작하고 Caddy는 정확한
`GET/HEAD /calendar/:token.ics`만 외부로 전달합니다. `/api` 전체는 public
hostname에서 고정 `404`이며 capability URL access log도 활성화하지 않습니다.
공인 도메인보다 먼저 같은 네트워크에서 검증하려면 별도의
[S-Lite LAN HTTPS Validation with Caddy](docs/deployment/slite-lan-https-caddy.md)를
사용합니다. 이 프로필은 고정 private IPv4와 8443 포트, Caddy 내부 CA를
사용하며 허용된 LAN CIDR의 calendar read 요청만 전달합니다. 다른 기기에는
Caddy root 인증서를 명시적으로 신뢰시켜야 합니다.

실제 DNS/host에 적용하는 공개 배포 절차는
[S-Lite HTTPS Deployment with Caddy](docs/deployment/slite-https-caddy.md)를
따릅니다. 이 kit가 실제 host, DNS, firewall, backup 또는 calendar-client
검증을 대신하지는 않습니다.

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
- [Foundation.25.1 Standalone Release Record](docs/releases/foundation-25.1.md) — 검증된 standalone crawler package가 `packages/noticepilot-knu-crawler`에 복원됐고 로컬 reference feed 경계까지 연결됐으며, 운영용 수집·배포는 아직 수행되지 않았습니다.
- [Current Product Roadmap](docs/roadmap/current-product-roadmap.md) — 먼저 S-Lite 단일 영속 feed를 검증하고, 자동 수집·계정 feed와 AI assistant 확장을 별도 gate로 둡니다.
- [Phase 4 Plan](docs/roadmap/phase-4-plan.md)
- [AI Output Schema](docs/ai/ai-output-schema.md)
- [Prompt Contract](docs/ai/prompt-contract.md)
- [Test Corpus Plan](docs/qa/test-corpus-plan.md)
- [Batch Calendar Export Roadmap](docs/roadmap/batch-calendar-export.md)

## 다음 단계

1. **P0: Product truth and quality foundation**
   - repository/Wiki authority를 검토 가능한 one-way 경계로 정리
   - 구축된 실제 공개 공지 10건 baseline의 구조·근거·분포를 결정적으로 검증
   - master roadmap, protected CI, upstream workflow guardrail 유지

2. **S-Lite: durable single-feed release boundary**
   - LAN Caddy profile로 같은 네트워크의 실제 calendar client lifecycle 검증
   - 검증 후 public Caddy/systemd kit를 실제 DNS·Linux host에 적용
   - SQLite volume backup/restore와 장애 시 fail-closed 동작 검증
   - 실제 calendar client에서 링크 등록·재시작·회전·폐기 lifecycle QA

3. **Route M: Manual / AI assistant — postponed independent route**
   - corpus structure와 expected truth를 검증하는 평가 기반 마련
   - 수동 텍스트만 받는 작은 server-side AI vertical slice 구현
   - corpus 기반으로 accuracy, evidence, correction, latency, failure를 평가

4. **Controlled Route M expansion**
   - QA 근거가 확보된 뒤 PDF / HWP / HWPX / OCR extraction을 별도 단계로 검토
   - advanced date resolution과 school-level parsing은 각자의 entry gate 유지
   - checkbox 기반 batch `.ics` export는 단건 품질과 corpus가 충분한 이후 진행

5. **Route S: Automated subscription — separately gated**
   - live ingestion, persistent event runtime, account-owned feed를 순차 결정
   - subscription-management UI와 실제 calendar-client lifecycle QA 수행
   - local reference feed를 production subscription 완료로 간주하지 않음

6. **Shared production gate**
   - 개인정보·보존·삭제, 인증·권한, secrets, abuse prevention 검토
   - monitoring, backup/restore, incident response, rollback, SLO 준비
