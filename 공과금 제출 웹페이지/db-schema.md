# 자취달력(JachiCal) — 데이터베이스 설계 (ERD)

> 2단계 산출물. PRD 용어 정의(Bill/Payment/Budget/Expense/AdminTask)를 그대로 사용합니다.
> 설계 프로세스: 요구사항 분석 → 개념적(ERD) → 논리적(정규화/FK) → 물리적(인덱스).

## 1. 요구사항 분석 — 핵심 엔티티

| 엔티티 | 근거 기능 | 설명 |
| --- | --- | --- |
| User | 인증 | 데이터 소유 단위 |
| Bill (공과금 항목) | F1 | 정기 납부 대상(전기/가스/수도/관리비/기타) |
| Payment (납부 이력) | F1 | 월별 납부 예정/완료 레코드 (알림·체크 대상) |
| Budget (예산) | F2 | 월 단위 지출 상한 |
| Expense (지출) | F2 | 수동 입력 개별 지출 |
| AdminTask (행정 태스크) | F3(Should) | 자취 행정 체크리스트 항목 |

## 2. 개념적 설계 — ERD (관계)

```
        ┌─────────┐
        │  User   │
        └────┬────┘
   ┌─────────┼───────────┬──────────────┬───────────────┐
  1:N       1:N         1:N            1:N             1:N
   │         │           │              │               │
┌──▼──┐  ┌───▼────┐  ┌───▼────┐   ┌─────▼────┐   ┌───────▼────┐
│Bill │  │ Budget │  │Expense │   │AdminTask │   │ (Payment via Bill) │
└──┬──┘  └────────┘  └───▲────┘   └──────────┘   └────────────┘
  1:N                    │ 0..1
   │                     │ (납부 체크 시 지출 자동 반영)
┌──▼──────┐              │
│ Payment ├──────────────┘
└─────────┘   Payment 0..1 ─ 0..1 Expense
```

- **User 1:N Bill** — 한 사용자가 여러 공과금 항목 보유.
- **Bill 1:N Payment** — 항목마다 월별 납부 레코드가 누적.
- **User 1:N Budget** — 사용자·연월당 예산 1건 (유니크 제약).
- **User 1:N Expense** — 지출 다건.
- **Payment 0..1 ─ 0..1 Expense** — 납부 완료 시 지출로 자동 반영하면 연결(옵션).
- **User 1:N AdminTask** — 행정 체크리스트.

## 3. 논리적 설계 — 테이블 정의

### User
| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | INTEGER | PK, auto |
| email | TEXT | UNIQUE, NOT NULL |
| password_hash | TEXT | NOT NULL |
| nickname | TEXT | NOT NULL |
| created_at | DATETIME | default now |

### Bill (공과금 항목)
| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | INTEGER | PK |
| user_id | INTEGER | FK→User, NOT NULL |
| category | TEXT | ENUM(ELECTRIC/GAS/WATER/MAINT/ETC) |
| name | TEXT | NOT NULL |
| due_day | INTEGER | NULL 허용(=납부일 미정), 1~31 |
| default_amount | INTEGER | NULL 허용(=금액 미입력) |
| provider | TEXT | NULL (예: 한전) |
| notify_enabled | BOOLEAN | default true |
| notify_days_before | INTEGER | default 2 |
| created_at | DATETIME | default now |

### Payment (납부 이력)
| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | INTEGER | PK |
| bill_id | INTEGER | FK→Bill, NOT NULL |
| user_id | INTEGER | FK→User (조회 최적화용 비정규화) |
| period_year | INTEGER | NOT NULL |
| period_month | INTEGER | NOT NULL (1~12) |
| due_date | DATE | NULL 허용(미정 항목) |
| amount | INTEGER | NULL 허용 |
| status | TEXT | ENUM(PENDING/PAID/OVERDUE), default PENDING |
| paid_at | DATETIME | NULL |
| **UNIQUE** | (bill_id, period_year, period_month) | 월 중복 방지 |

### Budget (예산)
| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | INTEGER | PK |
| user_id | INTEGER | FK→User |
| period_year | INTEGER | NOT NULL |
| period_month | INTEGER | NOT NULL |
| amount | INTEGER | NOT NULL |
| **UNIQUE** | (user_id, period_year, period_month) | 월 1건 |

### Expense (지출)
| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | INTEGER | PK |
| user_id | INTEGER | FK→User |
| category_label | TEXT | 공과금/식비/생활용품/기타 등 |
| amount | INTEGER | NOT NULL |
| spent_at | DATE | NOT NULL |
| memo | TEXT | NULL |
| source_payment_id | INTEGER | FK→Payment, NULL (납부 체크 자동 반영분) |

### AdminTask (행정 태스크 · Should)
| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | INTEGER | PK |
| user_id | INTEGER | FK→User |
| title | TEXT | NOT NULL |
| due_date | DATE | NULL |
| is_done | BOOLEAN | default false |
| sort_order | INTEGER | default 0 |

## 4. 물리적 설계 — 인덱스 전략

납부일/월 기준 조회가 잦으므로(캘린더·홈 대시보드) 날짜 컬럼 위주로 인덱싱한다.

| 인덱스 | 대상 | 목적 |
| --- | --- | --- |
| `idx_payment_user_due` | Payment(user_id, due_date) | 홈 '다가오는 납부', 캘린더 월 조회 |
| `uq_payment_period` | Payment(bill_id, period_year, period_month) UNIQUE | 월별 중복 생성 방지 |
| `uq_budget_period` | Budget(user_id, period_year, period_month) UNIQUE | 월 예산 1건 보장 |
| `idx_expense_user_spent` | Expense(user_id, spent_at) | 월별 지출 집계(게이지) |
| `idx_bill_user` | Bill(user_id) | 항목 목록 조회 |

## 5. 트랜잭션 범위 (핵심)

- **납부 완료 처리**: `Payment.status=PAID` 갱신 + (옵션)`Expense` 생성 + 다음 달 `Payment` 예정 생성 → **하나의 트랜잭션**으로 원자 처리.
- **공과금 항목 삭제**: Bill 삭제 시 미래 PENDING Payment는 함께 삭제, 과거 PAID 이력은 보존(soft 처리 or 유지) — 정책은 개발 단계에서 확정.
