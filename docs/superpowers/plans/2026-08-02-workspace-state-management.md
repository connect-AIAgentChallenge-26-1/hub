# Workspace 상태 관리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 인사이트와 카테고리 서버 상태를 TanStack Query로 옮기고, 화면 사이에 유지할 workspace UI 상태를 scoped Zustand Store로 분리한다.

**Architecture:** 로그인한 workspace가 Query Client와 Zustand Store의 수명 주기 경계가 된다. 기존 `useInsightWorkspace`, `useCategoryWorkspace`의 외부 계약은 유지하되 내부 조회와 mutation 캐시는 TanStack Query가 소유하고, 보관함 및 꺼내보기 입력 상태만 Zustand가 소유한다. Repository, 페이지와 UI 계약은 바꾸지 않는다.

이 구현에서 설계의 "앱 수명 주기"는 로그인한 `AuthenticatedWorkspace`가 마운트된 기간이다. 로그아웃 또는 사용자 교체로 이 경계가 사라지거나 key가 바뀌면 Query Client와 Store 인스턴스를 함께 폐기하므로 이전 사용자 캐시를 별도 전역 객체에 남기지 않는다.

**Tech Stack:** React 19, TypeScript 6, TanStack Query 5, TanStack Query Devtools 5, Zustand 5, Vitest, Testing Library

---

## 범위

이 계획은 [프론트엔드 상태, 라우팅과 폼 아키텍처 설계](../specs/2026-08-02-frontend-state-routing-forms-design.md)의 1단계만 구현한다.

- 포함: Query Provider, query key, 인사이트와 카테고리 Query 및 mutation, scoped Zustand Store, 가져오기 후 재조회, 사용자 scope 분리, 기술 문서 정리
- 제외: React Router, `activeTab` 제거, React Hook Form, Zod schema, 의존성 uninstall, `showcase.json` 수정

## 시작 조건

- 기준 브랜치: 이 계획 문서 커밋까지 포함한 `submit`
- 현재 `C:\hub`의 `package.json`, `package-lock.json` 미커밋 변경과 작업이 섞이지 않도록 격리된 worktree에서 실행한다.
- 코드 수정 전에 루트 `DESIGN.md`와 `docs` 아래 모든 Markdown 문서를 읽는다.
- 기준 전체 테스트에는 이 계획과 무관한 기존 실패 6개가 있다. 변경 범위 테스트는 모두 통과해야 하며 전체 테스트에 새 실패를 추가하지 않는다.

worktree 생성 명령:

```powershell
Set-Location C:\hub
git worktree add .worktrees\workspace-state-management -b codex/workspace-state-management submit
Set-Location C:\hub\.worktrees\workspace-state-management
git status --short --branch
```

예상 결과: `codex/workspace-state-management` 브랜치가 clean 상태이고 이 계획 문서와 승인된 설계 문서를 포함한다. 루트 worktree의 `package.json`, `package-lock.json` 변경은 보이지 않는다.

문서 확인 명령:

```powershell
Get-Content -Raw -Encoding utf8 DESIGN.md
$documents = rg --files docs -g '*.md' | Sort-Object
foreach ($document in $documents) {
  Get-Content -Raw -Encoding utf8 $document
}
```

기준 검사 명령:

```powershell
npx vitest run src/app/model/use_insight_workspace.test.tsx src/app/model/use_category_workspace.test.tsx src/app/authenticated_workspace.test.tsx --maxWorkers=2
npm run build:web
npm run lint
```

예상 결과:

- 두 model Hook 테스트 파일은 통과한다.
- `authenticated_workspace.test.tsx`에는 기준부터 존재한 문구 불일치 1개가 실패한다. `검색 결과 없음` 기대와 현재 제품 문구 `검색 결과 0개`의 차이다.
- `build:web`과 `lint`는 종료 코드 0이다.
- `npm test` 전체 실행은 기존 6개 실패를 별도로 기록한다.

## 파일 구조

### 새 파일

- `src/app/providers/workspace_query_provider.tsx`: Query Client 생성, Provider와 개발 전용 Devtools
- `src/app/providers/workspace_query_provider.test.tsx`: Query 기본값과 Provider 수명 주기 검증
- `src/app/model/workspace_query_keys.ts`: 사용자 scope별 직렬화 가능한 query key 생성
- `src/app/model/workspace_query_keys.test.ts`: query key 구조와 scope 분리 검증
- `src/app/model/workspace_ui_store.tsx`: vanilla Zustand Store, Context Provider와 selector Hook
- `src/app/model/workspace_ui_store.test.tsx`: Store 초기값, action과 Provider 격리 검증

### 수정 파일

- `src/app/model/use_insight_workspace.ts`: 수동 서버 캐시를 Query와 mutation으로 교체
- `src/app/model/use_insight_workspace.test.tsx`: Query Provider와 scope를 사용하는 기존 계약 테스트
- `src/app/model/use_category_workspace.ts`: 수동 서버 캐시를 Query와 mutation으로 교체
- `src/app/model/use_category_workspace.test.tsx`: Query Provider와 scope를 사용하는 기존 계약 테스트
- `src/app/authenticated_workspace.tsx`: Provider 경계, query scope와 Zustand selector 연결
- `src/app/authenticated_workspace.test.tsx`: 화면 이동 뒤 UI 상태 유지와 Store reset 검증
- `docs/development-architecture.md`: Query와 Store의 FSD 책임 기록
- `docs/tech-stack.md`: 실제 사용 상태 정정

## Task 1: Workspace Query 기반 추가

**Files:**

- Create: `src/app/model/workspace_query_keys.ts`
- Create: `src/app/model/workspace_query_keys.test.ts`
- Create: `src/app/providers/workspace_query_provider.tsx`
- Create: `src/app/providers/workspace_query_provider.test.tsx`

- [ ] **Step 1: query key와 Query Client의 실패 테스트 작성**

`src/app/model/workspace_query_keys.test.ts`를 만든다.

