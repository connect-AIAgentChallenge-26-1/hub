# Shared Domain Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브라우저와 Express 서버가 인사이트와 가져오기 분석의 같은 제품 규칙을 사용하도록 런타임 중립 `@amadda/domain` workspace 패키지를 만들고, 서버 생산 코드의 프론트엔드 FSD 내부 직접 의존을 제거한다.

**Architecture:** 루트 `packages/domain`을 비공개 npm workspace로 추가하고 `@amadda/domain/insight`, `@amadda/domain/insight-import` 두 공개 진입점만 제공한다. 프론트엔드는 기존 `entities/insight`, `features/insight-import` public API를 호환 계층으로 유지하고, 서버와 Supabase Adapter는 패키지 Interface를 직접 사용한다. 데이터베이스 행 변환, React 상태, `File`, UI 색상과 네트워크 오류 변환은 각 Adapter에 남긴다.

**Tech Stack:** TypeScript 6, npm 11 workspaces, Vite 8, Vitest 4, Express 5, Supabase JS 2

---

## 구현 원칙

- 기준 설계는 `docs/superpowers/specs/2026-08-03-shared-domain-modules-design.md`와 GitHub 이슈 #113이다.
- 현재 브랜치 `refactor/113-shared-domain`과 현재 worktree에서만 작업한다.
- `main`과 사용자의 `submit` worktree는 수정하지 않는다.
- 새 패키지는 React, Supabase, Node 전용 모듈을 import하지 않는다.
- `URL`은 브라우저와 Node에 모두 있는 런타임 전역으로 사용하되, DOM 전용 값을 공개 타입으로 노출하지 않는다.
- Supabase의 snake case 행을 camel case 제품 모델로 바꾸는 코드는 Adapter에 남긴다.
- 기존 오류 문자열, 공개 export와 사용자 동작을 바꾸지 않는다.
- 각 Task에서는 해당 변경의 집중 테스트만 실행한다. 별도의 Task별 코드 품질 검토는 하지 않는다.
- 전체 `test`, `lint`, `format:check`, 프로덕션 `build`는 모든 Task가 끝난 뒤 한 번만 실행한다.
- 구현 범위에 `showcase.json`, FSD 제거, 별도 백엔드 저장소, DB/RLS 변경, Notion 전송 계약 통합을 포함하지 않는다.

## 최종 파일 구조

```text
packages/domain/
├── package.json
├── tsconfig.json
└── src/
    ├── insight/
    │   ├── index.ts
    │   ├── insight.test.ts
    │   ├── insight.ts
    │   ├── insight_capture.ts
    │   ├── normalize_insight_url.test.ts
    │   ├── normalize_insight_url.ts
    │   ├── parse_insight.test.ts
    │   └── parse_insight.ts
    └── insight-import/
        ├── index.ts
        ├── import_analysis.test.ts
        ├── import_analysis.ts
        ├── import_limits.ts
        ├── import_types.ts
        ├── import_url.test.ts
        └── import_url.ts
```

## Task 1: npm workspace와 패키지 검증 경계 구성

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`

- [ ] **Step 1: 루트 패키지에 workspace와 공용 패키지 의존을 선언한다.**

`package.json`에 다음 항목을 추가한다. npm은 루트가 같은 버전 범위의 workspace 패키지를 의존하면 레지스트리 대신 로컬 패키지를 연결한다.

```json
{
  "workspaces": ["packages/*"],
  "scripts": {
    "build:web": "npm run typecheck:domain && tsc -b tsconfig.app.json tsconfig.node.json && vite build && tsx scripts/verify_client_bundle.ts dist",
    "typecheck:domain": "tsc -p packages/domain/tsconfig.json",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\" \"server/**/*.ts\" \"api/**/*.ts\" \"extension/**/*.{ts,css,html,md}\" \"packages/**/*.{ts,json}\" \"scripts/**/*.ts\" \"*.{js,ts,json,html}\"",
    "format:check": "prettier --check \"src/**/*.{ts,tsx,css}\" \"server/**/*.ts\" \"api/**/*.ts\" \"extension/**/*.{ts,css,html,md}\" \"packages/**/*.{ts,json}\" \"scripts/**/*.ts\" \"*.{js,ts,json,html}\""
  },
  "dependencies": {
    "@amadda/domain": "^0.1.0"
  }
}
```

기존 script와 dependency는 그대로 두고 표시한 키만 병합한다.

- [ ] **Step 2: 비공개 도메인 패키지 manifest를 만든다.**

`packages/domain/package.json`:

```json
{
  "name": "@amadda/domain",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    "./insight": {
      "types": "./src/insight/index.ts",
      "default": "./src/insight/index.ts"
    },
    "./insight-import": {
      "types": "./src/insight-import/index.ts",
      "default": "./src/insight-import/index.ts"
    }
  }
}
```

패키지 루트 export와 내부 파일 export는 추가하지 않는다.

- [ ] **Step 3: 패키지 전용 TypeScript 검증 설정을 만든다.**

`packages/domain/tsconfig.json`:

```json
{
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleDetection": "force",
    "moduleResolution": "bundler",
    "noEmit": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "strict": true,
    "target": "ES2022",
    "verbatimModuleSyntax": true
  },
  "include": ["src"]
}
```

`DOM` lib는 양쪽 런타임에 존재하는 `URL` 전역의 TypeScript 선언을 얻기 위한 것이며, 패키지 공개 Interface에 `File`, `Document`, `Window` 같은 DOM 전용 타입을 추가하지 않는다.

- [ ] **Step 4: workspace 링크와 lockfile을 갱신한다.**

Run:

```powershell
npm install --ignore-scripts
```

Expected:

- `package-lock.json`에 `packages/domain` workspace가 기록된다.
- `node_modules/@amadda/domain`이 `packages/domain`을 가리킨다.
- 기존 dependency 버전이 의도치 않게 바뀌지 않는다.

- [ ] **Step 5: manifest와 lockfile 변경만 확인한다.**

Run:

```powershell
git diff -- package.json package-lock.json packages/domain/package.json packages/domain/tsconfig.json
npm ls @amadda/domain --depth=0
```

Expected: `@amadda/domain@0.1.0 -> .\packages\domain`이 출력되고 불필요한 의존 변경이 없다.

- [ ] **Step 6: 설정 커밋을 만든다.**

```powershell
git add package.json package-lock.json packages/domain/package.json packages/domain/tsconfig.json
git commit -m "chore: 공용 도메인 workspace 패키지 구성"
```

## Task 2: 인사이트 도메인 Interface와 Implementation 분리

**Files:**

- Create: `packages/domain/src/insight/index.ts`
- Create: `packages/domain/src/insight/insight.ts`
- Create: `packages/domain/src/insight/insight_capture.ts`
- Create: `packages/domain/src/insight/normalize_insight_url.ts`
- Create: `packages/domain/src/insight/parse_insight.ts`
- Create: `packages/domain/src/insight/insight.test.ts`
- Create: `packages/domain/src/insight/normalize_insight_url.test.ts`
- Create: `packages/domain/src/insight/parse_insight.test.ts`

- [ ] **Step 1: 패키지 공개 Interface 테스트를 먼저 작성한다.**

`packages/domain/src/insight/insight.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  INSIGHT_CAPTURE_SOURCES,
  isInsightCaptureSource,
  type Insight,
  type InsightCaptureResult,
} from './index.js';

