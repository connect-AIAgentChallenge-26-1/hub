# AI Agent Challenge 1주차 백엔드 회고 — ShowUp: 노쇼·악성 고객 이력 관리 웹서비스

> **ShowUp**은 소상공인(카페·식당·미용실 사장님)이 노쇼, 폭언, 환불 분쟁 같은 문제 고객의 이력을 기록하고, 예약 전 위험도를 조회해 경고해주는 웹서비스입니다.
>
> 4주간 진행되는 AI Agent Challenge에서 **Hermes Agent 프레임워크 + Ollama Pro 모델** 4세션(리드/프론트엔드/백엔드/보안)으로 협업 개발을 진행하고 있습니다.
>
- 프로젝트 기간: 2026-07-09 ~ 2026-07-30 (16영업일)
- 백엔드: Firebase (Auth / Firestore / Cloud Functions / Hosting)
- 백엔드 세션 모델: Kimi K2.7 Code (Ollama)

이 글에서는 1주차(7/9~7/10) 동안 백엔드 파트에서 구현한 코드를 중심으로, 설계 고민과 학습 포인트를 정리합니다.

---

## 1주차 백엔드 작업 요약

| 작업 | 파일 | 설계 고민 |
|------|------|----------|
| 공유 타입 확정 | `src/types/schema.ts` | Firestore 타입 다루기, 파생 타입 분리 |
| 위험도 계산 로직 | `src/utils/risk.ts` | 순수 함수로 설계, 가중치 기반 점수 모델 |
| 위험도 단위 테스트 | `src/utils/risk.test.ts` | 테이블 드리븐 테스트, 임계점 검증 |
| 전화번호 처리 | `src/utils/phone.ts` | 마스킹, 개인정보 3단계 처리 |
| Firebase 서비스 함수 | `src/services/*.ts` | 서브컬렉션 설계, 비정규화 캐시 |
| 시드 데이터 | `src/seeds/seed.ts` | 데모 데이터 + riskStats 자동 계산 |
| Firestore Security Rules | `firestore.rules` | 가게 격리, ownerUid 검증 |

---

## 1. 공유 타입 설계 — 인터페이스 먼저, 구현 나중

4개 세션이 동시에 작업하는 구조에서, 가장 먼저 확정해야 할 것은 **데이터 모델의 타입**이었습니다. 백엔드가 `schema.ts`를 먼저 정의하면 프론트엔드는 이 타입으로 mock 데이터를 만들어 병행 개발하고, 보안은 이 구조를 기준으로 Security Rules를 작성합니다. 세션 간 대기 시간을 최소화하는 것이 핵심이었습니다.

```typescript
// src/types/schema.ts — 핵심 타입만 발췌 (전체는 GitHub 참고)

export type FirestoreTimestamp = Timestamp | FieldValue;

export interface Customer {
  name: string;
  phone: string;           // 원본. 화면 표시 금지
  phoneLast4: string;      // 검색용 식별자
  createdAt: FirestoreTimestamp;
  riskStats: RiskStats;    // 비정규화 캐시
}
```

### `Timestamp | FieldValue` — 처음에 겪었던 타입 문제

Firestore에서 `createdAt` 필드에 `serverTimestamp()`를 쓰려면, 타입이 `Timestamp`만 허용하면 에러가 납니다. `serverTimestamp()`는 `FieldValue` 타입이기 때문입니다. 처음에는 타입 단언(`as Timestamp`)으로 넘기려 했지만, 그러면 읽기 시점에 `Timestamp`로 들어오는 값과 충돌했습니다.

결국 두 타입의 유니온으로 정의했는데, 이게 Firestore의 "쓰기 시점에는 서버 시간을 아직 모르지만 읽기 시점에는 Timestamp로 변환되어 있다"는 특성을 더 정확하게 표현한다는 걸 깨달았습니다.

```typescript
export type FirestoreTimestamp = Timestamp | FieldValue;
```

### 파생 타입은 저장 타입과 분리

`RiskLevel`이나 `CustomerSearchResult` 같은 파생 타입은 DB에 저장되지 않고, 프론트엔드에서 화면 표시용으로 계산됩니다. 이를 저장 타입과 분리해두니 DB 스키마와 화면 모델의 경계가 명확해졌고, 프론트엔드가 "무엇을 DB에서 가져오고 무엇을 계산해야 하는지" 한눈에 파악할 수 있었습니다.

