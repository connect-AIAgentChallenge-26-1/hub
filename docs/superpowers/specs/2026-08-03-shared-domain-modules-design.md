# 런타임 중립 도메인 Module 설계

## 배경

현재 프론트엔드는 FSD 구조를 사용하고 Express 서버는 루트 `server/`에 있다. 이 구분은 유지해야 하지만 서버가 다음 프론트엔드 내부 구현을 직접 가져오고 있다.

- `src/entities/insight`의 캡처 계약과 URL 정규화
- `src/features/insight-import`의 가져오기 후보 타입과 분석 규칙

이 의존 방향 때문에 인사이트 또는 가져오기 규칙을 변경할 때 브라우저와 서버가 같은 계약을 사용하는지 여러 디렉터리를 오가며 확인해야 한다. Notion 가져오기 결과 타입도 서버와 브라우저에 중복 선언되어 있지만, 첫 작업에서 전송 계약까지 모두 통합하면 범위가 지나치게 커진다.

이 설계는 [#113](https://github.com/ppre1ude/hub/issues/113)의 구현 기준이다.

## 목표

모노레포 안에 브라우저와 서버 어느 쪽에도 속하지 않는 런타임 중립 도메인 Module을 만든다. 인사이트와 가져오기 분석의 제품 규칙을 작은 Interface 뒤에 모아 브라우저와 서버 Adapter가 같은 Implementation을 사용하게 한다.

다음 결과를 만든다.

- 프론트엔드 FSD 구조를 유지한다.
- 서버 생산 코드가 `src/entities`와 `src/features` 내부를 직접 가져오지 않는다.
- 인사이트 캡처, URL 정규화와 런타임 검증의 Locality를 확보한다.
- 파일 가져오기와 Notion 가져오기가 같은 후보 분석 규칙을 사용한다.
- 기존 프론트엔드 공개 export와 사용자 동작을 유지한다.

## 선택한 접근

루트 `packages/domain`에 비공개 npm workspace 패키지 `@amadda/domain`을 둔다. 이 패키지는 별도 저장소로 분리하거나 npm에 배포하지 않는다. 웹, 확장, 서버가 하나의 저장소와 릴리스 단위를 유지한 채 같은 소스를 참조한다.

`src/shared/domain`은 사용하지 않는다. FSD `shared`는 제품 고유 개념보다 기반 코드를 위한 계층이며, 이 위치를 사용하면 서버가 계속 프론트엔드 `src` 아래를 의존하게 된다. 루트 `domain/`도 사용하지 않는다. 패키지 Interface와 허용 의존성을 명시하지 않으면 공용 코드가 모이는 디렉터리로 변할 가능성이 크다.

## 디렉터리 구조

```text
packages/domain/
├── package.json
├── tsconfig.json
└── src/
    ├── insight/
    │   ├── index.ts
    │   ├── insight.ts
    │   ├── insight_capture.ts
    │   ├── normalize_insight_url.ts
    │   └── parse_insight.ts
    └── insight-import/
        ├── index.ts
        ├── import_analysis.ts
        ├── import_limits.ts
        ├── import_types.ts
        └── import_url.ts
```

공개 진입점은 `@amadda/domain/insight`와 `@amadda/domain/insight-import` 두 개만 제공한다. 호출자는 내부 파일을 직접 가져오지 않는다. 패키지는 브라우저와 Node 양쪽에서 실행할 수 있도록 React, Supabase, Node 전용 모듈, DOM 전용 타입에 의존하지 않는다.

## 인사이트 Module

### Interface

인사이트 Module의 Interface는 다음 제품 계약을 제공한다.

- 인사이트의 저장 필드와 제목 출처
- 캡처 출처, 요청, 성공 결과와 실패 사유
- 캡처 출처 런타임 판별
- URL 검증·정규화 결과
- 알 수 없는 값을 인사이트로 검증하는 파서

현재 `Insight`와 `CapturedInsight`는 같은 필드를 중복 선언하므로 공용 `Insight`를 기준 타입으로 둔다. 기존 호출부의 호환성을 위해 프론트엔드 `entities/insight`는 `CapturedInsight`를 `Insight`의 별칭으로 계속 재노출한다.

### Implementation

URL 정규화는 현재 추적 매개변수 제거, 프로토콜 제한, 원본 URL 보존과 도메인 추출 규칙을 그대로 이동한다. 런타임 파서는 인사이트 필드, nullable 값과 제목 출처를 한곳에서 검증한다.

Supabase 행 이름을 camel case 제품 모델로 바꾸는 로직은 브라우저와 서버의 Supabase Adapter에 남긴다. Adapter는 변환한 값을 공용 파서 Interface에 전달한다. 데이터베이스 세부사항은 도메인 Module로 들어오지 않고, 최종 제품 모델 검증만 공유한다.

## 가져오기 분석 Module

### Interface

가져오기 분석 Module의 Interface는 다음 계약만 제공한다.

- `ImportCandidate`
- `ImportWarningCode`
- `ImportExclusionCode`
- `AnalyzedImportItem`
- `ImportSummary`
- 후보 URL 검사 결과
- 후보 목록 분석 결과와 분석 함수

`File`, 카테고리 색상, 준비된 가져오기 화면 모델, 이력과 되돌리기 결과는 프론트엔드 기능에 남긴다. 이 타입들은 브라우저 UI와 Supabase 작업 흐름에 결합되어 있어 런타임 중립 Interface에 포함하지 않는다.

### Implementation

후보 분석은 URL 정규화, 제한값 적용, 입력 안의 중복 분류, 경고 정리와 요약 계산을 숨긴다. 브라우저 파일 Adapter와 서버 Notion Adapter는 모두 표준 후보를 만들고 같은 분석 Interface를 호출한다.

가져오기 분석 Module은 인사이트 Module의 URL 정규화 규칙을 사용한다. 반대 방향 의존은 허용하지 않는다.

## 의존 방향

허용하는 방향은 다음과 같다.

```text
src/entities/insight ───────────────┐
src/features/insight-import ────────┼──> @amadda/domain
server/insight_capture_* ───────────┤
server/insight_import/* ────────────┘

@amadda/domain/insight-import ──> @amadda/domain/insight
```

`@amadda/domain`은 `src`, `server`, `api`, `extension`을 가져오지 않는다. 프론트엔드의 기존 공개 진입점은 공용 Module을 재노출해 현재 호출부의 Interface를 유지한다.

## 데이터 흐름

### 인사이트 캡처

1. 브라우저 또는 확장 Adapter가 캡처 요청을 만든다.
2. 서버 캡처 Module이 공용 요청과 URL 규칙을 검증한다.
3. Supabase Adapter가 행을 제품 모델로 변환한다.
4. 공용 인사이트 파서가 변환 결과를 검증한다.
5. 서버와 브라우저는 같은 캡처 결과 계약을 사용한다.

### 가져오기 분석

1. 브라우저 파일 Adapter 또는 서버 Notion Adapter가 `ImportCandidate`를 만든다.
2. 공용 분석 Implementation이 후보를 정리하고 URL을 검증한다.
3. 입력 중복, 제외 사유와 요약을 포함한 분석 결과를 반환한다.
4. 각 호출자는 분석 결과를 자신의 저장 또는 화면 흐름에 연결한다.

## 오류 계약

이번 리팩터링은 오류 종류와 사용자 동작을 바꾸지 않는다.

- 인사이트 캡처 실패 사유 문자열을 유지한다.
- URL의 `invalid-url`과 `unsupported-protocol` 구분을 유지한다.
- 런타임 파서는 잘못된 값을 예외로 노출하지 않고 기존처럼 실패 결과 또는 `null`로 변환한다.
- 가져오기 경고, 제외 사유와 중복 분류 문자열을 유지한다.
- Supabase, Notion과 네트워크 오류 변환은 각 Adapter와 서버 Module에 남긴다.

## 이전 전략

작업은 두 구현 단위로 진행한다.

1. `@amadda/domain/insight`를 구성하고 프론트엔드 공개 export와 서버 캡처 의존을 전환한다.
2. `@amadda/domain/insight-import`를 구성하고 브라우저 가져오기와 서버 Notion 의존을 전환한다.

각 단계에서 기존 공개 export를 먼저 새 Module로 연결한 뒤 내부 중복 Implementation을 제거한다. 중간 커밋에서도 웹과 서버 타입 검사가 가능해야 한다.

## 검증 전략

새 도메인 Module의 Interface를 주요 테스트 표면으로 사용한다.

- URL 정규화와 인사이트 파서 테스트를 `packages/domain` 가까이 둔다.
- 가져오기 URL과 후보 분석 테스트를 `packages/domain` 가까이 둔다.
- 기존 브라우저 캡처, 확장 캡처, 서버 캡처와 Supabase Adapter 테스트를 회귀 테스트로 유지한다.
- 기존 파일 가져오기, Notion 후보 추출과 가져오기 테스트를 회귀 테스트로 유지한다.
- 정적 검증으로 서버 생산 코드의 `src/entities`, `src/features` 직접 import가 없는지 확인한다.
- 구현 중에는 변경 Module과 Adapter에 연결된 테스트만 실행한다.
- PR 직전에 전체 테스트, 린트와 프로덕션 빌드를 한 번 실행한다.

## 문서 변경

현재 기준 문서인 `docs/development-architecture.md`와 `docs/tech-stack.md`에 런타임 중립 도메인 Module의 위치와 의존 방향을 기록한다.

`docs/superpowers/specs/2026-07-25-universal-insight-import-design.md`는 당시 승인된 설계 기록이므로 내용을 덮어쓰지 않는다. 이 문서와 #113이 현재 소유권을 변경한 근거가 된다.

## 제외 범위

- 프론트엔드 FSD 구조 제거 또는 재구성
- 별도 백엔드 저장소 생성
- `@amadda/domain`의 외부 배포
- `server/app.ts` 경로 분리
- Notion 가져오기 대형 Implementation 분해
- 중복된 Notion 전송 결과 타입과 응답 파서 통합
- Supabase 인증과 사용자 클라이언트 생성 통합
- 브라우저와 확장의 모든 응답 파서 통합
- 데이터베이스 스키마, RLS와 사용자 동작 변경

## 후속 후보

이 작업이 끝난 뒤 별도 이슈로 다음 순서를 검토한다.

1. Notion 전송 계약과 런타임 응답 파서 통합
2. 사용자 인증과 Supabase 사용자 클라이언트 Module 정리
3. 도메인별 HTTP 전송 Module 분리
4. Notion 가져오기 내부 Implementation deepening