describe('인사이트 도메인 Interface', () => {
  it('저장 모델과 캡처 성공 결과가 같은 Insight 계약을 사용한다', () => {
    expectTypeOf<
      Extract<InsightCaptureResult, { ok: true }>['insight']
    >().toEqualTypeOf<Insight>();
  });

  it('지원하는 캡처 출처만 허용한다', () => {
    expect(INSIGHT_CAPTURE_SOURCES).toEqual([
      'web',
      'chrome_extension',
      'ios_share',
      'android_share',
    ]);
    expect(isInsightCaptureSource('chrome_extension')).toBe(true);
    expect(isInsightCaptureSource('desktop_share')).toBe(false);
  });
});
```

- [ ] **Step 2: URL 정규화 회귀 테스트를 패키지 가까이 복제한 뒤 실패를 확인한다.**

`src/entities/insight/model/normalize_insight_url.test.ts`의 동작 테스트를 `packages/domain/src/insight/normalize_insight_url.test.ts`에 복제하고 import를 다음처럼 바꾼다. 기존 테스트는 Task 3에서 호환 계약만 남기므로 이 단계에서는 삭제하지 않는다.

```ts
import { describe, expect, it } from 'vitest';

import * as insightApi from './index.js';
```

기존 첫 번째 `entities/insight` public API 노출 테스트는 복제하지 않는다. 아래 케이스를 모두 보존한다.

- HTTP와 HTTPS 성공 계약
- 공백, host, 기본 port, fragment와 root path 정규화
- 추적 query만 제거하고 raw path, backslash, percent encoding 보존
- 단일 slash, 과도한 slash, backslash authority, malformed URL 거부
- 지원하지 않는 protocol 구분

Run:

```powershell
npx vitest run packages/domain/src/insight/insight.test.ts packages/domain/src/insight/normalize_insight_url.test.ts --maxWorkers=2
```

Expected: 공개 파일이 아직 없으므로 module resolution 또는 export 오류로 실패한다.

- [ ] **Step 3: 인사이트와 캡처 계약을 구현한다.**

`packages/domain/src/insight/insight.ts`:

```ts
export type InsightTitleOrigin = 'capture' | 'fallback' | 'metadata' | 'user';

export type Insight = {
  categoryId: string | null;
  createdAt: string;
  domain: string;
  id: string;
  memo: string | null;
  normalizedUrl: string;
  originalUrl: string;
  title: string;
  titleOrigin: InsightTitleOrigin;
  updatedAt: string;
};
```

`packages/domain/src/insight/insight_capture.ts`:

```ts
import type { Insight } from './insight.js';

export const INSIGHT_CAPTURE_SOURCES = [
  'web',
  'chrome_extension',
  'ios_share',
  'android_share',
] as const;

export type InsightCaptureSource = (typeof INSIGHT_CAPTURE_SOURCES)[number];

export type InsightCaptureRequest = {
  source: InsightCaptureSource;
  title?: string;
  url: string;
};

export type InsightCaptureFailureReason =
  | 'invalid-request'
  | 'invalid-url'
  | 'permission-denied'
  | 'unsupported-protocol'
  | 'write-failed';

export type InsightCaptureResult =
  | { created: boolean; insight: Insight; ok: true }
  | { ok: false; reason: InsightCaptureFailureReason };

export type InsightCaptureService = {
  capture(request: InsightCaptureRequest): Promise<InsightCaptureResult>;
};

export function isInsightCaptureSource(
  value: unknown
): value is InsightCaptureSource {
  return (
    typeof value === 'string' &&
    INSIGHT_CAPTURE_SOURCES.some((source) => source === value)
  );
}
```

- [ ] **Step 4: URL 정규화 Implementation을 이동한다.**

`src/entities/insight/model/normalize_insight_url.ts`의 Implementation을 동작 변경 없이 `packages/domain/src/insight/normalize_insight_url.ts`로 옮긴다. 추적 매개변수 목록과 raw URL 보존 알고리즘을 정리하거나 단순화하지 않는다.

- [ ] **Step 5: 인사이트 파서 테스트를 작성한다.**

`packages/domain/src/insight/parse_insight.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { parseInsight, type Insight } from './index.js';

