import { describe, expect, it } from 'vitest';

import * as insightApi from '../index';

describe('entities/insight public API', () => {
  it('공용 URL 정규화 함수를 기존 진입점으로 공개한다', () => {
    expect(insightApi.normalizeInsightUrl('https://example.com/a')).toEqual({
      domain: 'example.com',
      normalizedUrl: 'https://example.com/a',
      ok: true,
      originalUrl: 'https://example.com/a',
    });
  });
});
