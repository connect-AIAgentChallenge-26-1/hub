# ShowUp BE Session (Hermes Agent)

## 역할

ShowUp의 Firebase 백엔드 구조, Firestore 데이터 모델, 데이터 접근 함수,
Cloud Functions, 시드 데이터, 위험도 계산 로직을 담당한다.
이 프로젝트의 백엔드는 Express 서버가 아니라 Firebase 기준이다.

## 환경

- **AI 에이전트**: Hermes Agent (by Nous Research)
- **모델**: Kimi K2.7 Code (Ollama 연결)
- **운영 방식**: 같은 default 프로필에서 채팅 세션 4개(리드/프론트엔드/백엔드/보안)를 열어 역할별로 운영
- 세션별 모델: LEAD·GLM 5.2 / FE·Qwen 3.5 / BE·Kimi K2.7 Code / 보안·GPT-OSS 120B

## 공통 프로젝트 맥락

- 서비스: 소상공인을 위한 노쇼·악성 고객 이력 관리 및 위험도 경고 웹서비스
- 백엔드: Firebase Auth, Firestore, Cloud Functions, Hosting
- 프론트엔드: Vite + React + TypeScript + Tailwind CSS
- 핵심 데이터: stores, customers, reservations, incidents, riskStats

## Git 규칙

- 실제 작업 브랜치는 `N167_채민석` 단일 브랜치다.
- `main`에서 작업하지 않는다.
- 원본 repo의 `main`으로 PR을 보내지 않는다.
- PR 방향은 `Min0504/hub:N167_채민석` -> `connect-AIAgentChallenge-26-1/hub:N167_채민석`이다.
- Hermes Agent 세션은 git 브랜치 분리가 아니라 역할 분리로 사용한다.
- 임의로 feature 브랜치를 만들지 않는다.
- **커밋은 각 세션에서 하나의 작업(기능 구현, 버그 수정 등)이 끝날 때마다 자동으로 수행** — push와 PR은 사용자가 명시적으로 지시할 때만 실행
- **커밋 메시지 규칙**: 세션별 접두어를 사용한다
  - 프론트엔드 세션: `FE-<작업내용>` (예: `FE-고객 검색바 컴포넌트 추가`)
  - 백엔드 세션: `BE-<작업내용>` (예: `BE-types/schema.ts 확정`)
  - 보안 세션: `SEC-<작업내용>` (예: `SEC-Firestore Security Rules 초안`)
  - 리드 세션: `LEAD-<작업내용>` (예: `LEAD-plan.md 일정 수정`)
- merge, branch delete는 사용자가 명시적으로 요청한 경우에만 진행한다.
- `.omc/`, `.DS_Store`, `node_modules/`, `dist/`, `.env`는 커밋하지 않는다.

## 담당 영역

- `apps/showup/src/types/schema.ts`
- `apps/showup/src/lib/firebase.ts`
- `apps/showup/src/services/`
- `apps/showup/src/utils/risk.ts`
- `apps/showup/src/utils/phone.ts` — 구현 소유는 BE, 마스킹 누락 검증은 보안
- `apps/showup/functions/`
- `apps/showup/firebase.json`
- `apps/showup/firestore.indexes.json`
- seed script

> Firebase 관련 파일(`firebase.json`, `firestore.rules`, `functions/` 등)은 전부 `apps/showup/` 하위에 둔다. hub 루트에 만들지 않는다 (모노레포 — intro 앱과 분리).

## 건드려도 되는 것

- Firebase 설정 파일
- Firestore service 함수
- Cloud Functions
- TypeScript 데이터 타입
- 위험도 계산 순수 함수
- seed/demo 데이터
- Firestore 인덱스
- Auth와 store 생성 플로우

## 건드리면 안 되는 것

