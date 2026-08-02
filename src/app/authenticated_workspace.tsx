import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

import type {
  CategoryRepository,
  CategoryRepositoryWarning,
} from '@/entities/category';
import {
  filterInsights,
  createBrowserInsightCaptureService,
  type InsightRepository,
  type InsightCaptureService,
  type InsightRepositoryWarning,
} from '@/entities/insight';
import { CategoryManager } from '@/features/category-management';
import {
  InsightImportDialog,
  type InsightImportService,
  type NotionImportApi,
} from '@/features/insight-import';
import { PwaInstallNotice, usePwaInstallPrompt } from '@/features/pwa-install';
import {
  createBrowserRetrieveService,
  type RetrieveService,
  useRetrieve,
} from '@/features/retrieve';
import { HomePage, type SuggestedSituation } from '@/pages/home';
import { LibraryPage } from '@/pages/library';
import { SavePage, type SaveContextDraft } from '@/pages/save';
import { readClipboardText } from '@/shared/browser';
import type { NotionImportCallback } from '@/shared/capacitor';
import {
  BrandLogo,
  StatusMessage,
  type CategoryFilterOption,
} from '@/shared/ui';
import { AppNavigation, type WorkspaceTab } from '@/widgets/app-navigation';

import { createBrowserCategoryRepository } from './model/create_browser_category_repository';
import { createBrowserInsightRepository } from './model/create_browser_insight_repository';
import { createRepositoryInsightCaptureService } from './model/create_repository_insight_capture_service';
import { useCategoryWorkspace } from './model/use_category_workspace';
import {
  useWorkspaceUiStore,
  WorkspaceUiProvider,
} from './model/workspace_ui_store';
import { SUGGESTED_SITUATIONS } from './model/workspace_seed';
import {
  useInsightWorkspace,
  type SaveInsightFailureReason,
  type SaveInsightInput,
} from './model/use_insight_workspace';
import { WorkspaceQueryProvider } from './providers/workspace_query_provider';
import './styles/authenticated_workspace.css';

const EMPTY_CONTEXT_DRAFT: SaveContextDraft = {
  categoryId: null,
  memo: '',
  title: '',
};
const CATEGORY_LOAD_WARNING_MESSAGES: Record<
  CategoryRepositoryWarning,
  { description: string; title: string }
> = {
  'corrupted-entry': {
    title: '일부 카테고리를 제외했어요',
    description:
      '손상된 카테고리를 제외했어요. 나머지 카테고리는 계속 사용할 수 있어요.',
  },
  'permission-denied': {
    title: '카테고리 접근 권한을 확인하지 못했어요',
    description:
      '인사이트는 계속 볼 수 있지만 카테고리는 다시 로그인한 뒤 변경할 수 있어요.',
  },
  'read-failed': {
    title: '카테고리를 불러오지 못했어요',
    description:
      '인사이트는 계속 볼 수 있지만 카테고리는 네트워크를 확인한 뒤 다시 시도해 주세요.',
  },
};
const SAVE_ERROR_MESSAGES: Record<SaveInsightFailureReason, string> = {
  'invalid-url': '올바른 URL을 입력해 주세요.',
  'permission-denied':
    '저장 권한을 확인하지 못했어요. 입력한 URL은 그대로 두었어요. 다시 로그인한 뒤 시도해 주세요.',
  'unsupported-protocol': 'http 또는 https URL만 저장할 수 있어요.',
  'write-failed':
    '보관함에 저장하지 못했어요. 입력한 URL은 그대로 두었어요. 네트워크를 확인하고 다시 시도해 주세요.',
};
const LOAD_WARNING_MESSAGES: Record<
  InsightRepositoryWarning,
  { description: string; title: string }
