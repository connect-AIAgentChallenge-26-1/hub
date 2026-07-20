# NoticePilot

NoticePilot은 대학생이 긴 공지, 과제 지침, 장학금 안내, 공모전 공지, 채용 공고를 실행 가능한 체크리스트와 캘린더 일정 후보로 바꿀 수 있게 돕는 MVP 웹앱입니다.

현재 저장소에는 서로 다른 네 개의 제품·검증 경계가 함께 존재합니다.

1. **Manual MVP** — 사용자가 공지 텍스트를 입력하고 mock 분석 결과를 검토·수정한 뒤 Markdown 또는 one-off `.ics` 파일을 내려받는 웹 UI
2. **Local reference proof** — Foundation.25.1의 고정 601-event snapshot을 in-memory capability URL로 노출하는 로컬 통합 검증 경계
3. **S-Lite durable proof** — 한 명의 신뢰된 운영자가 SQLite-backed capability URL 하나를 발급·조회·회전·폐기하는 영속 단일-feed 경계
4. **Production subscription** — live ingestion, account ownership, dynamic refresh, 운영 인프라를 포함해야 하는 향후 별도 제품 경계

실제 AI provider, 운영용 공지 수집 스케줄, 계정 소유의 다중 사용자 subscription service는 아직 연결하지 않았습니다.

## 제품 스냅샷

![NoticePilot landing screen](docs/assets/wiki/noticepilot-story-appendix-v3-5/a00_landing_actual_crop.png)

## 핵심 아이디어

```text
긴 공지 → 구조화된 분석 결과 → 사용자 검토/수정 → 체크리스트 및 캘린더 export
```

![NoticePilot overview map](docs/assets/wiki/noticepilot-story-appendix-v3-5/noticepilot_story_00_overview_v3_5.png)

> 이 v3.5 개요 이미지는 초기 MVP 시각화입니다. 이후 추가된 local reference feed와 S-Lite durable/HTTPS 상태는 포함하지 않습니다.

NoticePilot은 단순 요약 앱이 아니라 공지에서 다음 정보를 추출하는 것을 목표로 합니다.

- 마감일
- 해야 할 일
- 필수 제출물
- 지원 조건
- 주의사항
- 캘린더 일정 후보
- 각 항목의 원문 근거

## 현재 제품 경계

| 경계 | 현재 상태 | 저장 및 URL 수명 | 사용자 표면 | 명시적 한계 |
| --- | --- | --- | --- | --- |
| Manual MVP | Runtime active | 분석 세션과 캠퍼스 설정을 browser `localStorage`에 저장 | React UI | 실제 AI provider 없음, one-off export만 제공 |
| Local reference proof | Opt-in runtime active | capability는 memory에만 존재하며 서버 재시작 시 URL 만료 | Calendar 탭의 생성·복사 상태 카드 | 고정 601-event snapshot, 계정·DB·회전·폐기 없음 |
| S-Lite durable proof | 단일 관리자·단일 프로세스 경계 구현 완료 | SQLite에 feed 상태와 token hash를 저장하며 재시작 후 기존 URL 유지 | 별도 management UI 없이 administrator API만 제공 | 단일 feed, 고정 snapshot, live ingestion·다중 사용자 없음 |
| Production subscription | 미구현 | account-owned durable store와 dynamic event runtime 필요 | subscription management UI 필요 | 배포·운영·보안·실제 client QA gate 미통과 |

Local reference proof와 S-Lite durable proof는 모두 production subscription 완료를 의미하지 않습니다.

## 현재 구현 범위

### Manual MVP

- React + Vite 프로젝트 구성
- Express analyze API skeleton
- Zod 기반 server schema validation
- `GET /api/health`
- `POST /api/analyze` mock mode
- English / 한국어 UI 전환
- workspace hash tabs: `#analyze`, `#calendar`
- 공지 제목 및 본문 입력 UI
- client-side mock 및 server mock 분석
- 분석 dashboard
- 항목 수정 / 삭제
- 할 일 완료 체크
- 캘린더 일정 선택 토글
- 원문 근거 패널과 전체 근거 검토 모드
- Markdown 체크리스트 다운로드
- 선택한 캘린더 일정의 one-off all-day `.ics` 다운로드
- TXT / MD 파일 업로드 및 추출 텍스트 확인
- 공지 유형 / 게시일 메타데이터 입력
- 분석 경고, 에러 메시지, 덮어쓰기 확인 모달
- privacy-like pattern 감지 및 확인 모달
- server unavailable / invalid response 오류 표시
- `localStorage` 기반 단일 분석 세션 복원
- 별도 `localStorage` 기반 캠퍼스 선호 저장: `noticepilot:campus-preferences:v1`
- 분석 요청/결과 metadata에 inert `userPreferencesSnapshot` 포함
- Vite `/api` dev proxy를 통한 frontend ↔ server mock wiring