```ts
import { describe, expect, it } from 'vitest';

import { workspaceQueryKeys } from './workspace_query_keys';

describe('workspaceQueryKeys', () => {
  it('사용자와 도메인별 직렬화 가능한 키를 만든다', () => {
    expect(workspaceQueryKeys.insights('user-a')).toEqual([
      'workspace',
      'user-a',
      'insights',
    ]);
    expect(workspaceQueryKeys.categories('user-a')).toEqual([
      'workspace',
      'user-a',
      'categories',
    ]);
    expect(workspaceQueryKeys.scope('user-b')).toEqual(['workspace', 'user-b']);
  });
});
```

`src/app/providers/workspace_query_provider.test.tsx`를 만든다.

```tsx
/* @vitest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
  createWorkspaceQueryClient,
  WorkspaceQueryProvider,
} from './workspace_query_provider';

describe('WorkspaceQueryProvider', () => {
  it('명시적인 Query Client를 자식에게 제공한다', () => {
    const client = createWorkspaceQueryClient();
    const view = renderHook(() => useQueryClient(), {
      wrapper: ({ children }) => (
        <WorkspaceQueryProvider client={client}>
          {children}
        </WorkspaceQueryProvider>
      ),
    });

    expect(view.result.current).toBe(client);
    expect(client.getDefaultOptions().queries).toMatchObject({
      refetchOnWindowFocus: false,
      retry: false,
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run:

```powershell
npx vitest run src/app/model/workspace_query_keys.test.ts src/app/providers/workspace_query_provider.test.tsx
```

Expected: 두 모듈이 없어서 FAIL한다.

- [ ] **Step 3: query key 구현**

`src/app/model/workspace_query_keys.ts`를 만든다.

```ts
export const workspaceQueryKeys = {
  all: ['workspace'] as const,
  scope: (scope: string) => ['workspace', scope] as const,
  insights: (scope: string) =>
    [...workspaceQueryKeys.scope(scope), 'insights'] as const,
  categories: (scope: string) =>
    [...workspaceQueryKeys.scope(scope), 'categories'] as const,
  insightMutations: (scope: string) =>
    [...workspaceQueryKeys.insights(scope), 'mutation'] as const,
  categoryMutations: (scope: string) =>
    [...workspaceQueryKeys.categories(scope), 'mutation'] as const,
};
```

- [ ] **Step 4: Query Provider 구현**

`src/app/providers/workspace_query_provider.tsx`를 만든다. 테스트 환경에서는 Devtools를 렌더링하지 않고 개발 빌드에서만 지연 로드한다.

```tsx
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from '@tanstack/react-query';
import { lazy, Suspense, useState, type ReactNode } from 'react';

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(async () => {
      const module = await import('@tanstack/react-query-devtools');
      return { default: module.ReactQueryDevtools };
    })
  : null;

export function createWorkspaceQueryClient(config: QueryClientConfig = {}) {
  return new QueryClient({
    ...config,
    defaultOptions: {
      ...config.defaultOptions,
      queries: {
        refetchOnWindowFocus: false,
        retry: false,
        ...config.defaultOptions?.queries,
      },
    },
  });
}

export type WorkspaceQueryProviderProps = {
  children: ReactNode;
  client?: QueryClient;
};