const INSIGHT: Insight = {
  categoryId: '10000000-0000-4000-8000-000000000001',
  createdAt: '2026-07-14T00:00:00.000Z',
  domain: 'example.com',
  id: 'insight-1',
  memo: null,
  normalizedUrl: 'https://example.com/article',
  originalUrl: 'https://example.com/article?utm_source=test',
  title: '테스트 인사이트',
  titleOrigin: 'capture',
  updatedAt: '2026-07-14T00:00:01.000Z',
};

describe('parseInsight', () => {
  it('유효한 제품 모델을 반환한다', () => {
    expect(parseInsight(INSIGHT)).toEqual(INSIGHT);
  });

  it.each([
    { ...INSIGHT, categoryId: 'not-a-uuid' },
    { ...INSIGHT, titleOrigin: 'generated' },
    { ...INSIGHT, normalizedUrl: 'https://other.example/article' },
    { ...INSIGHT, createdAt: '2026-02-30T00:00:00.000Z' },
    {
      ...INSIGHT,
      createdAt: '2026-07-14T00:00:02.000Z',
      updatedAt: '2026-07-14T00:00:01.000Z',
    },
  ])('잘못된 제품 모델을 null로 변환한다', (value) => {
    expect(parseInsight(value)).toBeNull();
  });
});
```

Run:

```powershell
npx vitest run packages/domain/src/insight/parse_insight.test.ts --maxWorkers=2
```

Expected: `parseInsight`가 아직 공개되지 않아 실패한다.

- [ ] **Step 6: 공용 파서와 public entry point를 구현한다.**

`src/entities/insight/model/parse_insight.ts`를 `packages/domain/src/insight/parse_insight.ts`로 이동하되 다음 import만 패키지 내부 경로로 바꾼다.

```ts
import type { Insight } from './insight.js';
import { normalizeInsightUrl } from './normalize_insight_url.js';
```

`packages/domain/src/insight/index.ts`:

```ts
export type { Insight, InsightTitleOrigin } from './insight.js';
export {
  INSIGHT_CAPTURE_SOURCES,
  isInsightCaptureSource,
} from './insight_capture.js';
export type {
  InsightCaptureFailureReason,
  InsightCaptureRequest,
  InsightCaptureResult,
  InsightCaptureService,
  InsightCaptureSource,
} from './insight_capture.js';
export { normalizeInsightUrl } from './normalize_insight_url.js';
export { parseInsight } from './parse_insight.js';
```

- [ ] **Step 7: 패키지 인사이트 집중 검증을 실행한다.**

Run:

```powershell
npm run typecheck:domain
npx vitest run packages/domain/src/insight --maxWorkers=2
```

Expected: 인사이트 패키지 테스트와 타입 검사가 통과한다.

- [ ] **Step 8: 인사이트 도메인 커밋을 만든다.**

```powershell
git add packages/domain/src/insight
git commit -m "refactor: 공용 인사이트 도메인 Module 분리"
```

## Task 3: 프론트엔드 인사이트 public API를 공용 Module에 연결

**Files:**

- Modify: `src/entities/insight/model/insight.ts`
- Modify: `src/entities/insight/model/insight_capture.ts`
- Modify: `src/entities/insight/model/normalize_insight_url.ts`
- Modify: `src/entities/insight/model/parse_insight.ts`
- Modify: `src/entities/insight/model/normalize_insight_url.test.ts`
- Modify: `src/entities/insight/model/insight.test.ts`
- Verify: `src/entities/insight/index.ts`
- Verify: `src/entities/insight/api/supabase_insight_repository.ts`
- Verify: `src/entities/insight/api/browser_insight_capture_service.ts`
- Verify: `src/entities/insight/model/local_storage_insight_repository.ts`

- [ ] **Step 1: FSD 호환 계약 테스트를 별칭 기준으로 바꾼다.**

`src/entities/insight/model/insight.test.ts`의 `Insight` 계약 테스트에 다음 검증을 추가한다.

```ts
import type { CapturedInsight } from './insight_capture';

it('기존 CapturedInsight 이름을 공용 Insight 별칭으로 유지한다', () => {
  expectTypeOf<CapturedInsight>().toEqualTypeOf<Insight>();
});
```

`src/entities/insight/model/normalize_insight_url.test.ts`는 패키지에 옮긴 중복 동작 케이스를 제거하고 다음 public API 호환 테스트만 남긴다.

```ts
import { describe, expect, it } from 'vitest';

import * as insightApi from '../index';

describe('entities/insight public API', () => {
  it('공용 URL 정규화 함수를 기존 진입점으로 공개한다', () => {
    expect(insightApi.normalizeInsightUrl('https://example.com/a')).toEqual({
      domain: 'example.com',
      normalizedUrl: 'https://example.com/a',
      ok: true,
      originalUrl: 'https://example.com/a',
    });
  });
});
```

Run:

```powershell
npx vitest run src/entities/insight/model/insight.test.ts src/entities/insight/model/normalize_insight_url.test.ts --maxWorkers=2
```

Expected: 구조적으로 같던 기존 두 타입의 회귀 계약이 통과한다. 이 Task는 새 동작을 추가하지 않는 호환 리팩터링이므로 이 검증을 기준선으로 사용한다.

- [ ] **Step 2: 프론트엔드의 인사이트 타입을 공용 타입으로 교체한다.**

`src/entities/insight/model/insight.ts`의 로컬 `Insight` 선언을 제거하고 다음처럼 연결한다. `InsightContextInput`, `InsightMutationResult`, `filterInsights`는 현재 파일에 남긴다.

```ts
import type { Insight as DomainInsight } from '@amadda/domain/insight';