```typescript
// 파생 타입 — DB에 저장 안 됨, FE에서 계산
export interface CustomerSearchResult {
  id: string;
  name: string;
  phoneMasked: string;  // 010-****-1234
  riskLevel: RiskLevel; // 'low' | 'medium' | 'high'
  alert: boolean;       // 경고 배너 발동 여부
}
```

---

## 2. 위험도 계산 로직 — 순수 함수로 설계하기

ShowUp의 핵심 차별점은 위험도 계산입니다. 이 로직은 **`risk.ts` 파일에만** 존재해야 한다는 규칙을 세웠습니다.

왜 이렇게 했냐면, MVP 단계에서는 Cloud Function 셋업 비용이 크고 클라이언트에서 먼저 동작을 확인해야 했습니다. 그래서 `risk.ts`를 순수 함수로 만들어 클라이언트에서 먼저 사용하고, **이후 같은 파일을 Cloud Function에서 import하는 구조**로 설계했습니다. 현재는 클라이언트 단에서 계산하고 있고, 2주차에 Cloud Function으로 이관할 예정입니다.

```typescript
// src/utils/risk.ts — 가중치와 핵심 계산 흐름만 발췌

export const RISK_WEIGHTS = {
  noShow: 8,
  lateCancel: 4,
  abuse: 10,
  visited: -1,        // 정상 방문 = 점수 회복
  recentNoShow: 5,    // 최근 30일 내 노쇼 가중
} as const;
```

여기서 `as const`를 붙인 건 의도적인 선택이었습니다. 그냥 `const`만 쓰면 TypeScript가 각 속성을 `number`로 추론하는데, `as const`를 붙이면 리터럴 타입(`8`, `-1`)으로 추론되어 실수로 변경할 수 없고 타입 안전성이 올라갑니다.

### 계산 흐름

`calculateRiskStats` 함수는 예약 이력과 사건 이력을 받아서 점수를 계산합니다. 핵심 흐름은 이렇습니다:

1. 예약 상태별 집계 (방문/노쇼/당일취소)
2. 사건 카테고리별 집계 (폭언/분쟁/지각/무리한요구)
3. 점수 = 예약 점수 + 사건 점수 + 최근 노쇼 가중(+5)
4. `Math.max(0, score)` — 점수는 0 이하로 내려가지 않음

전체 구현은 약 70줄인데, 여기서는 핵심만 짚고 전체 코드는 저장소를 참고해주세요.

### 왜 순수 함수로 만들었는가

같은 입력 → 같은 출력, 부작용 없는 순수 함수로 설계한 이유는 세 가지입니다:

1. **테스트하기 쉽다** — DB 연결 없이 입력 데이터만으로 검증 가능
2. **재사용 가능** — 클라이언트에서도, Cloud Function에서도 같은 로직 사용
3. **디버깅이 쉽다** — 외부 상태에 의존하지 않으니 입력만 확인하면 됨

---

## 3. 위험도 등급 + 특별 규칙

### 점수 → 등급 변환

```typescript
export function calculateRiskLevel(score: number): RiskLevel {
  if (score >= 40) return 'high';     // 40+
  if (score >= 24) return 'medium';   // 24+
  return 'low';                        // 0~23
}
```

### "폭언 1회면 최소 주의" — 설계 의도

여기서 중요한 설계 결정이 있습니다. 점수가 10점(안심 범위)이어도, **abuse(폭언) 사건이 1회라도 있으면 최소 '주의' 등급**으로 보장합니다.

```typescript
export function resolveRiskLevel(
  score: number,
  incidentCounts: { abuse: number },
): RiskLevel {
  const base = calculateRiskLevel(score);
  if (incidentCounts.abuse >= 1 && base === 'low') {
    return 'medium';
  }
  return base;
}
```

노쇼와 폭언은 질적으로 다른 사안이라고 판단했습니다. 노쇼는 "안 오는 것"이지만 폭언은 "직원에게 해를 끼치는 것"입니다. 점수가 낮아도 폭언 기록이 있으면 사장님이 주의를 기울여야 한다고 생각했고, 이를 코드로 구현했습니다.

