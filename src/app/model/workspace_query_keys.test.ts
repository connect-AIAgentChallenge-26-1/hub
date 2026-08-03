import { describe, expect, it } from 'vitest';

import { workspaceQueryKeys } from './workspace_query_keys';

describe('workspaceQueryKeys', () => {
  it('사용자별 인사이트와 카테고리 조회 키를 구분한다', () => {
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
  });

  it('다른 사용자의 scope와 mutation 키를 별도로 구성한다', () => {
    expect(workspaceQueryKeys.scope('user-b')).toEqual(['workspace', 'user-b']);
    expect(workspaceQueryKeys.insightMutations('user-b')).toEqual([
      'workspace',
      'user-b',
      'insights',
      'mutation',
    ]);
    expect(workspaceQueryKeys.categoryMutations('user-b')).toEqual([
      'workspace',
      'user-b',
      'categories',
      'mutation',
    ]);
  });
});
