# 자취달력(JachiCal) — 프로젝트 진행 정리

> SDLC 단계(기획 → UI/UX → 아키텍처 → 개발 → QA → 배포 → 운영 → 회고)에 따라 진행 중.
> 작성일 기준 **1~3단계 완료**, 4단계(QA) 진행 대기.

---

## 0. 개요

| 항목 | 내용 |
| --- | --- |
| 서비스명 | 자취달력 (JachiCal) |
| 한 줄 정의 | 공과금 납부일·지출을 한 곳에서 관리하는 자취생용 생활 캘린더 |
| 타겟 | 자취 1~3년 차 대학생 (페르소나: 김서연, 22세) |
| 기술 스택 | Next.js 14(App Router) + TypeScript + Prisma + SQLite + JWT |
| 상태 | 동작하는 MVP 완성 (로컬 데모 가능) |

---

## 1. 진행 현황 (단계별)

| 단계 | 내용 | 상태 | 산출물 |
| --- | --- | --- | --- |
| 1. UI/UX 설계 | IA·화면정의서·와이어프레임·디자인시스템 | ✅ 완료 | `screen-spec.md`, `wireframes.html` |
| 2. 아키텍처 | API 명세·ERD·기술스택 | ✅ 완료 | `architecture.md`, `db-schema.md` |
| 3. 개발 | Must→Should 순 구현 | ✅ 완료 | Next.js 앱 코드 전체 |
| 4. QA | 단위/통합/E2E 테스트 | ⏳ 대기 | — |
| 5. 배포 | 롤링 배포·CI/CD | ⏳ 예정 | — |
| 6. 운영 | 모니터링 체크리스트 | ⏳ 예정 | — |
| 7. 회고 | KPT | ⏳ 예정 | — |

---

## 2. 기능 범위 (MoSCoW)

| 구분 | 기능 | 구현 |
| --- | --- | --- |
| **Must** | 사용자 인증(가입/로그인) | ✅ |
| **Must** | F1. 공과금 통합 캘린더 + 알림 리스트 + 납부 완료 체크 | ✅ |
| **Must** | F2. 간편 예산 관리(수동 입력) + 잔여금 게이지 | ✅ |
| **Should** | F3. 자취 행정 타임라인 체크리스트 | ✅ |
| **Won't (1차 제외)** | 결제 대행·은행 연동·카드 문자 자동 연동 | — |

**KPI:** 납부 알림 클릭률 60%↑ / 지출 기록 3일 유지율 40%↑ / WAU/MAU 35%↑

---

## 3. 문서 산출물 (기획·설계)

| 파일 | 단계 | 핵심 내용 |
| --- | --- | --- |
| [PRD.md](PRD.md) | 기획 | 목적·타겟·MoSCoW·KPI·용어 정의 |
| [screen-spec.md](screen-spec.md) | UI/UX | IA 표(화면 11개), 화면정의서(플로우 3종+예외), 디자인 토큰 |
| [wireframes.html](wireframes.html) | UI/UX | 미드파이 목업 4종(온보딩·홈·캘린더·예산) |
| [architecture.md](architecture.md) | 아키텍처 | REST 엔드포인트 24개, 기술스택 근거, 확장 시나리오 |
| [db-schema.md](db-schema.md) | 아키텍처 | ERD(엔티티 6개), 인덱스·트랜잭션 설계 |
| [README.md](README.md) | 개발 | 실행 방법·폴더 구조·데모 계정 |

---

## 4. 코드 구조 (역할 분리)

```
app/                          화면(UI) + 백엔드(API)
├─ page.tsx                   진입점(인증 분기 리다이렉트)
├─ layout.tsx / globals.css   루트 레이아웃 + 디자인 토큰 CSS
├─ login, signup, onboarding  인증·온보딩 화면
├─ (app)/                     ── 로그인 필수 메인 4탭 (하단 탭바 공통) ──
│  ├─ layout.tsx              미인증 자동 리다이렉트 가드
│  ├─ home/                   S2 홈 대시보드(게이지+D-day+할일)
│  ├─ calendar/               S3 월간 캘린더(납부일 마킹)
│  ├─ budget/                 S5 예산 게이지+지출 관리
│  └─ my/                     S9 마이(항목 관리+행정 타임라인)
└─ api/                       ── 백엔드 REST ──
   ├─ auth/                   signup·login·logout·me
   ├─ bills/                  공과금 항목 CRUD
   ├─ payments/               조회·upcoming·[id]/pay(납부 트랜잭션)
   ├─ budgets/[year]/[month]/ 월 예산 upsert
   ├─ expenses/               지출 CRUD·summary(게이지 집계)
   └─ admin-tasks/            행정 체크리스트 CRUD

components/                   공통 UI
├─ BottomTab   하단 4탭
├─ Gauge       반원 예산 게이지(색상 전환)
├─ BillFormModal  공과금 등록/수정 시트
└─ PayModal    납부 완료 체크 시트

lib/                          공통 로직
├─ prisma.ts   DB 클라이언트
├─ auth.ts     비밀번호 해시·JWT·쿠키·인증 가드
├─ date.ts     다음 납부일·D-day·금액 포맷 (QA 단위테스트 대상)
└─ constants.ts 카테고리 정의(색상 매핑)

prisma/
├─ schema.prisma  ERD 반영 스키마
└─ seed.ts        데모 계정+샘플 데이터
```

---

## 5. 데이터 모델 (요약 ERD)

```
User ─1:N─ Bill ─1:N─ Payment ─0..1─ Expense
  ├─1:N─ Budget      (userId+연월 유니크)
  ├─1:N─ Expense
  └─1:N─ AdminTask
```
- Payment `(bill, 연, 월)` 유니크 → 월 중복 방지
- 인덱스: `Payment(userId, dueDate)`, `Expense(userId, spentAt)` — 캘린더·집계 조회 최적화

---

## 6. 검증 완료 항목 (개발 중 확인)

- ✅ TypeScript 타입체크 통과, 브라우저 콘솔 에러 0
- ✅ 홈/캘린더/예산 화면 렌더 정상 (스크린샷 확인)
- ✅ **핵심 트랜잭션(납부 완료 체크)** 실데이터 검증:
  납부 처리 → 상태 PAID + 지출 자동 반영 + 다음 달 예정 자동 생성

---

## 7. 실행 방법 (요약)

```powershell
cd "C:\Users\user\공과금 제출 웹페이지"
npm run dev          # → http://localhost:3000
```
- 데모 계정: `demo@jachical.app` / `demo1234`
- 최초 세팅 시에만: `npm install → npx prisma db push → npm run db:seed`

---

## 8. 다음 단계

- **4단계 QA(대기):** `lib/date.ts`·예산 계산 단위 테스트 → 등록~알림 통합 테스트 → 온보딩~납부체크 E2E → KPI 검증 체크리스트
- 이후 5단계(배포·CI/CD) → 6단계(운영) → 7단계(KPT 회고)