기본 점수 로직(`calculateRiskLevel`)과 예외 규칙(`resolveRiskLevel`)을 분리해둬서, 나중에 다른 예외 규칙이 추가되어도 기본 로직은 수정할 필요가 없습니다.

### `Pick` 유틸리티 타입

```typescript
export function shouldAlert(
  riskStats: Pick<RiskStats, 'noShowCount' | 'incidentCounts'>,
): boolean {
  return riskStats.noShowCount >= 3 || riskStats.incidentCounts.abuse >= 1;
}
```

`Pick`으로 함수가 필요한 필드만 받도록 제한했습니다. 전체 `RiskStats`를 요구하지 않으니 테스트할 때도 최소한의 데이터만 만들면 되고, 함수의 의존성이 명확해집니다.

---

## 4. 단위 테스트 — 임계점을 코드로 증명하기

테스트는 테이블 드리븐 패턴으로 작성했습니다. 케이스 배열을 순회하면서 각각의 `expectedScore`, `expectedLevel`, `expectedAlert`를 검증하는 구조입니다.

```typescript
const cases = [
  { name: '노쇼 3회 (29점 → medium)',  expectedScore: 29, expectedLevel: 'medium', expectedAlert: true  },
  { name: '노쇼 5회 (45점 → high)',    expectedScore: 45, expectedLevel: 'high',   expectedAlert: true  },
  { name: 'abuse 1회 (10점 → medium)', expectedScore: 10, expectedLevel: 'medium', expectedAlert: true  },
  { name: '방문 10회 (0점 → low)',     expectedScore: 0,  expectedLevel: 'low',    expectedAlert: false },
];
```

### 어떤 케이스를 테스트했는가

| 케이스 | 검증 목적 |
|--------|----------|
| 노쇼 3회 (24점) | 주의 등급 진입 임계점 |
| 노쇼 5회 (40점) | 위험 등급 진입 임계점 |
| abuse 1회 (10점) | 특별 규칙: 점수 낮아도 최소 medium |
| 방문 10회 (-10점) | Math.max(0, ...) 최소값 보장 |
| 노쇼 2 + 방문 2 (19점) | 회복 점수가 총점에 미치는 영향 |
| 노쇼 1회 30일 이내 (13점) | 최신성 가중 +5 검증 |

**임계점(boundary)**을 테스트하는 것이 핵심이었습니다. 23→24, 39→40 경계에서 등급이 정확히 바뀌는지 확인했습니다. 특히 `abuse 1회` 케이스는 점수가 10점이라 `low`여야 하지만, 특별 규칙 때문에 `medium`이 되는지 검증하는 게 중요했습니다.

---

## 5. 전화번호 처리 — 개인정보 보호를 코드로 구현하기

```typescript
// src/utils/phone.ts — 핵심 함수만 발췌

/** 화면 표시용 마스킹 — 원본 절대 노출 금지 */
export function maskPhone(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length === 11) return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-***-${digits.slice(-4)}`;
  return `****-${digits.slice(-4)}`;
}

/** 저장용 + 검색용 + 마스킹을 한 번에 */
export function parsePhone(rawPhone: string) {
  const phone = toStoredPhone(rawPhone);  // 검증 포함
  return { phone, phoneLast4: extractPhoneLast4(phone), phoneMasked: maskPhone(phone) };
}
```

### 개인정보 3단계 처리

전화번호는 **3가지 형태**로 존재합니다:

| 형태 | 용도 | 예 |
|------|------|----|
| `phone` (원본) | DB 저장 | `01012345678` |
| `phoneLast4` | 검색 인덱스 | `5678` |
| `phoneMasked` | 화면 표시 | `010-****-5678` |

원본은 DB에 저장되지만 화면에 절대 노출되지 않습니다. **이중 보호**를 적용했습니다 — 클라이언트 마스킹 + Firestore Security Rules로 원본 필드 접근 제한. 둘 중 하나가 뚫려도 다른 하나가 지켜줍니다.

`toStoredPhone`에서는 검증과 변환을 합쳤습니다. 저장 전에 반드시 형식 검증을 거치도록 해서, 잘못된 번호가 DB에 들어가는 것을 코드 레벨에서 차단했습니다.

---

## 6. Firestore 서비스 함수 — 서브컬렉션과 비정규화

### 데이터 모델 구조

```
stores/{storeId}
  ├── customers/{customerId}
  │     ├── riskStats: { score, noShowCount, ... }  ← 비정규화 캐시
  │     └── incidents/{incidentId}
  └── reservations/{resId}
