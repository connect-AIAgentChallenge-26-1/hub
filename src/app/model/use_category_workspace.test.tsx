/* @vitest-environment jsdom */
import type { PropsWithChildren } from 'react';

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  Category,
  CategoryRepository,
  CategoryRepositoryDeleteResult,
  CategoryRepositoryLoadResult,
  CategoryRepositoryWriteResult,
} from '@/entities/category';

import {
  createWorkspaceQueryClient,
  WorkspaceQueryProvider,
} from '../providers/workspace_query_provider';
import { useCategoryWorkspace } from './use_category_workspace';
import { workspaceQueryKeys } from './workspace_query_keys';

const CATEGORY_QUERY_SCOPE = 'category-workspace-test';

const DEVELOPMENT_CATEGORY = createCategory({
  colorKey: 'green-2',
  id: '10000000-0000-4000-8000-000000000001',
  name: '개발',
  sortOrder: 0,
});
const FRONTEND_CATEGORY = createCategory({
  colorKey: 'blue-2',
  id: DEVELOPMENT_CATEGORY.id,
  name: '프론트엔드',
  sortOrder: 0,
});

describe('useCategoryWorkspace', () => {
  it('생성, 변경, 삭제 성공 결과를 목록에 반영한다', async () => {
    const onCategoryDeleted = vi.fn();
    const create = vi
      .fn<CategoryRepository['create']>()
      .mockResolvedValue({ category: DEVELOPMENT_CATEGORY, ok: true });
    const update = vi
      .fn<CategoryRepository['update']>()
      .mockResolvedValue({ category: FRONTEND_CATEGORY, ok: true });
    const remove = vi
      .fn<CategoryRepository['delete']>()
      .mockResolvedValue({ ok: true });
    const repository = createRepository({ create, delete: remove, update });
    const { result } = await renderReadyWorkspace(
      repository,
      onCategoryDeleted
    );

    await act(async () => {
      await expect(
        result.current.createCategory({
          colorKey: 'green-2',
          name: '  개발  ',
        })
      ).resolves.toEqual({ category: DEVELOPMENT_CATEGORY, ok: true });
    });
    expect(create).toHaveBeenCalledWith(
      { colorKey: 'green-2', name: '개발' },
      0
    );
    await waitFor(() =>
      expect(result.current.categories).toEqual([DEVELOPMENT_CATEGORY])
    );

    await act(async () => {
      await expect(
        result.current.updateCategory(DEVELOPMENT_CATEGORY.id, {
          colorKey: 'blue-2',
          name: ' 프론트엔드 ',
        })
      ).resolves.toEqual({ category: FRONTEND_CATEGORY, ok: true });
    });
    await waitFor(() =>
      expect(result.current.categories).toEqual([FRONTEND_CATEGORY])
    );

    await act(async () => {
      await expect(
        result.current.deleteCategory(FRONTEND_CATEGORY.id)
      ).resolves.toEqual({ ok: true });
    });
    await waitFor(() => expect(result.current.categories).toEqual([]));
    expect(onCategoryDeleted).toHaveBeenCalledWith(FRONTEND_CATEGORY.id);
  });

  it('삭제 후 콜백이 실패해도 성공 결과 계약을 유지한다', async () => {
    const repository = createRepository({
      delete: vi.fn().mockResolvedValue({ ok: true }),
      list: vi.fn().mockResolvedValue({
        categories: [DEVELOPMENT_CATEGORY],
        warnings: [],
      }),
    });
    const { result } = await renderReadyWorkspace(repository, () => {
      throw new Error('콜백 실패');
    });

    await act(async () => {
      await expect(
        result.current.deleteCategory(DEVELOPMENT_CATEGORY.id)
      ).resolves.toEqual({ ok: true });
    });
    await waitFor(() => expect(result.current.categories).toEqual([]));
  });

  it('현재 목록의 최댓값 다음 sortOrder로 생성한다', async () => {
    const create = vi
      .fn<CategoryRepository['create']>()
      .mockResolvedValue({ category: DEVELOPMENT_CATEGORY, ok: true });
    const repository = createRepository({
      create,
      list: vi.fn().mockResolvedValue({
        categories: [
          createCategory({ id: 'category-1', sortOrder: 3 }),
          createCategory({ id: 'category-2', sortOrder: 7 }),
        ],
        warnings: [],
      }),
    });
    const { result } = await renderReadyWorkspace(repository);

    await act(async () => {
      await result.current.createCategory({
        colorKey: 'green-2',
        name: '개발',
      });
    });

    expect(create).toHaveBeenCalledWith(
      { colorKey: 'green-2', name: '개발' },
      8
    );
  });

  it('공백과 대소문자만 다른 중복 생성을 저장소 호출 전에 거절한다', async () => {
    const create = vi.fn<CategoryRepository['create']>();
    const repository = createRepository({
      create,
      list: vi.fn().mockResolvedValue({
        categories: [
          createCategory({
            id: '10000000-0000-4000-8000-000000000010',
            name: 'Design Systems',
          }),
        ],
        warnings: [],
      }),
    });
    const { result } = await renderReadyWorkspace(repository);

    await act(async () => {
      await expect(
        result.current.createCategory({
          colorKey: 'blue-2',
          name: '  design   systems  ',
        })
      ).resolves.toEqual({ ok: false, reason: 'duplicate' });
    });

    expect(create).not.toHaveBeenCalled();
  });

  it('실패 응답에서는 목록을 유지하고 삭제 콜백을 호출하지 않는다', async () => {
    const onCategoryDeleted = vi.fn();
    const repository = createRepository({
      create: vi
        .fn<CategoryRepository['create']>()
        .mockResolvedValue({ ok: false, reason: 'write-failed' }),
      delete: vi
        .fn<CategoryRepository['delete']>()
        .mockResolvedValue({ ok: false, reason: 'write-failed' }),
      list: vi.fn().mockResolvedValue({
        categories: [DEVELOPMENT_CATEGORY],
        warnings: [],
      }),
      update: vi
        .fn<CategoryRepository['update']>()
        .mockResolvedValue({ ok: false, reason: 'write-failed' }),
    });
    const { result } = await renderReadyWorkspace(
      repository,
      onCategoryDeleted
    );

    await act(async () => {
      await expect(
        result.current.createCategory({
          colorKey: 'blue-2',
          name: '새 분류',
        })
      ).resolves.toEqual({ ok: false, reason: 'write-failed' });
      await expect(
        result.current.updateCategory(DEVELOPMENT_CATEGORY.id, {
          colorKey: 'blue-2',
          name: '변경',
        })
      ).resolves.toEqual({ ok: false, reason: 'write-failed' });
      await expect(
        result.current.deleteCategory(DEVELOPMENT_CATEGORY.id)
      ).resolves.toEqual({ ok: false, reason: 'write-failed' });
    });

    expect(result.current.categories).toEqual([DEVELOPMENT_CATEGORY]);
    expect(onCategoryDeleted).not.toHaveBeenCalled();
  });

  it('동시에 두 변경을 실행하지 않는다', async () => {
    const deferred = createDeferred<CategoryRepositoryWriteResult>();
    const create = vi
      .fn<CategoryRepository['create']>()
      .mockReturnValue(deferred.promise);
    const remove = vi.fn<CategoryRepository['delete']>();
    const repository = createRepository({ create, delete: remove });
    const { result } = await renderReadyWorkspace(repository);

    let firstMutation!: Promise<CategoryRepositoryWriteResult>;
    act(() => {
      firstMutation = result.current.createCategory({
        colorKey: 'green-2',
        name: '개발',
      });
    });
    await waitFor(() => expect(result.current.isMutating).toBe(true));

    await act(async () => {
      await expect(
        result.current.deleteCategory(DEVELOPMENT_CATEGORY.id)
      ).resolves.toEqual({ ok: false, reason: 'write-failed' });
    });
    expect(remove).not.toHaveBeenCalled();

    await act(async () => {
      deferred.resolve({ category: DEVELOPMENT_CATEGORY, ok: true });
      await firstMutation;
    });
    await waitFor(() => expect(result.current.isMutating).toBe(false));
  });

  it.each([
    { mutationKind: 'create', mutationLabel: '생성' },
    { mutationKind: 'update', mutationLabel: '수정' },
    { mutationKind: 'delete', mutationLabel: '삭제' },
  ] as const)(
    '$mutationLabel mutation 중 요청한 재조회를 종료 뒤 한 번 실행한다',
    async ({ mutationKind }) => {
      const existingCategory = createCategory({ id: 'existing-category' });
      const createdCategory = createCategory({
        id: 'created-category',
        name: '새 카테고리',
      });
      const updatedCategory = createCategory({
        id: existingCategory.id,
        name: '수정된 카테고리',
      });
      const canonicalCategory = createCategory({ id: 'canonical-category' });
      const callOrder: string[] = [];
      const pendingCreate =
        createDeferred<Awaited<ReturnType<CategoryRepository['create']>>>();
      const pendingUpdate =
        createDeferred<Awaited<ReturnType<CategoryRepository['update']>>>();
      const pendingDelete =
        createDeferred<Awaited<ReturnType<CategoryRepository['delete']>>>();
      const list = vi
        .fn<CategoryRepository['list']>()
        .mockImplementationOnce(async () => {
          callOrder.push('list:initial');
          return {
            categories: [existingCategory],
            warnings: [],
          };
        })
        .mockImplementationOnce(async () => {
          callOrder.push('list:canonical');
          return {
            categories: [canonicalCategory],
            warnings: [],
          };
        });
      const repository = createRepository({
        create: vi.fn(() => {
          callOrder.push('mutation:start');
          return pendingCreate.promise.then((result) => {
            callOrder.push('mutation:end');
            return result;
          });
        }),
        delete: vi.fn(() => {
          callOrder.push('mutation:start');
          return pendingDelete.promise.then((result) => {
            callOrder.push('mutation:end');
            return result;
          });
        }),
        list,
        update: vi.fn(() => {
          callOrder.push('mutation:start');
          return pendingUpdate.promise.then((result) => {
            callOrder.push('mutation:end');
            return result;
          });
        }),
      });
      const { result } = await renderReadyWorkspace(repository);
      let mutationRequest!: Promise<
        CategoryRepositoryDeleteResult | CategoryRepositoryWriteResult
      >;
      let reloadRequest!: Promise<void>;

      act(() => {
        if (mutationKind === 'create') {
          mutationRequest = result.current.createCategory({
            colorKey: createdCategory.colorKey,
            name: createdCategory.name,
          });
        } else if (mutationKind === 'update') {
          mutationRequest = result.current.updateCategory(existingCategory.id, {
            colorKey: updatedCategory.colorKey,
            name: updatedCategory.name,
          });
        } else {
          mutationRequest = result.current.deleteCategory(existingCategory.id);
        }
      });
      await waitFor(() => expect(result.current.isMutating).toBe(true));

      act(() => {
        reloadRequest = result.current.reloadCategories();
      });
      expect(list).toHaveBeenCalledOnce();
      expect(callOrder).toEqual(['list:initial', 'mutation:start']);

      await act(async () => {
        if (mutationKind === 'create') {
          pendingCreate.resolve({ category: createdCategory, ok: true });
          await expect(mutationRequest).resolves.toEqual({
            category: createdCategory,
            ok: true,
          });
        } else if (mutationKind === 'update') {
          pendingUpdate.resolve({ category: updatedCategory, ok: true });
          await expect(mutationRequest).resolves.toEqual({
            category: updatedCategory,
            ok: true,
          });
        } else {
          pendingDelete.resolve({ ok: true });
          await expect(mutationRequest).resolves.toEqual({ ok: true });
        }
        await reloadRequest;
      });

      expect(list).toHaveBeenCalledTimes(2);
      expect(callOrder).toEqual([
        'list:initial',
        'mutation:start',
        'mutation:end',
        'list:canonical',
      ]);
      await waitFor(() =>
        expect(result.current.categories).toEqual([canonicalCategory])
      );
    }
  );

  it('재조회가 진행 중이면 mutation을 즉시 거절한다', async () => {
    const pendingReload =
      createDeferred<Awaited<ReturnType<CategoryRepository['list']>>>();
    const create = vi
      .fn<CategoryRepository['create']>()
      .mockResolvedValue({ category: DEVELOPMENT_CATEGORY, ok: true });
    const list = vi
      .fn<CategoryRepository['list']>()
      .mockResolvedValueOnce({ categories: [], warnings: [] })
      .mockReturnValueOnce(pendingReload.promise);
    const { result } = await renderReadyWorkspace(
      createRepository({ create, list })
    );
    let reloadRequest!: Promise<void>;
    let mutationRequest!: Promise<CategoryRepositoryWriteResult>;

    act(() => {
      reloadRequest = result.current.reloadCategories();
      mutationRequest = result.current.createCategory({
        colorKey: 'green-2',
        name: '개발',
      });
    });

    await expect(mutationRequest).resolves.toEqual({
      ok: false,
      reason: 'write-failed',
    });
    expect(create).not.toHaveBeenCalled();

    await act(async () => {
      pendingReload.resolve({ categories: [], warnings: [] });
      await reloadRequest;
    });
  });

  it('생성 성공 시 mutation 중 외부에서 추가된 cache 항목을 보존한다', async () => {
    const createdCategory = createCategory({ id: 'created-category' });
    const externalCategory = createCategory({ id: 'external-category' });
    const pendingCreate =
      createDeferred<Awaited<ReturnType<CategoryRepository['create']>>>();
    const repository = createRepository({
      create: vi.fn(() => pendingCreate.promise),
    });
    const client = createTestQueryClient();
    const { result } = renderHook(
      () =>
        useCategoryWorkspace({
          onCategoryDeleted: vi.fn(),
          queryScope: CATEGORY_QUERY_SCOPE,
          repository,
        }),
      { wrapper: createQueryWrapper(client) }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let createRequest!: Promise<CategoryRepositoryWriteResult>;

    act(() => {
      createRequest = result.current.createCategory({
        colorKey: createdCategory.colorKey,
        name: createdCategory.name,
      });
    });
    await waitFor(() => expect(result.current.isMutating).toBe(true));

    act(() => {
      client.setQueryData<CategoryRepositoryLoadResult>(
        workspaceQueryKeys.categories(CATEGORY_QUERY_SCOPE),
        { categories: [externalCategory], warnings: [] }
      );
    });
    await waitFor(() =>
      expect(result.current.categories).toEqual([externalCategory])
    );

    await act(async () => {
      pendingCreate.resolve({ category: createdCategory, ok: true });
      await expect(createRequest).resolves.toEqual({
        category: createdCategory,
        ok: true,
      });
    });

    await waitFor(() =>
      expect(result.current.categories).toEqual([
        externalCategory,
        createdCategory,
      ])
    );
  });

  it('재조회는 가장 늦게 시작한 요청 결과만 반영한다', async () => {
    const firstReload =
      createDeferred<Awaited<ReturnType<CategoryRepository['list']>>>();
    const secondReload =
      createDeferred<Awaited<ReturnType<CategoryRepository['list']>>>();
    const latestCategory = createCategory({
      id: 'latest-category',
      name: '최신 분류',
    });
    const list = vi
      .fn<CategoryRepository['list']>()
      .mockResolvedValueOnce({
        categories: [DEVELOPMENT_CATEGORY],
        warnings: [],
      })
      .mockReturnValueOnce(firstReload.promise)
      .mockReturnValueOnce(secondReload.promise);
    const repository = createRepository({ list });
    const { result } = await renderReadyWorkspace(repository);
    let firstRequest!: Promise<void>;
    let secondRequest!: Promise<void>;

    act(() => {
      firstRequest = result.current.reloadCategories();
      secondRequest = result.current.reloadCategories();
    });

    await act(async () => {
      secondReload.resolve({
        categories: [latestCategory],
        warnings: [],
      });
      await secondRequest;
    });
    await waitFor(() =>
      expect(result.current.categories).toEqual([latestCategory])
    );

    await act(async () => {
      firstReload.resolve({
        categories: [FRONTEND_CATEGORY],
        warnings: [],
      });
      await firstRequest;
    });

    expect(result.current.categories).toEqual([latestCategory]);
    expect(list).toHaveBeenCalledTimes(3);
  });

  it('같은 scope에서 저장소가 바뀌면 이전 지연 응답을 무시하고 새 목록만 반영한다', async () => {
    const oldList =
      createDeferred<Awaited<ReturnType<CategoryRepository['list']>>>();
    const oldRepository = createRepository({
      list: vi.fn(() => oldList.promise),
    });
    const newCategory = createCategory({ id: 'new-category', name: '새 목록' });
    const newRepository = createRepository({
      list: vi.fn().mockResolvedValue({
        categories: [newCategory],
        warnings: [],
      }),
    });
    const onCategoryDeleted = vi.fn();
    const { result, rerender } = renderHook(
      ({ repository }) =>
        useCategoryWorkspace({
          onCategoryDeleted,
          queryScope: CATEGORY_QUERY_SCOPE,
          repository,
        }),
      {
        initialProps: { repository: oldRepository },
        wrapper: createQueryWrapper(),
      }
    );

    rerender({ repository: newRepository });
    await waitFor(() => expect(newRepository.list).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(result.current.categories).toEqual([newCategory])
    );

    await act(async () => {
      oldList.resolve({
        categories: [DEVELOPMENT_CATEGORY],
        warnings: [],
      });
      await oldList.promise;
    });

    expect(result.current.categories).toEqual([newCategory]);
  });

  it('이전 저장소에서 시작한 mutation 응답을 같은 scope의 새 cache에 쓰지 않는다', async () => {
    const oldCategory = createCategory({ id: 'old-category' });
    const updatedOldCategory = createCategory({
      id: oldCategory.id,
      name: '이전 저장소 수정',
    });
    const newCategory = createCategory({ id: 'new-category' });
    const pendingUpdate =
      createDeferred<Awaited<ReturnType<CategoryRepository['update']>>>();
    const oldRepository = createRepository({
      list: vi.fn().mockResolvedValue({
        categories: [oldCategory],
        warnings: [],
      }),
      update: vi.fn(() => pendingUpdate.promise),
    });
    const newRepository = createRepository({
      list: vi.fn().mockResolvedValue({
        categories: [newCategory],
        warnings: [],
      }),
    });
    const { result, rerender } = renderHook(
      ({ repository }) =>
        useCategoryWorkspace({
          onCategoryDeleted: vi.fn(),
          queryScope: CATEGORY_QUERY_SCOPE,
          repository,
        }),
      {
        initialProps: { repository: oldRepository },
        wrapper: createQueryWrapper(),
      }
    );
    await waitFor(() =>
      expect(result.current.categories).toEqual([oldCategory])
    );
    let updateRequest!: Promise<CategoryRepositoryWriteResult>;

    act(() => {
      updateRequest = result.current.updateCategory(oldCategory.id, {
        colorKey: updatedOldCategory.colorKey,
        name: updatedOldCategory.name,
      });
    });
    await waitFor(() => expect(result.current.isMutating).toBe(true));

    rerender({ repository: newRepository });
    await waitFor(() => expect(newRepository.list).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(result.current.categories).toEqual([newCategory])
    );

    await act(async () => {
      pendingUpdate.resolve({ category: updatedOldCategory, ok: true });
      await expect(updateRequest).resolves.toEqual({
        ok: false,
        reason: 'write-failed',
      });
    });

    expect(result.current.categories).toEqual([newCategory]);
  });

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
});

async function renderReadyWorkspace(
  repository: CategoryRepository,
  onCategoryDeleted: (categoryId: string) => void = () => undefined,
  queryScope = CATEGORY_QUERY_SCOPE
) {
  const view = renderHook(
    () => useCategoryWorkspace({ onCategoryDeleted, queryScope, repository }),
    { wrapper: createQueryWrapper() }
  );

  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

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

function createRepository(
  overrides: Partial<CategoryRepository> = {}
): CategoryRepository {
  return {
    create: vi.fn<CategoryRepository['create']>(async () => ({
      ok: false,
      reason: 'write-failed',
    })),
    delete: vi.fn<CategoryRepository['delete']>(async () => ({
      ok: false,
      reason: 'write-failed',
    })),
    list: vi.fn(async () => ({ categories: [], warnings: [] })),
    update: vi.fn<CategoryRepository['update']>(async () => ({
      ok: false,
      reason: 'write-failed',
    })),
    ...overrides,
  };
}

function createCategory(overrides: Partial<Category> = {}): Category {
  return {
    colorKey: 'slate-2',
    createdAt: '2026-07-24T00:00:00.000Z',
    id: '10000000-0000-4000-8000-000000000099',
    name: '기본',
    sortOrder: 0,
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}
