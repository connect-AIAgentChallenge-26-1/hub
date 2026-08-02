/* @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  Category,
  CategoryRepository as AsyncCategoryRepository,
} from '@/entities/category';
import type {
  Insight,
  InsightCaptureService,
  InsightRepository as AsyncInsightRepository,
  InsightRepositoryLoadResult,
} from '@/entities/insight';
import type {
  InsightImportService,
  NotionImportApi,
  PreparedImport,
} from '@/features/insight-import';
import type { RetrieveService } from '@/features/retrieve';
import {
  pwaInstallPromptEvents,
  type BeforeInstallPromptEvent,
} from '@/shared/pwa';
import { DesignSystemProvider } from '@/shared/ui';

import { AuthenticatedWorkspace } from './authenticated_workspace';

type InsightRepository = {
  load: () => InsightRepositoryLoadResult;
  save: (
    insights: Insight[]
  ) => { ok: true } | { ok: false; reason: 'write-failed' };
};

const DEVELOPMENT_CATEGORY_ID = '10000000-0000-4000-8000-000000000001';
const DESIGN_CATEGORY_ID = '10000000-0000-4000-8000-000000000002';
const DESIGN_SYSTEMS_CATEGORY_ID = '10000000-0000-4000-8000-000000000003';
const TEST_CATEGORIES: Category[] = [
  createCategory({
    colorKey: 'blue-2',
    id: DEVELOPMENT_CATEGORY_ID,
    name: '개발',
    sortOrder: 0,
  }),
  createCategory({
    colorKey: 'coral-2',
    id: DESIGN_CATEGORY_ID,
    name: '디자인',
    sortOrder: 1,
  }),
  createCategory({
    colorKey: 'violet-2',
    id: DESIGN_SYSTEMS_CATEGORY_ID,
    name: 'Design Systems',
    sortOrder: 2,
  }),
];

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserverMock {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    }
  );
});

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value: vi.fn(() => []),
  });

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  pwaInstallPromptEvents.discardPrompt();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('AuthenticatedWorkspace', () => {
  it('Notion callback query가 있으면 가져오기 창을 열고 연결 분석을 재개한다', async () => {
    const connectionId = '10000000-0000-4000-8000-000000000099';
    window.history.replaceState(
      null,
      '',
      `/?import=notion&connection=${connectionId}`
    );
    const notionApi = {
      analyze: vi.fn<NotionImportApi['analyze']>().mockResolvedValue({
        candidateCount: 1,
        prepared: { ...createPreparedImport(), id: connectionId },
        requestCount: 1,
        status: 'ready',
      }),
      cancel: vi.fn<NotionImportApi['cancel']>(),
      complete: vi.fn<NotionImportApi['complete']>(),
      start: vi.fn<NotionImportApi['start']>(),
      status: vi.fn<NotionImportApi['status']>().mockResolvedValue({
        connectionId,
        includePageUrls: false,
        jobId: connectionId,
        jobStatus: 'analyzing',
        status: 'connected',
        workspaceName: '개인 문서',
      }),
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          importService={createImportService()}
          notionImportApi={notionApi}
          repository={toAsyncRepository(createRepository())}
        />
      </DesignSystemProvider>
    );

    expect(
      await screen.findByRole('dialog', { name: '인사이트 가져오기' })
    ).toBeTruthy();
    expect(await screen.findByText('새 인사이트')).toBeTruthy();
    expect(notionApi.status).toHaveBeenCalledWith(
      connectionId,
      expect.any(AbortSignal)
    );
    window.history.replaceState(null, '', '/');
  });

  it('Notion callback 분석 중 창을 닫으면 일회성 상태와 query를 정리한다', async () => {
    const user = userEvent.setup();
    const connectionId = '10000000-0000-4000-8000-000000000097';
    window.history.replaceState(
      null,
      '',
      `/?tab=home&import=notion&connection=${connectionId}`
    );
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const notionApi = {
      analyze: vi.fn<NotionImportApi['analyze']>(),
      cancel: vi
        .fn<NotionImportApi['cancel']>()
        .mockResolvedValue({ status: 'canceled' }),
      complete: vi.fn<NotionImportApi['complete']>(),
      start: vi.fn<NotionImportApi['start']>(),
      status: vi
        .fn<NotionImportApi['status']>()
        .mockImplementation((_connectionId, signal) => {
          if (!signal) {
            throw new Error('취소 신호가 필요합니다.');
          }

          return new Promise((_, reject) => {
            signal.addEventListener(
              'abort',
              () =>
                reject(
                  new DOMException('작업이 취소되었습니다.', 'AbortError')
                ),
              { once: true }
            );
          });
        }),
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          importService={createImportService()}
          notionImportApi={notionApi}
          repository={toAsyncRepository(createRepository())}
        />
      </DesignSystemProvider>
    );

    await screen.findByRole('dialog', { name: '인사이트 가져오기' });
    await user.click(screen.getByRole('button', { name: '닫기' }));

    expect(
      screen.queryByRole('dialog', { name: '인사이트 가져오기' })
    ).toBeNull();
    expect(window.location.search).toBe('?tab=home');
  });

  it('거절된 Notion callback을 안내하고 URL에서 일회성 query를 제거한다', async () => {
    const connectionId = '10000000-0000-4000-8000-000000000098';
    window.history.replaceState(
      null,
      '',
      `/?tab=home&import=notion&connection=${connectionId}&error=access-denied`
    );
    const notionApi = {
      analyze: vi.fn<NotionImportApi['analyze']>(),
      cancel: vi.fn<NotionImportApi['cancel']>(),
      complete: vi.fn<NotionImportApi['complete']>(),
      start: vi.fn<NotionImportApi['start']>(),
      status: vi.fn<NotionImportApi['status']>(),
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          importService={createImportService()}
          notionImportApi={notionApi}
          repository={toAsyncRepository(createRepository())}
        />
      </DesignSystemProvider>
    );

    expect(
      await screen.findByText(
        'Notion 연결을 승인하지 않았어요. 다시 연결해 주세요.'
      )
    ).toBeTruthy();
    expect(notionApi.status).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?tab=home');
  });

  it('가져오기 완료 뒤 인사이트와 분류를 재조회해 보관함과 꺼내보기에 반영한다', async () => {
    const user = userEvent.setup();
    const importedCategory = createCategory({
      id: '20000000-0000-4000-8000-000000000010',
      name: '가져온 분류',
    });
    const importedInsight = createInsight({
      categoryId: importedCategory.id,
      id: '30000000-0000-4000-8000-000000000010',
      memo: '재조회 단서',
      title: '가져온 인사이트',
    });
    const insightList = vi
      .fn<AsyncInsightRepository['list']>()
      .mockResolvedValueOnce({ insights: [], warnings: [] })
      .mockResolvedValue({
        insights: [importedInsight],
        warnings: [],
      });
    const categoryList = vi
      .fn<AsyncCategoryRepository['list']>()
      .mockResolvedValueOnce({ categories: [], warnings: [] })
      .mockResolvedValue({
        categories: [importedCategory],
        warnings: [],
      });
    const insightRepository: AsyncInsightRepository = {
      ...toAsyncRepository(createRepository()),
      list: insightList,
    };
    const categoryRepository: AsyncCategoryRepository = {
      ...createCategoryRepository(),
      list: categoryList,
    };
    const importService = createImportService();
    importService.prepare.mockResolvedValue({
      ok: true,
      value: createPreparedImport(),
    });
    importService.commit.mockResolvedValue({
      ok: true,
      value: {
        createdCount: 1,
        duplicateCount: 0,
        excludedCount: 0,
        jobId: '10000000-0000-4000-8000-000000000010',
      },
    });

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          categoryRepository={categoryRepository}
          importService={importService}
          repository={insightRepository}
          retrieveService={createRetrieveService([importedInsight.id])}
        />
      </DesignSystemProvider>
    );

    await screen.findByRole('heading', {
      name: '아직 저장한 인사이트가 없어요',
    });
    await user.click(screen.getByRole('button', { name: '보관함' }));
    await user.click(screen.getByRole('button', { name: '인사이트 가져오기' }));
    await user.click(screen.getByRole('button', { name: '링크 붙여넣기' }));
    await user.type(
      screen.getByRole('textbox', { name: '가져올 링크' }),
      'https://example.com/imported'
    );
    await user.click(
      screen.getByRole('button', { name: '가져올 내용 확인하기' })
    );
    await user.click(screen.getByRole('button', { name: '인사이트 가져오기' }));

    await waitFor(() => expect(insightList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(categoryList).toHaveBeenCalledTimes(2));
    await user.click(
      screen.getByRole('button', { name: '보관함으로 돌아가기' })
    );

    expect(await screen.findByText('가져온 인사이트')).not.toBeNull();
    expect(screen.getByRole('button', { name: '가져온 분류' })).not.toBeNull();

    await user.type(
      screen.getByRole('searchbox', { name: '보관함 검색' }),
      '가져온'
    );
    expect(screen.getByText('가져온 인사이트')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: '홈' }));
    await user.type(
      screen.getByRole('textbox', {
        name: '지금 꺼내 보고 싶은 상황',
      }),
      '재조회 단서'
    );
    await user.click(screen.getByRole('button', { name: '꺼내보기' }));

    expect(screen.getByText('가져온 인사이트')).not.toBeNull();
  }, 20_000);

  it.each(['read-failed', 'permission-denied'] as const)(
    'distinguishes %s from an empty library across home and library tabs',
    async (warning) => {
      const user = userEvent.setup();
      const repository: InsightRepository = {
        load: () => ({ insights: [], warnings: [warning] }),
        save: () => ({ ok: true }),
      };

      render(
        <DesignSystemProvider>
          <AuthenticatedWorkspace repository={toAsyncRepository(repository)} />
        </DesignSystemProvider>
      );

      expect(
        await screen.findByRole('heading', {
          name: '보관함을 불러오지 못해 꺼내볼 수 없어요',
        })
      ).not.toBeNull();

      await user.click(screen.getByRole('button', { name: '보관함' }));

      expect(
        screen.getByRole('heading', {
          name: '보관함을 불러오지 못했어요',
        })
      ).not.toBeNull();
      expect(
        screen.queryByRole('heading', {
          name: '아직 저장한 인사이트가 없어요',
        })
      ).toBeNull();
    }
  );

  it('treats an entirely corrupted remote library as unavailable', async () => {
    const user = userEvent.setup();
    const repository: InsightRepository = {
      load: () => ({ insights: [], warnings: ['corrupted-entry'] }),
      save: () => ({ ok: true }),
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace repository={toAsyncRepository(repository)} />
      </DesignSystemProvider>
    );

    expect(
      await screen.findByRole('heading', {
        name: '보관함을 불러오지 못해 꺼내볼 수 없어요',
      })
    ).not.toBeNull();
    expect(screen.getByRole('alert').textContent).toContain(
      '저장된 인사이트를 읽지 못했어요'
    );

    await user.click(screen.getByRole('button', { name: '보관함' }));

    expect(
      screen.getByRole('heading', { name: '보관함을 불러오지 못했어요' })
    ).not.toBeNull();
    expect(
      screen.queryByRole('heading', { name: '아직 저장한 인사이트가 없어요' })
    ).toBeNull();
  });

  it('keeps valid insights visible when only some remote rows are corrupted', async () => {
    const user = userEvent.setup();
    const repository: InsightRepository = {
      load: () => ({
        insights: [createInsight({ title: '정상 인사이트' })],
        warnings: ['corrupted-entry'],
      }),
      save: () => ({ ok: true }),
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace repository={toAsyncRepository(repository)} />
      </DesignSystemProvider>
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      '일부 인사이트를 제외했어요'
    );

    await user.click(screen.getByRole('button', { name: '보관함' }));

    expect(screen.getByText('정상 인사이트')).not.toBeNull();
    expect(
      screen.queryByRole('heading', { name: '보관함을 불러오지 못했어요' })
    ).toBeNull();
  });

  it('keeps insights visible but disables category changes when category loading fails', async () => {
    const user = userEvent.setup();
    const categoryRepository: AsyncCategoryRepository = {
      ...createCategoryRepository(),
      async list() {
        return { categories: [], warnings: ['read-failed'] };
      },
    };
    const repository: InsightRepository = {
      load: () => ({
        insights: [createInsight({ title: '계속 볼 수 있는 인사이트' })],
        warnings: [],
      }),
      save: () => ({ ok: true }),
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          categoryRepository={categoryRepository}
          repository={toAsyncRepository(repository)}
        />
      </DesignSystemProvider>
    );

    expect(
      await screen.findByText('카테고리를 불러오지 못했어요')
    ).not.toBeNull();

    await user.click(screen.getByRole('button', { name: '보관함' }));

    expect(screen.getByText('계속 볼 수 있는 인사이트')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: '관리' }).getAttribute('aria-disabled')
    ).toBe('true');

    await user.click(screen.getByRole('button', { name: '수정' }));

    expect(
      screen
        .getByRole('combobox', { name: '카테고리' })
        .getAttribute('aria-disabled')
    ).toBe('true');
  });

  it('shows remote loading before an empty library is ready', async () => {
    const loadResult = createDeferred<InsightRepositoryLoadResult>();
    const repository: AsyncInsightRepository = {
      ...toAsyncRepository(createRepository()),
      list: () => loadResult.promise,
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace repository={repository} />
      </DesignSystemProvider>
    );

    expect(
      screen.getByRole('status', {
        name: '꺼내볼 인사이트를 불러오고 있어요',
      })
    ).not.toBeNull();

    await act(async () => {
      loadResult.resolve({ insights: [], warnings: [] });
      await loadResult.promise;
    });

    expect(
      await screen.findByRole('heading', {
        name: '아직 저장한 인사이트가 없어요',
      })
    ).not.toBeNull();
  });

  it('shows the shared brand logo in the workspace header', () => {
    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          repository={toAsyncRepository(createRepository())}
        />
      </DesignSystemProvider>
    );

    const brand = screen.getByText('아맞다').closest('.workspace-brand');

    expect(brand).not.toBeNull();
    expect(brand?.querySelector('svg.workspace-brand__mark')).not.toBeNull();
    expect(brand?.querySelector('span.workspace-brand__mark')).toBeNull();
  });

  it('공유 초안을 저장 탭에 채우고 사용자가 저장할 때만 android_share로 캡처한다', async () => {
    const user = userEvent.setup();
    const capture = vi
      .fn<InsightCaptureService['capture']>()
      .mockResolvedValue({
        created: true,
        insight: createInsight({
          id: 'shared-insight',
          originalUrl: 'https://example.com/shared',
          normalizedUrl: 'https://example.com/shared',
        }),
        ok: true,
      });

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          captureService={{ capture }}
          initialSaveDraft={{
            source: 'android_share',
            title: '공유한 기사',
            url: 'https://example.com/shared',
          }}
          repository={toAsyncRepository(createRepository())}
        />
      </DesignSystemProvider>
    );

    expect(
      await screen.findByRole('heading', {
        name: '공유한 링크를 저장할까요?',
      })
    ).not.toBeNull();
    expect((screen.getByLabelText('URL') as HTMLInputElement).value).toBe(
      'https://example.com/shared'
    );
    const sharedTitle = screen.getByRole('textbox', {
      name: '공유 제목 (선택)',
    });
    expect((sharedTitle as HTMLInputElement).value).toBe('공유한 기사');
    expect(capture).not.toHaveBeenCalled();

    await user.clear(sharedTitle);
    await user.type(sharedTitle, '수정한 공유 기사');
    await user.click(screen.getByRole('button', { name: '저장하기' }));

    expect(capture).toHaveBeenCalledWith({
      source: 'android_share',
      title: '수정한 공유 기사',
      url: 'https://example.com/shared',
    });
  });

  it('Android Chrome의 현재 초안 저장 성공 뒤 설치 안내를 표시한다', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('navigator', ANDROID_CHROME_NAVIGATOR);
    pwaInstallPromptEvents.start(window);
    window.dispatchEvent(createBeforeInstallPromptEvent());

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          repository={toAsyncRepository(createRepository())}
        />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '저장' }));
    await user.type(
      screen.getByRole('textbox', { name: 'URL' }),
      'https://example.com/install'
    );
    await user.click(screen.getByRole('button', { name: '저장하기' }));

    expect(
      await screen.findByRole('region', { name: '더 빠르게 저장하기' })
    ).not.toBeNull();
  });

  it('공유 저장 완료 뒤 클립보드 URL은 이전 상태를 지우고 web 출처로 저장한다', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('navigator', {
      clipboard: {
        readText: vi.fn().mockResolvedValue(' https://example.com/pasted '),
      },
    });
    const capture = vi
      .fn<InsightCaptureService['capture']>()
      .mockResolvedValueOnce({
        created: true,
        insight: createInsight({
          id: 'shared-insight',
          originalUrl: 'https://example.com/shared',
          normalizedUrl: 'https://example.com/shared',
        }),
        ok: true,
      })
      .mockResolvedValueOnce({
        created: true,
        insight: createInsight({
          id: 'pasted-insight',
          originalUrl: 'https://example.com/pasted',
          normalizedUrl: 'https://example.com/pasted',
        }),
        ok: true,
      });

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          captureService={{ capture }}
          initialSaveDraft={{
            source: 'android_share',
            title: '이전 공유 제목',
            url: 'https://example.com/shared',
          }}
          repository={toAsyncRepository(createRepository())}
        />
      </DesignSystemProvider>
    );

    const saveButton = screen.getByRole('button', { name: '저장하기' });
    await waitFor(() =>
      expect((saveButton as HTMLButtonElement).disabled).toBe(false)
    );

    await user.click(saveButton);
    expect(screen.getByRole('status').textContent).toContain(
      '인사이트를 저장했어요'
    );
    expect(
      screen.getByRole('heading', {
        name: '언제 다시 쓰고 싶은가요?',
      })
    ).not.toBeNull();

    await user.click(
      screen.getByRole('button', { name: '클립보드에서 붙여넣기' })
    );

    await waitFor(() => {
      expect((screen.getByLabelText('URL') as HTMLInputElement).value).toBe(
        'https://example.com/pasted'
      );
    });
    expect(
      screen.getByRole('heading', { name: 'URL을 입력하면 바로 저장해요' })
    ).not.toBeNull();
    expect(
      screen.queryByRole('textbox', { name: '공유 제목 (선택)' })
    ).toBeNull();
    expect(
      screen.queryByRole('heading', {
        name: '언제 다시 쓰고 싶은가요?',
      })
    ).toBeNull();

    await user.click(screen.getByRole('button', { name: '저장하기' }));

    expect(capture).toHaveBeenLastCalledWith({
      source: 'web',
      url: 'https://example.com/pasted',
    });
  });

  it('클립보드 읽기 실패 시 직접 입력한 URL을 유지한다', async () => {
    const user = userEvent.setup();
    const readText = vi.fn().mockRejectedValue(new Error('권한 거부'));
    vi.stubGlobal('navigator', { clipboard: { readText } });

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          repository={toAsyncRepository(createRepository())}
        />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '저장' }));
    const saveUrl = screen.getByRole('textbox', { name: 'URL' });
    await user.type(saveUrl, 'https://example.com/direct');
    await user.click(
      screen.getByRole('button', { name: '클립보드에서 붙여넣기' })
    );

    await waitFor(() => expect(readText).toHaveBeenCalledOnce());
    expect((saveUrl as HTMLInputElement).value).toBe(
      'https://example.com/direct'
    );
  });

  it('저장 중 도착한 클립보드 초안에 이전 저장 결과를 적용하지 않는다', async () => {
    const user = userEvent.setup();
    const clipboardRead = createDeferred<string>();
    const captureResult =
      createDeferred<Awaited<ReturnType<InsightCaptureService['capture']>>>();
    vi.stubGlobal('navigator', {
      ...ANDROID_CHROME_NAVIGATOR,
      clipboard: {
        readText: vi.fn(() => clipboardRead.promise),
      },
    });
    pwaInstallPromptEvents.start(window);
    window.dispatchEvent(createBeforeInstallPromptEvent());
    const capture = vi.fn<InsightCaptureService['capture']>(
      () => captureResult.promise
    );

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          captureService={{ capture }}
          initialSaveDraft={{
            source: 'android_share',
            title: '공유 초안 A',
            url: 'https://example.com/a',
          }}
          repository={toAsyncRepository(createRepository())}
        />
      </DesignSystemProvider>
    );

    const clipboardButton = await screen.findByRole('button', {
      name: '클립보드에서 붙여넣기',
    });
    const saveButton = screen.getByRole('button', { name: '저장하기' });
    const saveUrl = screen.getByRole('textbox', { name: 'URL' });
    const sharedTitle = screen.getByRole('textbox', {
      name: '공유 제목 (선택)',
    });
    await waitFor(() =>
      expect((saveButton as HTMLButtonElement).disabled).toBe(false)
    );

    await user.click(clipboardButton);
    await user.click(saveButton);

    await waitFor(() => {
      expect(saveButton.closest('form')?.getAttribute('aria-busy')).toBe(
        'true'
      );
      expect((clipboardButton as HTMLButtonElement).disabled).toBe(true);
      expect((saveUrl as HTMLInputElement).disabled).toBe(true);
      expect((sharedTitle as HTMLInputElement).disabled).toBe(true);
    });
    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith({
      source: 'android_share',
      title: '공유 초안 A',
      url: 'https://example.com/a',
    });

    await act(async () => {
      clipboardRead.resolve('https://example.com/b');
      await clipboardRead.promise;
    });

    expect((saveUrl as HTMLInputElement).value).toBe('https://example.com/b');
    expect(
      screen.queryByRole('textbox', { name: '공유 제목 (선택)' })
    ).toBeNull();

    await act(async () => {
      captureResult.resolve({
        created: true,
        insight: createInsight({
          id: 'shared-insight-a',
          originalUrl: 'https://example.com/a',
          normalizedUrl: 'https://example.com/a',
        }),
        ok: true,
      });
      await captureResult.promise;
    });

    expect((saveUrl as HTMLInputElement).value).toBe('https://example.com/b');
    expect(screen.queryByText('인사이트를 저장했어요')).toBeNull();
    expect(
      screen.queryByRole('heading', {
        name: '언제 다시 쓰고 싶은가요?',
      })
    ).toBeNull();
    expect(
      screen.queryByRole('region', { name: '더 빠르게 저장하기' })
    ).toBeNull();
    expect(capture).toHaveBeenCalledOnce();
  });

  it('immediately retrieves the exact survey query when a suggested situation is selected', async () => {
    const user = userEvent.setup();
    const repository: InsightRepository = {
      load: () => ({
        insights: [
          createInsight({
            id: 'project-design',
            title: '앱 화면 설계',
            memo: '프로젝트에 쓸 자료',
          }),
          createInsight({ id: 'unrelated', title: '여행 준비' }),
        ],
        warnings: [],
      }),
      save: () => ({ ok: true }),
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          repository={toAsyncRepository(repository)}
          retrieveService={createRetrieveService(['project-design'])}
        />
      </DesignSystemProvider>
    );

    expect(screen.queryByRole('article')).toBeNull();

    const suggestion = screen.getByRole('button', {
      name: '프로젝트에 쓸 자료 꺼내기',
    });
    await user.click(suggestion);

    expect(suggestion.getAttribute('aria-pressed')).toBe('true');
    expect(
      (
        screen.getByRole('textbox', {
          name: '지금 꺼내 보고 싶은 상황',
        }) as HTMLInputElement
      ).value
    ).toBe('프로젝트에 쓸 자료 꺼내기');
    expect(screen.getByRole('status').textContent).toContain(
      '“프로젝트에 쓸 자료 꺼내기” 결과 1개'
    );
    expect(
      screen.getByRole('heading', { name: '앱 화면 설계' })
    ).not.toBeNull();
    expect(screen.queryByText(/단서/)).toBeNull();
  });

  it('waits for submission and clears the entire retrieve state from the clear control', async () => {
    const user = userEvent.setup();
    const repository: InsightRepository = {
      load: () => ({
        insights: [
          createInsight({
            title: '팀 프로젝트 자료',
            memo: '팀 프로젝트 앱 디자인 참고 수정',
          }),
        ],
        warnings: [],
      }),
      save: () => ({ ok: true }),
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          repository={toAsyncRepository(repository)}
          retrieveService={createRetrieveService(['insight-1'])}
        />
      </DesignSystemProvider>
    );

    const input = screen.getByRole('textbox', {
      name: '지금 꺼내 보고 싶은 상황',
    });

    await user.type(input, '팀 프로젝트');

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('article')).toBeNull();

    await user.keyboard('{Enter}');

    expect(screen.getByRole('status').textContent).toContain(
      '“팀 프로젝트” 결과 1개'
    );
    expect(screen.getByRole('article')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: '입력 지우기' }));

    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('article')).toBeNull();
    expect(
      screen.getByText('떠오르는 단어나 지금 하는 일을 짧게 적어 보세요.')
    ).not.toBeNull();
    expect(
      screen.getByRole('button', { name: '과제 참고자료 다시 찾기' })
    ).not.toBeNull();
    expect(
      screen.getByRole('button', { name: '프로젝트에 쓸 자료 꺼내기' })
    ).not.toBeNull();
    expect(
      screen.getByRole('button', { name: '공모전 아이디어 발전시키기' })
    ).not.toBeNull();
    expect(
      screen.getByRole('button', { name: '여행·취미 계획 다시 이어가기' })
    ).not.toBeNull();
    expect(
      screen.getByRole('button', { name: '디자인·개발 레퍼런스 찾기' })
    ).not.toBeNull();
    expect(
      screen.getByRole('button', { name: '저장해둔 영상 골라보기' })
    ).not.toBeNull();
  });

  it('waits for free-input submission before presenting results', async () => {
    const user = userEvent.setup();
    const repository: InsightRepository = {
      load: () => ({
        insights: [createInsight({ title: 'React 폼 검증' })],
        warnings: [],
      }),
      save: () => ({ ok: true }),
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          repository={toAsyncRepository(repository)}
          retrieveService={createRetrieveService(['insight-1'])}
        />
      </DesignSystemProvider>
    );

    await user.type(
      screen.getByRole('textbox', {
        name: '지금 꺼내 보고 싶은 상황',
      }),
      'React'
    );

    expect(
      screen.getByText('떠오르는 단어나 지금 하는 일을 짧게 적어 보세요.')
    ).not.toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('article')).toBeNull();

    await user.keyboard('{Enter}');

    expect(screen.getByRole('status').textContent).toContain(
      '“React” 결과 1개'
    );
    expect(
      screen.getByRole('heading', { name: 'React 폼 검증' })
    ).not.toBeNull();
  });

  it('submits a trimmed query while preserving the exact controlled draft', async () => {
    const user = userEvent.setup();
    const repository: InsightRepository = {
      load: () => ({
        insights: [createInsight({ title: 'React 폼 검증' })],
        warnings: [],
      }),
      save: () => ({ ok: true }),
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          repository={toAsyncRepository(repository)}
          retrieveService={createRetrieveService(['insight-1'])}
        />
      </DesignSystemProvider>
    );

    const input = screen.getByRole('textbox', {
      name: '지금 꺼내 보고 싶은 상황',
    });
    await user.type(input, '  React  ');
    await user.keyboard('{Enter}');

    expect((input as HTMLInputElement).value).toBe('  React  ');
    expect(screen.getByRole('status').textContent).toContain(
      '“React” 결과 1개'
    );
    expect(screen.getByRole('status').textContent).not.toContain('“  React  ”');
    expect(
      screen.getByRole('heading', { name: 'React 폼 검증' })
    ).not.toBeNull();
  });

  it('빈 상황은 꺼내보기 서비스에 전달하지 않는다', async () => {
    const user = userEvent.setup();
    const retrieve = vi.fn().mockResolvedValue({
      insightIds: [],
      ok: true as const,
      pendingCount: 0,
    });

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace retrieveService={{ retrieve }} />
      </DesignSystemProvider>
    );

    await user.type(
      screen.getByRole('textbox', {
        name: '지금 꺼내 보고 싶은 상황',
      }),
      '   '
    );
    await user.keyboard('{Enter}');

    expect(retrieve).not.toHaveBeenCalled();
  });

  it('combines category filtering with deterministic all-result ranking', async () => {
    const user = userEvent.setup();
    const titleMatch = createInsight({
      id: 'title-match',
      originalUrl: 'https://title.example/signal',
      normalizedUrl: 'https://title.example/signal',
      domain: 'title.example',
      title: 'signal 제목',
      categoryId: DEVELOPMENT_CATEGORY_ID,
      createdAt: '2026-07-14T00:00:00.000Z',
    });
    const memoMatch = createInsight({
      id: 'memo-match',
      originalUrl: 'https://memo.example/article',
      normalizedUrl: 'https://memo.example/article',
      domain: 'memo.example',
      title: '메모로 찾은 자료',
      memo: 'signal',
      categoryId: DEVELOPMENT_CATEGORY_ID,
      createdAt: '2026-07-13T00:00:00.000Z',
    });
    const moreMatches = Array.from({ length: 6 }, (_, index) =>
      createInsight({
        id: `more-${index}`,
        originalUrl: `https://more${index}.example/article`,
        normalizedUrl: `https://more${index}.example/article`,
        domain: `more${index}.example`,
        title: `signal 추가 자료 ${index}`,
        categoryId: DEVELOPMENT_CATEGORY_ID,
      })
    );
    const otherCategory = createInsight({
      id: 'other-category',
      title: 'signal 디자인 자료',
      categoryId: DESIGN_CATEGORY_ID,
    });
    const repository: InsightRepository = {
      load: () => ({
        insights: [titleMatch, memoMatch, ...moreMatches, otherCategory],
        warnings: [],
      }),
      save: () => ({ ok: true }),
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          categoryRepository={createCategoryRepository(TEST_CATEGORIES)}
          repository={toAsyncRepository(repository)}
        />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '보관함' }));
    await user.click(screen.getByRole('button', { name: '개발' }));
    const search = screen.getByRole('searchbox', { name: '보관함 검색' });
    await user.type(search, 'signal');

    expect((search as HTMLInputElement).value).toBe('signal');
    expect(screen.getByRole('status').textContent).toBe('검색 결과 8개');
    expect(
      screen
        .getAllByRole('article')
        .map((article) => article.querySelector('h3')?.textContent)
    ).toEqual([
      '메모로 찾은 자료',
      'signal 제목',
      ...moreMatches.map(({ title }) => title),
    ]);
    expect(screen.queryByText('signal 디자인 자료')).toBeNull();
  });

  it('distinguishes a category-only no-result from an empty remote library', async () => {
    const user = userEvent.setup();
    const repository: InsightRepository = {
      load: () => ({
        insights: [
          createInsight({
            title: '디자인 자료',
            categoryId: DESIGN_CATEGORY_ID,
          }),
        ],
        warnings: [],
      }),
      save: () => ({ ok: true }),
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          categoryRepository={createCategoryRepository(TEST_CATEGORIES)}
          repository={toAsyncRepository(repository)}
        />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '보관함' }));
    await user.click(screen.getByRole('button', { name: '개발' }));

    expect(
      screen.getByRole('heading', {
        name: '이 카테고리에 인사이트가 없어요',
      })
    ).not.toBeNull();
    expect(
      screen.queryByRole('heading', { name: '아직 저장한 인사이트가 없어요' })
    ).toBeNull();
  });

  it('검색 결과에서 검색어만 지우고 현재 카테고리를 유지한다', async () => {
    const user = userEvent.setup();
    const repository: InsightRepository = {
      load: () => ({
        insights: [
          createInsight({
            id: 'development',
            title: '개발 자료',
            categoryId: DEVELOPMENT_CATEGORY_ID,
          }),
          createInsight({
            id: 'design',
            title: '디자인 자료',
            categoryId: DESIGN_CATEGORY_ID,
          }),
        ],
        warnings: [],
      }),
      save: () => ({ ok: true }),
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          categoryRepository={createCategoryRepository(TEST_CATEGORIES)}
          repository={toAsyncRepository(repository)}
        />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '보관함' }));
    await user.click(screen.getByRole('button', { name: '개발' }));
    const search = screen.getByRole('searchbox', { name: '보관함 검색' });
    await user.type(search, '없는 검색어');

    expect(
      screen.getByRole('heading', {
        name: '이 검색어로 찾은 인사이트가 없어요',
      })
    ).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe('검색 결과 0개');

    await user.click(screen.getByRole('button', { name: '검색어 지우기' }));

    expect((search as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(search);
    await waitFor(() => {
      expect(
        screen
          .getByRole('button', { name: '개발' })
          .getAttribute('aria-pressed')
      ).toBe('true');
      expect(screen.getAllByRole('article')).toHaveLength(1);
      expect(screen.getByText('개발 자료')).not.toBeNull();
      expect(screen.queryByText('디자인 자료')).toBeNull();
      expect(screen.queryByText('검색 결과 0개')).toBeNull();
      expect(screen.getByRole('status').textContent).toBe('개발 1개');
    });
  });

  it('moves focus to the next card when an edited category leaves the active filter', async () => {
    const user = userEvent.setup();
    const repository: InsightRepository = {
      load: () => ({
        insights: [
          createInsight({
            id: 'category-change',
            title: '카테고리로 찾은 카드',
            categoryId: DEVELOPMENT_CATEGORY_ID,
          }),
          createInsight({
            id: 'next-card',
            originalUrl: 'https://next.example/article',
            normalizedUrl: 'https://next.example/article',
            domain: 'next.example',
            title: '다음 개발 카드',
            categoryId: DEVELOPMENT_CATEGORY_ID,
          }),
        ],
        warnings: [],
      }),
      save: () => ({ ok: true }),
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          categoryRepository={createCategoryRepository(TEST_CATEGORIES)}
          repository={toAsyncRepository(repository)}
        />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '보관함' }));
    await user.click(screen.getByRole('button', { name: '개발' }));
    await user.click(screen.getAllByRole('button', { name: '수정' })[0]!);
    const categoryInput = screen.getByRole('combobox', { name: '카테고리' });
    await user.click(categoryInput);
    await user.click(screen.getByRole('option', { name: '디자인' }));
    await user.click(
      screen.getByRole('button', { name: '변경 내용 저장하기' })
    );

    await waitFor(() => {
      expect(screen.queryByText('카테고리로 찾은 카드')).toBeNull();
      expect(screen.getByText('다음 개발 카드')).not.toBeNull();
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: '수정' })
      );
    });
  });

  it('returns focus to library search when edited content leaves the search result', async () => {
    const user = userEvent.setup();
    const repository: InsightRepository = {
      load: () => ({
        insights: [
          createInsight({
            title: '집중력 키워드 자료',
            memo: '집중력 키워드 메모',
          }),
        ],
        warnings: [],
      }),
      save: () => ({ ok: true }),
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace repository={toAsyncRepository(repository)} />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '보관함' }));
    const search = screen.getByRole('searchbox', { name: '보관함 검색' });
    await user.type(search, '집중력 키워드');
    await user.click(screen.getByRole('button', { name: '수정' }));
    const titleInput = screen.getByRole('textbox', { name: '제목' });
    const memoInput = screen.getByRole('textbox', { name: '한 줄 메모' });
    await user.clear(titleInput);
    await user.type(titleInput, '새 제목');
    await user.clear(memoInput);
    await user.type(memoInput, '새 메모');
    await user.click(
      screen.getByRole('button', { name: '변경 내용 저장하기' })
    );

    await waitFor(() => {
      expect(screen.queryByText('새 제목')).toBeNull();
      expect(document.activeElement).toBe(search);
    });
  });

  it('updates search data immediately and persists edit and deletion across remounts', async () => {
    const user = userEvent.setup();
    let persistedInsights = [
      createInsight({
        title: '편집할 링크',
        memo: '기존 메모',
        categoryId: DEVELOPMENT_CATEGORY_ID,
      }),
    ];
    const repository: InsightRepository = {
      load: () => ({ insights: persistedInsights, warnings: [] }),
      save: (insights) => {
        persistedInsights = insights;
        return { ok: true };
      },
    };
    const firstRender = render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          categoryRepository={createCategoryRepository(TEST_CATEGORIES)}
          repository={toAsyncRepository(repository)}
        />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '보관함' }));
    await user.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByRole('textbox', { name: '제목' }), {
      target: { value: '검색에 바로 잡힐 제목' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '한 줄 메모' }), {
      target: { value: '  새 검색 단서  ' },
    });
    await user.click(screen.getByRole('combobox', { name: '카테고리' }));
    await user.click(screen.getByRole('option', { name: 'Design Systems' }));
    await user.click(
      screen.getByRole('button', { name: '변경 내용 저장하기' })
    );

    expect(persistedInsights[0]).toEqual(
      expect.objectContaining({
        title: '검색에 바로 잡힐 제목',
        memo: '새 검색 단서',
        categoryId: DESIGN_SYSTEMS_CATEGORY_ID,
      })
    );

    const search = screen.getByRole('searchbox', { name: '보관함 검색' });
    await user.type(search, '새 검색 단서');
    expect(
      screen.getByRole('heading', { name: '검색에 바로 잡힐 제목' })
    ).not.toBeNull();

    firstRender.unmount();
    const editReload = render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          categoryRepository={createCategoryRepository(TEST_CATEGORIES)}
          repository={toAsyncRepository(repository)}
        />
      </DesignSystemProvider>
    );
    await user.click(screen.getByRole('button', { name: '보관함' }));
    expect(
      screen.getByRole('heading', { name: '검색에 바로 잡힐 제목' })
    ).not.toBeNull();

    await user.click(screen.getByRole('button', { name: '삭제' }));
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(
      screen.getByRole('heading', { name: '검색에 바로 잡힐 제목' })
    ).not.toBeNull();

    await user.click(screen.getByRole('button', { name: '삭제' }));
    await user.click(screen.getByRole('button', { name: '인사이트 삭제하기' }));
    expect(
      screen.queryByRole('heading', { name: '검색에 바로 잡힐 제목' })
    ).toBeNull();
    expect(persistedInsights).toEqual([]);
    expect(document.activeElement).toBe(
      screen.getByRole('searchbox', { name: '보관함 검색' })
    );

    editReload.unmount();
    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          categoryRepository={createCategoryRepository(TEST_CATEGORIES)}
          repository={toAsyncRepository(repository)}
        />
      </DesignSystemProvider>
    );
    await user.click(screen.getByRole('button', { name: '보관함' }));

    expect(
      screen.getByRole('heading', { name: '아직 저장한 인사이트가 없어요' })
    ).not.toBeNull();
  }, 10_000);

  it('saves optional personal context and shows it in the library immediately', async () => {
    const user = userEvent.setup();
    const save = vi.fn<InsightRepository['save']>(() => ({ ok: true }));
    const repository: InsightRepository = {
      load: () => ({ insights: [], warnings: [] }),
      save,
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          categoryRepository={createCategoryRepository(TEST_CATEGORIES)}
          repository={toAsyncRepository(repository)}
        />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '저장' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
      target: { value: 'https://context.example/article' },
    });
    await user.click(screen.getByRole('button', { name: '저장하기' }));

    expect(
      screen.getByRole('heading', {
        name: '언제 다시 쓰고 싶은가요?',
      })
    ).not.toBeNull();

    fireEvent.change(screen.getByRole('textbox', { name: '제목 (선택)' }), {
      target: { value: '다시 쓰는 디자인 패턴' },
    });
    fireEvent.change(
      screen.getByRole('textbox', { name: '한 줄 메모 (선택)' }),
      { target: { value: '모바일 설계 때 참고하기' } }
    );
    await user.click(screen.getByRole('combobox', { name: '카테고리 (선택)' }));
    await user.click(screen.getByRole('option', { name: 'Design Systems' }));
    await user.click(
      screen.getByRole('button', { name: '인사이트 정보 저장하기' })
    );

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0][0]).toEqual(
      expect.objectContaining({
        categoryId: DESIGN_SYSTEMS_CATEGORY_ID,
        memo: '모바일 설계 때 참고하기',
        title: '다시 쓰는 디자인 패턴',
      })
    );

    const titleInput = screen.getByRole('textbox', { name: '제목 (선택)' });
    fireEvent.change(titleInput, {
      target: { value: '수정한 디자인 패턴' },
    });
    expect(
      screen.queryByRole('status', { name: '인사이트 정보를 저장했어요' })
    ).toBeNull();
    expect(
      (
        screen.getByRole('button', {
          name: '인사이트 정보 저장하기',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    expect(
      screen.getByRole('button', { name: '지금은 건너뛰기' })
    ).not.toBeNull();
    await user.click(
      screen.getByRole('button', { name: '인사이트 정보 저장하기' })
    );

    expect(save).toHaveBeenCalledTimes(3);
    expect(save.mock.calls[2]?.[0][0]?.title).toBe('수정한 디자인 패턴');
    expect(
      screen.getByRole('status', { name: '인사이트 정보를 저장했어요' })
    ).not.toBeNull();
    expect(
      screen.queryByRole('button', { name: '지금은 건너뛰기' })
    ).toBeNull();
    expect(
      (
        screen.getByRole('button', {
          name: '변경 내용 저장하기',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: '보관함' }));

    expect(screen.getByText('수정한 디자인 패턴')).not.toBeNull();
    expect(screen.getByText('모바일 설계 때 참고하기')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Design Systems' })
    ).not.toBeNull();

    fireEvent.change(screen.getByRole('searchbox', { name: '보관함 검색' }), {
      target: { value: 'Design Systems' },
    });
    expect(screen.getByText('수정한 디자인 패턴')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(
      (screen.getByRole('textbox', { name: 'URL' }) as HTMLInputElement).value
    ).toBe('');
    expect(
      screen.queryByRole('heading', {
        name: '언제 다시 쓰고 싶은가요?',
      })
    ).toBeNull();
  }, 10_000);

  it('keeps the saved URL when personal context is skipped', async () => {
    const user = userEvent.setup();
    const save = vi.fn<InsightRepository['save']>(() => ({ ok: true }));
    const repository: InsightRepository = {
      load: () => ({ insights: [], warnings: [] }),
      save,
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace repository={toAsyncRepository(repository)} />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '저장' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
      target: { value: 'https://skip-context.example/article#source' },
    });
    await user.click(screen.getByRole('button', { name: '저장하기' }));
    await user.click(screen.getByRole('button', { name: '지금은 건너뛰기' }));

    expect(save).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('link', { name: '원문 열기' }).getAttribute('href')
    ).toBe('https://skip-context.example/article#source');

    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(
      (screen.getByRole('textbox', { name: 'URL' }) as HTMLInputElement).value
    ).toBe('');
    expect(
      screen.queryByRole('heading', {
        name: '언제 다시 쓰고 싶은가요?',
      })
    ).toBeNull();

    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
      target: { value: 'https://next-save.example/article' },
    });
    await user.click(screen.getByRole('button', { name: '저장하기' }));

    expect(
      (screen.getByRole('textbox', { name: '제목 (선택)' }) as HTMLInputElement)
        .value
    ).toBe('');
    expect(
      (
        screen.getByRole('textbox', {
          name: '한 줄 메모 (선택)',
        }) as HTMLTextAreaElement
      ).value
    ).toBe('');
    expect(
      screen.getByRole('combobox', {
        name: '카테고리 (선택)',
      }).textContent
    ).toContain('미분류');
    expect(
      screen.queryByRole('status', { name: '인사이트 정보를 저장했어요' })
    ).toBeNull();
  });

  it('keeps personal context inputs after a write failure and retries them', async () => {
    const user = userEvent.setup();
    const save = vi
      .fn<InsightRepository['save']>()
      .mockReturnValueOnce({ ok: true })
      .mockReturnValueOnce({ ok: false, reason: 'write-failed' })
      .mockReturnValueOnce({ ok: true });
    const repository: InsightRepository = {
      load: () => ({ insights: [], warnings: [] }),
      save,
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace repository={toAsyncRepository(repository)} />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '저장' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
      target: { value: 'https://context-retry.example/article' },
    });
    await user.click(screen.getByRole('button', { name: '저장하기' }));
    const memoInput = screen.getByRole('textbox', {
      name: '한 줄 메모 (선택)',
    });
    fireEvent.change(memoInput, {
      target: { value: '발표 자료를 만들 때 참고하기' },
    });
    await user.click(
      screen.getByRole('button', { name: '인사이트 정보 저장하기' })
    );

    expect(screen.getByRole('alert').textContent).toContain(
      '먼저 저장한 인사이트와 입력한 내용은 그대로 두었어요.'
    );
    expect((memoInput as HTMLTextAreaElement).value).toBe(
      '발표 자료를 만들 때 참고하기'
    );

    await user.click(
      screen.getByRole('button', { name: '인사이트 정보 다시 저장하기' })
    );

    expect(save).toHaveBeenCalledTimes(3);
    expect(
      screen.getByRole('status', { name: '인사이트 정보를 저장했어요' })
    ).not.toBeNull();
  });

  it('keeps the URL in the library when failed personal context is skipped', async () => {
    const user = userEvent.setup();
    const save = vi
      .fn<InsightRepository['save']>()
      .mockReturnValueOnce({ ok: true })
      .mockReturnValueOnce({ ok: false, reason: 'write-failed' });
    const repository: InsightRepository = {
      load: () => ({ insights: [], warnings: [] }),
      save,
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace repository={toAsyncRepository(repository)} />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '저장' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
      target: { value: 'https://failed-context.example/article' },
    });
    await user.click(screen.getByRole('button', { name: '저장하기' }));
    fireEvent.change(
      screen.getByRole('textbox', { name: '한 줄 메모 (선택)' }),
      { target: { value: '저장되지 않을 메모' } }
    );
    await user.click(
      screen.getByRole('button', { name: '인사이트 정보 저장하기' })
    );
    await user.click(screen.getByRole('button', { name: '지금은 건너뛰기' }));

    expect(screen.getAllByText('failed-context.example')).toHaveLength(2);
    expect(screen.queryByText('저장되지 않을 메모')).toBeNull();
    expect(
      screen.getByRole('link', { name: '원문 열기' }).getAttribute('href')
    ).toBe('https://failed-context.example/article');
  });

  it('restores repository insights and persists a saved URL', async () => {
    const user = userEvent.setup();
    const restoredInsight = createInsight({
      id: 'restored',
      originalUrl: 'https://restored.example/article',
      normalizedUrl: 'https://restored.example/article',
      domain: 'restored.example',
      title: '새로고침 뒤 복원된 링크',
    });
    const save = vi.fn<InsightRepository['save']>(() => ({ ok: true }));
    const repository: InsightRepository = {
      load: () => ({ insights: [restoredInsight], warnings: [] }),
      save,
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace repository={toAsyncRepository(repository)} />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '보관함' }));
    expect(screen.getByText('새로고침 뒤 복원된 링크')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: '저장' }));
    await user.type(
      screen.getByRole('textbox', { name: 'URL' }),
      'https://Example.com/new-article#details'
    );
    await user.click(screen.getByRole('button', { name: '저장하기' }));

    expect(save).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: '보관함' }));
    const newSourceLink = screen.getAllByRole('link', {
      name: '원문 열기',
    })[0];

    expect(newSourceLink?.getAttribute('href')).toBe(
      'https://Example.com/new-article#details'
    );
    expect(newSourceLink?.getAttribute('target')).toBe('_blank');
    expect(newSourceLink?.getAttribute('rel')).toBe('noreferrer');
  });

  it('distinguishes unsupported protocols from malformed URLs', async () => {
    const user = userEvent.setup();

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          repository={toAsyncRepository(createRepository())}
        />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '저장' }));
    const saveUrl = screen.getByRole('textbox', { name: 'URL' });

    await user.type(saveUrl, 'ftp://example.com/article');
    await user.click(screen.getByRole('button', { name: '저장하기' }));

    expect(screen.getByRole('alert').textContent).toContain(
      'http 또는 https URL만 저장할 수 있어요.'
    );
    expect((saveUrl as HTMLInputElement).value).toBe(
      'ftp://example.com/article'
    );

    await user.clear(saveUrl);
    await user.type(saveUrl, 'notaurl');
    await user.click(screen.getByRole('button', { name: '저장하기' }));

    expect(screen.getByRole('alert').textContent).toContain(
      '올바른 URL을 입력해 주세요.'
    );
    expect((saveUrl as HTMLInputElement).value).toBe('notaurl');
  });

  it('treats a duplicate URL as an already saved capture', async () => {
    const user = userEvent.setup();
    const save = vi.fn<InsightRepository['save']>(() => ({ ok: true }));
    const repository: InsightRepository = {
      load: () => ({
        insights: [
          createInsight({
            originalUrl: 'https://example.com/article?utm_source=feed',
            normalizedUrl: 'https://example.com/article',
          }),
        ],
        warnings: [],
      }),
      save,
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace repository={toAsyncRepository(repository)} />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '저장' }));
    const saveUrl = screen.getByRole('textbox', { name: 'URL' });

    await user.type(saveUrl, 'https://EXAMPLE.com/article#details');
    await user.click(screen.getByRole('button', { name: '저장하기' }));

    expect(screen.getByRole('status').textContent).toContain(
      '인사이트를 저장했어요'
    );
    expect((saveUrl as HTMLInputElement).value).toBe(
      'https://EXAMPLE.com/article#details'
    );
    expect(save).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '지금은 건너뛰기' }));

    expect(
      screen.getByRole('heading', { name: '전체 인사이트' })
    ).not.toBeNull();
  });

  it('clears hidden library filters after a duplicate capture is skipped', async () => {
    const user = userEvent.setup();
    const duplicateInsight = createInsight({
      originalUrl: 'https://example.com/article?utm_source=feed',
      normalizedUrl: 'https://example.com/article',
      title: '다시 보여야 하는 링크',
      categoryId: DEVELOPMENT_CATEGORY_ID,
    });
    const repository: InsightRepository = {
      load: () => ({ insights: [duplicateInsight], warnings: [] }),
      save: () => ({ ok: true }),
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          categoryRepository={createCategoryRepository(TEST_CATEGORIES)}
          repository={toAsyncRepository(repository)}
        />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '보관함' }));
    await user.click(screen.getByRole('button', { name: '디자인' }));
    const librarySearch = screen.getByRole('searchbox', {
      name: '보관함 검색',
    });
    await user.type(librarySearch, '숨김 검색어');
    expect(screen.queryByText('다시 보여야 하는 링크')).toBeNull();

    await user.click(screen.getByRole('button', { name: '저장' }));
    await user.type(
      screen.getByRole('textbox', { name: 'URL' }),
      'https://EXAMPLE.com/article#details'
    );
    await user.click(screen.getByRole('button', { name: '저장하기' }));
    await user.click(screen.getByRole('button', { name: '지금은 건너뛰기' }));

    expect(screen.getByText('다시 보여야 하는 링크')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: '전체' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      (
        screen.getByRole('searchbox', {
          name: '보관함 검색',
        }) as HTMLInputElement
      ).value
    ).toBe('');
  });

  it('keeps the URL after a write failure and allows retrying', async () => {
    const user = userEvent.setup();
    const save = vi
      .fn<InsightRepository['save']>()
      .mockReturnValueOnce({ ok: false, reason: 'write-failed' })
      .mockReturnValueOnce({ ok: true });
    const repository: InsightRepository = {
      load: () => ({ insights: [], warnings: [] }),
      save,
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace repository={toAsyncRepository(repository)} />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '저장' }));
    const saveUrl = screen.getByRole('textbox', { name: 'URL' });
    await user.type(saveUrl, 'https://retry.example/article');
    await user.click(screen.getByRole('button', { name: '저장하기' }));

    expect(screen.getByRole('alert').textContent).toContain(
      '보관함에 저장하지 못했어요.'
    );
    expect(screen.getByRole('alert').textContent).toContain('다시 시도');
    expect((saveUrl as HTMLInputElement).value).toBe(
      'https://retry.example/article'
    );

    await user.click(screen.getByRole('button', { name: '저장하기' }));

    expect(save).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status').textContent).toContain(
      '인사이트를 저장했어요'
    );
  });

  it('keeps the URL when the common capture service rejects permission', async () => {
    const user = userEvent.setup();
    const capture = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'permission-denied',
    });

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          captureService={{ capture }}
          repository={toAsyncRepository(createRepository())}
        />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '저장' }));
    const saveUrl = screen.getByRole('textbox', { name: 'URL' });
    await user.type(saveUrl, 'https://permission.example/article');
    await user.click(screen.getByRole('button', { name: '저장하기' }));

    expect(capture).toHaveBeenCalledWith({
      source: 'web',
      url: 'https://permission.example/article',
    });
    expect(screen.getByRole('alert').textContent).toContain(
      '입력한 URL은 그대로 두었어요. 다시 로그인한 뒤 시도해 주세요.'
    );
    expect((saveUrl as HTMLInputElement).value).toBe(
      'https://permission.example/article'
    );
  });

  it('explains load warnings without hiding restored valid insights', async () => {
    const user = userEvent.setup();
    const repository: InsightRepository = {
      load: () => ({
        insights: [createInsight({ title: '정상 복원된 링크' })],
        warnings: ['read-failed', 'corrupted-store', 'corrupted-entry'],
      }),
      save: () => ({ ok: true }),
    };

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace repository={toAsyncRepository(repository)} />
      </DesignSystemProvider>
    );

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(3));
    const warningText = screen
      .getAllByRole('alert')
      .map((alert) => alert.textContent)
      .join(' ');

    expect(
      screen.getByText('네트워크를 확인하고 새로고침해 주세요.')
    ).not.toBeNull();
    expect(warningText).toContain(
      '저장 데이터가 손상되어 불러오지 못했어요. 새 인사이트는 계속 저장할 수 있어요.'
    );
    expect(warningText).toContain(
      '일부 손상된 인사이트를 제외하고 나머지를 불러왔어요.'
    );
    expect(
      screen.getByRole('heading', {
        name: '보관함을 불러오지 못해 꺼내볼 수 없어요',
      })
    ).not.toBeNull();

    await user.click(screen.getByRole('button', { name: '보관함' }));
    expect(screen.getByText('정상 복원된 링크')).not.toBeNull();
  });

  it('moves between the home, library, and save tabs', async () => {
    const user = userEvent.setup();

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          repository={toAsyncRepository(createRepository())}
        />
      </DesignSystemProvider>
    );

    expect(
      screen.getByRole('navigation', { name: '주요 화면' })
    ).not.toBeNull();
    expect(screen.queryByText('이 계정의 보관함에 저장해요')).toBeNull();
    const navigations = screen.getAllByRole('navigation', {
      name: '주요 화면',
    });

    expect(navigations).toHaveLength(1);
    expect(navigations[0].closest('.workspace-header')).not.toBeNull();
    expect(screen.getByRole('heading', { name: '홈' })).not.toBeNull();
    expect(
      screen.getByRole('button', { name: '홈' }).getAttribute('aria-current')
    ).toBe('page');

    await user.click(screen.getByRole('button', { name: '보관함' }));
    expect(
      screen.getByRole('heading', { name: '전체 인사이트' })
    ).not.toBeNull();
    expect(
      screen.getByRole('button', { name: '전체' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      screen
        .getByRole('button', { name: '보관함' })
        .getAttribute('aria-current')
    ).toBe('page');

    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(
      screen.getByRole('heading', { name: 'URL을 입력하면 바로 저장해요' })
    ).not.toBeNull();

    const saveUrl = screen.getByLabelText('URL');

    await user.click(screen.getByRole('button', { name: '저장하기' }));

    expect(screen.getByRole('alert').textContent).toContain(
      '올바른 URL을 입력해 주세요.'
    );
    expect(saveUrl.getAttribute('aria-invalid')).toBe('true');
    expect(saveUrl.getAttribute('aria-describedby')).toBe('save-url-error');

    await user.type(saveUrl, 'notaurl');
    await user.click(screen.getByRole('button', { name: '저장하기' }));

    expect(screen.getByRole('alert').textContent).toContain(
      '올바른 URL을 입력해 주세요.'
    );

    await user.clear(saveUrl);
    await user.type(saveUrl, 'https://example.com/article');
    await user.click(screen.getByRole('button', { name: '저장하기' }));

    expect(screen.getByRole('status').textContent).toContain(
      '인사이트를 저장했어요'
    );
  });

  it('카테고리 생성부터 연결, 필터, 삭제 후 미분류 이동까지 동기화한다', async () => {
    const user = userEvent.setup();
    const insightRepository = toAsyncRepository({
      load: () => ({
        insights: [
          createInsight({
            id: 'category-flow',
            title: '프론트엔드 참고 자료',
          }),
        ],
        warnings: [],
      }),
      save: () => ({ ok: true }),
    });
    const categoryRepository = createCategoryRepository();

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          categoryRepository={categoryRepository}
          repository={insightRepository}
        />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '보관함' }));
    await user.click(screen.getByRole('button', { name: '관리' }));
    await user.click(screen.getByRole('button', { name: '새 카테고리' }));
    await user.type(screen.getByLabelText('카테고리 이름'), '프론트엔드');
    await user.click(screen.getByRole('button', { name: '파랑' }));
    await user.click(screen.getByRole('button', { name: '카테고리 만들기' }));
    await user.click(screen.getAllByRole('button', { name: '닫기' }).at(-1)!);

    await user.click(screen.getByRole('button', { name: '수정' }));
    await user.click(screen.getByRole('combobox', { name: '카테고리' }));
    await user.click(screen.getByRole('option', { name: '프론트엔드' }));
    await user.click(
      screen.getByRole('button', { name: '변경 내용 저장하기' })
    );

    const frontendFilter = screen.getByRole('button', {
      name: '프론트엔드',
    });

    expect(frontendFilter).not.toBeNull();
    await user.click(frontendFilter);
    expect(screen.getByRole('article').textContent).toContain(
      '프론트엔드 참고 자료'
    );

    await user.click(screen.getByRole('button', { name: '관리' }));
    await user.click(screen.getByRole('button', { name: '프론트엔드 수정' }));
    await user.click(screen.getByRole('button', { name: '카테고리 삭제' }));
    await user.click(screen.getByRole('button', { name: '카테고리 삭제하기' }));
    await user.click(screen.getAllByRole('button', { name: '닫기' }).at(-1)!);

    expect(
      screen.getByRole('button', { name: '전체' }).getAttribute('aria-pressed')
    ).toBe('true');
    await user.click(screen.getByRole('button', { name: '미분류' }));
    expect(screen.getByRole('article').textContent).toContain(
      '프론트엔드 참고 자료'
    );
    expect(screen.queryByText('프론트엔드')).toBeNull();
  }, 15_000);

  it('작성 중 선택한 카테고리가 삭제되면 맥락 초안을 미분류로 바꾼다', async () => {
    const user = userEvent.setup();
    const save = vi.fn<InsightRepository['save']>(() => ({ ok: true }));

    render(
      <DesignSystemProvider>
        <AuthenticatedWorkspace
          categoryRepository={createCategoryRepository(TEST_CATEGORIES)}
          repository={toAsyncRepository({
            load: () => ({ insights: [], warnings: [] }),
            save,
          })}
        />
      </DesignSystemProvider>
    );

    await user.click(screen.getByRole('button', { name: '저장' }));
    await user.type(
      screen.getByRole('textbox', { name: 'URL' }),
      'https://context.example/category'
    );
    await user.click(screen.getByRole('button', { name: '저장하기' }));
    await user.click(screen.getByRole('combobox', { name: '카테고리 (선택)' }));
    await user.click(screen.getByRole('option', { name: '개발' }));

    await user.click(screen.getByRole('button', { name: '보관함' }));
    await user.click(screen.getByRole('button', { name: '관리' }));
    await user.click(screen.getByRole('button', { name: '개발 수정' }));
    await user.click(screen.getByRole('button', { name: '카테고리 삭제' }));
    await user.click(screen.getByRole('button', { name: '카테고리 삭제하기' }));
    await user.click(screen.getAllByRole('button', { name: '닫기' }).at(-1)!);

    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(
      screen.getByRole('combobox', { name: '카테고리 (선택)' }).textContent
    ).toContain('미분류');

    await user.click(
      screen.getByRole('button', { name: '인사이트 정보 저장하기' })
    );

    expect(save.mock.calls.at(-1)?.[0][0]?.categoryId).toBeNull();
  }, 15_000);
});

function createInsight(overrides: Partial<Insight> = {}): Insight {
  return {
    id: 'insight-1',
    originalUrl: 'https://example.com',
    normalizedUrl: 'https://example.com',
    domain: 'example.com',
    titleOrigin: 'fallback',
    title: 'example.com',
    memo: null,
    categoryId: null,
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
    ...overrides,
  };
}

function createCategory(overrides: Partial<Category> = {}): Category {
  return {
    colorKey: 'blue-2',
    createdAt: '2026-07-24T00:00:00.000Z',
    id: DEVELOPMENT_CATEGORY_ID,
    name: '개발',
    sortOrder: 0,
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

function createImportService() {
  return {
    commit: vi.fn<InsightImportService['commit']>(),
    deleteRecord: vi.fn<InsightImportService['deleteRecord']>(),
    listHistory: vi
      .fn<InsightImportService['listHistory']>()
      .mockResolvedValue({ ok: true, value: [] }),
    listIssues: vi.fn<InsightImportService['listIssues']>(),
    prepare: vi.fn<InsightImportService['prepare']>(),
    retry: vi.fn<InsightImportService['retry']>(),
    undo: vi.fn<InsightImportService['undo']>(),
  };
}

function createPreparedImport(): PreparedImport {
  return {
    adapterKey: 'pasted-text',
    collections: [],
    expiresAt: '2026-07-26T03:00:00.000Z',
    id: '10000000-0000-4000-8000-000000000010',
    items: [
      {
        candidateId: 'pasted-text:0',
        capturedAtCandidate: null,
        classification: 'new',
        collectionPath: [],
        domain: 'example.com',
        exclusionCode: null,
        explicitMemoCandidate: null,
        normalizedUrl: 'https://example.com/imported',
        originalUrl: 'https://example.com/imported',
        sourceLocation: '1번째 줄',
        titleCandidate: null,
        warnings: ['missing-title'],
      },
    ],
    status: 'ready',
    summary: {
      createdCount: 0,
      duplicateCount: 0,
      excludedCount: 0,
      inputDuplicateCount: 0,
      newCount: 1,
      totalCount: 1,
    },
  };
}

function createCategoryRepository(
  initialCategories: readonly Category[] = []
): AsyncCategoryRepository {
  let categories: Category[] = [...initialCategories];

  return {
    async create(input, sortOrder) {
      const category: Category = {
        ...input,
        createdAt: '2026-07-24T00:00:00.000Z',
        id: '10000000-0000-4000-8000-000000000001',
        sortOrder,
        updatedAt: '2026-07-24T00:00:00.000Z',
      };
      categories = [...categories, category];

      return { category, ok: true };
    },
    async delete(categoryId) {
      categories = categories.filter((category) => category.id !== categoryId);
      return { ok: true };
    },
    async list() {
      return { categories, warnings: [] };
    },
    async update(categoryId, input) {
      const categoryIndex = categories.findIndex(
        (category) => category.id === categoryId
      );
      const currentCategory = categories[categoryIndex];

      if (!currentCategory) {
        return { ok: false, reason: 'not-found' };
      }

      const category = { ...currentCategory, ...input };
      categories = [...categories];
      categories[categoryIndex] = category;

      return { category, ok: true };
    },
  };
}

function createRetrieveService(insightIds: string[]): RetrieveService {
  return {
    retrieve: vi.fn(async () => ({
      insightIds,
      ok: true as const,
      pendingCount: 0,
    })),
  };
}

function createRepository(): InsightRepository {
  return {
    load: () => ({ insights: [], warnings: [] }),
    save: () => ({ ok: true }),
  };
}

function toAsyncRepository(
  repository: InsightRepository
): AsyncInsightRepository {
  const initialLoadResult = repository.load();
  let currentInsights = initialLoadResult.insights;

  return {
    async list() {
      return { ...initialLoadResult, insights: currentInsights };
    },
    async create(insight) {
      const nextInsights = [insight, ...currentInsights];
      const writeResult = repository.save(nextInsights);

      if (writeResult.ok) {
        currentInsights = nextInsights;
      }

      return writeResult.ok
        ? { insight, ok: true }
        : { ok: false, reason: writeResult.reason };
    },
    async update(insight) {
      const insightIndex = currentInsights.findIndex(
        (candidate) => candidate.id === insight.id
      );

      if (insightIndex === -1) {
        return { ok: false, reason: 'not-found' };
      }

      const nextInsights = [...currentInsights];
      nextInsights[insightIndex] = insight;
      const writeResult = repository.save(nextInsights);

      if (writeResult.ok) {
        currentInsights = nextInsights;
      }

      return writeResult.ok
        ? { insight, ok: true }
        : { ok: false, reason: writeResult.reason };
    },
    async delete(insightId) {
      const nextInsights = currentInsights.filter(
        (insight) => insight.id !== insightId
      );

      if (nextInsights.length === currentInsights.length) {
        return { ok: false, reason: 'not-found' };
      }

      const writeResult = repository.save(nextInsights);

      if (writeResult.ok) {
        currentInsights = nextInsights;
      }

      return writeResult;
    },
    async deleteMany(insightIds) {
      const uniqueInsightIds = [...new Set(insightIds)];
      const currentInsightIdSet = new Set(currentInsights.map(({ id }) => id));

      if (uniqueInsightIds.some((id) => !currentInsightIdSet.has(id))) {
        return { ok: false, reason: 'not-found' };
      }

      const deletedIdSet = new Set(uniqueInsightIds);
      const nextInsights = currentInsights.filter(
        ({ id }) => !deletedIdSet.has(id)
      );
      const writeResult = repository.save(nextInsights);

      if (writeResult.ok) {
        currentInsights = nextInsights;
      }

      return writeResult.ok
        ? { deletedIds: uniqueInsightIds, ok: true }
        : { ok: false, reason: writeResult.reason };
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

const ANDROID_CHROME_NAVIGATOR = {
  userAgent:
    'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/138.0.0.0 Mobile Safari/537.36',
  userAgentData: {
    brands: [{ brand: 'Google Chrome', version: '138' }],
    platform: 'Android',
  },
} as const;

function createBeforeInstallPromptEvent(): BeforeInstallPromptEvent {
  return Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({
      outcome: 'dismissed',
      platform: '',
    } as const),
  });
}