export function WorkspaceQueryProvider({
  children,
  client,
}: WorkspaceQueryProviderProps) {
  const [defaultClient] = useState(createWorkspaceQueryClient);
  const queryClient = client ?? defaultClient;
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {ReactQueryDevtools && import.meta.env.MODE !== 'test' ? (
        <Suspense fallback={null}>
          <ReactQueryDevtools buttonPosition="bottom-left" />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  );
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run:

```powershell
npx vitest run src/app/model/workspace_query_keys.test.ts src/app/providers/workspace_query_provider.test.tsx
```

Expected: 2개 파일의 모든 테스트 PASS.

- [ ] **Step 6: 커밋**

```powershell
git add src/app/model/workspace_query_keys.ts src/app/model/workspace_query_keys.test.ts src/app/providers/workspace_query_provider.tsx src/app/providers/workspace_query_provider.test.tsx
git commit -m "refactor: 워크스페이스 Query 기반 추가"
```

## Task 2: 인사이트 서버 상태를 TanStack Query로 전환

**Files:**

- Modify: `src/app/model/use_insight_workspace.test.tsx`
- Modify: `src/app/model/use_insight_workspace.ts`

- [ ] **Step 1: Hook 테스트에 Query Provider와 scope 추가**

테스트 import와 helper를 다음처럼 추가한다.

```tsx
import type { PropsWithChildren } from 'react';

import {
  createWorkspaceQueryClient,
  WorkspaceQueryProvider,
} from '../providers/workspace_query_provider';
import {
  useInsightWorkspace,
  type UseInsightWorkspaceOptions,
} from './use_insight_workspace';
import { workspaceQueryKeys } from './workspace_query_keys';

const INSIGHT_QUERY_SCOPE = 'insight-workspace-test';

function createTestQueryClient() {
  return createWorkspaceQueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });
}

function createQueryWrapper(client = createTestQueryClient()) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return (
      <WorkspaceQueryProvider client={client}>
        {children}
      </WorkspaceQueryProvider>
    );
  };
}
```

Query 전환 전에는 실패하는 캐시 소유권 테스트를 추가한다.

```tsx
it('조회 결과를 사용자 scope의 Query 캐시에 저장한다', async () => {
  const restoredInsight = createInsight({ id: 'query-cached' });
  const repository = createRepository({
    list: vi.fn().mockResolvedValue({
      insights: [restoredInsight],
      warnings: [],
    }),
  });
  const client = createTestQueryClient();
  const view = renderHook(
    () =>
      useInsightWorkspace({
        captureService: UNAVAILABLE_CAPTURE_SERVICE,
        queryScope: INSIGHT_QUERY_SCOPE,
        repository,
      }),
    { wrapper: createQueryWrapper(client) }
  );

  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  expect(
    client.getQueryData(workspaceQueryKeys.insights(INSIGHT_QUERY_SCOPE))
  ).toEqual({ insights: [restoredInsight], warnings: [] });
});
```

모든 `useInsightWorkspace` 호출에 `queryScope: INSIGHT_QUERY_SCOPE`를 추가하고 `renderHook`에는 `wrapper: createQueryWrapper()`를 제공한다. `renderReadyWorkspace`는 다음 계약을 사용한다.

```tsx
async function renderReadyWorkspace(
  repository: InsightRepository,
  options: Partial<UseInsightWorkspaceOptions> = {}
) {
  const view = renderHook(
    () =>
      useInsightWorkspace({
        captureService: UNAVAILABLE_CAPTURE_SERVICE,
        queryScope: INSIGHT_QUERY_SCOPE,
        repository,
        ...options,
      }),
    { wrapper: createQueryWrapper() }
  );

  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}
```

저장소 교체 테스트는 repository와 함께 scope도 바꿔야 한다.

```tsx
const { result, rerender } = renderHook(
  ({ queryScope, repository }) =>
    useInsightWorkspace({
      captureService: UNAVAILABLE_CAPTURE_SERVICE,
      queryScope,
      repository,
    }),
  {
    initialProps: { queryScope: 'old-user', repository: oldRepository },
    wrapper: createQueryWrapper(),
  }
);

rerender({ queryScope: 'new-user', repository: newRepository });
```

- [ ] **Step 2: 기존 구현에서 실패 확인**

Run:

```powershell
npx vitest run src/app/model/use_insight_workspace.test.tsx
```

Expected: 기존 Hook이 Query Client에 조회 결과를 기록하지 않으므로 새 캐시 소유권 테스트가 FAIL.

- [ ] **Step 3: 조회 상태를 useQuery로 교체**

`UseInsightWorkspaceOptions`에 `queryScope: string`을 추가한다. 수동 `workspaceState`, `workspaceStateRef`, `loadRevisionRef`, `mountedRef`와 조회 `useEffect`를 제거하고 다음 Query 상태를 사용한다.

```ts
const queryClient = useQueryClient();
const queryKey = workspaceQueryKeys.insights(queryScope);
const insightQuery = useQuery({
  queryKey,
  queryFn: () => loadInsights(repository),
});
const { refetch: refetchInsights } = insightQuery;

const reloadInsights = useCallback(async () => {
  await queryClient.invalidateQueries({
    exact: true,
    queryKey,
    refetchType: 'none',
  });
  await refetchInsights({ cancelRefetch: true });
}, [queryClient, queryKey, refetchInsights]);

function readCurrentState() {
  return (
    queryClient.getQueryData<InsightRepositoryLoadResult>(queryKey) ?? {
      insights: [],
      warnings: [],
    }
  );
}

function writeCurrentState(nextState: InsightRepositoryLoadResult) {
  queryClient.setQueryData(queryKey, nextState);
}
```

import는 다음처럼 바꾼다.

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

import {
  type Insight,
  type InsightCaptureRequest,
  type InsightCaptureService,
  type InsightContextInput,
  type InsightRepository,
  type InsightRepositoryLoadResult,
  type InsightRepositoryWarning,
} from '@/entities/insight';

import { workspaceQueryKeys } from './workspace_query_keys';
```

- [ ] **Step 4: mutation을 Query 캐시 갱신으로 교체**

저장, 수정, 단건 삭제와 일괄 삭제에 각각 `useMutation`을 사용한다. 기존 Repository 호출과 결과 변환 로직은 유지하고 성공 시 `writeCurrentState`로 불변 갱신한다.

공통 동시 실행 방지는 다음 helper로 유지한다. `isMutating`의 화면 값은 네 mutation의 `isPending`을 합쳐 계산한다.

```ts
const mutationInFlightRef = useRef(false);

const runMutation = useCallback(
  async <T>(command: () => Promise<T>, failure: T): Promise<T> => {
    if (
      !insightQuery.isSuccess ||
      insightQuery.isFetching ||
      mutationInFlightRef.current
    ) {
      return failure;
    }

    mutationInFlightRef.current = true;
    try {
      return await command();
    } finally {
      mutationInFlightRef.current = false;
    }
  },
  [insightQuery.isFetching, insightQuery.isSuccess]
);
```

저장 mutation의 형태는 다음과 같다.

```ts
const saveMutation = useMutation({
  mutationKey: workspaceQueryKeys.insightMutations(queryScope),
  mutationFn: async (input: SaveInsightInput | string) => {
    const currentState = readCurrentState();
    const captureResult = await captureService.capture(
      toInsightCaptureRequest(input)
    );

    if (!captureResult.ok) {
      return {
        ok: false,
        reason: toSaveFailureReason(captureResult.reason),
      } as SaveInsightResult;
    }

    writeCurrentState({
      insights: upsertInsight(currentState.insights, captureResult.insight),
      warnings: clearRecoverableWarnings(currentState.warnings),
    });
    return {
      ok: true,
      insightId: captureResult.insight.id,
    } as SaveInsightResult;
  },
});
const { isPending: isSaving, mutateAsync: mutateSave } = saveMutation;

const saveInsight = useCallback(
  (input: SaveInsightInput | string) =>
    runMutation(() => mutateSave(input), { ok: false, reason: 'write-failed' }),
  [mutateSave, runMutation]
);
```

수정과 삭제 mutation도 기존 검증 순서를 보존한다.

```ts
const updateMutation = useMutation({
  mutationKey: workspaceQueryKeys.insightMutations(queryScope),
  mutationFn: async ({
    context,
    insightId,
  }: {
    context: InsightContextInput;
    insightId: string;
  }): Promise<UpdateInsightContextResult> => {
    const currentState = readCurrentState();
    const insightIndex = currentState.insights.findIndex(
      (candidate) => candidate.id === insightId
    );
    const insight = currentState.insights[insightIndex];

    if (!insight) return { ok: false, reason: 'not-found' };

    const normalizedTitle = normalizeOptionalText(context.title);
    const candidate: Insight = {
      ...insight,
      categoryId: context.categoryId,
      memo: normalizeOptionalText(context.memo),
      title: normalizedTitle ?? insight.title,
      titleOrigin: normalizedTitle ? 'user' : insight.titleOrigin,
      updatedAt: getNextUpdatedAt(insight, now()),
    };
    const updateResult = await repository.update(candidate);

    if (!updateResult.ok) {
      return {
        ok: false,
        reason:
          updateResult.reason === 'not-found' ||
          updateResult.reason === 'permission-denied'
            ? updateResult.reason
            : 'write-failed',
      };
    }

    const nextInsights = [...currentState.insights];
    nextInsights[insightIndex] = updateResult.insight;
    writeCurrentState({
      insights: nextInsights,
      warnings: clearRecoverableWarnings(currentState.warnings),
    });
    return { ok: true };
  },
});
const { isPending: isUpdating, mutateAsync: mutateUpdate } = updateMutation;

const updateInsightContext = useCallback(
  (insightId: string, context: InsightContextInput) =>
    runMutation(() => mutateUpdate({ context, insightId }), {
      ok: false,
      reason: 'write-failed',
    }),
  [mutateUpdate, runMutation]
);
```

단건 삭제와 일괄 삭제는 다음처럼 현재 검증 순서와 실패 매핑을 그대로 보존한다.

```ts
const deleteMutation = useMutation({
  mutationKey: workspaceQueryKeys.insightMutations(queryScope),
  mutationFn: async (insightId: string): Promise<DeleteInsightResult> => {
    const currentState = readCurrentState();
    const insightIndex = currentState.insights.findIndex(
      (candidate) => candidate.id === insightId
    );

    if (insightIndex === -1) return { ok: false, reason: 'not-found' };

    const deleteResult = await repository.delete(insightId);
    if (!deleteResult.ok) return deleteResult;

    writeCurrentState({
      insights: currentState.insights.filter(
        (insight) => insight.id !== insightId
      ),
      warnings: clearRecoverableWarnings(currentState.warnings),
    });
    return { ok: true };
  },
});
const { isPending: isDeleting, mutateAsync: mutateDelete } = deleteMutation;

const deleteInsight = useCallback(
  (insightId: string) =>
    runMutation(() => mutateDelete(insightId), {
      ok: false,
      reason: 'write-failed',
    }),
  [mutateDelete, runMutation]
);

const deleteManyMutation = useMutation({
  mutationKey: workspaceQueryKeys.insightMutations(queryScope),
  mutationFn: async (
    insightIds: readonly string[]
  ): Promise<DeleteInsightsResult> => {
    const currentState = readCurrentState();
    const uniqueInsightIds = [...new Set(insightIds)];
    const currentInsightIdSet = new Set(
      currentState.insights.map(({ id }) => id)
    );

    if (
      uniqueInsightIds.length === 0 ||
      uniqueInsightIds.some((id) => !currentInsightIdSet.has(id))
    ) {
      return { ok: false, reason: 'not-found' };
    }

    const deleteResult = await repository.deleteMany(uniqueInsightIds);
    if (!deleteResult.ok) {
      return {
        ok: false,
        reason:
          deleteResult.reason === 'permission-denied' ||
          deleteResult.reason === 'not-found'
            ? deleteResult.reason
            : 'write-failed',
      };
    }

    const deletedIdSet = new Set(deleteResult.deletedIds);
    if (
      deletedIdSet.size !== uniqueInsightIds.length ||
      uniqueInsightIds.some((id) => !deletedIdSet.has(id))
    ) {
      await reloadInsights();
      return { ok: false, reason: 'write-failed' };
    }

    writeCurrentState({
      insights: currentState.insights.filter(({ id }) => !deletedIdSet.has(id)),
      warnings: clearRecoverableWarnings(currentState.warnings),
    });
    return { ok: true };
  },
});
const { isPending: isDeletingMany, mutateAsync: mutateDeleteMany } =
  deleteManyMutation;

const deleteInsights = useCallback(
  (insightIds: readonly string[]) =>
    runMutation(() => mutateDeleteMany(insightIds), {
      ok: false,
      reason: 'write-failed',
    }),
  [mutateDeleteMany, runMutation]
);

const detachCategory = useCallback(
  (categoryId: string) => {
    if (!insightQuery.isSuccess || insightQuery.isFetching) return;

    queryClient.setQueryData<InsightRepositoryLoadResult>(
      queryKey,
      (currentState) =>
        currentState
          ? {
              ...currentState,
              insights: currentState.insights.map((insight) =>
                insight.categoryId === categoryId
                  ? { ...insight, categoryId: null }
                  : insight
              ),
            }
          : currentState
    );
  },
  [insightQuery.isFetching, insightQuery.isSuccess, queryClient, queryKey]
);
```

- [ ] **Step 5: 반환 계약 정리**

Hook 반환은 기존 이름을 유지한다.

```ts
return {
  deleteInsight,
  deleteInsights,
  detachCategory,
  insights: insightQuery.data?.insights ?? [],
  isLoading: insightQuery.isFetching,
  isMutating: isSaving || isUpdating || isDeleting || isDeletingMany,
  loadWarnings: insightQuery.data?.warnings ?? [],
  reloadInsights,
  saveInsight,
  updateInsightContext,
};
```

- [ ] **Step 6: 테스트 통과 확인**

Run:

```powershell
npx vitest run src/app/model/use_insight_workspace.test.tsx
```

Expected: 15개 기존 동작 테스트와 새 캐시 소유권 테스트, 총 16개 PASS.

- [ ] **Step 7: 커밋**

```powershell
git add src/app/model/use_insight_workspace.ts src/app/model/use_insight_workspace.test.tsx
git commit -m "refactor: 인사이트 서버 상태 Query 전환"
```

## Task 3: 카테고리 서버 상태를 TanStack Query로 전환

**Files:**

- Modify: `src/app/model/use_category_workspace.test.tsx`
- Modify: `src/app/model/use_category_workspace.ts`

- [ ] **Step 1: Hook 테스트에 Query Provider와 scope 추가**

카테고리 테스트에 전용 Query Client를 만드는 helper를 추가하고 모든 Hook 호출에 `queryScope: CATEGORY_QUERY_SCOPE`를 전달한다.

```tsx
import type { PropsWithChildren } from 'react';

import {
  createWorkspaceQueryClient,
  WorkspaceQueryProvider,
} from '../providers/workspace_query_provider';
import { workspaceQueryKeys } from './workspace_query_keys';

const CATEGORY_QUERY_SCOPE = 'category-workspace-test';

function createTestQueryClient() {
  return createWorkspaceQueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });
}