```

### 비정규화 캐시를 선택한 이유

`riskStats`는 원본 데이터(예약, 사건)가 별도 컬렉션에 있음에도 고객 문서 안에 캐시해뒀습니다. 검색할 때마다 예약 30건 + 사건 5건을 읽어서 계산하면 Firestore 읽기 비용이 크기 때문입니다. `riskStats`를 고객 문서에 캐시해두면 **검색 1회 = 읽기 1회**로 비용이 절감됩니다.

다만 캐시이므로 원본 데이터가 바뀔 때 갱신해줘야 합니다. 현재는 클라이언트에서 `refreshCustomerRiskStats`를 호출해서 갱신하고 있고, 이후 Cloud Function 트리거로 자동화할 예정입니다.

### 검색 쿼리 — 이름 + 전화 뒤 4자리 동시 검색

```typescript
// 두 쿼리 병렬 실행 + Map으로 중복 제거 + 위험도 내림차순 정렬
const [nameSnap, last4Snap] = await Promise.all([getDocs(nameQuery), getDocs(last4Query)]);
const results = new Map<string, CustomerSearchResult>();
// ... 위험도 점수 내림차순 정렬 (위험한 고객이 먼저)
```

여기서 몇 가지 고민했던 점들:

- `\uf8ff`를 써서 Firestore prefix 검색을 구현했습니다. `name >= '김' && name <= '김\uf8ff'`는 "김으로 시작하는 모든 이름"을 의미합니다.
- `Promise.all`로 두 쿼리를 병렬 실행했습니다. 직렬로 실행하면 2배 느려집니다.
- `Map`으로 중복 제거 — 이름 검색과 번호 검색 결과가 겹칠 수 있어서 동일한 고객이 두 번 나오는 걸 방지했습니다.
- 위험도 내림차순 정렬 — 사장님이 가장 위험한 고객을 먼저 보도록.

### 당일 취소 자동 판별

예약 상태를 `cancelled`로 변경할 때, 취소 시점이 예약일과 같은 날이면 `cancelledSameDay = true`로 자동 설정합니다. 당일 취소는 노쇼보다 가벼운 페널티(+4점)를 받기 때문에, 이 판별을 상태 전환 시점에 자동으로 처리했습니다. 사용자가 수동으로 체크하지 않아도 되도록 했습니다.

---

## 7. Firestore Security Rules — 서버에서 강제하는 가게 격리

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /stores/{storeId} {
      allow read, write: if
        request.auth != null &&
        resource.data.ownerUid == request.auth.uid;

      match /{document=**} {
        allow read, write: if
          request.auth != null &&
          get(/databases/$(database)/documents/stores/$(storeId))
            .data.ownerUid == request.auth.uid;
      }
    }
  }
}
```

핵심은 **모든 데이터가 가게 단위로 격리**된다는 것입니다. 클라이언트를 신뢰하지 않습니다 — 프론트엔드에서 storeId를 필터링하는 것만으로는 충분하지 않습니다. 악의적인 사용자가 다른 storeId로 쿼리를 날릴 수 있으므로, 서버(규칙) 레벨에서 강제해야 합니다.

### 침투 테스트 시나리오 (현재 설계, 에뮬레이터 테스트 예정)

보안 세션에서 8개 시나리오를 정의했습니다. 현재는 문서로 정의된 상태이고, Firestore 에뮬레이터에서 자동화 테스트로 실행할 예정입니다:

| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | 미인증 상태로 stores 접근 | Permission denied |
| 2 | A사용자가 B가게 데이터 접근 | Permission denied |
| 3 | 위조된 ownerUid로 store 생성 | Permission denied |
| 4 | 허용되지 않은 incident type | Permission denied |
| 5 | 원본 전화번호 클라이언트 노출 | 마스킹만 표시 |
| 6 | 고객 삭제 시 하위 데이터 cascade | 잔여 데이터 0건 |
| 7 | 클라이언트에서 riskStats 직접 수정 | Permission denied |
| 8 | "블랙리스트" 용어 사용 | 코드베이스에서 0건 |

