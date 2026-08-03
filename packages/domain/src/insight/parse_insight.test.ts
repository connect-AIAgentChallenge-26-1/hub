import { describe, expect, it } from 'vitest';

import { parseInsight, type Insight } from './index.js';

const INSIGHT: Insight = {
  categoryId: '10000000-0000-4000-8000-000000000001',
  createdAt: '2026-07-14T00:00:00.000Z',
  domain: 'example.com',
  id: 'insight-1',
  memo: null,
  normalizedUrl: 'https://example.com/article',
  originalUrl: 'https://example.com/article?utm_source=test',
  title: '테스트 인사이트',
  titleOrigin: 'capture',
  updatedAt: '2026-07-14T00:00:01.000Z',
};

describe('parseInsight', () => {
  it('유효한 제품 모델을 반환한다', () => {
    expect(parseInsight(INSIGHT)).toEqual(INSIGHT);
  });

  it.each([
    { ...INSIGHT, categoryId: 'not-a-uuid' },
    { ...INSIGHT, titleOrigin: 'generated' },
    { ...INSIGHT, normalizedUrl: 'https://other.example/article' },
    { ...INSIGHT, createdAt: '2026-02-30T00:00:00.000Z' },
    {
      ...INSIGHT,
      createdAt: '2026-07-14T00:00:02.000Z',
      updatedAt: '2026-07-14T00:00:01.000Z',
    },
  ])('잘못된 제품 모델을 null로 변환한다', (value) => {
    expect(parseInsight(value)).toBeNull();
  });
});
