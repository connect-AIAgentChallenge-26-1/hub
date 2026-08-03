# 현재 프로젝트 상태

> 이 문서의 상단 대시보드가 현재 상태의 기준이다.
>
> - **완료**: 현재 코드에 구현 경로가 존재한다.
> - **검증 완료**: 자동 테스트 또는 기록된 실제 환경 검증 근거가 있다.
> - **백로그**: 필요성과 범위가 확인됐지만 아직 구현 또는 검증이 끝나지 않았다.
> - **미구현 아이디어**: 장기 확장 후보이며 현재 제품 기능으로 설명하지 않는다.
>
> 아래의 **개발 기록**은 1~4주차 의사결정과 시행착오를 보존한 기록이다.
> 과거 기록과 현재 상태가 다르면 이 대시보드를 우선한다.

---

## 1. 현재 상태 대시보드

### 완료

#### 제품 흐름

- [x] Landing(`/landing`) → 할 일 등록(`/register`) → Home(`/home`) → Focus → Completion → History(`/history`) 흐름
- [x] 할 일 제목·유형·시작 예정 시간·마감 D-day·예상 회피 이유 등록
- [x] `waiting | active | done` 상태별 Home 섹션과 TaskCard
- [x] 직접 시작과 Nudge 시작의 Focus 진입 계약 분리
- [x] Focus 타이머, 멈추기, 완료, 세션 저장·복구
- [x] 완료 이벤트 기반 History 리스트·캘린더 뷰·최근 7일 Insight
- [x] Asia/Seoul 기준 날짜 기반 연속 완료일(streak)
- [x] 완료 직후 도움됨/아쉬움 피드백 저장

#### 개입과 첫 행동

- [x] 무응답 횟수 기반 Lv0~Lv4 개입 레벨 계산
- [x] 마감 긴급도와 현재 레벨을 반영한 다음 알림 간격 계산
- [x] Lv1·Lv3 회피 이유 재확인, Lv2 자유 입력, Lv4 강한 개입
- [x] Lv2·Lv3 Gemini 마이크로태스크 생성
- [x] Gemini API 오류·timeout·응답 형식·품질 검사 실패 시 `rule_based` fallback
- [x] Gemini 응답 형식·품질 validator와 내부 실패 단계/규칙 로그
- [x] 완료 기록의 과거 마이크로태스크를 Lv3 참고자료로 사용하는 memory evidence 흐름
- [x] 늦은 비동기 응답과 중복 요청이 확정된 Nudge/Focus 상태를 덮지 않도록 방어

#### 알림과 PWA

- [x] Notification 권한 요청과 PushSubscription 생성·DB 저장·삭제
- [x] 레벨 상승 시 Web Push 브로드캐스트
- [x] 404/410 만료 구독 자동 삭제와 발송 실패 분류 로그
- [x] Service Worker의 Push 수신·알림 클릭·오프라인 폴백
- [x] 알림 권한은 있지만 구독이 없는 브라우저의 재구독 UI
- [x] PWA manifest와 Vercel Deployment Protection용 credential 설정

#### Shared Journey와 화면

- [x] Landing Hero와 서비스 흐름·레벨별 개입 소개
- [x] Home Journey Hero와 Lv0~Lv4 캐릭터·날씨 배경
- [x] Focus 진입 레벨별 Walking 캐릭터와 Journey 배경
- [x] Completion 성공 캐릭터와 보조 sparkles
- [x] Nudge Modal Lv1~Lv4 캐릭터와 레벨별 색상
- [x] Navbar 얼굴 로고, Register 안내 캐릭터, Home/History Summary UI

#### API·데이터

- [x] Task 생성·조회·삭제
- [x] Task event 기록: `activated | notification_sent | level_up | done | stopped`
- [x] 회피 이유 재확인 이력 저장
- [x] 완료 시점 `durationSeconds`, `entryLevel`, `microTask`, `entryMode`, `generationSource`, `memoryEvidence` 스냅샷
- [x] PushSubscription과 Feedback 저장
- [x] Prisma + Supabase(Postgres), Vercel Express serverless 배포 구조