import { searchInsights, type SearchInsightsOptions } from './search_insights';

export type { InsightTitleOrigin } from '@amadda/domain/insight';
export type Insight = DomainInsight;
```

`src/entities/insight/model/insight_capture.ts`는 Implementation을 제거하고 다음 호환 export만 둔다.

```ts
import type { Insight } from '@amadda/domain/insight';

export {
  INSIGHT_CAPTURE_SOURCES,
  isInsightCaptureSource,
} from '@amadda/domain/insight';
export type {
  InsightCaptureFailureReason,
  InsightCaptureRequest,
  InsightCaptureResult,
  InsightCaptureService,
  InsightCaptureSource,
  InsightTitleOrigin,
} from '@amadda/domain/insight';

export type CapturedInsight = Insight;
```

- [ ] **Step 3: 기존 내부 경로를 얇은 호환 계층으로 바꾼다.**

`src/entities/insight/model/normalize_insight_url.ts`:

```ts
export { normalizeInsightUrl } from '@amadda/domain/insight';
```

`src/entities/insight/model/parse_insight.ts`:

```ts
export { parseInsight } from '@amadda/domain/insight';
```

기존 `src/entities/insight/index.ts` export는 그대로 유지한다. Supabase, 브라우저 캡처와 Local Storage Adapter도 현재 내부 경로를 유지해 호환 계층을 거치게 한다.

- [ ] **Step 4: 프론트엔드 인사이트 집중 회귀 테스트를 실행한다.**

Run:

```powershell
npx vitest run packages/domain/src/insight src/entities/insight/model/insight.test.ts src/entities/insight/model/normalize_insight_url.test.ts src/entities/insight/api/supabase_insight_repository.test.ts src/entities/insight/api/browser_insight_capture_service.test.ts src/entities/insight/model/local_storage_insight_repository.test.ts --maxWorkers=2
```

Expected: 공용 테스트와 기존 Adapter 회귀 테스트가 통과한다.

- [ ] **Step 5: 프론트엔드 호환 계층 커밋을 만든다.**

```powershell
git add src/entities/insight
git commit -m "refactor: 프론트엔드 인사이트 계약을 공용 Module로 연결"
```

## Task 4: 서버 캡처 Module과 Supabase Adapter의 프론트엔드 의존 제거

**Files:**

- Create: `scripts/server_frontend_dependency_contract.test.ts`
- Modify: `server/app.ts`
- Modify: `server/insight_capture_service.ts`
- Modify: `server/insight_capture_service.test.ts`
- Modify: `server/supabase_insight_capture.ts`
- Verify: `server/app.test.ts`
- Verify: `server/supabase_insight_capture.test.ts`

- [ ] **Step 1: 서버의 `entities` 직접 import를 막는 정적 계약 테스트를 작성한다.**

`scripts/server_frontend_dependency_contract.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const SERVER_DIRECTORY = resolve(process.cwd(), 'server');
const IMPORT_SPECIFIER_PATTERN =
  /(?:from\s+|import\s*\()\s*['\"]([^'\"]+)['\"]/gu;

function listProductionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return listProductionTypeScriptFiles(path);
    }

    return entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts')
      ? [path]
      : [];
  });
}

function findForbiddenImports(forbiddenSegment: string) {
  return listProductionTypeScriptFiles(SERVER_DIRECTORY).flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    const specifiers = [...source.matchAll(IMPORT_SPECIFIER_PATTERN)]
      .map((match) => match[1])
      .filter((specifier): specifier is string => specifier !== undefined)
      .filter((specifier) => specifier.includes(forbiddenSegment));

    return specifiers.map((specifier) => ({
      file: relative(process.cwd(), path).replaceAll('\\', '/'),
      specifier,
    }));
  });
}