> = {
  'read-failed': {
    title: '보관함을 불러오지 못했어요',
    description: '네트워크를 확인하고 새로고침해 주세요.',
  },
  'corrupted-store': {
    title: '저장 데이터를 불러오지 못했어요',
    description:
      '저장 데이터가 손상되어 불러오지 못했어요. 새 인사이트는 계속 저장할 수 있어요.',
  },
  'corrupted-entry': {
    title: '일부 인사이트를 제외했어요',
    description: '일부 손상된 인사이트를 제외하고 나머지를 불러왔어요.',
  },
  'permission-denied': {
    title: '보관함 접근 권한을 확인하지 못했어요',
    description: '다시 로그인한 뒤 보관함을 열어 주세요.',
  },
};

function hasBlockingLoadWarning(warnings: InsightRepositoryWarning[]) {
  return warnings.some(
    (warning) => warning === 'read-failed' || warning === 'permission-denied'
  );
}

function hasBlockingCategoryWarning(warnings: CategoryRepositoryWarning[]) {
  return warnings.some(
    (warning) => warning === 'read-failed' || warning === 'permission-denied'
  );
}

function isLibraryUnavailable(
  warnings: InsightRepositoryWarning[],
  insightCount: number
) {
  return (
    hasBlockingLoadWarning(warnings) ||
    (insightCount === 0 && warnings.includes('corrupted-entry'))
  );
}

function getLoadWarningMessage(
  warning: InsightRepositoryWarning,
  insightCount: number
) {
  if (warning === 'corrupted-entry' && insightCount === 0) {
    return {
      title: '저장된 인사이트를 읽지 못했어요',
      description:
        '보관함의 데이터를 확인하지 못했어요. 다시 불러와도 계속되면 문제를 알려 주세요.',
    };
  }

  return LOAD_WARNING_MESSAGES[warning];
}

export type AuthenticatedWorkspaceProps = {
  accountControl?: ReactNode;
  captureService?: InsightCaptureService;
  categoryRepository?: CategoryRepository;
  importService?: InsightImportService;
  initialSaveDraft?: SaveInsightInput;
  notionImportApi?: NotionImportApi;
  notionImportCallback?: NotionImportCallback;
  notionOpenWeb?: (authorizeUrl: string) => void;
  repository?: InsightRepository;
  retrieveService?: RetrieveService;
  userId?: string;
};

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

