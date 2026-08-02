const WORKSPACE_QUERY_KEY = 'workspace';

export const workspaceQueryKeys = {
  all: [WORKSPACE_QUERY_KEY] as const,
  scope: (scope: string) => [WORKSPACE_QUERY_KEY, scope] as const,
  insights: (scope: string) =>
    [WORKSPACE_QUERY_KEY, scope, 'insights'] as const,
  categories: (scope: string) =>
    [WORKSPACE_QUERY_KEY, scope, 'categories'] as const,
  insightMutations: (scope: string) =>
    [WORKSPACE_QUERY_KEY, scope, 'insights', 'mutation'] as const,
  categoryMutations: (scope: string) =>
    [WORKSPACE_QUERY_KEY, scope, 'categories', 'mutation'] as const,
} as const;