describe('서버와 프론트엔드 의존 경계', () => {
  it('서버 생산 코드가 src/entities를 직접 import하지 않는다', () => {
    expect(findForbiddenImports('/src/entities/')).toEqual([]);
  });
});
```

Run:

```powershell
npx vitest run scripts/server_frontend_dependency_contract.test.ts --maxWorkers=2
```

Expected: `server/app.ts`, `server/insight_capture_service.ts`, `server/supabase_insight_capture.ts`가 보고되어 실패한다.

- [ ] **Step 2: 서버 캡처 계약과 URL 규칙 import를 공용 패키지로 바꾼다.**

`server/app.ts`:

```ts
import type { InsightCaptureResult } from '@amadda/domain/insight';
```

`server/insight_capture_service.ts`:

```ts
import {
  isInsightCaptureSource,
  normalizeInsightUrl,
  type Insight,
  type InsightCaptureFailureReason,
  type InsightCaptureRequest,
  type InsightCaptureResult,
  type InsightTitleOrigin,
} from '@amadda/domain/insight';
```

파일 안의 `CapturedInsight` 타입 사용을 `Insight`로 바꾸고 서비스 로직, 길이 제한과 오류 문자열은 변경하지 않는다.

`server/insight_capture_service.test.ts`도 fixture 타입을 다음처럼 바꾼다.

```ts
import type { Insight } from '@amadda/domain/insight';
```

- [ ] **Step 3: 서버 Supabase 행 Adapter가 공용 파서를 사용하게 한다.**

`server/supabase_insight_capture.ts`의 프론트엔드 타입 import와 중복 필드 validator를 제거하고 다음 import를 사용한다.

```ts
import { parseInsight, type Insight } from '@amadda/domain/insight';
```

기존 `parseCapturedInsight`를 Adapter 변환과 공용 검증만 담당하도록 바꾼다.

```ts
function parseCapturedInsight(value: unknown, userId: string): Insight | null {
  if (
    !isRecord(value) ||
    value.user_id !== userId ||
    value.schema_version !== 1
  ) {
    return null;
  }

  return parseInsight({
    categoryId: value.category_id,
    createdAt: value.created_at,
    domain: value.domain,
    id: value.id,
    memo: value.memo,
    normalizedUrl: value.normalized_url,
    originalUrl: value.original_url,
    title: value.title,
    titleOrigin: value.title_origin,
    updatedAt: value.updated_at,
  });
}
```

이 변경 뒤 `hasTextFields`, `isTitleOrigin`, `isNullableString`, `isNullableUuid`를 삭제하고 `isRecord`는 Adapter 행 판별에 유지한다.

- [ ] **Step 4: 서버 캡처와 의존 경계 집중 테스트를 실행한다.**

Run:

```powershell
npx vitest run scripts/server_frontend_dependency_contract.test.ts server/insight_capture_service.test.ts server/supabase_insight_capture.test.ts server/app.test.ts --maxWorkers=2
```

Expected: 캡처 API 상태와 Supabase Adapter 동작이 유지되고 `src/entities` 직접 import가 0개다.

- [ ] **Step 5: 서버 캡처 연결 커밋을 만든다.**

```powershell
git add scripts/server_frontend_dependency_contract.test.ts server/app.ts server/insight_capture_service.ts server/insight_capture_service.test.ts server/supabase_insight_capture.ts
git commit -m "refactor: 서버 캡처 계약을 공용 인사이트 Module로 연결"
```

## Task 5: 가져오기 분석 도메인 Interface와 Implementation 분리

**Files:**

- Create: `packages/domain/src/insight-import/index.ts`
- Create: `packages/domain/src/insight-import/import_types.ts`
- Create: `packages/domain/src/insight-import/import_limits.ts`
- Create: `packages/domain/src/insight-import/import_url.ts`
- Create: `packages/domain/src/insight-import/import_analysis.ts`
- Create: `packages/domain/src/insight-import/import_url.test.ts`
- Create: `packages/domain/src/insight-import/import_analysis.test.ts`

- [ ] **Step 1: 가져오기 URL 테스트를 패키지 가까이 옮기고 실패를 확인한다.**

`src/features/insight-import/model/import_url.test.ts`를 `packages/domain/src/insight-import/import_url.test.ts`에 복제하고 import만 바꾼다. 기존 테스트는 Task 6에서 삭제한다.

```ts
import { analyzeImportUrl } from './index.js';
```

사설 IPv4, IPv6, IPv4-mapped IPv6, 로컬 suffix, 공개 주소와 정규화 성공 케이스를 모두 보존한다.

Run:

```powershell
npx vitest run packages/domain/src/insight-import/import_url.test.ts --maxWorkers=2
```

Expected: 공개 파일이 아직 없어 실패한다.

- [ ] **Step 2: 런타임 중립 가져오기 타입과 제한을 구현한다.**

`packages/domain/src/insight-import/import_types.ts`:

```ts
export type ImportWarningCode =
  'missing-title' | 'trimmed-title' | 'trimmed-memo' | 'ambiguous-field';

export type ImportCandidate = {
  candidateId: string;
  capturedAtCandidate: string | null;
  collectionPath: string[];
  explicitMemoCandidate: string | null;
  originalUrl: string;
  sourceLocation: string;
  titleCandidate: string | null;
  warnings: ImportWarningCode[];
};

export type ImportExclusionCode =
  'invalid-url' | 'unsupported-protocol' | 'private-address' | 'limit-exceeded';

export type AnalyzedImportItem = ImportCandidate & {
  classification: 'candidate' | 'excluded' | 'input_duplicate';
  domain: string | null;
  exclusionCode: ImportExclusionCode | null;
  normalizedUrl: string | null;
};

export type ImportSummary = {
  createdCount: number;
  duplicateCount: number;
  excludedCount: number;
  inputDuplicateCount: number;
  newCount: number;
  totalCount: number;
};
```

`packages/domain/src/insight-import/import_limits.ts`에는 기존 `IMPORT_LIMITS`를 그대로 옮긴다. 파일 크기와 ZIP 제한도 브라우저 Adapter가 같은 Interface를 사용하므로 값 변경 없이 포함한다.

- [ ] **Step 3: 가져오기 URL 분석을 공용 인사이트 URL 규칙에 연결한다.**

`src/features/insight-import/model/import_url.ts`의 Implementation을 `packages/domain/src/insight-import/import_url.ts`로 옮기고 import만 다음처럼 바꾼다.

```ts
import { normalizeInsightUrl } from '../insight/index.js';
```

공용 패키지 내부에서도 `insight-import`가 `insight`에만 의존하며 반대 import를 만들지 않는다.

- [ ] **Step 4: 후보 분석 테스트를 패키지 Interface 기준으로 옮긴다.**

`src/features/insight-import/model/import_analysis.test.ts`에서 붙여넣기 Adapter와 FSD public API에 의존하지 않는 다음 테스트를 `packages/domain/src/insight-import/import_analysis.test.ts`로 옮긴다.

- 정규화 URL 중복 분류와 입력 순서 보존
- 잘못된 URL과 사설 주소 제외
- 제목, 메모, 출처 위치와 컬렉션 깊이 제한
- 경고 중복 제거
- 컬렉션 경로 중복 제거와 최초 순서 보존
- 분석 요약 계산

테스트 fixture는 패키지 `ImportCandidate`만 사용한다.

```ts
import { describe, expect, it } from 'vitest';