### Local reference proof

- 환경변수로만 활성화되는 Foundation.25.1 reference feed API와 Python bridge
- 고정 all-campus student profile의 601-event snapshot
- strict `POST /api/subscription-feeds/reference` provisioning
- in-memory capability URL 기반 `GET` / `HEAD` ICS delivery
- `ETag` 및 conditional `304`
- Calendar 탭의 bilingual create, retry, copy, expiry 상태 카드
- 서버 재시작 시 기존 reference capability URL 만료
- loopback-only startup boundary

### S-Lite durable proof

- opt-in S-Lite durable single-feed mode
- administrator status, create, rotate, revoke API
- SQLite-backed singleton feed identity와 lifecycle state
- raw capability token 대신 SHA-256 token hash와 display fingerprint만 저장
- create 또는 rotate 성공 시 raw `subscriptionPath`를 한 번만 반환
- Node/Python bridge 재시작 후 기존 capability URL 유지
- rotate 시 같은 feed ID를 유지하면서 이전 token 무효화
- revoke 상태의 restart persistence와 explicit rotate 재활성화
- public `GET` / `HEAD /calendar/:opaqueToken.ics`
- `ETag` 및 conditional `304`
- malformed, unknown, old, revoked capability에 동일한 generic `404`
- dependency 또는 storage failure에 fail-closed `503`
- 단일 Linux host용 public Caddy/systemd profile
- 동일 네트워크 검증용 LAN Caddy internal-CA profile

S-Lite에는 frontend management UI, 사용자 계정, 다중 feed, campus/source filter, live crawling, scheduled refresh, multi-process coordination, 실제 host/DNS provisioning, 자동 backup/restore 또는 physical calendar-client 증거가 없습니다.

## 기술 스택

- Frontend: React + Vite
- Backend: Express
- Schema validation: Zod
- State: React `useState`
- Browser persistence: manual-analysis session과 campus preferences용 `localStorage`
- Durable feed persistence: opt-in S-Lite SQLite singleton
- Crawler/feed bridge: Python + restored Foundation.25.1 package
- Export: client-side Markdown 및 one-off `.ics` generation
- HTTPS boundary: Caddy deployment profiles
- Service profile: systemd kit

## 아직 구현하지 않은 범위

- live AI provider integration
- provider prompt의 실제 runtime 적용과 corpus 기반 품질 검증
- PDF / HWP / HWPX / OCR extraction
- 고급 상대 날짜 해석
- root application의 운영용 live ingestion 및 scheduled crawling
- dynamic snapshot refresh와 다학교 production parser orchestration
- checkbox 기반 batch `.ics` export
- 로그인 및 사용자 계정
- 일반 application database
- account-owned multi-user subscription persistence
- multiple subscription profiles와 management UI
- 여러 공지 프로젝트 저장
- production monitoring, rate limiting, automated backup/restore, incident response
- Google Calendar API 연동

`packages/noticepilot-knu-crawler`에는 검증된 Foundation.25.1 강원대 standalone crawler package가 복원되어 있습니다. 위의 미구현 범위는 이 package의 존재를 부정하는 것이 아니라, root application에서 live ingestion·스케줄링·동적 갱신·다학교 운영을 아직 수행하지 않았다는 의미입니다.

## 실행 모드

| 모드 | 활성화 | 저장 | URL 수명 | UI |
| --- | --- | --- | --- | --- |
| 기본 mock | 별도 feed 환경변수 없음 | browser `localStorage` | subscription URL 없음 | Manual MVP UI |
| Local reference | `NOTICEPILOT_ENABLE_REFERENCE_FEED=true` | capability memory only | 서버 재시작 시 만료 | 생성·복사 카드 있음 |
| S-Lite | `NOTICEPILOT_ENABLE_SLITE_FEED=true` + admin key + DB path | SQLite | 서버 재시작 후 유지 | administrator API only |

