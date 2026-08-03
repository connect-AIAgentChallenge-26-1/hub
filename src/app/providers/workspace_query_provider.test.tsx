/* @vitest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import {
  onlineManager,
  QueryClient,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createWorkspaceQueryClient,
  WorkspaceQueryProvider,
} from './workspace_query_provider';

describe('WorkspaceQueryProvider', () => {
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('전달받은 QueryClient를 하위 컴포넌트에 제공한다', () => {
    const client = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) => (
      <WorkspaceQueryProvider client={client}>
        {children}
      </WorkspaceQueryProvider>
    );
    const { result } = renderHook(() => useQueryClient(), { wrapper });

    expect(result.current).toBe(client);
  });

  it('기본 query 옵션으로 창 포커스 재조회와 재시도를 비활성화한다', () => {
    const client = createWorkspaceQueryClient();

    expect(client.getDefaultOptions().queries).toMatchObject({
      networkMode: 'always',
      refetchOnWindowFocus: false,
      retry: false,
    });
    expect(client.getDefaultOptions().mutations).toMatchObject({
      networkMode: 'always',
    });
  });

  it('오프라인에서도 queryFn을 실행한다', async () => {
    onlineManager.setOnline(false);
    const client = createWorkspaceQueryClient();
    const queryFn = vi.fn().mockResolvedValue('offline-result');
    const wrapper = ({ children }: PropsWithChildren) => (
      <WorkspaceQueryProvider client={client}>
        {children}
      </WorkspaceQueryProvider>
    );
    const { result } = renderHook(
      () => useQuery({ queryFn, queryKey: ['offline-query'] }),
      { wrapper }
    );

    await waitFor(() => expect(queryFn).toHaveBeenCalledOnce());
    await waitFor(() => expect(result.current.data).toBe('offline-result'));
  });
});