function AuthenticatedWorkspaceContent({
  accountControl,
  captureService,
  categoryRepository,
  importService,
  initialSaveDraft,
  notionImportApi,
  notionImportCallback,
  notionOpenWeb,
  queryScope,
  repository,
  retrieveService,
  userId,
}: AuthenticatedWorkspaceContentProps) {
  const [initialNotionCallback, setInitialNotionCallback] = useState(() =>
    readNotionCallback(globalThis.location?.search ?? '')
  );
  const initialNotionConnectionId = initialNotionCallback?.connectionId ?? null;
  const clearNotionCallback = useCallback(() => {
    setInitialNotionCallback(null);
    clearNotionCallbackQuery();
  }, []);
  const pwaInstallPrompt = usePwaInstallPrompt();
  const workspaceRepository = useMemo(
    () =>
      repository ??
      (userId
        ? createBrowserInsightRepository(userId)
        : createUnavailableInsightRepository()),
    [repository, userId]
  );
  const workspaceCaptureService = useMemo(
    () =>
      captureService ??
      (repository
        ? createRepositoryInsightCaptureService(repository)
        : userId
          ? createBrowserInsightCaptureService()
          : createUnavailableInsightCaptureService()),
    [captureService, repository, userId]
  );
  const workspaceCategoryRepository = useMemo(
    () =>
      categoryRepository ??
      (userId
        ? createBrowserCategoryRepository(userId)
        : repository
          ? createEmptyCategoryRepository()
          : createUnavailableCategoryRepository()),
    [categoryRepository, repository, userId]
  );
  const workspaceRetrieveService = useMemo(
    () =>
      retrieveService ??
      (userId
        ? createBrowserRetrieveService()
        : createUnavailableRetrieveService()),
    [retrieveService, userId]
  );
  const {
    deleteInsight,
    deleteInsights,
    detachCategory,
    insights,
    isLoading,
    isMutating,
    loadWarnings,
    reloadInsights,
    saveInsight,
    updateInsightContext,
  } = useInsightWorkspace({
    captureService: workspaceCaptureService,
    queryScope,
    repository: workspaceRepository,
  });
  const {
    clear: clearRetrieve,
    errorReason: retrieveErrorReason,
    pendingCount: retrievePendingCount,
    results: retrieveResults,
    retrieve,
    submittedQuery: submittedRetrieveQuery,
  } = useRetrieve(insights, workspaceRetrieveService);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() =>
    initialSaveDraft ? 'save' : 'home'
  );
  const activeCategory = useWorkspaceUiStore((state) => state.activeCategory);
  const setActiveCategory = useWorkspaceUiStore(
    (state) => state.setActiveCategory
  );
  const globalQuery = useWorkspaceUiStore((state) => state.globalQuery);
  const setGlobalQuery = useWorkspaceUiStore((state) => state.setGlobalQuery);
  const retrieveQuery = useWorkspaceUiStore((state) => state.retrieveQuery);
  const setRetrieveQuery = useWorkspaceUiStore(
    (state) => state.setRetrieveQuery
  );
  const selectedSituation = useWorkspaceUiStore(
    (state) => state.selectedSituation
  );
  const setSelectedSituation = useWorkspaceUiStore(
    (state) => state.setSelectedSituation
  );
  const [saveDraft, setSaveDraft] = useState<SaveInsightInput>(
    () => initialSaveDraft ?? { source: 'web', url: '' }
  );
  const saveDraftRevisionRef = useRef(0);
  const [saveComplete, setSaveComplete] = useState(false);
  const [saveErrorReason, setSaveErrorReason] =
    useState<SaveInsightFailureReason>();
  const [savedInsightId, setSavedInsightId] = useState<string>();
  const [contextDraft, setContextDraft] = useState(EMPTY_CONTEXT_DRAFT);
  const [contextSaveComplete, setContextSaveComplete] = useState(false);
  const [contextSaveFailed, setContextSaveFailed] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(initialNotionCallback !== null);
  const handleImportOpenChange = useCallback(
    (nextOpen: boolean) => {
      setImportOpen(nextOpen);
      if (!nextOpen && initialNotionCallback) {
        clearNotionCallback();
      }
    },
    [clearNotionCallback, initialNotionCallback]
  );
  const pendingCategorySelectionRef = useRef<
    ((categoryId: string) => void) | undefined
  >(undefined);
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
  const {
    categories,
    createCategory,
    deleteCategory,
    isLoading: categoriesLoading,
    isMutating: categoriesMutating,
    loadWarnings: categoryLoadWarnings,
    reloadCategories,
    updateCategory,
  } = useCategoryWorkspace({
    onCategoryDeleted: handleCategoryDeleted,
    queryScope,
    repository: workspaceCategoryRepository,
  });
  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );
  const categoryOptions = useMemo<CategoryFilterOption[]>(
    () => [
      { colorKey: null, label: '전체', value: 'all' },
      ...categories.map((category) => ({
        colorKey: category.colorKey,
        label: category.name,
        value: category.id,
      })),
      { colorKey: null, label: '미분류', value: 'uncategorized' },
    ],
    [categories]
  );
  const categorySelectionDisabled =
    categoriesLoading || hasBlockingCategoryWarning(categoryLoadWarnings);

  const visibleInsights = useMemo(() => {
    return filterInsights(insights, activeCategory, globalQuery, {
      getCategoryName: (categoryId) => categoryNameById.get(categoryId) ?? null,
    });
  }, [activeCategory, categoryNameById, globalQuery, insights]);

  const libraryUnavailable = isLibraryUnavailable(
    loadWarnings,
    insights.length
  );

  function handleSituationClick(situation: SuggestedSituation) {
    setSelectedSituation(situation.query);
    setRetrieveQuery(situation.query);
    void retrieve(situation.query);
  }

  function handleRetrieveQueryChange(value: string) {
    setRetrieveQuery(value);

    if (value !== selectedSituation) {
      setSelectedSituation('');
    }
  }

  function handleRetrieveClear() {
    setRetrieveQuery('');
    setSelectedSituation('');
    clearRetrieve();
  }

  function handleRetrieve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = retrieveQuery.trim();

    if (!query) {
      return;
    }

    void retrieve(query);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const submittedDraftRevision = saveDraftRevisionRef.current;
    const saveResult = await saveInsight(saveDraft);

    if (submittedDraftRevision !== saveDraftRevisionRef.current) {
      return;
    }

    if (!saveResult.ok) {
      setSaveComplete(false);
      setSaveErrorReason(saveResult.reason);
      return;
    }

    pwaInstallPrompt.recordSuccessfulSave();
    setSaveErrorReason(undefined);
    setActiveCategory('all');
    setSavedInsightId(saveResult.insightId);
    setContextDraft(EMPTY_CONTEXT_DRAFT);
    setContextSaveComplete(false);
    setContextSaveFailed(false);
    setSaveComplete(true);
  }

  function resetSaveFeedback() {
    setSaveComplete(false);
    setSaveErrorReason(undefined);
    setSavedInsightId(undefined);
    setContextDraft(EMPTY_CONTEXT_DRAFT);
    setContextSaveComplete(false);
    setContextSaveFailed(false);
  }

  function updateSaveDraft(
    update: (currentDraft: SaveInsightInput) => SaveInsightInput
  ) {
    saveDraftRevisionRef.current += 1;
    setSaveDraft(update);
    resetSaveFeedback();
  }

  function handleSaveUrlChange(value: string) {
    updateSaveDraft((draft) => ({ ...draft, url: value }));
  }

  function handleSaveTitleChange(value: string) {
    updateSaveDraft((draft) => ({ ...draft, title: value }));
  }

  async function handleClipboardPaste() {
    const value = await readClipboardText();

    if (value) {
      updateSaveDraft(() => ({ source: 'web', url: value }));
    }
  }

  async function handleContextSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!savedInsightId) {
      return;
    }

    const updateResult = await updateInsightContext(
      savedInsightId,
      contextDraft
    );

    if (updateResult.ok) {
      setContextSaveComplete(true);
      setContextSaveFailed(false);
      return;
    }

    setContextSaveComplete(false);
    setContextSaveFailed(true);
  }

  function handleContextDraftChange(draft: SaveContextDraft) {
    setContextDraft(draft);
    setContextSaveComplete(false);
    setContextSaveFailed(false);
  }

  function handleTabChange(tab: WorkspaceTab) {
    if (tab === 'save' && activeTab !== 'save' && contextSaveComplete) {
      saveDraftRevisionRef.current += 1;
      setSaveDraft({ source: 'web', url: '' });
      resetSaveFeedback();
    }

    setActiveTab(tab);
  }

  function handleContextSkip() {
    setSavedInsightId(undefined);
    setContextDraft(EMPTY_CONTEXT_DRAFT);
    setContextSaveComplete(false);
    setContextSaveFailed(false);
    setSaveComplete(false);
    setSaveDraft({ source: 'web', url: '' });
    setSaveErrorReason(undefined);
    setActiveCategory('all');
    setGlobalQuery('');
    setActiveTab('library');
  }

  function openCategoryManager() {
    pendingCategorySelectionRef.current = undefined;
    setCategoryManagerOpen(true);
  }

  function requestCategoryCreation(
    selectCategory: (categoryId: string) => void
  ) {
    pendingCategorySelectionRef.current = selectCategory;
    setCategoryManagerOpen(true);
  }

  function handleCategoryManagerOpenChange(open: boolean) {
    setCategoryManagerOpen(open);

    if (!open) {
      pendingCategorySelectionRef.current = undefined;
    }
  }

  function handleCategoryCreated(category: { id: string }) {
    const selectCategory = pendingCategorySelectionRef.current;

    if (!selectCategory) {
      return;
    }

    selectCategory(category.id);
    pendingCategorySelectionRef.current = undefined;
    setCategoryManagerOpen(false);
  }

  return (
    <div className="workspace-shell">
      <header className="workspace-header">
        <div className="workspace-header__inner">
          <div className="workspace-brand">
            <BrandLogo className="workspace-brand__mark" />
            <span className="workspace-brand__name">아맞다</span>
            <span aria-hidden="true" className="workspace-brand__divider" />
            <h1>{getScreenTitle(activeTab)}</h1>
          </div>
          <AppNavigation onTabChange={handleTabChange} tab={activeTab} />
          <div className="workspace-account">{accountControl}</div>
        </div>
      </header>

      <main className="workspace-main">
        {pwaInstallPrompt.isVisible ? (
          <PwaInstallNotice
            isPrompting={pwaInstallPrompt.isPrompting}
            onDismiss={pwaInstallPrompt.dismiss}
            onInstall={pwaInstallPrompt.install}
          />
        ) : null}

        {loadWarnings.length > 0 ? (
          <div className="workspace-warnings" aria-label="보관함 안내">
            {loadWarnings.map((warning) => {
              const message = getLoadWarningMessage(warning, insights.length);

              return (
                <StatusMessage
                  key={warning}
                  title={message.title}
                  variant="error"
                >
                  <p>{message.description}</p>
                </StatusMessage>
              );
            })}
          </div>
        ) : null}

        {categoryLoadWarnings.length > 0 ? (
          <div className="workspace-warnings" aria-label="카테고리 안내">
            {categoryLoadWarnings.map((warning) => {
              const message = CATEGORY_LOAD_WARNING_MESSAGES[warning];

              return (
                <StatusMessage
                  key={warning}
                  title={message.title}
                  variant="error"
                >
                  <p>{message.description}</p>
                </StatusMessage>
              );
            })}
          </div>
        ) : null}

        {activeTab === 'library' ? (
          <LibraryPage
            activeCategory={activeCategory}
            categories={categories}
            categoryManagementDisabled={categorySelectionDisabled}
            categoryOptions={categoryOptions}
            insights={visibleInsights}
            loading={isLoading}
            onCategoryChange={setActiveCategory}
            onDeleteInsight={deleteInsight}
            onDeleteInsights={deleteInsights}
            onManageCategories={openCategoryManager}
            onOpenImport={() => setImportOpen(true)}
            onOpenSave={() => handleTabChange('save')}
            onQueryChange={setGlobalQuery}
            onRetryLoad={() => window.location.reload()}
            onRequestCategoryCreation={requestCategoryCreation}
            onUpdateInsight={updateInsightContext}
            query={globalQuery}
            totalInsightCount={insights.length}
            unavailable={libraryUnavailable}
          />
        ) : null}

        {activeTab === 'home' ? (
          <HomePage
            insightCount={insights.length}
            libraryState={
              isLoading
                ? 'loading'
                : libraryUnavailable
                  ? 'unavailable'
                  : 'ready'
            }
            onClearQuery={handleRetrieveClear}
            onOpenLibrary={() => handleTabChange('library')}
            onOpenSave={() => handleTabChange('save')}
            onQueryChange={handleRetrieveQueryChange}
            onRetrieve={handleRetrieve}
            onRetryLoad={() => window.location.reload()}
            onSituationClick={handleSituationClick}
            pendingCount={retrievePendingCount}
            query={retrieveQuery}
            results={retrieveResults}
            retrieveErrorMessage={
              retrieveErrorReason
                ? '입력한 내용은 그대로 두었어요. 잠시 후 다시 시도해 주세요.'
                : undefined
            }
            selectedSituation={selectedSituation}
            situations={SUGGESTED_SITUATIONS}
            submittedQuery={submittedRetrieveQuery}
          />
        ) : null}

        {activeTab === 'save' ? (
          <SavePage
            categories={categories}
            categorySelectionDisabled={categorySelectionDisabled}
            contextDraft={contextDraft}
            contextErrorMessage={
              contextSaveFailed
                ? '먼저 저장한 인사이트와 입력한 내용은 그대로 두었어요. 다시 시도하거나 지금은 건너뛸 수 있어요.'
                : undefined
            }
            contextSaveComplete={contextSaveComplete}
            isContextSaving={isMutating}
            isSaving={isMutating}
            errorMessage={
              saveErrorReason ? SAVE_ERROR_MESSAGES[saveErrorReason] : undefined
            }
            onContextDraftChange={handleContextDraftChange}
            onContextSave={handleContextSave}
            onContextSkip={handleContextSkip}
            onPasteFromClipboard={handleClipboardPaste}
            onRequestCategoryCreation={requestCategoryCreation}
            onSave={handleSave}
            onTitleChange={handleSaveTitleChange}
            onUrlChange={handleSaveUrlChange}
            isSharedSave={saveDraft.source === 'android_share'}
            saveComplete={saveComplete}
            saveTitle={saveDraft.title ?? ''}
            saveUrl={saveDraft.url}
            storageReady={!isLoading}
          />
        ) : null}
      </main>

      {importOpen ? (
        <InsightImportDialog
          categories={categories}
          initialNotionConnectionId={initialNotionConnectionId}
          initialNotionError={initialNotionCallback?.error ?? null}
          notionApi={notionImportApi}
          notionCallback={notionImportCallback}
          notionOpenWeb={notionOpenWeb}
          onCategoriesChanged={reloadCategories}
          onLibraryChanged={reloadInsights}
          onNotionConnectionFinished={clearNotionCallback}
          onOpenChange={handleImportOpenChange}
          open
          service={importService}
        />
      ) : null}

      <CategoryManager
        categories={categories}
        createCategory={createCategory}
        deleteCategory={deleteCategory}
        isMutating={categoriesMutating}
        onCategoryCreated={handleCategoryCreated}
        onOpenChange={handleCategoryManagerOpenChange}
        open={categoryManagerOpen}
        updateCategory={updateCategory}
      />
    </div>
  );
}

