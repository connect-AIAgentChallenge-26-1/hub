# 자취달력(JachiCal) — 2단계 시스템 아키텍처 설계

> 산출물: API 명세서 · 기술 스택 선정 근거 · 인프라 확장 시나리오.
> ERD는 [`db-schema.md`](db-schema.md) 참고.

---

## 2-1. 프론트/백엔드 분리 및 API 방식

### API 방식: **REST**
- **근거:** 자원이 단순한 CRUD(공과금 항목·예산·지출·태스크) 중심이고, 실시간 양방향 통신 요구가 없다. 화면별 데이터 요구가 다양하지 않아 GraphQL의 이점이 작고, 소규모 팀에는 REST가 학습·디버깅 비용이 낮다. → 지시서 권장(REST)과 일치.

### 엔드포인트 명세 (초안)

인증은 JWT(Bearer). 모든 `/api/**`는 `me` 기준 소유 데이터만 반환.

#### 인증 (Auth)
| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| POST | `/api/auth/signup` | 가입 (email, password, nickname) |
| POST | `/api/auth/login` | 로그인 → JWT 발급 |
| POST | `/api/auth/logout` | 토큰 무효화(클라이언트 폐기) |
| GET | `/api/auth/me` | 현재 사용자 정보 |

#### 공과금 항목 (Bills) — F1
| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/bills` | 항목 목록 |
| POST | `/api/bills` | 항목 등록(등록 시 이번 달 Payment 자동 생성) |
| GET | `/api/bills/:id` | 항목 상세 |
| PATCH | `/api/bills/:id` | 수정 |
| DELETE | `/api/bills/:id` | 삭제(미래 PENDING 정리) |

#### 납부 이력 (Payments) — F1
| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/payments?from=&to=&status=` | 기간별 조회(캘린더 마킹용) |
| GET | `/api/payments/upcoming?days=7` | 홈 '다가오는 납부' D-day 리스트 |
| POST | `/api/payments/:id/pay` | 납부 완료 처리(body: amount?, addToExpense?) — 트랜잭션 |
| POST | `/api/payments/generate` | (배치/수동) 다음 달 예정 생성 |

#### 예산 (Budgets) — F2
| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/budgets/:year/:month` | 월 예산 조회(없으면 null) |
| PUT | `/api/budgets/:year/:month` | 월 예산 설정/수정(upsert) |

#### 지출 (Expenses) — F2
| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/expenses?year=&month=` | 월 지출 목록 |
| GET | `/api/expenses/summary?year=&month=` | 카테고리별 합계 + 잔여금(게이지용) |
| POST | `/api/expenses` | 지출 입력 |
| PATCH | `/api/expenses/:id` | 수정 |
| DELETE | `/api/expenses/:id` | 삭제 |

#### 행정 태스크 (AdminTasks) — F3(Should)
| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/admin-tasks` | 목록 |
| POST | `/api/admin-tasks` | 추가 |
| PATCH | `/api/admin-tasks/:id` | 완료 토글/수정 |
| DELETE | `/api/admin-tasks/:id` | 삭제 |

### 알림 처리 방식 (MVP)
- 서버가 Payment의 `due_date`와 Bill의 `notify_days_before`를 기준으로 **'다가오는 납부' 리스트**를 산출(1차 채널·fallback).
- 브라우저 푸시(Web Push)는 선택적 강화. MVP는 앱 진입 시 리스트 노출 + (가능 시) 로컬 알림으로 시작하고, 네이티브 푸시는 차기.

---

## 2-2. 기술 스택 선정 (제안)

| 레이어 | 선택 | 근거 |
| --- | --- | --- |
| 프레임워크 | **Next.js (App Router) + TypeScript** ✅확정 | 프론트+백엔드를 한 프로젝트에 통합 → 서버 1개, CORS 불필요, 초보자 관리 최소화. Vercel 원클릭 배포 |
| 백엔드 | **Next.js Route Handlers (`app/api/**`)** | 별도 Express 서버 없이 REST 엔드포인트를 같은 코드베이스에서 제공 |
| DB | **SQLite (개발) → PostgreSQL (운영)** | MVP는 파일 하나(`dev.db`)로 즉시 시작. 스키마 동일하게 Postgres 전환 |
| ORM | **Prisma** | 스키마-마이그레이션-타입을 한 곳에서 관리, ERD를 코드로 그대로 반영 |
| 인증 | **JWT (httpOnly 쿠키)** | 무상태 + 쿠키 자동 전송으로 클라이언트 코드 단순 |

- **확정 근거:** "제일 관리하기 쉽고 초보자도 가능"한 스택 요청 → 저장소 1개·명령어 1개(`npm run dev`)·무료 배포가 가능한 **Next.js 풀스택**이 최적.
- **폴더 분리(지시서 3-3 준수):** `app/`(화면·UI) / `app/api/`(백엔드 REST) / `lib/`(공통 로직) / `prisma/`(DB)로 역할 분리.

---

## 2-3. 인프라 확장성 (문서로만, 지금 구현 X)

- **MVP:** 단일 서버 + 단일 DB(SQLite/Postgres 1대)로 충분. 과설계 지양.
- **이후 트래픽 증가 시 시나리오(참고용):**
  - DB 읽기/쓰기 분리(Master-Slave)로 조회 부하 분산
  - 정적 자산 CDN 캐싱
  - 알림 배치를 별도 워커/큐로 분리
- 위 항목은 **지금 도입하지 않고** 트리거(동시접속/응답지연 임계) 도달 시 검토.

---

## 산출물 체크 (2단계)
- [x] API 방식 결정(REST) + 근거
- [x] 엔드포인트 명세 초안(인증/Bill/Payment/Budget/Expense/AdminTask)
- [x] ERD → `db-schema.md`
- [x] 기술 스택 제안 + 근거
- [x] 확장성 시나리오(문서화만)
- [ ] **기술 스택 확정 대기** → 확정 후 3단계 진행