import { analyzeImportCandidates, type ImportCandidate } from './index.js';

function createCandidate(
  overrides: Partial<ImportCandidate> = {}
): ImportCandidate {
  return {
    candidateId: 'candidate:0',
    capturedAtCandidate: null,
    collectionPath: [],
    explicitMemoCandidate: null,
    originalUrl: 'https://example.com/a',
    sourceLocation: '1번째 줄',
    titleCandidate: '제목',
    warnings: [],
    ...overrides,
  };
}
```

Run:

```powershell
npx vitest run packages/domain/src/insight-import/import_analysis.test.ts --maxWorkers=2
```

Expected: 분석 함수가 없어 실패한다.

- [ ] **Step 5: 후보 분석 Implementation과 public entry point를 구현한다.**

`src/features/insight-import/model/import_analysis.ts`를 `packages/domain/src/insight-import/import_analysis.ts`로 이동한다. `createCollectionKey`는 공개 Interface로 확장하지 않고 이 파일의 private 함수로 둔다.

```ts
function createCollectionKey(path: readonly string[]) {
  return JSON.stringify(path);
}
```

`packages/domain/src/insight-import/index.ts`:

```ts
export { analyzeImportCandidates } from './import_analysis.js';
export type { ImportAnalysis } from './import_analysis.js';
export { IMPORT_LIMITS } from './import_limits.js';
export type {
  AnalyzedImportItem,
  ImportCandidate,
  ImportExclusionCode,
  ImportSummary,
  ImportWarningCode,
} from './import_types.js';
export { analyzeImportUrl } from './import_url.js';
export type { ImportUrlResult } from './import_url.js';
```

- [ ] **Step 6: 가져오기 도메인 집중 검증을 실행한다.**

Run:

```powershell
npm run typecheck:domain
npx vitest run packages/domain/src/insight packages/domain/src/insight-import --maxWorkers=2
```

Expected: 공용 패키지의 인사이트와 가져오기 분석 테스트가 모두 통과한다.

- [ ] **Step 7: 가져오기 도메인 커밋을 만든다.**

```powershell
git add packages/domain/src/insight-import
git commit -m "refactor: 공용 가져오기 분석 도메인 Module 분리"
```

## Task 6: 프론트엔드 가져오기 public API를 공용 Module에 연결

**Files:**

- Modify: `src/features/insight-import/model/import_types.ts`
- Modify: `src/features/insight-import/model/import_limits.ts`
- Modify: `src/features/insight-import/model/import_url.ts`
- Modify: `src/features/insight-import/model/import_analysis.ts`
- Delete: `src/features/insight-import/model/import_url.test.ts`
- Modify: `src/features/insight-import/model/import_analysis.test.ts`
- Verify: `src/features/insight-import/index.ts`

- [ ] **Step 1: FSD public API 호환 테스트만 기존 위치에 남긴다.**

`src/features/insight-import/model/import_analysis.test.ts`를 다음 계약 테스트로 축소한다.

```ts
import { describe, expect, it } from 'vitest';

import * as insightImportApi from '../index';

describe('features/insight-import public API', () => {
  it('공용 분석 함수와 브라우저 Adapter를 기존 진입점으로 공개한다', () => {
    expect(insightImportApi).toMatchObject({
      analyzeImportCandidates: expect.any(Function),
      analyzeImportUrl: expect.any(Function),
      pastedTextAdapter: expect.any(Object),
    });
  });
});
```

`src/features/insight-import/model/import_url.test.ts`는 패키지로 이동했으므로 삭제한다. 순수 규칙 테스트의 단일 소유자는 `packages/domain`이다.

- [ ] **Step 2: 런타임 중립 타입을 재노출하고 UI 타입은 FSD에 남긴다.**

`src/features/insight-import/model/import_types.ts` 상단에서 공용 타입을 import하고 다시 export한다.

```ts
import type {
  AnalyzedImportItem,
  ImportSummary,
} from '@amadda/domain/insight-import';

import type { CategoryColorKey } from '../../../shared/config/design-system/tokens.js';