---

## 8. 시드 데이터 — 데모와 테스트를 한 번에

시드 데이터는 두 가지 목적을 동시에 충족합니다:

1. **프론트엔드 mock 데이터** — 백엔드 연동 전에 UI 개발
2. **위험도 계산 검증** — 실제 시나리오(노쇼 3회, 폭언 1회 등)를 시드에 넣고 `riskStats`가 정확히 계산되는지 확인

각 고객이 특정 시나리오를 대표하도록 설계했습니다:

| 고객 | 시나리오 | 기대 등급 |
|------|---------|-----------|
| 김철수 | 노쇼 3회 + abuse 1회 | 주의 (39점) |
| 이영희 | 노쇼 5회 | 위험 (45점) |
| 박준호 | 당일 취소 2회 + 방문 1회 | 안심 (7점) |
| 최수진 | 방문 8회 | 안심 (0점) |
| 정민우 | abuse 1회 | 주의 (10점, 특별 규칙) |

시드 데이터 생성 시 `risk.ts`의 순수 함수를 호출해서 각 고객의 `riskStats`를 자동으로 계산합니다. 테스트에서는 `console.table`로 전체 고객의 위험도를 한눈에 확인하고, `alert` 발동 조건이 정확한지 검증합니다.

---

## 9. AI 에이전트와 협업하며 배운 것

### 5요소 프롬프트 구조

백엔드 작업을 AI 에이전트(Kimi K2.7 Code)에게 지시할 때, 일관된 프롬프트 구조를 사용했습니다:

```
[맥락] React+TS+Vite, Firebase v10 modular. 폴더: src/services, src/utils
[구체성] calculateRiskStats 함수를 src/utils/risk.ts에 작성
[단계화] 이번엔 계산 로직만. Firestore 연동은 다음 단계
[제약] 외부 라이브러리 금지, risk.ts 외 파일 건드리지 마
[검증] 끝나면 엣지케이스 5개 테스트 코드로 확인해줘
```

"계산기 만들어줘"라고만 하면 AI가 방향을 잡지 못하는 걸 미니 미션에서 경험했기 때문에, 이번에는 맥락과 제약을 명확히 주는 방식을 채택했습니다.

### 인터페이스 우선 개발

백엔드가 `schema.ts`를 먼저 확정하니, 프론트엔드가 백엔드 완료를 기다리지 않고 mock 데이터로 개발을 시작할 수 있었습니다:

```
1. BE: schema.ts 확정 (30분)
2. FE: schema.ts 기반 mock 데이터 생성 + UI 개발 시작 (동시 진행)
3. BE: 서비스 함수 구현 (FE와 병행)
4. FE: mock → 실제 Firestore 연동으로 전환
```

이건 1주차에 가장 잘 먹혔던 전략이었습니다. 4개 세션이 각자의 속도로 진행하면서도 인터페이스가 맞아 떨어지니 통합 때 큰 충돌이 없었습니다.

---

## 마무리

1주차 백엔드 작업의 핵심은 **"기반을 탄탄히"** 였습니다.

- 타입 인터페이스를 먼저 확정하여 4개 세션이 같은 기준으로 작업
- 위험도 계산을 순수 함수로 분리하여 테스트 가능하고 재사용 가능하게
- 전화번호 처리로 개인정보 보호를 코드 레벨에서 구현
- Firestore Security Rules로 가게 격리를 서버에서 강제
- 시드 데이터로 실제 시나리오를 코드로 증명

현재 상태는 기반 세팅이 완료된 단계이고, Cloud Function 기반 riskStats 자동 갱신, 침투 테스트 자동화, 인증 연동은 2주차에 진행할 예정입니다.

---

> **ShowUp** — 블랙리스트가 아니라 참고 지표. 최종 판단은 사장님.

---

**참고:** 본 프로젝트의 코드는 Hermes Agent 프레임워크 + Ollama Pro 모델(Kimi K2.7 Code)과 협업하여 작성되었으며, 설계 검토와 방향 수립, 코드 리뷰와 수정은 직접 진행했습니다.