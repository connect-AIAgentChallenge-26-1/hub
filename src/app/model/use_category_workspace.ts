import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  normalizeCategoryInput,
  normalizeCategoryName,
  type Category,
  type CategoryInput,
  type CategoryRepository,
  type CategoryRepositoryDeleteResult,
  type CategoryRepositoryLoadResult,
  type CategoryRepositoryWriteResult,
} from '@/entities/category';

import { workspaceQueryKeys } from './workspace_query_keys';

export type UseCategoryWorkspaceOptions = {
  onCategoryDeleted: (categoryId: string) => void;
  queryScope: string;
  repository: CategoryRepository;
};

type QueuedReload = {
  promise: Promise<void>;
  reject: (reason?: unknown) => void;
  resolve: () => void;
};

type RepositoryIdentity = {
  queryScope: string;
  repository: CategoryRepository;
};

export function useCategoryWorkspace({
  onCategoryDeleted,
  queryScope,
  repository,
}: UseCategoryWorkspaceOptions) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => workspaceQueryKeys.categories(queryScope),
    [queryScope]
  );
  const mutationKey = useMemo(
    () => workspaceQueryKeys.categoryMutations(queryScope),
    [queryScope]
  );
  const categoryQuery = useQuery({
    queryKey,
    queryFn: () => loadCategories(repository),
  });
  const { refetch: refetchCategories } = categoryQuery;
  const currentRepositoryRef = useRef(repository);
  const observedRepositoryIdentityRef = useRef<RepositoryIdentity>({
    queryScope,
    repository,
  });
  const mutationInFlightRef = useRef(false);
  const queuedReloadRef = useRef<QueuedReload | null>(null);
  const reloadInFlightCountRef = useRef(0);

  useEffect(() => {
    currentRepositoryRef.current = repository;
  }, [repository]);

  const refetchCategoriesNow = useCallback(async () => {
    reloadInFlightCountRef.current += 1;
    try {
      await queryClient.invalidateQueries({
        exact: true,
        queryKey,
        refetchType: 'none',
      });
      await refetchCategories({ cancelRefetch: true });
    } finally {
      reloadInFlightCountRef.current -= 1;
    }
  }, [queryClient, queryKey, refetchCategories]);

  useEffect(() => {
    const previousIdentity = observedRepositoryIdentityRef.current;
    observedRepositoryIdentityRef.current = { queryScope, repository };

    if (
      previousIdentity.repository === repository ||
      previousIdentity.queryScope !== queryScope
    ) {
      return;
    }

    const currentRepository = repository;
    reloadInFlightCountRef.current += 1;
    void (async () => {
      try {
        await queryClient.cancelQueries({ exact: true, queryKey });
        if (currentRepositoryRef.current !== currentRepository) {
          return;
        }
        await refetchCategoriesNow();
      } finally {
        reloadInFlightCountRef.current -= 1;
      }
    })();
  }, [queryClient, queryKey, queryScope, refetchCategoriesNow, repository]);

  const reloadCategories = useCallback((): Promise<void> => {
    if (!mutationInFlightRef.current) {
      return refetchCategoriesNow();
    }

    if (queuedReloadRef.current) {
      return queuedReloadRef.current.promise;
    }

    let reject!: (reason?: unknown) => void;
    let resolve!: () => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      reject = rejectPromise;
      resolve = resolvePromise;
    });
    queuedReloadRef.current = { promise, reject, resolve };
    return promise;
  }, [refetchCategoriesNow]);

  const flushQueuedReload = useCallback(async () => {
    const queuedReload = queuedReloadRef.current;
    if (!queuedReload) {
      return;
    }

    queuedReloadRef.current = null;
    try {
      await refetchCategoriesNow();
      queuedReload.resolve();
    } catch (error) {
      queuedReload.reject(error);
    }
  }, [refetchCategoriesNow]);

  const readCurrentState = useCallback(
    () =>
      queryClient.getQueryData<CategoryRepositoryLoadResult>(queryKey) ?? {
        categories: [],
        warnings: [],
      },
    [queryClient, queryKey]
  );

  const updateCurrentState = useCallback(
    (
      repositoryAtStart: CategoryRepository,
      updater: (
        currentState: CategoryRepositoryLoadResult
      ) => CategoryRepositoryLoadResult
    ) => {
      if (currentRepositoryRef.current !== repositoryAtStart) {
        return;
      }

      queryClient.setQueryData<CategoryRepositoryLoadResult>(
        queryKey,
        (currentState) =>
          currentState && currentRepositoryRef.current === repositoryAtStart
            ? updater(currentState)
            : currentState
      );
    },
    [queryClient, queryKey]
  );

  const runMutation = useCallback(
    async <T>(
      repositoryAtStart: CategoryRepository,
      command: () => Promise<T>,
      failure: T
    ): Promise<T> => {
      if (
        currentRepositoryRef.current !== repositoryAtStart ||
        !categoryQuery.isSuccess ||
        categoryQuery.isFetching ||
        reloadInFlightCountRef.current > 0 ||
        mutationInFlightRef.current
      ) {
        return failure;
      }

      mutationInFlightRef.current = true;
      try {
        return await command();
      } finally {
        mutationInFlightRef.current = false;
        await flushQueuedReload();
      }
    },
    [categoryQuery.isFetching, categoryQuery.isSuccess, flushQueuedReload]
  );

  const createMutation = useMutation({
    mutationKey,
    mutationFn: async ({
      input,
      repositoryAtStart,
    }: {
      input: CategoryInput;
      repositoryAtStart: CategoryRepository;
    }): Promise<CategoryRepositoryWriteResult> => {
      const currentState = readCurrentState();
      const normalizedInput = normalizeCategoryInput(input);

      if (!normalizedInput) {
        return { ok: false, reason: 'invalid-input' };
      }

      if (hasDuplicateName(currentState.categories, normalizedInput.name)) {
        return { ok: false, reason: 'duplicate' };
      }

      const sortOrder =
        Math.max(
          -1,
          ...currentState.categories.map((category) => category.sortOrder)
        ) + 1;
      const createResult = await repositoryAtStart.create(
        normalizedInput,
        sortOrder
      );

      if (currentRepositoryRef.current !== repositoryAtStart) {
        return { ok: false, reason: 'write-failed' };
      }

      if (createResult.ok) {
        updateCurrentState(repositoryAtStart, (latestState) => ({
          categories: [...latestState.categories, createResult.category],
          warnings: latestState.warnings,
        }));
      }

      return createResult;
    },
  });
  const { isPending: isCreating, mutateAsync: mutateCreate } = createMutation;

  const createCategory = useCallback(
    (input: CategoryInput) =>
      runMutation(
        repository,
        () => mutateCreate({ input, repositoryAtStart: repository }),
        {
          ok: false,
          reason: 'write-failed',
        }
      ),
    [mutateCreate, repository, runMutation]
  );

  const updateMutation = useMutation({
    mutationKey,
    mutationFn: async ({
      categoryId,
      input,
      repositoryAtStart,
    }: {
      categoryId: string;
      input: CategoryInput;
      repositoryAtStart: CategoryRepository;
    }): Promise<CategoryRepositoryWriteResult> => {
      const currentState = readCurrentState();
      const categoryExists = currentState.categories.some(
        (category) => category.id === categoryId
      );

      if (!categoryExists) {
        return { ok: false, reason: 'not-found' };
      }

      const normalizedInput = normalizeCategoryInput(input);

      if (!normalizedInput) {
        return { ok: false, reason: 'invalid-input' };
      }

      if (
        hasDuplicateName(
          currentState.categories,
          normalizedInput.name,
          categoryId
        )
      ) {
        return { ok: false, reason: 'duplicate' };
      }

      const updateResult = await repositoryAtStart.update(
        categoryId,
        normalizedInput
      );

      if (currentRepositoryRef.current !== repositoryAtStart) {
        return { ok: false, reason: 'write-failed' };
      }

      if (updateResult.ok) {
        updateCurrentState(repositoryAtStart, (latestState) => ({
          categories: latestState.categories.map((category) =>
            category.id === categoryId ? updateResult.category : category
          ),
          warnings: latestState.warnings,
        }));
      }

      return updateResult;
    },
  });
  const { isPending: isUpdating, mutateAsync: mutateUpdate } = updateMutation;

  const updateCategory = useCallback(
    (categoryId: string, input: CategoryInput) =>
      runMutation(
        repository,
        () =>
          mutateUpdate({
            categoryId,
            input,
            repositoryAtStart: repository,
          }),
        {
          ok: false,
          reason: 'write-failed',
        }
      ),
    [mutateUpdate, repository, runMutation]
  );

  const deleteMutation = useMutation({
    mutationKey,
    mutationFn: async ({
      categoryId,
      repositoryAtStart,
    }: {
      categoryId: string;
      repositoryAtStart: CategoryRepository;
    }): Promise<CategoryRepositoryDeleteResult> => {
      const currentState = readCurrentState();
      const categoryExists = currentState.categories.some(
        (category) => category.id === categoryId
      );

      if (!categoryExists) {
        return { ok: false, reason: 'not-found' };
      }

      const deleteResult = await repositoryAtStart.delete(categoryId);

      if (currentRepositoryRef.current !== repositoryAtStart) {
        return { ok: false, reason: 'write-failed' };
      }

      if (!deleteResult.ok) {
        return deleteResult;
      }

      updateCurrentState(repositoryAtStart, (latestState) => ({
        categories: latestState.categories.filter(
          (category) => category.id !== categoryId
        ),
        warnings: latestState.warnings,
      }));
      onCategoryDeleted(categoryId);

      return deleteResult;
    },
  });
  const { isPending: isDeleting, mutateAsync: mutateDelete } = deleteMutation;

  const deleteCategory = useCallback(
    (categoryId: string) =>
      runMutation(
        repository,
        () => mutateDelete({ categoryId, repositoryAtStart: repository }),
        {
          ok: false,
          reason: 'write-failed',
        }
      ),
    [mutateDelete, repository, runMutation]
  );

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
}

async function loadCategories(
  repository: CategoryRepository
): Promise<CategoryRepositoryLoadResult> {
  try {
    return await repository.list();
  } catch {
    return { categories: [], warnings: ['read-failed'] };
  }
}

function hasDuplicateName(
  categories: Category[],
  name: string,
  excludedCategoryId?: string
) {
  const normalizedName = toDuplicateKey(name);

  return categories.some(
    (category) =>
      category.id !== excludedCategoryId &&
      toDuplicateKey(category.name) === normalizedName
  );
}

function toDuplicateKey(name: string) {
  return normalizeCategoryName(name).toLocaleLowerCase('ko-KR');
}