### 검증 완료

#### 자동 테스트

- [x] Vitest 순수 함수 테스트: 레벨·알림 간격·날짜/streak·deadline·통계·마이크로태스크 검증
- [x] React Testing Library 컴포넌트·사용자 상호작용 회귀 테스트
- [x] Supertest 서버 라우트 테스트와 테스트 DB 가드
- [x] Service Worker 알림 클릭 동작의 jsdom mock 테스트
- [x] Playwright 설치와 `npm run test:e2e` 스크립트
- [x] Playwright 스모크: Landing 렌더링
- [x] Playwright 핵심 흐름: 할 일 생성 → Home → Focus 완료 → History
- [x] Playwright 등록 검증: 제목 빈 값, D-day 빈 값에서 API 요청 차단

#### 실제 환경에서 확인한 항목

- [x] Vercel Production 배포와 SPA 새로고침 라우팅
- [x] Lv1~Lv4 Nudge, Focus, Completion 흐름의 Production 수동 검증
- [x] Desktop Chrome·Edge Web Push 수신
- [x] iPhone 홈 화면에 추가한 PWA의 Web Push 수신
- [x] Preview의 demo 간격과 Production의 실제 간격 분리
- [x] 1440/1024/768/390/360px 중심의 주요 화면 반응형 검토 기록

### 백로그

#### 높은 우선순위

- [ ] 서버 스케줄러가 `nextNudgeAt` 계산과 저장의 단일 책임자가 되도록 전환
- [ ] Task별 `nextNudgeAt` 영속화와 새로고침·탭 종료 후 예약 복구
- [ ] 외부 Cron 기반 알림 처리와 Task별 중복 이벤트·Push 방지
- [ ] Focus 중 전체 Task 일시중지 상태의 서버 저장과 종료 후 재예약
- [ ] `stopped` 이벤트 서버 멱등성 보강
- [ ] `POST /api/tasks` 서버 검증을 다른 API의 `invalid_*` 응답 규칙과 통일
- [ ] Task eventType 서버 allowlist 적용
- [ ] Home·History 초기 조회 실패 시 오류 UI와 재시도 제공

#### 추가 자동화·실기기 검증

- [ ] Playwright: 등록 폼 새로고침 동작
- [ ] Playwright: Focus 세션 새로고침 복구
- [ ] Playwright: API 실패 시 오류 UI와 재시도
- [ ] Android Chrome 실기기 Web Push 수신
- [ ] 실제 Android 브라우저의 알림 클릭 후 기존 탭 포커스·새 탭 이동
- [ ] Preview/Production 배포별 E2E 또는 smoke 검증 자동화
- [ ] 간헐적인 서버 DB 통합 테스트 지연 원인 조사

#### 제품·데이터 보강

- [ ] 저장된 피드백을 다음 개입 속도와 전략에 반영
- [ ] 완료 시점 skipCount 스냅샷 저장과 History 표시
- [ ] 여러 날에 걸친 완료 기록 기반 Nudge 고도화
- [ ] Lv4 도달 뒤 불필요한 다음 알림 예약·카운트다운 중단
- [ ] 다중 사용자 도입 시 사용자별 Push 구독 소유권과 기기 관리

### 미구현 아이디어

- [ ] 사용자가 선택하지 않아도 회피 이유를 자동 추론
- [ ] 피드백과 장기 행동 기록을 이용한 개입 톤·강도 자동 개인화
- [ ] 정식 Pomodoro와 휴식/재개 기능
- [ ] Google Calendar 등 외부 캘린더 연동
- [ ] 시간대별 새벽·오전·오후·밤 Journey 테마
- [ ] Walking 프레임 애니메이션과 목적지 도착 연출
- [ ] 스카프·배지 등 캐릭터 장식 커스터마이징
- [ ] 사용자 환경(장소·시간·음악 등)을 이용한 성공 요인 학습
- [ ] 소셜·경쟁 기능과 다중 사용자 계정
- [ ] 주간 리포트 확장과 스트릭 기반 보상·배지
- [ ] 사이트 미접속 사용자를 위한 서버 스케줄러 기반 재개 알림

