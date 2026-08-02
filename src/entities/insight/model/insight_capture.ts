import type { Insight } from '@amadda/domain/insight';

export {
  INSIGHT_CAPTURE_SOURCES,
  isInsightCaptureSource,
} from '@amadda/domain/insight';
export type {
  InsightCaptureFailureReason,
  InsightCaptureRequest,
  InsightCaptureResult,
  InsightCaptureService,
  InsightCaptureSource,
  InsightTitleOrigin,
} from '@amadda/domain/insight';

export type CapturedInsight = Insight;
