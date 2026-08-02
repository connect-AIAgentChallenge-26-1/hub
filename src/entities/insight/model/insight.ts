import type { Insight as DomainInsight } from '@amadda/domain/insight';

import { searchInsights, type SearchInsightsOptions } from './search_insights';

export type { InsightTitleOrigin } from '@amadda/domain/insight';
export type Insight = DomainInsight;

export type InsightContextInput = {
  categoryId: string | null;
  memo: string;
  title: string;
};

export type InsightMutationResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'not-found' | 'permission-denied' | 'write-failed';
    };

export function filterInsights(
  insights: Insight[],
  categoryFilter: string,
  query: string,
  searchOptions?: SearchInsightsOptions
) {
  const categoryInsights = insights.filter((insight) => {
    return (
      categoryFilter === 'all' ||
      (categoryFilter === 'uncategorized' && insight.categoryId === null) ||
      insight.categoryId === categoryFilter
    );
  });

  if (query.trim().length === 0) {
    return categoryInsights;
  }

  return searchInsights(categoryInsights, query, searchOptions).map(
    ({ insight }) => insight
  );
}