---

# 2. 개발 기록

> 아래 내용은 당시의 계획과 판단을 보존한다. 이후 정책 변경으로 현재 구현과
> 다를 수 있으며, 미완료 항목의 현재 분류는 위 대시보드에서 관리한다.

## 1주차 — 기반 세팅 + 할 일 등록

### 기획 & 설계

- [x] [P0] plan.md의 화면 흐름(User Flow / System Flow)을 실제 화면 단위 와이어프레임으로 정리 → `docs/wireframe.md`
- [x] [P0] 1주차 안에 보여줄 "프로토타입" 범위 확정 (등록~홈 화면까지만 vs 포커스 화면까지 포함할지) → 등록~홈 화면까지로 확정, 포커스 화면은 2주차
- [x] [P1] 기획 보조용 AI Agent 활용 계획 정리 (와이어프레임/문구 초안 등 어떤 작업을 AI에게 맡길지)

### 구현

- [x] [P0] 프로젝트 초기화 (Next.js/Vite 등) + repo 구조 세팅
- [x] [P0] PWA manifest.json 작성 (아이콘, 이름, start_url)
- [x] [P0] 서비스워커 등록 (기본 캐싱만, 푸시는 3주차에)
- [x] [P0] DB 스키마 설계: `tasks`(할일: 제목/유형/마감 D-day/시작예정시각/회피이유/상태/skipCount/level)
  - `subjects`(과목) 테이블은 두지 않는다 — plan.md 문제 정의에 근거 없음