Reference mode와 S-Lite mode는 동시에 활성화할 수 없습니다.

## 기본 실행

Repository root에서 dependency를 설치합니다.

```bash
npm install
```

프론트엔드 MVP와 client-side mock 분석만 확인할 때:

```bash
npm run dev
```

서버 mock 분석까지 확인할 때는 터미널 2개를 사용합니다.

```bash
npm run dev:server
```

```bash
npm run dev
```

Express analyze API 기본 주소는 `http://127.0.0.1:3001/`이며, Vite 개발 서버는 `/api` 요청을 이 서버로 proxy합니다. Vite 주소는 실행 후 터미널에 표시되며 기본값은 보통 `http://localhost:5173/`입니다.

프로덕션 빌드 확인:

```bash
npm run build
```

## Local reference proof 실행

복원된 Foundation.25.1의 고정 reference calendar를 로컬에서 검증할 때만 다음처럼 서버를 실행합니다.

```bash
NOTICEPILOT_ENABLE_REFERENCE_FEED=true npm run dev:server
```

이 모드는 로그인, database-backed lifetime, 사용자별 campus filter가 없는 비운영 integration proof입니다. 생성된 capability URL은 서버 재시작 시 만료됩니다.

Reference mode는 숫자형 loopback host에서만 시작됩니다. `HOST=0.0.0.0`, `HOST=::`, `HOST=localhost` 또는 LAN 주소와 함께 활성화하면 서버가 시작 전에 실패합니다. 기본값 `127.0.0.1`을 그대로 사용하는 것을 권장합니다.

Reference mode가 활성화된 경우 Calendar 탭에서 고정 reference feed를 생성하고 same-origin capability URL을 복사할 수 있습니다. 이 UI는 S-Lite management UI가 아닙니다.

## S-Lite durable proof 실행

한 명의 신뢰된 운영자가 재시작 후에도 유지되는 ICS 링크 하나를 발급하려면 S-Lite mode를 사용합니다. 아래 세 환경변수는 모두 필수입니다.

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

응답의 `subscriptionPath`는 raw capability token을 포함해 한 번만 표시됩니다. 실제 구독 주소는 검증된 HTTPS origin과 이 path를 결합해 캘린더 앱에 등록합니다.

상태 조회로 원래 URL을 복구할 수 없습니다. URL을 분실하면 `POST /api/subscription-feeds/slite/rotate`로 명시적으로 회전해야 합니다. `DELETE /api/subscription-feeds/slite`는 feed를 폐기하며, 폐기 후 rotate는 같은 feed ID로 새 링크를 명시적으로 활성화합니다.

현재 S-Lite는 단일 Node process, 단일 Python bridge, 단일 replica 전용입니다. 안정적인 DB volume과 backup/restore가 필요합니다. DB를 잃으면 저장된 token hash로 raw URL을 복구할 수 없으므로 기존 링크도 영구적으로 무효화됩니다.

`GET /api/health`는 일반 Express analyze service의 상태를 확인하며 S-Lite SQLite readiness를 증명하지 않습니다. S-Lite dependency 또는 storage 장애는 administrator/public S-Lite 경계에서 `503`으로 처리됩니다.

Capability URL은 bearer credential입니다. URL path를 access log, analytics event, query parameter, cookie, support screenshot 또는 공개 문서에 남기지 마세요.

상세 계약은 [S-Lite Durable Feed](docs/architecture/slite-durable-feed.md)를 참고하세요.

## HTTPS 배포 profile

Repository에는 S-Lite를 위한 두 개의 대안적 Caddy 경계가 있습니다. 둘 다 Node를 `127.0.0.1:3001`에 유지하고 calendar read endpoint만 외부에 노출합니다.

- [S-Lite LAN HTTPS Validation with Caddy](docs/deployment/slite-lan-https-caddy.md) — 고정 private IPv4, port 8443, 허용된 LAN CIDR, Caddy internal CA를 사용하는 same-network 검증 profile
- [S-Lite HTTPS Deployment with Caddy](docs/deployment/slite-https-caddy.md) — 실제 DNS와 단일 Linux host를 전제로 한 public-domain profile