function createQueryWrapper(client = createTestQueryClient()) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return (
      <WorkspaceQueryProvider client={client}>
        {children}
      </WorkspaceQueryProvider>
    );
  };
}
```

Query 전환 전에는 실패하는 캐시 소유권 테스트를 추가한다.

```tsx
it('조회 결과를 사용자 scope의 Query 캐시에 저장한다', async () => {
  const restoredCategory = createCategory({ id: 'query-cached' });
  const repository = createRepository({
    list: vi.fn().mockResolvedValue({
      categories: [restoredCategory],
      warnings: [],
    }),
  });
  const client = createTestQueryClient();
  const view = renderHook(
    () =>
      useCategoryWorkspace({
        onCategoryDeleted: vi.fn(),
        queryScope: CATEGORY_QUERY_SCOPE,
        repository,
      }),
    { wrapper: createQueryWrapper(client) }
  );

  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  expect(
    client.getQueryData(workspaceQueryKeys.categories(CATEGORY_QUERY_SCOPE))
  ).toEqual({ categories: [restoredCategory], warnings: [] });
});
```

저장소 교체 테스트는 `old-user`, `new-user` scope를 repository와 함께 바꾼다.

```tsx
const { result, rerender } = renderHook(
  ({ queryScope, repository }) =>
    useCategoryWorkspace({
      onCategoryDeleted,
      queryScope,
      repository,
    }),
  {
    initialProps: { queryScope: 'old-user', repository: oldRepository },
    wrapper: createQueryWrapper(),
  }
);

