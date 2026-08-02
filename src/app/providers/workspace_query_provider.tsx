import { lazy, Suspense, useState, type ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from '@tanstack/react-query';

const ReactQueryDevtools =
  import.meta.env.DEV && import.meta.env.MODE !== 'test'
    ? lazy(() =>
        import('@tanstack/react-query-devtools').then(
          ({ ReactQueryDevtools: Devtools }) => ({ default: Devtools })
        )
      )
    : null;

export type WorkspaceQueryProviderProps = {
  children: ReactNode;
  client?: QueryClient;
};

export function createWorkspaceQueryClient(
  config: QueryClientConfig = {}
): QueryClient {
  return new QueryClient({
    ...config,
    defaultOptions: {
      ...config.defaultOptions,
      mutations: {
        networkMode: 'always',
        ...config.defaultOptions?.mutations,
      },
      queries: {
        networkMode: 'always',
        refetchOnWindowFocus: false,
        retry: false,
        ...config.defaultOptions?.queries,
      },
    },
  });
}

export function WorkspaceQueryProvider({
  children,
  client,
}: WorkspaceQueryProviderProps) {
  const [queryClient] = useState(() => client ?? createWorkspaceQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {ReactQueryDevtools ? (
        <Suspense fallback={null}>
          <ReactQueryDevtools buttonPosition="bottom-left" />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  );
}