export type {
  AnalyzedImportItem,
  ImportCandidate,
  ImportExclusionCode,
  ImportSummary,
  ImportWarningCode,
} from '@amadda/domain/insight-import';
```

현재 파일에서 위 다섯 타입의 로컬 선언만 삭제한다. 다음 항목은 프론트엔드 기능에 유지한다.

- `IMPORT_INPUT_KINDS`, `IMPORT_ADAPTER_KEYS`와 guard
- `ImportInput`의 `File`
- `ImportFieldMapping`, 카테고리 색상과 컬렉션 대상
- `PreparedImport`, 작업 상태, 반영, 이력과 Undo 타입
- 기존 FSD public API인 `createCollectionKey`

- [ ] **Step 3: 기존 내부 경로를 얇은 호환 계층으로 바꾼다.**

`src/features/insight-import/model/import_limits.ts`:

```ts
export { IMPORT_LIMITS } from '@amadda/domain/insight-import';
```

`src/features/insight-import/model/import_url.ts`:

```ts
export { analyzeImportUrl } from '@amadda/domain/insight-import';
export type { ImportUrlResult } from '@amadda/domain/insight-import';
```

`src/features/insight-import/model/import_analysis.ts`:

```ts
export { analyzeImportCandidates } from '@amadda/domain/insight-import';
export type { ImportAnalysis } from '@amadda/domain/insight-import';
```

`src/features/insight-import/index.ts`와 기존 브라우저 Adapter import 경로는 유지해 현재 FSD public API를 보존한다.

- [ ] **Step 4: 브라우저 가져오기 집중 회귀 테스트를 실행한다.**

Run:

```powershell
npx vitest run packages/domain/src/insight-import src/features/insight-import/model/import_analysis.test.ts src/features/insight-import/model/import_types.test.ts src/features/insight-import/model/import_adapter_contract.test.ts src/features/insight-import/model/read_import_file.test.ts src/features/insight-import/model/use_insight_import.test.tsx src/features/insight-import/api/browser_insight_import_service.test.ts --maxWorkers=2
```

Expected: 공용 분석 규칙, FSD public API, 파일 Adapter와 브라우저 서비스 회귀 테스트가 통과한다.

- [ ] **Step 5: 프론트엔드 가져오기 호환 계층 커밋을 만든다.**

```powershell
git add src/features/insight-import
git commit -m "refactor: 프론트엔드 가져오기 분석을 공용 Module로 연결"
```

## Task 7: 서버 Notion 가져오기의 프론트엔드 의존 제거

**Files:**

- Modify: `server/insight_import/notion_candidate_extractor.ts`
- Modify: `server/insight_import/notion_import_service.ts`
- Modify: `scripts/server_frontend_dependency_contract.test.ts`

- [ ] **Step 1: 서버 의존 계약 테스트를 `features`까지 확장하고 실패를 확인한다.**

`scripts/server_frontend_dependency_contract.test.ts`에 다음 테스트를 추가한다.

```ts
it('서버 생산 코드가 src/features를 직접 import하지 않는다', () => {
  expect(findForbiddenImports('/src/features/')).toEqual([]);
});
```

Run:

```powershell
npx vitest run scripts/server_frontend_dependency_contract.test.ts --maxWorkers=2
```

Expected: `notion_candidate_extractor.ts`와 `notion_import_service.ts`가 보고되어 실패한다.

- [ ] **Step 2: Notion 후보와 분석 계약 import를 공용 패키지로 바꾼다.**

`server/insight_import/notion_candidate_extractor.ts`:

```ts
import type { ImportCandidate } from '@amadda/domain/insight-import';
```

`server/insight_import/notion_import_service.ts`:

```ts
import {
  analyzeImportCandidates,
  type AnalyzedImportItem,
} from '@amadda/domain/insight-import';
```

Notion SDK DTO, field mapping, OAuth, cursor와 Supabase 작업 로직은 변경하지 않는다.

- [ ] **Step 3: 서버 가져오기와 의존 경계 집중 테스트를 실행한다.**

Run:

```powershell
npx vitest run scripts/server_frontend_dependency_contract.test.ts server/insight_import/notion_candidate_extractor.test.ts server/insight_import/notion_import_service.test.ts --maxWorkers=2
```

Expected: Notion 후보와 분석 회귀 테스트가 통과하고 서버 생산 코드의 `src/entities`, `src/features` 직접 import가 모두 0개다.

- [ ] **Step 4: 서버 Notion 연결 커밋을 만든다.**

```powershell
git add server/insight_import/notion_candidate_extractor.ts server/insight_import/notion_import_service.ts scripts/server_frontend_dependency_contract.test.ts
git commit -m "refactor: 서버 가져오기 분석을 공용 도메인 Module로 연결"
```

## Task 8: 현재 아키텍처와 기술 스택 문서 갱신

**Files:**

- Modify: `docs/development-architecture.md`
- Modify: `docs/tech-stack.md`
- Do not modify: `docs/superpowers/specs/2026-07-25-universal-insight-import-design.md`

- [ ] **Step 1: 개발 아키텍처에 공용 도메인 경계를 기록한다.**

`docs/development-architecture.md`의 레이어 책임 뒤에 다음 내용을 추가한다.

```md
### 런타임 중립 도메인 Module

`packages/domain`은 프론트엔드 FSD와 Express 서버가 함께 사용하는 제품 규칙을 소유하는 비공개 npm workspace다. 공개 진입점은 `@amadda/domain/insight`와 `@amadda/domain/insight-import`뿐이다.

- `@amadda/domain/insight`는 인사이트 저장 모델, 캡처 계약, URL 정규화와 런타임 파서를 소유한다.
- `@amadda/domain/insight-import`는 표준 후보, URL 안전성 검사, 제한, 중복 분류와 분석 요약을 소유하며 `insight` Module만 의존할 수 있다.
- 도메인 Module은 `src`, `server`, `api`, `extension`, React, Supabase와 Node 전용 모듈을 import하지 않는다.
- `entities/insight`와 `features/insight-import`는 기존 FSD public API를 유지하며 공용 도메인 계약을 재노출한다.
- Supabase 행 변환, 브라우저 파일 입력, 화면 상태와 네트워크 오류 변환은 각 Adapter에 남긴다.
```

`## import 경계`에는 다음 두 규칙을 추가한다.

```md
- 브라우저와 서버가 공유하는 제품 규칙은 `@amadda/domain`의 공개 진입점만 import한다.
- 서버 생산 코드는 `src/entities`와 `src/features` 내부를 직접 import하지 않는다.
```

`## 서버와 저장 경계`의 “인사이트 타입은 entities가 소유한다” 문장은 다음처럼 고친다.

```md
- 인사이트 저장 타입과 캡처 계약은 `@amadda/domain/insight`가 소유한다. 비동기 `InsightRepository` Interface와 표시·검색 책임은 `entities/insight`가 소유한다.
```

- [ ] **Step 2: 기술 스택 문서에 workspace 패키지 사용 상태를 기록한다.**

`docs/tech-stack.md`의 스택 표에 다음 행을 추가한다.