rerender({ queryScope: 'new-user', repository: newRepository });
```

- [ ] **Step 2: 실패 확인**

Run:

```powershell
npx vitest run src/app/model/use_category_workspace.test.tsx
```

Expected: 기존 Hook이 Query Client에 조회 결과를 기록하지 않으므로 새 캐시 소유권 테스트가 FAIL.

- [ ] **Step 3: 조회 상태를 useQuery로 교체**

`UseCategoryWorkspaceOptions`에 `queryScope: string`을 추가한다. 수동 state, ref와 effect를 제거하고 다음 Query를 사용한다.

```ts
const queryClient = useQueryClient();
const queryKey = workspaceQueryKeys.categories(queryScope);
const categoryQuery = useQuery({
  queryKey,
  queryFn: () => loadCategories(repository),
});
const { refetch: refetchCategories } = categoryQuery;

const reloadCategories = useCallback(async () => {
  await queryClient.invalidateQueries({
    exact: true,
    queryKey,
    refetchType: 'none',
  });
  await refetchCategories({ cancelRefetch: true });
}, [queryClient, queryKey, refetchCategories]);

function readCurrentState(): CategoryRepositoryLoadResult {
  return (
    queryClient.getQueryData<CategoryRepositoryLoadResult>(queryKey) ?? {
      categories: [],
      warnings: [],
    }
  );
}

function writeCurrentState(nextState: CategoryRepositoryLoadResult) {
  queryClient.setQueryData(queryKey, nextState);
}
```

- [ ] **Step 4: 생성, 수정과 삭제 mutation 구현**

각 mutation은 기존 입력 정규화, 중복 이름 검증, `sortOrder` 계산과 Repository 실패 결과를 유지한다. 성공할 때만 Query 캐시를 불변 갱신한다. 모든 mutation은 같은 `workspaceQueryKeys.categoryMutations(queryScope)`를 사용한다. `runMutation`은 조회 성공 전, 재조회 중 또는 다른 mutation 실행 중인 요청을 즉시 거절한다.

```ts
const mutationInFlightRef = useRef(false);

const runMutation = useCallback(
  async <T>(command: () => Promise<T>, failure: T): Promise<T> => {
    if (
      !categoryQuery.isSuccess ||
      categoryQuery.isFetching ||
      mutationInFlightRef.current
    ) {
      return failure;
    }

    mutationInFlightRef.current = true;
    try {
      return await command();
    } finally {
      mutationInFlightRef.current = false;
    }
  },
  [categoryQuery.isFetching, categoryQuery.isSuccess]
);
```

생성 mutation의 핵심 구현:

```ts
const createMutation = useMutation({
  mutationKey: workspaceQueryKeys.categoryMutations(queryScope),
  mutationFn: async (
    input: CategoryInput
  ): Promise<CategoryRepositoryWriteResult> => {
    const currentState = readCurrentState();
    const normalizedInput = normalizeCategoryInput(input);

    if (!normalizedInput) return { ok: false, reason: 'invalid-input' };
    if (hasDuplicateName(currentState.categories, normalizedInput.name)) {
      return { ok: false, reason: 'duplicate' };
    }

    const sortOrder =
      Math.max(
        -1,
        ...currentState.categories.map((category) => category.sortOrder)
      ) + 1;
    const result = await repository.create(normalizedInput, sortOrder);

    if (result.ok) {
      writeCurrentState({
        categories: [...currentState.categories, result.category],
        warnings: currentState.warnings,
      });
    }
    return result;
  },
});
const { isPending: isCreating, mutateAsync: mutateCreate } = createMutation;

const createCategory = useCallback(
  (input: CategoryInput) =>
    runMutation(() => mutateCreate(input), {
      ok: false,
      reason: 'write-failed',
    }),
  [mutateCreate, runMutation]
);
```

수정과 삭제 mutation은 다음 구현으로 기존 검증 순서와 callback 계약을 보존한다.

```ts
const updateMutation = useMutation({
  mutationKey: workspaceQueryKeys.categoryMutations(queryScope),
  mutationFn: async ({
    categoryId,
    input,
  }: {
    categoryId: string;
    input: CategoryInput;
  }): Promise<CategoryRepositoryWriteResult> => {
    const currentState = readCurrentState();
    const categoryIndex = currentState.categories.findIndex(
      (category) => category.id === categoryId
    );

    if (categoryIndex === -1) return { ok: false, reason: 'not-found' };

    const normalizedInput = normalizeCategoryInput(input);
    if (!normalizedInput) return { ok: false, reason: 'invalid-input' };
    if (
      hasDuplicateName(
        currentState.categories,
        normalizedInput.name,
        categoryId
      )
    ) {
      return { ok: false, reason: 'duplicate' };
    }

    const result = await repository.update(categoryId, normalizedInput);
    if (result.ok) {
      const nextCategories = [...currentState.categories];
      nextCategories[categoryIndex] = result.category;
      writeCurrentState({
        categories: nextCategories,
        warnings: currentState.warnings,
      });
    }
    return result;
  },
});
const { isPending: isUpdating, mutateAsync: mutateUpdate } = updateMutation;

