import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  type Insight,
  type InsightCaptureRequest,
  type InsightCaptureService,
  type InsightContextInput,
  type InsightMutationResult,
  type InsightRepository,
  type InsightRepositoryLoadResult,
  type InsightRepositoryWarning,
} from '@/entities/insight';

import { workspaceQueryKeys } from './workspace_query_keys';

export type SaveInsightFailureReason =
  'invalid-url' | 'permission-denied' | 'unsupported-protocol' | 'write-failed';

export type SaveInsightResult =
  | { ok: true; insightId: string }
  | {
      ok: false;
      reason: SaveInsightFailureReason;
    };

export type SaveInsightInput = InsightCaptureRequest;

export type UpdateInsightContextResult = InsightMutationResult;

export type DeleteInsightResult = InsightMutationResult;

export type DeleteInsightsResult = InsightMutationResult;

export type UseInsightWorkspaceOptions = {
  captureService: InsightCaptureService;
  now?: () => string;
  queryScope: string;
  repository: InsightRepository;
};

type QueuedReload = {
  promise: Promise<void>;
  reject: (reason?: unknown) => void;
  resolve: () => void;
};

type RepositoryIdentity = {
  queryScope: string;
  repository: InsightRepository;
};

export function useInsightWorkspace({
  captureService,
  now = () => new Date().toISOString(),
  queryScope,
  repository,
}: UseInsightWorkspaceOptions) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => workspaceQueryKeys.insights(queryScope),
    [queryScope]
  );
  const mutationKey = useMemo(
    () => workspaceQueryKeys.insightMutations(queryScope),
    [queryScope]
  );
  const insightQuery = useQuery({
    queryKey,
    queryFn: () => loadInsights(repository),
  });
  const { refetch: refetchInsights } = insightQuery;
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

  const refetchInsightsNow = useCallback(async () => {
    reloadInFlightCountRef.current += 1;
    try {
      await queryClient.invalidateQueries({
        exact: true,
        queryKey,
        refetchType: 'none',
      });
      await refetchInsights({ cancelRefetch: true });
    } finally {
      reloadInFlightCountRef.current -= 1;
    }
  }, [queryClient, queryKey, refetchInsights]);

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
        await refetchInsightsNow();
      } finally {
        reloadInFlightCountRef.current -= 1;
      }
    })();
  }, [queryClient, queryKey, queryScope, refetchInsightsNow, repository]);

  const reloadInsights = useCallback((): Promise<void> => {
    if (!mutationInFlightRef.current) {
      return refetchInsightsNow();
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
  }, [refetchInsightsNow]);

  const flushQueuedReload = useCallback(async () => {
    const queuedReload = queuedReloadRef.current;
    if (!queuedReload) {
      return;
    }

    queuedReloadRef.current = null;
    try {
      await refetchInsightsNow();
      queuedReload.resolve();
    } catch (error) {
      queuedReload.reject(error);
    }
  }, [refetchInsightsNow]);

  const readCurrentState = useCallback(
    () =>
      queryClient.getQueryData<InsightRepositoryLoadResult>(queryKey) ?? {
        insights: [],
        warnings: [],
      },
    [queryClient, queryKey]
  );

  const updateCurrentState = useCallback(
    (
      repositoryAtStart: InsightRepository,
      updater: (
        currentState: InsightRepositoryLoadResult
      ) => InsightRepositoryLoadResult
    ) => {
      if (currentRepositoryRef.current !== repositoryAtStart) {
        return;
      }

      queryClient.setQueryData<InsightRepositoryLoadResult>(
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
      repositoryAtStart: InsightRepository,
      command: () => Promise<T>,
      failure: T
    ): Promise<T> => {
      if (
        currentRepositoryRef.current !== repositoryAtStart ||
        !insightQuery.isSuccess ||
        insightQuery.isFetching ||
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
    [flushQueuedReload, insightQuery.isFetching, insightQuery.isSuccess]
  );

  const saveMutation = useMutation({
    mutationKey,
    mutationFn: async ({
      input,
      repositoryAtStart,
    }: {
      input: SaveInsightInput | string;
      repositoryAtStart: InsightRepository;
    }): Promise<SaveInsightResult> => {
      const captureResult = await captureService.capture(
        toInsightCaptureRequest(input)
      );

      if (currentRepositoryRef.current !== repositoryAtStart) {
        return { ok: false, reason: 'write-failed' };
      }

      if (!captureResult.ok) {
        return {
          ok: false,
          reason: toSaveFailureReason(captureResult.reason),
        };
      }

      updateCurrentState(repositoryAtStart, (currentState) => ({
        insights: upsertInsight(currentState.insights, captureResult.insight),
        warnings: clearRecoverableWarnings(currentState.warnings),
      }));
      return { ok: true, insightId: captureResult.insight.id };
    },
  });
  const { isPending: isSaving, mutateAsync: mutateSave } = saveMutation;

  const saveInsight = useCallback(
    (input: SaveInsightInput | string) =>
      runMutation(
        repository,
        () => mutateSave({ input, repositoryAtStart: repository }),
        {
          ok: false,
          reason: 'write-failed',
        }
      ),
    [mutateSave, repository, runMutation]
  );

  const updateMutation = useMutation({
    mutationKey,
    mutationFn: async ({
      context,
      insightId,
      repositoryAtStart,
    }: {
      context: InsightContextInput;
      insightId: string;
      repositoryAtStart: InsightRepository;
    }): Promise<UpdateInsightContextResult> => {
      const currentState = readCurrentState();
      const insightIndex = currentState.insights.findIndex(
        (candidate) => candidate.id === insightId
      );
      const insight = currentState.insights[insightIndex];

      if (!insight) {
        return { ok: false, reason: 'not-found' };
      }

      const normalizedTitle = normalizeOptionalText(context.title);
      const candidate: Insight = {
        ...insight,
        categoryId: context.categoryId,
        memo: normalizeOptionalText(context.memo),
        title: normalizedTitle ?? insight.title,
        titleOrigin: normalizedTitle ? 'user' : insight.titleOrigin,
        updatedAt: getNextUpdatedAt(insight, now()),
      };
      const updateResult = await repositoryAtStart.update(candidate);

      if (currentRepositoryRef.current !== repositoryAtStart) {
        return { ok: false, reason: 'write-failed' };
      }

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

      updateCurrentState(repositoryAtStart, (latestState) => ({
        insights: latestState.insights.map((insight) =>
          insight.id === insightId ? updateResult.insight : insight
        ),
        warnings: clearRecoverableWarnings(latestState.warnings),
      }));
      return { ok: true };
    },
  });
  const { isPending: isUpdating, mutateAsync: mutateUpdate } = updateMutation;

  const updateInsightContext = useCallback(
    (insightId: string, context: InsightContextInput) =>
      runMutation(
        repository,
        () =>
          mutateUpdate({
            context,
            insightId,
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
      insightId,
      repositoryAtStart,
    }: {
      insightId: string;
      repositoryAtStart: InsightRepository;
    }): Promise<DeleteInsightResult> => {
      const currentState = readCurrentState();
      const insightIndex = currentState.insights.findIndex(
        (candidate) => candidate.id === insightId
      );

      if (insightIndex === -1) {
        return { ok: false, reason: 'not-found' };
      }

      const deleteResult = await repositoryAtStart.delete(insightId);

      if (currentRepositoryRef.current !== repositoryAtStart) {
        return { ok: false, reason: 'write-failed' };
      }

      if (!deleteResult.ok) {
        return deleteResult;
      }

      updateCurrentState(repositoryAtStart, (latestState) => ({
        insights: latestState.insights.filter(
          (insight) => insight.id !== insightId
        ),
        warnings: clearRecoverableWarnings(latestState.warnings),
      }));
      return { ok: true };
    },
  });
  const { isPending: isDeleting, mutateAsync: mutateDelete } = deleteMutation;

  const deleteInsight = useCallback(
    (insightId: string) =>
      runMutation(
        repository,
        () => mutateDelete({ insightId, repositoryAtStart: repository }),
        {
          ok: false,
          reason: 'write-failed',
        }
      ),
    [mutateDelete, repository, runMutation]
  );

  const deleteManyMutation = useMutation({
    mutationKey,
    mutationFn: async ({
      insightIds,
      repositoryAtStart,
    }: {
      insightIds: readonly string[];
      repositoryAtStart: InsightRepository;
    }): Promise<DeleteInsightsResult> => {
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

      const deleteResult = await repositoryAtStart.deleteMany(uniqueInsightIds);

      if (currentRepositoryRef.current !== repositoryAtStart) {
        return { ok: false, reason: 'write-failed' };
      }

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
        await refetchInsightsNow();
        return { ok: false, reason: 'write-failed' };
      }

      updateCurrentState(repositoryAtStart, (latestState) => ({
        insights: latestState.insights.filter(
          ({ id }) => !deletedIdSet.has(id)
        ),
        warnings: clearRecoverableWarnings(latestState.warnings),
      }));
      return { ok: true };
    },
  });
  const { isPending: isDeletingMany, mutateAsync: mutateDeleteMany } =
    deleteManyMutation;

  const deleteInsights = useCallback(
    (insightIds: readonly string[]) =>
      runMutation(
        repository,
        () =>
          mutateDeleteMany({
            insightIds,
            repositoryAtStart: repository,
          }),
        {
          ok: false,
          reason: 'write-failed',
        }
      ),
    [mutateDeleteMany, repository, runMutation]
  );

  const detachCategory = useCallback(
    (categoryId: string) => {
      if (!insightQuery.isSuccess || insightQuery.isFetching) {
        return;
      }

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
}

async function loadInsights(
  repository: InsightRepository
): Promise<InsightRepositoryLoadResult> {
  try {
    return await repository.list();
  } catch {
    return {
      insights: [],
      warnings: ['read-failed'] as InsightRepositoryWarning[],
    };
  }
}

function clearRecoverableWarnings(warnings: InsightRepositoryWarning[]) {
  return warnings.filter(
    (warning) => warning === 'read-failed' || warning === 'permission-denied'
  );
}

function normalizeOptionalText(value: string) {
  return value.trim() || null;
}

function getNextUpdatedAt(insight: Insight, currentTime: string) {
  const createdAt = Date.parse(insight.createdAt);
  const previousUpdatedAt = Date.parse(insight.updatedAt);
  const currentTimestamp = Date.parse(currentTime);
  const nextTimestamp = Math.max(
    Number.isFinite(createdAt) ? createdAt : Number.NEGATIVE_INFINITY,
    Number.isFinite(previousUpdatedAt)
      ? previousUpdatedAt + 1
      : Number.NEGATIVE_INFINITY,
    Number.isFinite(currentTimestamp)
      ? currentTimestamp
      : Number.NEGATIVE_INFINITY
  );

  return new Date(nextTimestamp).toISOString();
}

function toSaveFailureReason(reason: string): SaveInsightFailureReason {
  if (
    reason === 'invalid-url' ||
    reason === 'permission-denied' ||
    reason === 'unsupported-protocol'
  ) {
    return reason;
  }

  return 'write-failed';
}

function toInsightCaptureRequest(
  input: SaveInsightInput | string
): InsightCaptureRequest {
  return typeof input === 'string' ? { source: 'web', url: input } : input;
}

function upsertInsight(insights: Insight[], insight: Insight) {
  const existingIndex = insights.findIndex(
    (candidate) => candidate.id === insight.id
  );

  if (existingIndex === -1) {
    return [insight, ...insights];
  }

  const nextInsights = [...insights];
  nextInsights[existingIndex] = insight;

  return nextInsights;
}
