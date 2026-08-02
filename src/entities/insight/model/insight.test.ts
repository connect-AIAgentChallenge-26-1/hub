import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  filterInsights,
  type Insight,
  type InsightTitleOrigin,
} from './insight';
import type { CapturedInsight } from './insight_capture';

const insights: Insight[] = [
  {
    id: '1',
    originalUrl: 'https://example.com/design',
    normalizedUrl: 'https://example.com/design',
    domain: 'example.com',
    titleOrigin: 'capture',
    title: '선택 부담을 줄이는 디자인',
    memo: '팀 프로젝트 첫 화면에 참고하기',
    categoryId: '10000000-0000-4000-8000-000000000001',
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
  },
  {
    id: '2',
    originalUrl: 'https://example.dev/guide',
    normalizedUrl: 'https://example.dev/guide',
    domain: 'example.dev',
    titleOrigin: 'capture',
    title: '팀 프로젝트 개발 가이드',
    memo: null,
    categoryId: '10000000-0000-4000-8000-000000000002',
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
  },
  {
    id: '3',
    originalUrl: 'https://uncategorized.example',
    normalizedUrl: 'https://uncategorized.example',
    domain: 'uncategorized.example',
    titleOrigin: 'fallback',
    title: '아직 분류하지 않은 링크',
    memo: null,
    categoryId: null,
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
  },
];

describe('filterInsights', () => {
  it('matches a category and every contained query token', () => {
    expect(
      filterInsights(
        insights,
        '10000000-0000-4000-8000-000000000001',
        '팀 프로젝트'
      )
    ).toEqual([insights[0]]);
  });

  it('returns uncategorized insights in input order for an empty query', () => {
    expect(filterInsights(insights, 'uncategorized', '')).toEqual([
      insights[2],
    ]);
  });

  it('returns every insight for the all filter key', () => {
    expect(filterInsights(insights, 'all', '')).toEqual(insights);
  });
});

describe('Insight', () => {
  it('exposes the persisted insight data contract', () => {
    expectTypeOf<Insight>().toEqualTypeOf<{
      id: string;
      originalUrl: string;
      normalizedUrl: string;
      domain: string;
      title: string;
      titleOrigin: InsightTitleOrigin;
      memo: string | null;
      categoryId: string | null;
      createdAt: string;
      updatedAt: string;
    }>();
  });

  it('기존 CapturedInsight 이름을 공용 Insight 별칭으로 유지한다', () => {
    expectTypeOf<CapturedInsight>().toEqualTypeOf<Insight>();
  });
});
