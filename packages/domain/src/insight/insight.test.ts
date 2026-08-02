import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  INSIGHT_CAPTURE_SOURCES,
  isInsightCaptureSource,
  type Insight,
  type InsightCaptureResult,
} from './index.js';

describe('인사이트 도메인 Interface', () => {
  it('저장 모델과 캡처 성공 결과가 같은 Insight 계약을 사용한다', () => {
    expectTypeOf<
      Extract<InsightCaptureResult, { ok: true }>['insight']
    >().toEqualTypeOf<Insight>();
  });

  it('지원하는 캡처 출처만 허용한다', () => {
    expect(INSIGHT_CAPTURE_SOURCES).toEqual([
      'web',
      'chrome_extension',
      'ios_share',
      'android_share',
    ]);
    expect(isInsightCaptureSource('chrome_extension')).toBe(true);
    expect(isInsightCaptureSource('desktop_share')).toBe(false);
  });
});