function readNotionCallback(search: string) {
  const query = new URLSearchParams(search);
  const connectionId = query.get('connection');

  if (
    query.get('import') !== 'notion' ||
    !connectionId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      connectionId
    )
  ) {
    return null;
  }

  return {
    connectionId,
    error:
      query.get('error') === 'access-denied'
        ? ('access-denied' as const)
        : null,
  };
}

function clearNotionCallbackQuery() {
  if (!globalThis.location || !globalThis.history) {
    return;
  }

  const url = new URL(globalThis.location.href);
  url.searchParams.delete('import');
  url.searchParams.delete('connection');
  url.searchParams.delete('error');
  globalThis.history.replaceState(
    globalThis.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`
  );
}

function createUnavailableInsightRepository(): InsightRepository {
  return {
    async create() {
      return { ok: false, reason: 'permission-denied' };
    },
    async delete() {
      return { ok: false, reason: 'permission-denied' };
    },
    async deleteMany() {
      return { ok: false, reason: 'permission-denied' };
    },
    async list() {
      return { insights: [], warnings: ['permission-denied'] };
    },
    async update() {
      return { ok: false, reason: 'permission-denied' };
    },
  };
}

function createEmptyCategoryRepository(): CategoryRepository {
  return {
    async create() {
      return { ok: false, reason: 'permission-denied' };
    },
    async delete() {
      return { ok: false, reason: 'permission-denied' };
    },
    async list() {
      return { categories: [], warnings: [] };
    },
    async update() {
      return { ok: false, reason: 'permission-denied' };
    },
  };
}

function createUnavailableCategoryRepository(): CategoryRepository {
  return {
    ...createEmptyCategoryRepository(),
    async list() {
      return { categories: [], warnings: ['permission-denied'] };
    },
  };
}

function createUnavailableInsightCaptureService(): InsightCaptureService {
  return {
    async capture() {
      return { ok: false, reason: 'permission-denied' };
    },
  };
}

function createUnavailableRetrieveService(): RetrieveService {
  return {
    async retrieve() {
      return { ok: false, reason: 'permission-denied' };
    },
  };
}

function getScreenTitle(tab: WorkspaceTab) {
  if (tab === 'library') {
    return '보관함';
  }

  if (tab === 'save') {
    return '저장';
  }

  return '홈';
}
