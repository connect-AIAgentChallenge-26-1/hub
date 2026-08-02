# Screen Specifications

출처: `src/prototype/gov_subsidy_home_wireframe.html` + `docs/plan.md`

## Screen Inventory

| ID | Name | Route | MVP |
|----|------|-------|-----|
| welcome | 환영 | `/` | ✅ |
| step1 | 업종 선택 | `/onboarding/1` | ✅ |
| step2 | 시/도 선택 | `/onboarding/2` | ✅ |
| step3 | 구/군 선택 | `/onboarding/3` | ✅ |
| step4 | 사업 규모 | `/onboarding/4` | ✅ |
| complete | 입력 완료 | `/onboarding/complete` | ✅ |
| home | 매칭 결과 | `/home` | ✅ |
| detail | 지원금 상세 | `/subsidies/:id` | ✅ |

## Onboarding State Shape

```typescript
/** shared/src/types/subsidy.ts — OnboardingProfile 과 동일 */
interface OnboardingState {
  industry: string;      // step1
  region: string;        // step2 — 시/도
  district: string;      // step3 — 구/군
  employees: string;     // step4
  revenue: string;       // step4 — 연매출 구간
}
```

### Step 1 — 업종
- Options: 음식점, 카페·베이커리, 소매·유통, 서비스업, 제조업, 기타(직접 입력)
- "기타" 선택 시 text input 노출, 입력 전 next disabled

### Step 2 — 시/도
- 2열 grid: 서울~제주 17개
- Single select

### Step 3 — 구/군
- step2 선택값에 따라 `districts` 맵에서 목록 생성
- Title: `{region} 어디에서 사업하고 계세요?` (region은 blue 강조)

### Step 4 — 사업 규모
- 직원 수: 4 options (single select)
- 연매출: select dropdown (5구간)
- Both required for "맞춤 지원금 찾기"

### Complete
- Summary box: 업종, 지역, 직원 수, 연매출
- CTA → `/home`

## Home Screen

### Header
- Greet: "안녕하세요, 사장님"
- Profile: `{district} · {industry} · {employees}`
- Bell icon + red dot (MVP: non-functional)

### Filters (sort)
| Chip | Sort key |
|------|----------|
| 전체 | default (match desc) |
| 마감임박순 | dday asc |
| 지원금액순 | amount desc |
| 신규 | created desc (API 준비 후) |

### SubsidyCard fields
- `name`, `org`, `amount`, `dday`, `match` (%)

### TabBar (MVP placeholder)
- 홈 (active), 지난 기록, 마이

## Detail Screen

### Header (navy)
- Back → home
- D-day badge
- Title, org

### Summary grid (2×2)
- 지원 금액, 매칭도, 마감일, 신청 방식

### Sections
1. 신청 자격 — bullet list (blue dot)
2. 필요 서류 — bullet list
3. 신청 방법 — info box (접수 방식, 접수처 링크, 문의)

### Bottom CTA
- "신청하러 가기" → external URL (new tab)

## Subsidy Data Model (API/UI)

```typescript
interface Subsidy {
  id: string;
  name: string;
  org: string;
  amount: string;           // "최대 300만원"
  dday: number;
  match: number;            // 0-100
  deadline: string;         // "2026. 7. 11"
  method: string;         // "온라인"
  qualifications: string[];
  documents: string[];
  how: string;
  where: string;
  whereUrl?: string;
  contact: string;
}
```

## Region Data

구/군 목록은 와이어프레임 `districts` 객체 참조. MVP는 주요 시·군·구만 포함 — 전국 완전 커버는 Won't.

## Copy Guidelines (와이어프레임 고정 문구)

- Welcome H1: "내 가게에 딱 맞는 / 지원금을 찾아드려요"
- Welcome sub: "간단한 정보 4가지만 알려주시면, / 받을 수 있는 정부지원금을 골라드릴게요."
- Home label: "내 조건에 맞는 지원금 **N건**"
- Step4 hint: "마지막이에요! 거의 다 됐어요"