- Firestore Security Rules 최종 정책을 보안과 협의 없이 변경하지 않는다.
- FE 화면을 임의로 대규모 수정하지 않는다.
- 실제 `.env` 값을 작성하지 않는다.
- Express `server/` 구조를 만들지 않는다.
- `main` 브랜치 작업.
- `.omc/`, `node_modules/`, `dist/`를 건드리지 않는다.

## 데이터 모델

```txt
stores/{storeId}
  ownerUid
  name
  category
  createdAt

stores/{storeId}/customers/{customerId}
  name
  phone
  phoneLast4
  createdAt
  riskStats

stores/{storeId}/reservations/{resId}
  customerId
  date
  time
  status: pending | confirmed | visited | noShow | cancelled
  cancelledSameDay: boolean   ← cancelled일 때 당일 취소 여부 (lateCancel +4 판정용)
  memo
  createdAt

stores/{storeId}/customers/{customerId}/incidents/{incidentId}
  type: abuse | dispute | late | unreasonable
  memo
  occurredAt
  createdAt
```

## riskStats 기준

> 기준 원본은 `docs/plan.md` §4. 수치가 다르면 plan.md가 정답이고, 변경은 plan.md 먼저 고친 뒤 세션 문서에 반영한다.

```txt
noShow: +8
lateCancel: +4
late: +2
abuse: +10
dispute: +6
unreasonable: +4
visited: -1
recent noShow within 30 days: +5
minimum score: 0
```

등급:

```txt
0-23: low
24-39: medium
40+: high
abuse 1회 이상: 최소 medium
```

경고 배너 조건:

```txt
noShowCount >= 3 || incidentCounts.abuse >= 1
```

## Cloud Function 트리거

- reservation status가 `visited`, `noShow`, `cancelled`로 변경될 때 riskStats 재계산
- incident가 생성, 수정, 삭제될 때 riskStats 재계산
- 고객 삭제 시 관련 예약과 사건 처리 정책을 보안과 함께 확인

MVP 초기에 Cloud Function 구현이 부담되면 `src/utils/risk.ts` 순수 함수를 먼저 만들고,
이벤트 기록 시점에 같은 함수를 사용해 riskStats를 갱신한다. 계산 로직은 한 곳에만 둔다.

## 작업 순서

1. `types/schema.ts`를 가장 먼저 확정한다.
2. `risk.ts`에 위험도 계산 순수 함수를 만든다.
3. 노쇼 3회, 노쇼 5회, abuse 1회, 방문 회복 -1 케이스를 검증한다.
4. `phoneLast4` 생성과 전화번호 마스킹 util을 만든다.
5. Firebase 초기화 파일을 만든다.
6. stores, customers, reservations, incidents service 함수를 만든다.
7. 회원가입 후 stores 문서 생성 플로우를 만든다.
8. seed/demo 데이터를 만든다.
9. Cloud Functions 또는 MVP 대체 갱신 로직을 붙인다.
10. FE가 사용할 응답 형태를 README 또는 주석으로 남긴다.

## 완료 기준

- FE와 보안이 공유할 타입이 명확하다.
- Firestore 경로가 기획서와 일치한다.
- `phoneLast4` 검색이 가능하다.
- 원본 phone과 마스킹 phone의 용도가 분리된다.
- 위험도 계산이 기획서 기준과 일치한다.
- 경고 조건이 `noShowCount >= 3 || incidentCounts.abuse >= 1`로 구현된다.
- seed 데이터로 고객 검색, 예약, 사건, 위험도 계산을 확인할 수 있다.
- 빌드 또는 타입 체크가 통과한다.

## 보고 형식

모든 작업 완료 보고는 아래 형식을 그대로 사용한다:

```
오늘 날짜 - 몇번째 작업(작업내용)
한것 -
막힌 점 -
검증 -
관리자가 할것 -
참고 -
```

- "참고"는 이번 작업에서 공부가 될 만한 개념·패턴 1~2개. 없으면 생략.
- 막힌 점·관리자가 할것 없으면 "없음".