const updateCategory = useCallback(
  (categoryId: string, input: CategoryInput) =>
    runMutation(() => mutateUpdate({ categoryId, input }), {
      ok: false,
      reason: 'write-failed',
    }),
  [mutateUpdate, runMutation]
);

const deleteMutation = useMutation({
  mutationKey: workspaceQueryKeys.categoryMutations(queryScope),
  mutationFn: async (
    categoryId: string
  ): Promise<CategoryRepositoryDeleteResult> => {
    const currentState = readCurrentState();
    const categoryIndex = currentState.categories.findIndex(
      (category) => category.id === categoryId
    );

    if (categoryIndex === -1) return { ok: false, reason: 'not-found' };

    const result = await repository.delete(categoryId);
    if (!result.ok) return result;

    writeCurrentState({
      categories: currentState.categories.filter(
        (category) => category.id !== categoryId
      ),
      warnings: currentState.warnings,
    });
    onCategoryDeleted(categoryId);
    return result;
  },
});
const { isPending: isDeleting, mutateAsync: mutateDelete } = deleteMutation;

const deleteCategory = useCallback(
  (categoryId: string) =>
    runMutation(() => mutateDelete(categoryId), {
      ok: false,
      reason: 'write-failed',
    }),
  [mutateDelete, runMutation]
);
```

- [ ] **Step 5: 반환 계약 정리**

```ts
return {
  categories: categoryQuery.data?.categories ?? [],
  createCategory,
  deleteCategory,
  isLoading: categoryQuery.isFetching,
  isMutating: isCreating || isUpdating || isDeleting,
  loadWarnings: categoryQuery.data?.warnings ?? [],
  reloadCategories,
  updateCategory,
};
```

- [ ] **Step 6: 테스트 통과 확인**

Run:

```powershell
npx vitest run src/app/model/use_category_workspace.test.tsx
```

Expected: 7개 기존 동작 테스트와 새 캐시 소유권 테스트, 총 8개 PASS.

- [ ] **Step 7: 커밋**

```powershell
git add src/app/model/use_category_workspace.ts src/app/model/use_category_workspace.test.tsx
git commit -m "refactor: 카테고리 서버 상태 Query 전환"
```

## Task 4: Scoped Zustand Store 추가 및 Workspace 연결

**Files:**

- Create: `src/app/model/workspace_ui_store.tsx`
- Create: `src/app/model/workspace_ui_store.test.tsx`
- Modify: `src/app/authenticated_workspace.tsx`
- Modify: `src/app/authenticated_workspace.test.tsx`

- [ ] **Step 1: Store 단위 실패 테스트 작성**

`src/app/model/workspace_ui_store.test.tsx`를 만든다.

```tsx
/* @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  createWorkspaceUiStore,
  useWorkspaceUiStore,
  WorkspaceUiProvider,
} from './workspace_ui_store';

describe('workspaceUiStore', () => {
  it('보관함과 꺼내보기 UI 상태를 갱신한다', () => {
    const store = createWorkspaceUiStore();

    store.getState().setActiveCategory('category-a');
    store.getState().setGlobalQuery('리액트');
    store.getState().setRetrieveQuery('발표 준비');
    store.getState().setSelectedSituation('발표 준비');

    expect(store.getState()).toMatchObject({
      activeCategory: 'category-a',
      globalQuery: '리액트',
      retrieveQuery: '발표 준비',
      selectedSituation: '발표 준비',
    });
  });

  it('Provider마다 Store를 격리한다', () => {
    const first = renderHook(
      () => ({
        activeCategory: useWorkspaceUiStore((state) => state.activeCategory),
        setActiveCategory: useWorkspaceUiStore(
          (state) => state.setActiveCategory
        ),
      }),
      { wrapper: WorkspaceUiProvider }
    );
    const second = renderHook(
      () => useWorkspaceUiStore((state) => state.activeCategory),
      { wrapper: WorkspaceUiProvider }
    );

    act(() => first.result.current.setActiveCategory('category-a'));

    expect(first.result.current.activeCategory).toBe('category-a');
    expect(second.result.current).toBe('all');
  });
});
```

같은 red 단계에서 `src/app/authenticated_workspace.test.tsx`에 사용자 scope가 바뀌면 UI 상태가 초기화되어야 한다는 통합 테스트를 먼저 추가한다. 현재 local `useState` 구현에서는 검색어가 남으므로 실패한다.

```tsx
it('사용자 scope가 바뀌면 workspace UI 상태를 초기화한다', async () => {
  const user = userEvent.setup();
  const repository = toAsyncRepository(createRepository());
  const view = render(
    <DesignSystemProvider>
      <AuthenticatedWorkspace repository={repository} userId="user-a" />
    </DesignSystemProvider>
  );

  await user.click(screen.getByRole('button', { name: '보관함' }));
  await user.type(
    screen.getByRole('searchbox', { name: '보관함 검색' }),
    '사용자 A 검색'
  );

  view.rerender(
    <DesignSystemProvider>
      <AuthenticatedWorkspace repository={repository} userId="user-b" />
    </DesignSystemProvider>
  );

  await user.click(screen.getByRole('button', { name: '보관함' }));
  expect(screen.getByRole('searchbox', { name: '보관함 검색' })).toHaveValue(
    ''
  );
});
```

- [ ] **Step 2: 실패 확인**

Run:

```powershell
npx vitest run src/app/model/workspace_ui_store.test.tsx src/app/authenticated_workspace.test.tsx --maxWorkers=2
```

Expected: Store 모듈이 없고 기존 workspace가 사용자 변경 뒤 검색어를 유지하므로 FAIL. 기준부터 존재한 `검색 결과 없음` 문구 assertion 실패도 함께 표시된다.

- [ ] **Step 3: scoped Store 구현**

`src/app/model/workspace_ui_store.tsx`를 만든다.

```tsx
import { createContext, useContext, useRef, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

export type WorkspaceUiState = {
  activeCategory: string;
  globalQuery: string;
  retrieveQuery: string;
  selectedSituation: string;
};

type WorkspaceUiActions = {
  setActiveCategory: (activeCategory: string) => void;
  setGlobalQuery: (globalQuery: string) => void;
  setRetrieveQuery: (retrieveQuery: string) => void;
  setSelectedSituation: (selectedSituation: string) => void;
};

type WorkspaceUiStoreState = WorkspaceUiState & WorkspaceUiActions;
export type WorkspaceUiStore = StoreApi<WorkspaceUiStoreState>;

const INITIAL_STATE: WorkspaceUiState = {
  activeCategory: 'all',
  globalQuery: '',
  retrieveQuery: '',
  selectedSituation: '',
};

export function createWorkspaceUiStore() {
  return createStore<WorkspaceUiStoreState>()((set) => ({
    ...INITIAL_STATE,
    setActiveCategory: (activeCategory) => set({ activeCategory }),
    setGlobalQuery: (globalQuery) => set({ globalQuery }),
    setRetrieveQuery: (retrieveQuery) => set({ retrieveQuery }),
    setSelectedSituation: (selectedSituation) => set({ selectedSituation }),
  }));
}

const WorkspaceUiContext = createContext<WorkspaceUiStore | null>(null);

export function WorkspaceUiProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<WorkspaceUiStore | null>(null);
  storeRef.current ??= createWorkspaceUiStore();

  return (
    <WorkspaceUiContext.Provider value={storeRef.current}>
      {children}
    </WorkspaceUiContext.Provider>
  );
}

export function useWorkspaceUiStore<T>(
  selector: (state: WorkspaceUiStoreState) => T
) {
  const store = useContext(WorkspaceUiContext);
  if (!store) {
    throw new Error('WorkspaceUiProvider 안에서 사용해야 합니다.');
  }
  return useStore(store, selector);
}
```

- [ ] **Step 4: Store 테스트 통과 확인**

Run:

```powershell
npx vitest run src/app/model/workspace_ui_store.test.tsx
```

Expected: 모든 Store 테스트 PASS.

- [ ] **Step 5: AuthenticatedWorkspace에 Provider 경계 추가**

현재 `AuthenticatedWorkspace` 함수의 파라미터 구조 분해와 함수 본문을 이름만 `AuthenticatedWorkspaceContent`로 바꿔 그대로 이동한다. 새 export component는 사용자 scope를 계산하고 scope별 Provider를 만든다.

```tsx
import { useCallback, useId, useMemo, useRef, useState } from 'react';

import {
  WorkspaceUiProvider,
  useWorkspaceUiStore,
} from './model/workspace_ui_store';
import { WorkspaceQueryProvider } from './providers/workspace_query_provider';

export function AuthenticatedWorkspace(props: AuthenticatedWorkspaceProps) {
  const generatedScope = useId();
  const queryScope = props.userId ?? `injected-${generatedScope}`;

  return (
    <WorkspaceQueryProvider key={queryScope}>
      <WorkspaceUiProvider>
        <AuthenticatedWorkspaceContent {...props} queryScope={queryScope} />
      </WorkspaceUiProvider>
    </WorkspaceQueryProvider>
  );
}

type AuthenticatedWorkspaceContentProps = AuthenticatedWorkspaceProps & {
  queryScope: string;
};
```

이동한 `AuthenticatedWorkspaceContent`는 기존 11개 prop인 `accountControl`, `captureService`, `categoryRepository`, `importService`, `initialSaveDraft`, `notionImportApi`, `notionImportCallback`, `notionOpenWeb`, `repository`, `retrieveService`, `userId`와 새 `queryScope`를 구조 분해한다. 함수 본문의 state, handler와 JSX는 이 단계에서 의미를 바꾸지 않는다.

두 workspace Hook 호출에 `queryScope`를 전달한다.

```ts
useInsightWorkspace({
  captureService: workspaceCaptureService,
  queryScope,
  repository: workspaceRepository,
});

useCategoryWorkspace({
  onCategoryDeleted: handleCategoryDeleted,
  queryScope,
  repository: workspaceCategoryRepository,
});
```

네 UI state의 `useState`를 selector로 교체한다.

```ts
const activeCategory = useWorkspaceUiStore((state) => state.activeCategory);
const setActiveCategory = useWorkspaceUiStore(
  (state) => state.setActiveCategory
);
const globalQuery = useWorkspaceUiStore((state) => state.globalQuery);
const setGlobalQuery = useWorkspaceUiStore((state) => state.setGlobalQuery);
const retrieveQuery = useWorkspaceUiStore((state) => state.retrieveQuery);
const setRetrieveQuery = useWorkspaceUiStore((state) => state.setRetrieveQuery);
const selectedSituation = useWorkspaceUiStore(
  (state) => state.selectedSituation
);
const setSelectedSituation = useWorkspaceUiStore(
  (state) => state.setSelectedSituation
);
```

`handleCategoryDeleted`의 functional setter는 현재 selector 값을 확인한 뒤 문자열을 넘기는 형태로 바꾸고 dependency도 함께 갱신한다.

```ts
const handleCategoryDeleted = useCallback(
  (categoryId: string) => {
    detachCategory(categoryId);
    if (activeCategory === categoryId) {
      setActiveCategory('all');
    }
    setContextDraft((currentDraft) =>
      currentDraft.categoryId === categoryId
        ? { ...currentDraft, categoryId: null }
        : currentDraft
    );
  },
  [activeCategory, detachCategory, setActiveCategory]
);
```

가져오기 성공 후 Query의 `refetch`가 실행되도록 현재 `InsightImportDialog`의 `onCategoriesChanged={reloadCategories}`와 `onLibraryChanged={reloadInsights}` 연결은 제거하거나 이름을 바꾸지 않는다.

- [ ] **Step 6: 화면 수준 회귀 테스트 추가**

`src/app/authenticated_workspace.test.tsx`에 화면 이동 뒤 상태 유지 테스트를 추가한다.

```tsx
it('화면을 이동해도 보관함 검색 조건과 꺼내보기 입력을 유지한다', async () => {
  const user = userEvent.setup();
  render(
    <DesignSystemProvider>
      <AuthenticatedWorkspace
        repository={toAsyncRepository(createRepository())}
      />
    </DesignSystemProvider>
  );

  await user.click(screen.getByRole('button', { name: '보관함' }));
  await user.type(
    screen.getByRole('searchbox', { name: '보관함 검색' }),
    '리액트'
  );
  await user.click(screen.getByRole('button', { name: '홈' }));
  await user.type(
    screen.getByRole('textbox', { name: '지금 꺼내 보고 싶은 상황' }),
    '발표 준비'
  );
  await user.click(screen.getByRole('button', { name: '보관함' }));

  expect(screen.getByRole('searchbox', { name: '보관함 검색' })).toHaveValue(
    '리액트'
  );
  await user.click(screen.getByRole('button', { name: '홈' }));
  expect(
    screen.getByRole('textbox', { name: '지금 꺼내 보고 싶은 상황' })
  ).toHaveValue('발표 준비');
});
```

Step 1에서 먼저 작성한 사용자 scope reset 테스트는 `key={queryScope}`가 두 Provider와 내부 workspace를 실제로 다시 만드는지 검증한다.

같은 테스트 파일의 기준 실패는 이미 `LibraryPage` 단위 테스트와 화면이 사용하는 현재 문구에 맞춰 다음처럼 정정한다. 제품 문구는 바꾸지 않는다.

```tsx
expect(screen.getByRole('status').textContent).toBe('검색 결과 0개');
```

- [ ] **Step 7: 통합 테스트 실행**

Run:

```powershell
npx vitest run src/app/model/workspace_ui_store.test.tsx src/app/model/use_insight_workspace.test.tsx src/app/model/use_category_workspace.test.tsx src/app/authenticated_workspace.test.tsx --maxWorkers=2
```

Expected: 새 Store 유지 및 reset 테스트와 기존 회귀 테스트를 포함해 대상 테스트 모두 PASS.

- [ ] **Step 8: 커밋**

```powershell
git add src/app/model/workspace_ui_store.tsx src/app/model/workspace_ui_store.test.tsx src/app/authenticated_workspace.tsx src/app/authenticated_workspace.test.tsx
git commit -m "refactor: 워크스페이스 UI 상태 Zustand 전환"
```

## Task 5: 문서 정합화 및 최종 검증

**Files:**

- Modify: `docs/development-architecture.md`
- Modify: `docs/tech-stack.md`

- [ ] **Step 1: 아키텍처 문서 갱신**

`docs/development-architecture.md`의 `app/model`과 레이어 책임에 다음 내용을 반영한다.

```markdown
- 로그인한 workspace는 app 계층의 Query Provider와 scoped Zustand Store를 사용한다.
- 인사이트와 카테고리 서버 상태, mutation 결과와 가져오기 후 재조회는 TanStack Query가 소유한다.
- 보관함 필터와 꺼내보기 입력처럼 화면 이동 뒤 유지할 UI 상태만 Zustand가 소유한다.
- Repository 객체는 query key에 넣지 않고 사용자 scope와 도메인 이름으로 키를 구성한다.
```

- [ ] **Step 2: 기술 스택 사용 상태 정정**

`docs/tech-stack.md`에서 다음 항목을 실제 코드에 맞게 바꾼다.

```text
clsx: 사용 중
lucide-react: 사용 중
Zustand: 사용 중
TanStack Query: 사용 중
TanStack Query Devtools: 사용 중
```

Zustand 메모에는 클라이언트 UI 상태만 소유한다고 기록하고, TanStack Query 메모에는 Supabase Repository의 목록 및 mutation 캐시와 재조회를 소유한다고 기록한다. Devtools는 개발 환경에서만 지연 로드한다고 기록한다.

- [ ] **Step 3: 변경 파일 포맷 검사**

Run:

```powershell
npx prettier --check src/app/model/workspace_query_keys.ts src/app/model/workspace_query_keys.test.ts src/app/model/workspace_ui_store.tsx src/app/model/workspace_ui_store.test.tsx src/app/providers/workspace_query_provider.tsx src/app/providers/workspace_query_provider.test.tsx src/app/model/use_insight_workspace.ts src/app/model/use_insight_workspace.test.tsx src/app/model/use_category_workspace.ts src/app/model/use_category_workspace.test.tsx src/app/authenticated_workspace.tsx src/app/authenticated_workspace.test.tsx docs/development-architecture.md docs/tech-stack.md
```

Expected: 모든 지정 파일이 Prettier 검사 PASS.

- [ ] **Step 4: 관련 테스트, 린트와 빌드 실행**

Run:

```powershell
npx vitest run src/app/model/workspace_query_keys.test.ts src/app/model/workspace_ui_store.test.tsx src/app/providers/workspace_query_provider.test.tsx src/app/model/use_insight_workspace.test.tsx src/app/model/use_category_workspace.test.tsx src/app/authenticated_workspace.test.tsx --maxWorkers=2
npm run lint
npm run build:web
```

Expected:

- 관련 테스트 전부 PASS.
- ESLint 종료 코드 0.
- TypeScript, Vite build와 클라이언트 비밀값 검사 종료 코드 0.

- [ ] **Step 5: 전체 테스트 기준 비교**

Run:

```powershell
npm test
```

Expected: 새 실패가 없다. 이번 단계에서 stale 문구 assertion 1개를 정정했으므로 기존 기준 실패 6개 중 아래 5개만 남는다.

```text
scripts/ux_writing_contract.test.ts 1개
server/supabase_migration_ci.test.ts 4개
```

- [ ] **Step 6: 문서 커밋**

```powershell
git add docs/development-architecture.md docs/tech-stack.md
git commit -m "docs: 프론트엔드 상태 관리 사용 현황 정리"
```

- [ ] **Step 7: 최종 diff 확인**

Run:

```powershell
git status --short
git diff --check HEAD~5..HEAD
git log --oneline -5
```

Expected: 계획 범위 밖 파일이 없고 diff 공백 오류가 없으며 다섯 개 의도적 커밋이 보인다.

## 완료 후 다음 계획

이 계획을 완료하고 검증 결과를 사용자에게 보고한 뒤에만 다음 문서를 작성한다.

1. React Router URL 라우팅 Implementation Plan
2. React Hook Form과 Zod 폼 상태 Implementation Plan

두 후속 계획이 모두 완료되기 전에는 미사용 의존성 uninstall과 `showcase.json` 기술 스택 갱신을 실행하지 않는다.
