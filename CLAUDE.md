# 빨래집사

## Project

무인빨래방 운영을 자동화하는 AI Agent

MVP 목표
방치 세탁물 자동 대응

상세 기획: `docs/plan.md`
Task·우선순위·4주 로드맵·진행 상태: `docs/backlog.md`

진행 상황은 백로그의 상태 열 하나로만 관리한다. (`docs/checklist.md`는 2주차에 폐기)

역할
서원(`swlog`) — `client/` 화면 · 시뮬레이터
도경(`do-ttery`) — `server/` 상태머신 · 알림 · 센서

---

# Team Setup (RSAK)

팀 저장소에 숨어 있는 네 가지 장치. 새 팀원·AI 에이전트는 여기부터 읽는다.

| 장치 | 뜻 | 우리 팀 위치 |
|---|---|---|
| **R — Rules** | 팀의 약속 (반드시 이렇게 작업한다) | 이 문서 `CLAUDE.md` |
| **S — Skills** | 자주 하는 일 버튼 (복잡한 절차를 한 줄로) | 규칙집은 `.claude/skills/`(`laundry-design`), 사용자 명령은 `.claude/commands/`(`/오늘`, `/팀`, `/pr`) |
| **A — Agent** | 역할별 전문 AI (분석·구현·검증 분업) | `.claude/agents/` — 아래 5종 |
| **K — KB** | AI용 팀 교과서 (기획·정책·용어) | `docs/` — `plan.md`(기획·왜), `backlog.md`(태스크·누가·언제) |

서브에이전트 (`.claude/agents/`)
- `spec-analyst` — 분석 담당. 구현 전 스펙 분해·확인 (읽기 전용)
- `client-builder` — 구현 담당(화면, 서원 영역). `client/` React 화면
- `server-builder` — 구현 담당(서버, 도경 영역). 상태머신·API·알림
- `rule-reviewer` — 검증 담당. 변경 diff를 이 문서 규칙과 대조
- `test-verifier` — 검증 담당. TDD로 만든 기능의 테스트를 실제로 돌려 green 확인 (client·server 공통, 대상 파일 경로로 워크스페이스 판별)

원칙: 에이전트·스킬은 규칙을 새로 쓰지 않고 이 문서·`docs/`·`design-system.md`를 **참조**만 한다 (단일 진실 원천).

---

# 집사 말투

빨래집사답게 **집사 톤**을 가볍게 쓴다.

- 인사·브리핑·마무리에만 집사 톤: "~해두었습니다, 서원님", "무엇부터 도와드릴까요".
- 기술 설명·코드·에러 진단은 **지금처럼 명료하게.** 존댓말체를 위해 정확성을 흐리지 않는다.
- 과하지 않게. 매 문장 집사 흉내 금지, 이모지 남발 금지. 마스코트 이모지(🧺)는 브리핑 머리에 하나면 충분하다.
- 팀원 호칭: 서원님 / 도경님.

---

# Architecture

Frontend
React + Vite + react-router-dom

Backend
Express + cors

Monorepo
npm workspaces + concurrently

Database
Supabase (PostgreSQL) — `@supabase/supabase-js`
(2026-07-16 결정: 매장은 1곳 유지, 여러 위치·기기에서 같은 DB에 접근할 필요가 있어 SQLite에서 전환)

Sensor
Tapo P110M (스마트플러그, 전력)
Tapo T110 (문열림 센서)
Tapo H100 (허브 — T110 연결에 필수)

Sensor 수집
`tapo` 라이브러리(python) 폴링 스크립트 → 서버로 전송
(2026-07-15 결정: P110M이 TAPO 암호화라 python-kasa 미지원 → `tapo`로 교체. T110·H100도 동일 라이브러리로 지원)

Notification
Web Push API + Service Worker + VAPID

---

# Folder

npm workspaces 모노레포. 루트에서 `npm install` 한 번, `npm run dev`로 둘 다 실행.

