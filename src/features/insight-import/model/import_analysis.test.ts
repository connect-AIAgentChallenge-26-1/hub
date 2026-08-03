import { describe, expect, it } from 'vitest';

import * as insightImportApi from '../index';

describe('features/insight-import public API', () => {
  it('공용 분석 함수와 브라우저 Adapter를 기존 진입점으로 공개한다', () => {
    expect(insightImportApi).toMatchObject({
      analyzeImportCandidates: expect.any(Function),
      analyzeImportUrl: expect.any(Function),
      pastedTextAdapter: expect.any(Object),
    });
  });
});