```md
| @amadda/domain | workspace 0.1.0 | 공용 도메인 Module | 사용 중 | 브라우저와 서버가 같은 인사이트·가져오기 제품 규칙을 사용하도록 런타임 중립 Interface를 제공한다. | 프론트엔드 내부 경로 공유, 별도 저장소 | npm 비공개 workspace이며 `insight`, `insight-import` 두 공개 진입점만 사용한다. |
```

`## 현재 런타임과 배포 경계`에 다음 항목을 추가한다.

```md
- 인사이트 저장·캡처와 가져오기 후보 분석의 제품 규칙은 `@amadda/domain` workspace가 소유한다. 브라우저 FSD와 Express 서버는 같은 패키지 Interface를 사용하고 런타임별 Adapter만 각 경계에 둔다.
```

- [ ] **Step 3: 문서 포맷과 설계 일치만 확인한다.**

Run:

```powershell
npx prettier --check docs/development-architecture.md docs/tech-stack.md
git diff --check
```

Expected: 포맷과 whitespace 검사가 통과하고 역사적 설계 문서는 수정되지 않는다.

- [ ] **Step 4: 현재 기준 문서 커밋을 만든다.**

```powershell
git add docs/development-architecture.md docs/tech-stack.md
git commit -m "docs: 공용 도메인 Module 의존 경계 반영"
```

## Task 9: 전체 검증과 Pull Request 준비

**Files:**

- Verify only: 전체 변경 파일

- [ ] **Step 1: 전체 테스트를 한 번 실행한다.**

Run:

```powershell
npm test
```

Expected: 전체 Vitest suite가 통과한다. 실패하면 실패한 범위만 수정하고 관련 집중 테스트를 먼저 재실행한 뒤 전체 테스트는 마지막에 다시 한 번 실행한다.

- [ ] **Step 2: 정적 분석과 포맷 검증을 실행한다.**

Run:

```powershell
npm run lint
npm run format:check
git diff --check main...HEAD
```

Expected: ESLint, Prettier와 whitespace 검사가 모두 통과한다.

- [ ] **Step 3: 웹과 확장 프로덕션 빌드를 실행한다.**

Run:

```powershell
npm run build
```

Expected:

- 도메인 패키지 타입 검사가 먼저 통과한다.
- Vite 웹 빌드와 클라이언트 번들 검증이 통과한다.
- Chrome 확장 타입 검사, 빌드와 번들 검증이 통과한다.
- `@amadda/domain`이 브라우저와 서버 양쪽에서 정상 해석된다.

- [ ] **Step 4: 범위와 커밋 구조를 최종 확인한다.**

Run:

```powershell
git status --short
git diff --stat main...HEAD
git log --oneline main..HEAD
rg -n "src/(entities|features)" server --glob "*.ts" --glob "!*.test.ts"
rg -n "from ['\"](?:@/|.*src/|.*server/|.*api/|.*extension/)" packages/domain --glob "*.ts"
```

Expected:

- 작업 트리가 깨끗하다.
- 계획과 설계, workspace 구성, 두 도메인 Module, 프론트엔드 호환 계층, 서버 연결, 문서만 diff에 있다.
- 서버 생산 코드의 프론트엔드 직접 import 검색 결과가 없다.
- 도메인 패키지의 상위 런타임 import 검색 결과가 없다.
- 커밋이 workspace, 인사이트 도메인, 프론트엔드 인사이트, 서버 캡처, 가져오기 도메인, 프론트엔드 가져오기, 서버 Notion, 문서 단위로 나뉜다.

- [ ] **Step 5: 이슈 체크리스트와 Project 상태를 검증 결과에 맞게 갱신한다.**

GitHub 이슈 #113의 완료 조건을 실제 검증 결과에 맞춰 체크한다. Project #3의 상태는 실제 Status option인 `검토 중`으로 바꾸되, 아직 병합하지 않는다.

Project item `PVTI_lAHOBa_IvM4BdOjvzg0_U4Y`를 다음 명령으로 갱신한다.

```powershell
gh project item-edit --id PVTI_lAHOBa_IvM4BdOjvzg0_U4Y --project-id PVT_kwHOBa_IvM4BdOjv --field-id PVTSSF_lAHOBa_IvM4BdOjvzhXxj3k --single-select-option-id 1f274931
```

실행 전 `gh project view 3 --owner ppre1ude --format json`으로 Project node ID가 `PVT_kwHOBa_IvM4BdOjv`인지 확인한다. 다르면 조회 결과의 ID를 사용한다.

- [ ] **Step 6: 브랜치를 push하고 `main` 기준 Pull Request를 만든다.**

```powershell
git push -u origin refactor/113-shared-domain
$prBody = @'
Closes #113

## 변경 사항

- `@amadda/domain/insight`, `@amadda/domain/insight-import` 공용 경계 추가
- 기존 FSD public API 유지
- 서버 생산 코드의 프론트엔드 내부 import 제거
- Supabase 행 Adapter와 공용 인사이트 파서 연결

## 검증

- `npm test`
- `npm run lint`
- `npm run format:check`
- `npm run build`

## 제외 범위

- FSD 제거와 별도 백엔드 저장소 분리
- Notion 전송 계약과 인증 Module 통합
- 데이터베이스 스키마와 RLS 변경
'@
gh pr create --base main --head refactor/113-shared-domain --title "refactor: 브라우저와 서버의 공용 도메인 Module 분리" --body $prBody
```

PR 본문에는 다음을 포함한다.

- Closes #113
- `@amadda/domain/insight`, `@amadda/domain/insight-import` 경계
- 기존 FSD public API 유지
- 서버 생산 코드의 프론트엔드 내부 import 제거
- 실행한 전체 테스트, 린트, 포맷, 빌드 결과
- 제외 범위와 후속 이슈 후보

자동 병합과 브랜치 삭제는 하지 않는다.