Public hostname에서 `/api` 전체는 고정 non-cacheable `404`이며, capability path access logging은 활성화하지 않습니다. LAN profile을 다른 기기에서 검증하려면 Caddy root 인증서를 그 기기에서 명시적으로 신뢰해야 합니다.

이 deployment kit는 실제 host, DNS, firewall, backup/restore, monitoring 또는 calendar-client 검증을 대신하지 않습니다. LAN과 public Caddy profile은 동시에 실행하는 구성이 아닙니다.

## 데모 흐름

### Manual MVP

1. 앱을 실행합니다.
2. 상단에서 `English` 또는 `한국어`를 선택합니다.
3. `공지 캘린더` / `Calendar` 탭에서 관심 캠퍼스를 선택합니다. 이 설정은 분석 결과를 바꾸지 않는 metadata snapshot으로만 저장됩니다.
4. `단건 공지 분석` / `Single notice analysis` 탭으로 돌아옵니다.
5. `Analyze mock notice` 또는 `샘플 공지 분석`으로 client-side mock 분석을 실행합니다.
6. Express 서버를 함께 실행한 경우 `Analyze via server mock` 또는 `서버 mock 분석`으로 server mock 분석을 실행합니다.
7. 분석 결과와 warning을 확인합니다. Server mock은 실제 AI 호출 없이 `/api/analyze` mock mode를 검증합니다.
8. 추출된 항목을 수정하거나 삭제합니다.
9. `Evidence` / `근거 보기`로 원문 근거를 확인합니다.
10. 필요하면 전체 근거 검토 모드에서 모든 evidence를 확인합니다.
11. Markdown 체크리스트 또는 선택한 캘린더 일정의 one-off `.ics` 파일을 다운로드합니다.

### Local reference proof

Reference mode가 활성화된 경우:

1. Calendar 탭에서 reference feed를 생성합니다.
2. same-origin capability URL을 복사합니다.
3. 이 URL이 고정 601-event snapshot이며 서버 재시작 시 만료되는 integration proof임을 확인합니다.

S-Lite lifecycle은 frontend demo가 아니라 별도의 administrator API와 calendar client로 검증합니다.

## 프로젝트 문서와 권위 상태

현재 구현을 확인할 때는 repository 문서를 우선 사용합니다. 다만 repository-to-Wiki canonical authority와 live Wiki publication은 아직 별도 one-way audit와 승인 절차를 완료하지 않았습니다.

`docs/wiki/*`는 향후 Wiki publication을 위한 repository-side source 문서입니다. Live GitHub Wiki는 publication과 post-publication verification이 끝나기 전까지 최신 repository 상태와 동기화된 권위 문서로 간주하지 않습니다.

### 현재 repository 기준 문서

- [Current Implementation Summary](docs/project/current-implementation-summary.md)
- [Current Product Roadmap](docs/roadmap/current-product-roadmap.md)
- [S-Lite Durable Feed](docs/architecture/slite-durable-feed.md)
- [S-Lite LAN HTTPS Validation](docs/deployment/slite-lan-https-caddy.md)
- [S-Lite Public HTTPS Deployment](docs/deployment/slite-https-caddy.md)
- [Foundation.25.1 Standalone Release Record](docs/releases/foundation-25.1.md)
- [AI Output Schema](docs/ai/ai-output-schema.md)
- [Prompt Contract](docs/ai/prompt-contract.md)
- [Test Corpus Plan](docs/qa/test-corpus-plan.md)
- [Phase 4 Plan](docs/roadmap/phase-4-plan.md)
- [Batch Calendar Export Roadmap](docs/roadmap/batch-calendar-export.md)

### Repository-side Wiki source

- [Architecture Overview](docs/wiki/Architecture-Overview.md)
- [Implementation Plan](docs/wiki/Implementation-Plan.md)
- [Review Points](docs/wiki/Review-Points.md)
- [NoticePilot Story Appendix v3.5](docs/wiki/NoticePilot-Story-Appendix-v3.5.md)

### Live Wiki — publication status pending

- [GitHub Wiki](../../wiki)

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
   - local reference proof와 S-Lite durable proof를 production subscription 완료로 간주하지 않음

6. **Shared production gate**
   - 개인정보·보존·삭제, 인증·권한, secrets, abuse prevention 검토
   - monitoring, backup/restore, incident response, rollback, SLO 준비
