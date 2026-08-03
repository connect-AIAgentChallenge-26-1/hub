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