```
client/             # React (Vite) — 5173
  src/
    App.jsx         # 라우팅
    pages/          # 고객(m/*), 사장님(owner/*)
    components/
    styles/         # tokens.css (디자인 토큰)
    utils/          # 화면 공용 함수 (시각 표시·경과 시간·진행률)
    mocks/          # mock 데이터 (구조는 아래 Data Model과 동일)
server/             # Express — 3000
  index.js
  routes/
  services/         # 상태머신, 방치 대응, 알림
  scripts/          # 센서 폴링, 시뮬레이터
  lib/              # supabase 클라이언트 초기화
docs/               # plan.md, backlog.md, prototype.html
assets/             # 마스코트, 로고
```

client의 `/api`·`/ingest` 요청은 Vite 프록시가 server로 넘긴다. 프론트는 상대 경로로 호출한다.

---

# Git Flow

feature/* → dev → main

---

# Commit

feat:
fix:
docs:
style:
refactor:
test:
chore:

---

# Coding Convention

camelCase
PascalCase

Hooks
useXXX

Component
PascalCase

Constant
UPPER_CASE

---

# Environment

`.env`는 Supabase 프로젝트 생성 시점(DB 작업 착수)에 바로 생성한다. (기존: 3주차까지 미루던 것에서 앞당김 — DB 접속 자체에 키가 필요해짐)

`.env`에 보관
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY (서버 전용 — 프론트에 노출 금지)
- VAPID_PUBLIC / VAPID_PRIVATE
- OWNER_PASSCODE
- PORT

비밀키·실제 값 커밋 금지.
`.env`는 `.gitignore`에 포함.

---

# Development Rule

UI를 먼저 구현한다.
화면은 mock 데이터로 완성하고, 기능은 나중에 연결한다.
mock 데이터의 구조는 아래 Data Model·API Spec과 동일하게 맞춘다.
(구조가 같아야 mock → 실제 API 교체가 갈아끼우기만으로 끝난다)

기능 구현 단계에서는 상태 머신을 우선 구현한다.

QR은 선택 기능이다.
전력 데이터가 기준이다.
문열림은 보조 데이터이다.

AI는 임의 판단하지 않는다.
아래 스펙에 없는 결정이 필요하면 임의로 정하지 말고 질문한다.
새로 확정된 결정은 이 문서에 반영한다.

---

# API Spec

센서 데이터 입구는 하나로 통일한다.

```
POST /ingest/:machineId
{ "type": "watt",      "value": 512 }   # 전력 (5초 간격)
{ "type": "door_open"  }                # 문 열림
{ "type": "door_close" }                # 문 닫힘
```

- 개발 중: 시뮬레이터가 이 엔드포인트로 가짜 데이터 주입
- 운영: 센서 폴링 스크립트가 동일 엔드포인트로 전송
- 개발·운영 경로는 항상 일치시킨다

## 조회 API

화면(T-14~T-16)이 소비하는 응답 형태다. `client/src/mocks/`가 이 모양 그대로 mock을 들고 있고,
T-17은 mock import를 fetch로 갈아끼우기만 한다. **서버(T-13)는 이 모양에 맞춘다.**

```
GET /api/machines      → Machine[]        # 대시보드
GET /api/machines/:id  → Machine          # QR 랜딩 · 진행 화면
GET /api/notifications/recent → Notification[]   # 대시보드 최근 처리 내역 (sentAt 내림차순)
```

```jsonc
// Machine — machine 테이블 + 현재 session 조인
{
  "id": "m1",
  "name": "세탁기 1",
  "status": "RUNNING",              // 6상태
  "needsAttention": false,          // 센서·전력 이상. 상태가 아니라 플래그다
  "attentionReason": null,          // needsAttention일 때만 문자열
  "session": {                      // 진행 중 세션이 없으면 null
    "id": "s-101",
    "machineId": "m1",
    "startedAt": "2026-07-14T18:02:00.000Z",
    "endedAt": null,                // 종료 전이면 null
    "state": "RUNNING",
    "etaFrom": "2026-07-14T18:45:00.000Z",   // 예상 종료 범위 — 서버가 계산한다
    "etaTo":   "2026-07-14T18:55:00.000Z",
    "subscriberCount": 1            // 0이면 QR 미신청
  }
}

// Notification — notification 테이블 + machineName · sessionState 조인
{
  "id": "n-209", "sessionId": "s-104", "machineId": "m4", "machineName": "세탁기 4",
  "sessionState": "ABANDONED",
  "type": "OWNER_ALERT",            // DEPARTURE | COMPLETED | COLLECT_1 | COLLECT_2 | OWNER_ALERT
  "sentAt": "2026-07-14T21:12:00.000Z"
}
```

규칙
- 시각은 전부 ISO 8601 문자열. 경과 시간·진행률·"방치 32분째"는 화면이 계산한다
- `plugId` / `doorSensorId`는 내부 센서 매핑이라 응답에 담지 않는다
- **예상 종료 범위(`etaFrom`/`etaTo`)는 서버가 계산한다.** 전력 곡선·코스 소요시간이 서버에 있으므로, 고객 화면과 대시보드가 같은 값을 본다
- **`needsAttention`은 7번째 상태가 아니다.** 상태는 6개를 유지하고, 전력 패턴 이상은 이 플래그로 표시한다 (대시보드 "확인 필요")
- "자동 해결 / 자동 안내" 같은 표시 문구는 저장하지 않는다. `type`과 `sessionState`로 화면이 판단한다

---

# Data Model

Supabase(PostgreSQL) 테이블. 5개만 사용한다. 임의로 추가하지 않는다.
`id`는 SQLite 시절의 문자열 리터럴(`m1`, `s-101`) 대신 Supabase 기본값인 `uuid`를 쓴다. API Spec의 예시 id는 형태 설명용이고 실제 값은 uuid로 대체된다.

| 테이블 | 주요 컬럼 | 용도 |
|---|---|---|
| `machine` | id, name, status, plugId, doorSensorId | 기계 목록·현재 상태·센서 매핑 |
| `session` | id, machineId, startedAt, endedAt, state | 세탁 1회 = 세션 (익명 허용, QR 무관 생성) |
| `subscription` | id, sessionId, endpoint, keys, createdAt | QR 알림 신청 (opt-in). `sessionId`는 nullable — NULL이면 세션에 묶이지 않은 사장님(매장) 구독 (2026-07-21 결정) |
| `reading` | id, machineId, ts, type, value | 전력·도어 이벤트 로그 |
| `notification` | id, sessionId, type, sentAt | 발송 이력 (중복 방지 근거) |

---

# State Machine

상태는 6가지만 사용한다.

```
IDLE → RUNNING → SPIN → DONE
DONE → COLLECTED       (수거)
DONE → ABANDONED       (방치)
ABANDONED → COLLECTED  (방치 후 수거)
```

전이 조건

| 전이 | 트리거 |
|---|---|
| IDLE → RUNNING | 전력 급상승 (**100W 이상 지속**) + 세션 자동 생성 |
| RUNNING → SPIN | 탈수 스파이크 (**500W 이상**) |
| SPIN → DONE | 전력 **20W 이하가 60초 유지** |
| DONE → COLLECTED | ① 도어 열림 ② 동일 기계 다음 세탁 시작(소급 처리) — 이 우선순위 (2026-07-27 결정: 고객 "수거했어요" 탭 제거 — 도착 전 미리 눌러 오탐 나는 문제. 수거는 문 열림으로만 판단) |
| DONE → ABANDONED | 종료 후 **15분** 수거 신호 없음 (타이머, 2026-07-27 결정: 30분 → 15분 단축) |
| ABANDONED → COLLECTED | 도어 열림 — 방치 알림까지 나간 뒤에도 수거는 항상 가능해야 한다 (2026-07-20 결정) |

**COLLECTED 전이 시 (2026-07-20 결정)**: `session.state`는 이력 그대로 `COLLECTED`로 남기지만, `machine.status`는 **`IDLE`로 리셋**한다. 그래야 다음 손님의 `IDLE → RUNNING` 전이가 정상 감지되고, 대시보드도 기계를 즉시 "사용 가능"으로 보여준다.

### 전력 임계값 (2026-07-15 1차 육안 실측 → 2026-07-20 2차 CSV 실측으로 확정, W3180N17 20kg, 히터 없음)

`server/scripts/실측_20260715.md` 참조. 2차는 `power_poll.py`로 세탁 시작~종료 전체 사이클(34분)을 1초 간격 CSV로 자동기록. 1차 육안 추정치를 전부 검증했고 **경계값 변경 없이 확정.**

| 상수 | 값 | 근거 |
|---|---|---|
| `IDLE_STANDBY_W` | ~7W | 대기 전력 (2차 CSV 7.0W로 일치) |
| `START_W` | 100W 이상 지속 | 세탁 대역 200~425W, 대기와 크게 벌어짐 |
| `SPIN_W` | 500W 이상 | 탈수 최고 930W, 헹굼 최고 425W — 500W에서 깨끗이 분리 (2차 CSV 확인) |
| `DONE_W` | 20W 이하 | 종료 시 9→7W 안착 |
| `DONE_HOLD_SEC` | 60초 | 세탁 중 텀블 휴지기 최대 8초(2차 CSV 실측) → 60초는 안전마진 7배 이상 |
| 표준 코스 소요 | 35분 | eta 계산 기준 (표준세탁 = 세탁1 + 헹굼3 + 탈수, 2차 실측 34분) |

**표준 코스만 실측됨 (2026-07-21 확인)** — 매장 세탁기는 급속·강력 등 코스가 여러 개이지만, 지금까지 실측(1차·2차)은 전부 표준세탁 1종만 진행됐다. `session` 테이블에 코스 구분 필드가 없어 시스템은 어떤 코스인지 감지·저장하지 않는다. 위 전력 임계값·`STANDARD_COURSE_MIN`(eta 계산)은 표준 코스 기준으로만 검증된 값이라, 다른 코스로 돌리면 eta가 어긋날 수 있다. **2026-07-27 결정: MVP는 표준 코스만 지원한다. 코스별 실측(T-28)은 하지 않고, 급속·강력 등 다른 코스 지원은 추후 과제로 미룬다.** 시스템은 모든 세션을 표준 코스로 간주한다 (`docs/backlog.md` T-28).

**20kg만 검증·지원됨 (2026-07-27 확인·결정)** — 매장 세탁기 4대의 크기는 **세탁기 1·2 = 28kg(큰 것), 세탁기 3·4 = 20kg(작은 것, W3180N17)**. 위 전력 임계값·실측(T-05)·실매장 검증(T-23)은 전부 **20kg에서만** 이뤄졌다. 위 헤더의 "W3180N17 20kg"가 그 실측 기계이고, 20kg는 이 매장에서 "큰 것"이 아니라 28kg 아래의 작은 축이다(과거 문서가 20kg를 "큰 세탁기"로 잘못 부른 것을 바로잡음). **MVP는 20kg만 지원 대상으로 하고, 28kg 실측·지원은 추후 과제로 미룬다** — 28kg는 용량이 커 특히 eta가 어긋날 수 있다. `machine` 테이블엔 용량 컬럼이 없으므로(테이블 5개 고정) 이 크기 매핑은 문서로만 관리한다. **20kg 테스트 시 폴러 `--machine-id`는 세탁기 3·4의 uuid를 써야** 물리 기계와 화면이 일치한다.

- **히터 없음(1.1kW)** → 세탁 중 전력이 주기적으로 낮게 떨어짐(텀블 휴지기, 2차 CSV 최대 8초). `DONE_HOLD_SEC`가 이보다 넉넉히 길어야 함 (그래서 60초)
- **폴링 5초 충분** — 휴지기 최대 8초라 5초 간격이 그 안에 샘플을 잡음
- **중간 탈수(헹굼 3회) 처리 — 2026-07-16 결정, 2026-07-20 CSV로 재확인**: `RUNNING→SPIN`은 **첫 스파이크(500W 이상)에서 전이 후 계속 유지**한다. `SPIN→RUNNING` 역전이는 만들지 않는다(6상태 전이표 그대로). 2차 실측에서 스파이크가 정확히 4회(헹굼 3회 + 최종탈수) 확인됨. 헹굼 중간에 고객 화면이 "탈수중"으로 조금 이르게 보일 수 있으나 종료 오판과는 무관하고(`DONE`은 별도로 60초 유지 조건), eta는 코스 소요시간(35분) 기준이라 영향 없음

규칙
- 세션은 QR 신청과 무관하게 전력 감지만으로 생성한다 (익명 세션)
- RUNNING / SPIN 중 door_open은 무시한다 (탈수 진동 오탐 방어)
- 방치 시간(15분), 2차 알림 간격(+15분), 위 전력 임계값은 상수로 분리한다 (2026-07-27 결정: 방치·2차 각각 30분 → 15분)
- 중복 전이 금지, 정의되지 않은 이벤트는 무시하고 로그만 남긴다

### IDLE→RUNNING / RUNNING→SPIN은 hold 없이 즉시 전이 (2026-07-20 결정)

`SPIN→DONE`만 "60초 유지"가 문서에 숫자로 명시돼 있고, 나머지 두 전이는 hold 시간이 없다. 노이즈 스파이크로 `IDLE→RUNNING`이 잘못 걸리면 유령 세션이 생기고, `RUNNING`에서 빠져나오는 역전이가 6상태 전이표에 없어 그 기계가 대시보드에 "사용중"으로 계속 멈춰 있는 리스크가 있다. 2026-07-20 CSV 실측에서는 그런 노이즈 패턴이 관측되지 않았다. **실측으로 확인 안 된 숫자를 미리 지어내지 않는다** 원칙에 따라 지금은 즉시 전이로 두고, **T-23 실매장 검증에서 유령 세션이 실제로 발생하는지 확인 후 필요하면 hold를 추가한다.**

방치 후 분기
- 알림 채널 있음 → 1차 수거 알림 → 2차 수거 알림
- 알림 채널 없음 → 사장님 알림 + QR 랜딩 방치 안내 모드 전환

---

# Notification Rule

종류
출발(종료 임박) / 완료 / 1차 수거 / 2차 수거 / 사장님 알림

문구 톤
- 고객 비난 금지: "방치하셨습니다" ❌ → "찾아가지 않은 세탁물이 있어요" ⭕
- 시간은 점이 아니라 범위로: "18:45~18:55"
- 같은 세션에 같은 종류의 알림은 1회만 (notification 테이블로 중복 방지)

**사장님 알림(OWNER_ALERT) 발송 채널 (2026-07-21 결정)**: OWNER_ALERT는 정의상 그 세션에
subscription이 없을 때만 발생하는 분기라, 세션에 묶인 구독으로는 실제로 발송할 대상이 항상 0건이었다.
`subscription.session_id`를 nullable로 바꿔 `session_id IS NULL`인 row를 세션에 안 묶인 사장님(매장)
구독으로 쓴다. 매장은 1곳만 운영한다는 전제(Architecture 섹션 참고)라 사장님 구독은 여러 개(사장님
폰·카운터 태블릿 등) 있을 수 있어도 특정 세션에는 묶이지 않는다.

---

# Agent Rule

항상
Observe → Think → Act
순서를 유지한다.

상태는
IDLE / RUNNING / SPIN / DONE / COLLECTED / ABANDONED
6가지만 사용한다.

---

# UI Rule

Pretendard
8pt Grid
Radius 24 (카드) / 18 (버튼)
Primary #6366F1

상태 색 (고정)

| 상태 | 색 |
|---|---|
| 대기 | #94A3B8 |
| 세탁중 | #6366F1 |
| 탈수 | #2E9CC5 |
| 완료 | #4CAF50 |
| 방치 | #F08C00 |
| 오류 | #E84D4D |

빨강 정책
- 고객 화면의 상태 표시에 빨강 금지 (방치 포함 — 비난 인상 금지)
- 빨강(#E84D4D)은 관리자 화면의 시스템 오류·파괴적 액션에만 허용

화면 작업 시 `빨래집사 Design Skill`을 반드시 적용하고,
작업 후 스킬의 검증 체크리스트로 자가 검증한다.

---

# Design Rule

항상
빨래집사 마스코트를 사용한다.

새 캐릭터 생성 금지.
마스코트 비율 변경 금지.
캐릭터의 AI 렌즈는 항상 오른쪽 눈에 유지한다.

---

# MVP Scope

기계 상태 감지
방치 판단
QR 알림
사장님 알림
Dashboard

여기까지만 구현한다.

재고관리
발주
환불
매출 분석

구현 금지.
(승인 대기함은 Dashboard에 UI 자리만 둔다 — 기능 구현 금지)