- [x] [P0] DB 스키마 설계: `avoidance_reasons`(할일별 예상 회피 이유 저장, 자유입력 포함)
- [x] [P0] DB 스키마 설계: `checkins` 대신 `task_events`(할일ID, 이벤트 종류: 알림발송/레벨상승/완료/멈추기, 발생시각) — 날짜 단위 습관 기록이 아니라 할일별 이벤트 로그로 설계
- [x] [P0] 할 일 등록 화면: 제목, 유형 9종, 시작 예정 시각, 마감 D-day, 예상 회피 이유 입력
- [x] [P0] 등록한 할일/회피이유를 DB에 저장
- [x] [P0] 등록 완료 후 홈 화면으로 이동하는 라우팅
- [x] [P0] 시작 예정 시각이 지나기 전엔 "대기중" 상태로 표시, 알림 발송하지 않음 (#5/#14로 충족)

## 2주차 — 무응답 감지 & 레벨 시스템

- [x] [P0] 홈 화면: 등록된 할 일 목록 표시, 진행 중/완료 구분, Lv 배지와 레벨별 얼굴 아이콘 적용
- [x] [P0] 포커스 화면: "완료" / "멈추기" 선택 UI (이진 체크인 토글이 아니라 포커스 화면에서의 종료 방식으로 설계) (#10로 완료)
- [x] [P0] 완료/멈추기 결과를 DB에 저장 (`task_events`에 기록, 완료 시에만 `status: done`) (#12로 완료)
- [x] [P0] 홈 카드 클릭 → FocusMode 연결 (#18로 완료)
- [x] [P0] 레벨 계산 함수 (`lib/scoring.ts` 초안: 무응답 횟수(skipCount) 기준 Lv0~4 계산, 세션 기반) (#8로 완료)
- [x] [P0] "완료" 시에만 skipCount/level 리셋, "멈추기"는 레벨만 하향 (#13로 완료)
      ⚠️ 스트릭 정의는 이후 여러 번 바뀜 — 최신 상태는 4주차 로그 참고
- [x] [P0] 무응답 시 자동으로 skipCount 증가 + 레벨 상승 로직 연결, 레벨이 실제로 오른 순간 사용자가 누르지 않아도 알림이 먼저 뜨도록 처리 (#14로 완료)
- [x] [P1] 프론트 typecheck 세팅 — 루트 tsconfig.json + npm run typecheck 스크립트 추가(CLAUDE.md에 규칙만 있고 실제 세팅이 안 되어 있던 걸 발견) (이슈 없이 완료됨)
- [x] [P0] 할일 삭제 기능 — TaskCard에 삭제 버튼, 확인창(confirm) 후 DELETE API 호출로 실제 삭제. 프로토타입에 이미 구현/검증됨 (#17로 완료)
- [x] Landing 페이지 최종 구현 및 반응형 개선
  - Hero 브랜드와 제목 정리
  - 실제 사용 흐름 5단계 세로 타임라인 적용
  - Lv1~Lv4 개입 카드 2×2 구성
  - Shared Journey를 Focus Mode와 연결해 설명
  - Lv0~Lv4 배경 5단계 표시
  - Hero 캐릭터를 배경 속 길 위에 배치
  - 1440/1024/768/390/360px 검증

## 3주차 — 마이크로태스크 + 회피 이유 맞춤 개입

### 회피 이유 확인

- [x] [P0] 미룸 감지 시 "회피 이유 확인/수정" UI — Lv1·Lv3 시점에 봇이 먼저 자동으로 물어봄 (사용자가 임의로 누르는 상시 버튼 아님), 할일당 최대 2번 제한 (#21로 완료)
- [x] [P0] 수정된 회피 이유를 DB에 갱신 (#22로 완료)

### 마이크로태스크 생성 (핵심 기능 ①)

- [x] [P0] 할일 유형(9종) × 회피 이유(3종+기타) 조합 마이크로태스크 템플릿 정의 (#19로 완료)
- [x] [P0] 템플릿 기반 마이크로태스크 생성 함수 (`lib/microtask.ts`) (#20로 완료)
- [x] [P1] Gemini API 연동으로 마이크로태스크 실시간 생성 (템플릿 대체/보강용) — 서버(`server/src/lib/geminiMicrotask.ts`, `server/src/routes/microtasks.ts`)에서 Lv2 마이크로태스크를 Gemini로 생성하도록 연결, 실패/timeout/비정상 응답 시 기존 룰베이스로 fallback. 이슈 없이 진행됨 (커밋 `2a0c9f3`)

### 넛지 메시지 (Lv1~4 차등, 핵심 기능 ②)

- [x] [P0] Lv1 메시지 문구 작성 (회피 이유 재확인 + 가벼운 톤, 마이크로태스크 미포함) (#23로 완료)
- [x] [P0] Lv2 메시지 문구 작성 (마이크로태스크 포함) (#24로 완료)
- [x] [P0] Lv3 기억 기반 개입 UI와 메시지 흐름 구현
- [x] [P0] Lv4 메시지 문구 작성 — 마감 D-day를 언급하고 가장 단호한 톤으로 시작을 요청
- [x] [P0] 넛지 모달 CTA를 "지금 시작하기" 하나로 통일
- [x] [P1] ~~API 연동: 넛지 메시지 동적 생성 함수 (`lib/nudge.ts`)~~ — #23~28에서 처음부터 nudgeMessages.js/buildNudgeMessage()로 통합 구현되어 별도 작업 불필요 (#29 중복 close)

### 발송

데모 증명 포인트("Web Push 알림 흐름을 구현하고, 탭 종료 후 안정성은 4주차에 재검증한다")

**P0 (데모 증명용 최소 세트)**

- [x] [P0] VAPID 키 발급 + 환경변수 세팅 (#31로 완료)
- [x] [P0] 알림 권한 요청 UI (프로토타입의 Notification API 권한 요청 로직 재사용) (#31로 완료)
- [x] [P0] Push 구독(subscription) 등록 — 클라이언트에서 구독 생성 (#42로 완료)
- [x] [P0] 구독 정보 DB 저장 (1주차 DB 스키마에 없던 새 테이블이므로 이 항목에 스키마 정의도 포함) (#32로 완료)
- [x] [P0] 서비스워커에 `push` 이벤트 리스너 추가 (수신 시 알림 표시) (#33로 완료)
- [x] [P0] `send-push` 서버리스 함수 (단건 발송) (#34로 완료, `server/src/lib/sendPush.ts` — 라우트가 아니라 일반 함수, `taskId` 기반 조회는 스키마상 불가능해 `subscriptionId` 기반으로만 구현)
- [x] [P0] 레벨 상승 로직에서 `send-push` 직접 호출 — 레벨 상승은 "지금 이 순간" 이벤트이므로 daily-checkin-scan(배치 스캔)을 경유하지 않고 바로 연결 (#35로 완료, DB의 모든 구독에 브로드캐스트, 트랜잭션 커밋 후 await + catch로 실패 격리)

**P1 (완성도/안정성, 데모 필수 아님)**

- [x] [P1] 발송 실패 시 재시도 처리 → 일시적/영구 실패 분류로 가시성 확보 - 재시도 자체는 응답 지연 트레이드오프 때문에 이번 스코프 제외, 필요시 별도 이슈로 (#58, `sendPush.ts`에 `classification`(permanent/config/rate_limited/temporary/unknown) 추가, `broadcastPush.ts` 로그에 노출)
- [x] [P1] 만료된 구독(410/404) 자동 삭제 — "갱신"이 아니라 삭제 방식으로 구현. `broadcastLevelUpPush`가 발송 결과에서 statusCode 410/404를 받으면 해당 `PushSubscription`을 삭제(#36 관련, 2026-07-26 완료)
- [x] [P1] 여러 탭/디바이스 동시 구독 관리 — 의도된 동작으로 확인됨, 발표 전 수동 구독 정리로 대응. 실제 멀티디바이스 정책 고도화(다중 기기 관리 UI 등)는 P1로 이후 확장 섹션에 남김
- [x] [P1] `DELETE /api/push-subscriptions/:id` 라우트 신규 추가 — 기존엔 등록(POST)만 있고 삭제 API가 없어 "DB는 항상 API 경로로만 조작" 원칙에 걸렸음. 존재하지 않는 id는 404, 정상 삭제는 200, 테스트 포함. 이 API로 테스트용 구독 정리 완료 (2026-07-27, 커밋 `d3296bc`)

### 피드백 루프

- [x] [P0] 넛지 수신 후 "도움됐음" / "귀찮았음" 선택 UI (#39로 완료, 완료 직후 CompletionMessage+FeedbackButtons 표시)
- [x] [P0] 피드백 결과 DB 저장 (`feedbacks`: taskId, 사용자 응답) (#40으로 완료 — 원래 "넛지ID" 기준으로 적었으나 스키마상 넛지 자체가 별도 엔티티가 아니라 taskId로 저장)

### 3주차 중 추가로 발견/제작한 것

- [x] test-writer Skill, code-review Agent 제작 (3주차 주간계획 요구사항)
- [x] #24 작업 중 발견한 버그 수정: `POST /:id/events` 응답에 회피 이유 필드가 누락돼 있던 문제

## 4주차 — 통합, 배포 + 발표 준비

### 통합 & 다듬기

- [x] [P0] 홈 카드에 현재 Lv, 레벨별 얼굴 아이콘, 할 일 핵심 정보 표시
- [x] [P0] 전체 플로우 통합 테스트 — "배포" 섹션의 프로덕션 수동 검증 완료 항목 참고
- [x] [P0] 모바일 홈 화면 추가(Add to Home Screen) 동작 확인 (iOS Safari 포함) — 아래 "4주차 중 추가로 발견/제작한 것"의 iOS Safari Web Push 수신 테스트 항목(131~133행)과 같은 작업이라 그쪽 기록 참고 (중복 항목 통합)
- [x] [P1] 넛지/마이크로태스크 문구 다듬기 (실제 데이터로 몇 번 발송해보고 조정) — 실제 문구 4개 카테고리 전체(Lv1 고정 문구 3개/Lv2 리드인 2개/Lv3 fallback 템플릿/Lv4 템플릿)를 검토한 결과 수정 필요한 부분 없음(2026-07-27, #52)

- [x] [P0] 캘린더 히스토리 뷰 구현 — 날짜별 등록/완료 task를 달력 형태로 표시, 기존 히스토리 리스트 뷰와 함께 제공 (외부 캘린더 연동 아님, 우리 서비스 내부 데이터만 사용) (#43으로 완료)
- [x] [P1] 넛지 모달 30초 자동 닫힘 타이머 적용 — 이유 선택이나 입력 중에도 멈추거나 초기화되지 않음
- [x] [P1] 현재 모달에서는 레벨을 고정하고, 닫힌 뒤 다음 알림에서 다음 Lv로 진행
- [x] [P1] 모달 진입 시 taskId + level별 메시지·microTask·generationSource 고정
- [x] [P1] Focus 진입 시 다른 active task의 알림 타이머와 카운트다운도 함께 정지
      (`clearAllTaskTimers`, `HomePage.test.jsx` 회귀 테스트로 확인)
- [x] [P1] 늦게 도착한 Gemini 응답이 확정된 레벨 화면을 덮어쓰지 않도록
      request sequence와 frozen message로 방어
- [x] [P1] ReasonCheckpoint 입력값과 선택 상태 보존 — 재현 안 됨으로 확인. 근거: `NudgeModal.jsx`의 `showCheckpoint`가 false로 바뀌는(=`ReasonCheckpoint` unmount) 조건은 `checkpointAnswered`(제출 시 의도적으로 true) / `checkpointLevel`(모달 오픈 시 고정, 도중 변경 없음) / `lockedToStart`(`task.level===4`)뿐인데, `HomePage.jsx`의 `runTick`이 모달이 하나라도 열려 있으면 전역적으로 즉시 리턴해 레벨 상승 폴링 자체를 막는다 — 즉 체크포인트가 떠 있는 동안 `task.level`이 배경에서 4로 올라 unmount를 유발하는 시나리오가 애초에 불가능함. 유일하게 실제로 입력이 사라지는 경로는 사용자가 명시적으로 "닫기"를 눌러 모달 전체를 닫는 경우인데, 이건 다이얼로그를 직접 닫으면 입력이 사라지는 일반적인 UX 동작이라 버그로 보지 않음 (2026-07-27 조사, 코드 변경 없음)
- [x] [P1] Playwright E2E 도입 — Landing 스모크, 등록 폼 빈 값 검증,
      할 일 생성→Home→Focus 완료→History 핵심 흐름 자동화

- [x] [P1] Focus "멈추기" 중복 클릭 방지 — `handleComplete`와 동일한 패턴(`stopInFlightRef` + `isStopping` state, 버튼 `disabled`)을 `handleStop`에 적용. RTL 테스트(`sends only one stopped request for rapid repeated clicks`) 추가, 관련 테스트 및 전체 프런트 테스트 통과 확인 (2026-07-27, `src/components/FocusMode.jsx`/`.test.jsx`)
- [x] [P1] 할 일 등록 입력 검증·중복 제출 방지·오류 UI 보강 — 프론트만 진행(서버 검증은 아래 별도 P1 후보로 분리). `validateTaskTitle`(기존 미연결 자산)을 `RegisterPage.jsx`에 연결, D-day 검증용 `validateDeadline`(`src/lib/validateDeadline.ts`)을 simple-tdd로 신규 작성(Red→Green, 빈 값/음수 방지, 0은 유효)해 함께 배선. `submitInFlightRef`+`isSubmitting` 가드로 연타 시 요청 1회만 발송(오늘 Focus 멈추기에 적용한 패턴과 동일). `handleSubmit`을 try/catch로 감싸 실패 시 에러 메시지 표시(`FocusMode.jsx`의 `errorMessage` 패턴 재사용). `RegisterPage.test.jsx` 신규 작성(4케이스: 제목/D-day 빈 값 차단, 연타 방지, API 실패 시 에러 UI), 전체 프론트 typecheck·테스트(20 files / 209 tests) 통과 확인 (2026-07-27)

### 4주차 중 추가로 발견/제작한 것 (원본 항목에 없던 것)

- [x] 마감 긴급도(D-day) × 현재 레벨 기반 알림 간격 설계 — 기존엔 모든 task에 동일한 고정 폴링 간격이 적용됐는데, 마감이 가까울수록/레벨이 높을수록 다음 알림까지의 대기 시간이 짧아지도록 `src/lib/nudgeInterval.ts`로 분리(순수 함수, 단위 테스트로 검증). 최초 검토했던 "할일 유형별 기본 간격" 안은 근거 없는 가정이라 폐기하고 마감 긴급도×레벨 조합으로 확정 (#44로 완료)
- [x] Focus 세션 새로고침 복구 — 새로고침해도 진행 중이던 Focus 세션(경과 시간 등)이 sessionStorage에서 복구되도록 구현 (이슈 없이 진행, 커밋 `cf23ee9`)
- [x] 완료 시점 컨텍스트 저장 — 어떤 방식(직접완료/개입후완료), 어느 레벨에서,
      어떤 첫 행동으로 완료했는지 TaskEvent에 스냅샷 저장. Focus 새로고침 복구도 이 구조로 통합 (커밋 eeb2369, ffc2ec1)
- [x] 서비스워커 버그 2건 수정 (2026-07-26) 1. 오프라인일 때 흰 화면 대신 캐시된 홈으로 폴백하도록 수정 2. 알림 클릭 시 기존 탭으로 포커스 안 되던 버그 수정 (실패 시 조용히 무시되던 게 원인), 새 탭 열릴 때 목적지도 랜딩페이지→홈으로 변경
- [x] iOS Web Push 수신 확인 — "홈 화면에 추가" 상태에서만 정상 수신
      (코드 수정 불필요, iOS 표준 동작). 테스트 중 구독 늘어남 → 발표 전 DELETE API로 정리 필요
- [x] 스트릭 로직 — 두 단계로 변경됨
      1차(2026-07-27 오전): 홈 화면에 스트릭이 항상 🔥0으로 뜨는 버그 발견
      → 원인 두 가지: (a) "개입 없이 완료해야만 +1"이라는 기존 정의가 이 서비스
      설계와 안 맞았음 (b) 프론트가 서버 값을 아예 안 읽고 0을 고정 출력하던 버그.
      완료마다 +1, 멈추면 리셋으로 임시 수정.
      2차(2026-07-27 오후, 코덱스): 방식을 다시 "날짜 기반 연속 완료일"로 전환.
      같은 날 여러 완료는 하루로 인정, stopped는 영향 없음. → 현재 이 방식이 최종.

- [x] 할일 목록 최신 등록순 정렬 — 원래 정렬 자체가 없어서 DB가 우연히
      반환하는 순서였음. createdAt 기준 정렬 추가 (2026-07-27)
- [x] History에 완료 시점 회피 이유 표시 — /api/history에 reason 필드 추가.
      skipCount는 별도 보류(완료 시 리셋되는 값이라 정확한 표시엔 스키마
      변경 필요, "확인 필요" 섹션 참고) (2026-07-27)
- [x] Lv3 "기억 기반 개입" 신뢰성 문제 해결 — 과거 기록 인용 문구를 "지난 기록 참고"로
      중립화, 근거 없는 인용 제거 (2026-07-27)
- [x] Lv2 마이크로태스크 품질/유형오염/이유별 차별화 개선 — 템플릿 85개 재작성, 검증
      규칙 Lv2/Lv3 공용화, 유형×이유 예시 동적 주입. 발표/PT 준비 유형은 근접 중복
      남음(구조적 한계로 판단, 추가 투자 안 함) (2026-07-27)
- [x] 캘린더 뷰 completedAt 반영 확인 — 이미 정상 배선돼 있음을 재확인 (2026-07-27)
- [x] #44 알림 간격 레벨 축 역전 버그 수정 — checklist.md 138행에는 "레벨이
      높을수록 대기 시간이 짧아지도록"라고 의도가 명시돼 있었는데, 실제 구현
      (`nudgeInterval.ts`의 `LEVEL_DELAY_MINUTES`, `nudgeConfig.js`의
      `DEMO_LEVEL_DELAY_MS`)은 각 긴급도 구간 안에서 Lv2→Lv3→Lv4로 갈수록 값이
      오히려 커지고 있었음(예: far 기준 30→60→120분). 문서화된 설계 의도와
      코드가 모순되는 걸 확인해 각 구간 안에서 Lv2/Lv4 값만 맞바꿔(Lv3은 가운데
      값이라 변경 없음) 레벨이 높을수록 짧아지도록 수정. 재발 방지로
      `nudgeInterval.test.ts`/`nudgeConfig.test.js`에 각 구간별 "Lv2>Lv3>Lv4"
      방향성 자체를 검증하는 테스트 추가. 값이 바뀌며 `HomePage.test.jsx`의
      `advance()` 타이밍 다수가 깨졌고, 특히 "restarts every active task..."
      테스트는 레벨이 높을수록 간격이 짧아지는 정책 하에서는 기존 두-task
      경쟁 구조 자체가 수학적으로 성립 불가능해(Lv2보다 Lv3 간격이 항상 더
      짧아 다른 task가 끼어들 여유 구간이 없음) 같은 레벨(Lv2)끼리 다른
      버킷으로 경쟁시키는 구조로 재작성. 전체 프론트 테스트(27 files/388
      tests) 통과 확인 (2026-07-28)

### 배포

- [x] [P0] 프로덕션 환경 배포 (Vercel) — 오늘 완료, PR #46 머지로 배포됨
- [x] [P0] 서비스워커 정상 동작 확인 — /history 404의 원인이 아니었음을 확인, 다만 오래된 캐시가 배포 반영을 가리는 문제가 있어 "Update on reload" 필요
- [x] [P0] Web Push 실제 수신 확인 — 2026-07-27 확인 완료. Chrome(데스크톱)
      / Edge / iOS Safari("홈 화면에 추가" 경로) 정상 수신됨.
      ⚠️ Android Chrome 실기기 검증 기록은 없음 — 확인 필요 항목에 추가
- [x] /history 새로고침 404 수정 (vercel.json SPA rewrite 패턴 교체)
- [x] Lv3 Gemini 품질검증(quality_result_verb_missing) 실패 → 프롬프트에 허용 동사 명시로 개선
- [x] 배포 최종 점검 7항목(환경변수/리전/DB/migration/Gemini키/CORS/라우팅) 확인 완료 — 리전만 이슈로 backlog 등록
- [x] Lv1/Lv2/Lv3/Lv4/Focus~완료 프로덕션 수동 검증 완료

### 발표 준비

- [x] [P0] 데모 시나리오 확정
- [x] [P1] 실제 발표 환경에서 데모 리허설

### Landing 최종 개선

- [x] Hero·브랜드·섹션 제목 줄바꿈 개선
- [x] 사용 흐름 5단계 세로 타임라인 적용
- [x] Shared Journey Lv0~Lv4 5단계 적용
- [x] Landing 관련 테스트 및 전체 프런트 테스트 통과

---

> 현재 남은 작업과 장기 아이디어는 문서 상단의 **백로그**와
> **미구현 아이디어**에서 중복 없이 관리한다.
