# 자취달력 (JachiCal)

공과금 납부일과 지출을 한 곳에서 관리하는 자취생용 생활 캘린더 MVP.

## 기술 스택
- **Next.js 14 (App Router) + TypeScript** — 프론트+백엔드 통합(서버 1개)
- **Prisma + SQLite** — 파일 기반 DB(`dev.db`)
- **JWT(httpOnly 쿠키)** 인증

## 폴더 구조 (역할 분리)
```
app/            화면(UI) — 라우팅
  (app)/        로그인 필수 메인 4탭 (home/calendar/budget/my)
  login, signup, onboarding
  api/          백엔드 REST 엔드포인트 (auth/bills/payments/budgets/expenses/admin-tasks)
components/     공통 UI (BottomTab, Gauge, BillFormModal, PayModal)
lib/            공통 로직 (prisma, auth, date, constants)
prisma/         schema.prisma(ERD), seed.ts(데모 데이터)
```

## 실행 방법 (초보자용)
```bash
npm install            # 1) 패키지 설치
npx prisma db push     # 2) DB 생성(dev.db)
npm run db:seed        # 3) (선택) 데모 데이터 생성
npm run dev            # 4) 개발 서버 → http://localhost:3000
```

### 데모 계정
- 이메일 `demo@jachical.app` / 비밀번호 `demo1234`

## 주요 기능 (MoSCoW)
- **Must** F1 공과금 통합 캘린더 + D-day 알림 리스트 + 납부 완료 체크(트랜잭션: 상태변경+지출반영+다음달 자동생성)
- **Must** F2 간편 예산 관리(수동 입력) + 잔여금 게이지 + 카테고리별 분석
- **Must** 사용자 인증(가입/로그인)
- **Should** F3 자취 행정 타임라인 체크리스트

## 문서 산출물
- [PRD.md](PRD.md) — 기획(Why)
- [screen-spec.md](screen-spec.md) — UI/UX(IA·화면정의서·디자인 토큰)
- [architecture.md](architecture.md) — API 명세·기술 스택 근거
- [db-schema.md](db-schema.md) — ERD

## 배포 (참고)
Vercel에 연결 시 운영 DB는 PostgreSQL 권장. `datasource db { provider = "postgresql" }`로 변경하고 `DATABASE_URL`만 교체하면 됩니다.
